// Creates a PayMongo hosted checkout for one keepsake on one timeline.
// Needs PAYMONGO_SECRET_KEY (sk_test_... or sk_live_...) and HOMEDAY_DB_SECRET.
import { PRICES, USD_PRICES, PHYSICAL, printsOn, usdOn, rpc, json, randomHex } from "./shared.js";

const auth = (key) => "Basic " + btoa(key + ":");

function cleanShipping(s) {
  if (!s || typeof s !== "object") return null;
  const f = (k, max) => String(s[k] ?? "").trim().slice(0, max);
  const out = { name: f("name", 80), phone: f("phone", 20), line1: f("line1", 120), line2: f("line2", 80), city: f("city", 60), province: f("province", 60), postal: f("postal", 4), country: "PH" };
  if (!out.name || !out.line1 || !out.city || !out.province) return null;
  if (!/^\d{4}$/.test(out.postal) || !/^[0-9+()\-\s]{7,20}$/.test(out.phone)) return null;
  return out;
}

let methodsCache = null;
async function paymentMethods(key, env) {
  if (env.PAYMONGO_METHODS) return env.PAYMONGO_METHODS.split(",").map((m) => m.trim()).filter(Boolean);
  if (methodsCache) return methodsCache;
  try {
    const r = await fetch("https://api.paymongo.com/v1/merchants/capabilities/payment_methods", { headers: { Authorization: auth(key), Accept: "application/json" } });
    const j = await r.json();
    if (r.ok && Array.isArray(j) && j.length) return (methodsCache = j);
  } catch (e) { /* fall through */ }
  return ["qrph"];
}

// GET /api/checkout tells the page whether PayMongo checkout is on (otherwise the page offers
// GCash/Maya by QR code, checked by hand) and whether overseas cards are charged in dollars.
export function checkoutInfo(env) {
  const card = !!(env.PAYMONGO_SECRET_KEY && env.HOMEDAY_DB_SECRET);
  return json({ card, usd: card && usdOn(env) }, 200, "public, max-age=300");
}

export async function handleCheckout(request, env) {
  const key = env.PAYMONGO_SECRET_KEY;
  if (!key || !env.HOMEDAY_DB_SECRET) return json({ error: "Payments aren't switched on yet." }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const item = body.item, id = String(body.timeline_id || "");
  const price = PRICES[item];
  if (!price || !/^[a-z0-9]{6,12}$/.test(id)) return json({ error: "Save the timeline and choose a keepsake first." }, 400);
  if (PHYSICAL.has(item) && !printsOn(env)) return json({ error: "Prints and books aren't available yet." }, 400);

  let shipping = null;
  if (PHYSICAL.has(item)) {
    shipping = cleanShipping(body.shipping);
    if (!shipping) return json({ error: "Fill in every shipping field. The ZIP code has 4 digits." }, 400);
  }

  try {
    const tl = await rpc("get_timeline", { p_id: id });
    if (!tl) return json({ error: "We couldn't find that timeline." }, 404);

    // Dollars only for digital items, only when switched on; everything else is charged in pesos.
    const usd = body.currency === "USD" && usdOn(env) && USD_PRICES[item] != null;
    const currency = usd ? "USD" : "PHP";
    let amount = usd ? USD_PRICES[item] : price.amount;
    // Price test: the database says what group "b" pays while the test runs (₱699 when it's off).
    if (!usd && body.variant === "b" && !PHYSICAL.has(item)) {
      const tested = await rpc("price_for", { p_item: item, p_variant: "b" }).catch(() => null);
      if (Number.isInteger(tested) && tested > 0) amount = tested;
    }

    const reference = `HD-${id}-${item}-${randomHex(4)}`;
    await rpc("create_order", { p_secret: env.HOMEDAY_DB_SECRET, p: { reference, timeline_id: id, item, amount, currency, shipping } });

    const origin = env.SITE_URL || new URL(request.url).origin;
    const r = await fetch("https://api.paymongo.com/v2/checkout_sessions", {
      method: "POST",
      headers: { Authorization: auth(key), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [{ name: `${price.label} for ${tl.name}`, amount, currency, quantity: 1 }],
            payment_method_types: usd ? ["card"] : await paymentMethods(key, env),
            success_url: `${origin}/thanks?t=${id}&item=${item}`,
            cancel_url: `${origin}/t/${id}`,
            reference_number: reference,
          },
        },
      }),
    });
    const j = await r.json().catch(() => null);
    const url = j && j.data && j.data.attributes && j.data.attributes.checkout_url;
    if (!r.ok || !url) {
      console.error("PayMongo checkout failed", r.status, JSON.stringify(j && j.errors ? j.errors : j));
      return json({ error: "Checkout didn't open. Try again in a minute." }, 502);
    }
    return json({ url });
  } catch (e) {
    console.error(e);
    return json({ error: "Checkout didn't open. Try again in a minute." }, 500);
  }
}
