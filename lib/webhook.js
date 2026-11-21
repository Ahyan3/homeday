// PayMongo calls this when a checkout is paid. It checks the signature, then marks the order
// paid, which unlocks the keepsake. Needs PAYMONGO_WEBHOOK_SECRET and HOMEDAY_DB_SECRET.
import { rpc, hmacHex, safeEqual } from "./shared.js";

async function signatureOk(raw, header, secret, live) {
  if (!header || !secret) return false;
  const parts = {};
  for (const piece of header.split(",")) {
    const i = piece.indexOf("=");
    if (i > 0) parts[piece.slice(0, i).trim()] = piece.slice(i + 1).trim();
  }
  const given = live ? parts.li : parts.te;
  if (!parts.t || !given) return false;
  return safeEqual(given, await hmacHex(secret, `${parts.t}.${raw}`));
}

export async function handleWebhook(request, env) {
  const raw = await request.text();
  let event;
  try { event = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const ev = (event && event.data && event.data.attributes) || {};
  const live = ev.livemode === true;

  if (!(await signatureOk(raw, request.headers.get("paymongo-signature"), env.PAYMONGO_WEBHOOK_SECRET, live))) {
    return new Response("Bad signature", { status: 401 });
  }
  if (ev.type !== "checkout_session.payment.paid") return new Response("Ignored", { status: 200 });

  const session = ev.data || {};
  const a = session.attributes || {};
  const payment = (a.payments || [])[0] || {};
  const pa = payment.attributes || {};
  const fromItems = (a.line_items || []).reduce((sum, li) => sum + (li.amount || 0) * (li.quantity || 1), 0);
  const currency = String(pa.currency || ((a.line_items || [])[0] || {}).currency || "PHP").toUpperCase();
  const billing = a.billing || pa.billing || null;

  try {
    const result = await rpc("mark_order_paid", {
      p_secret: env.HOMEDAY_DB_SECRET,
      p: {
        reference: a.reference_number,
        amount: pa.amount ?? fromItems,
        currency,
        email: billing && billing.email,
        payment_id: payment.id || null,
        session: session.id || null,
        livemode: live,
        billing,
      },
    });
    if (result !== "paid" && result !== "already") console.warn("Order not marked paid:", a.reference_number, result);
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("Could not record order", { status: 500 }); // PayMongo retries
  }
}
