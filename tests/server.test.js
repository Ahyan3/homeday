// Tests for the shared server code in lib/. Run with: npm test
// External services (Supabase, PayMongo, NASA POWER, OpenStreetMap) are replaced with a fake fetch.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { handleCheckout, checkoutInfo } from "../lib/checkout.js";
import { handleWebhook } from "../lib/webhook.js";
import { handleWeather } from "../lib/weather.js";
import { handleGeocode } from "../lib/geocode.js";
import { hmacHex, safeEqual, SECURITY_HEADERS } from "../lib/shared.js";
import { readFileSync } from "node:fs";

const env = { PAYMONGO_SECRET_KEY: "sk_test_x", HOMEDAY_DB_SECRET: "db-secret", PAYMONGO_WEBHOOK_SECRET: "whsk_test" };
let calls = [];
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (input, opts = {}) => {
    const url = String(input);
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes("/rpc/get_timeline")) return reply({ id: "abcd2345", name: "Mochi" });
    if (url.includes("/rpc/create_order")) return reply(true);
    if (url.includes("/rpc/mark_order_paid")) return reply("paid");
    if (url.includes("capabilities/payment_methods")) return reply(["gcash", "paymaya", "qrph", "card"]);
    if (url.includes("checkout_sessions")) return reply({ data: { attributes: { checkout_url: "https://checkout.paymongo.com/cs_1" } } });
    if (url.includes("power.larc.nasa.gov")) {
      const day = url.match(/start=(\d{8})/)[1];
      const hi = day === "20261119" ? -999 : 31.28;
      return reply({ properties: { parameter: { T2M_MAX: { [day]: hi }, T2M_MIN: { [day]: 22.64 }, PRECTOTCORR: { [day]: 1.69 } } } });
    }
    if (url.includes("nominatim.openstreetmap.org")) {
      return reply(url.includes("Nowhereville") ? [] : [{ lat: "14.651", lon: "121.049", display_name: "Quezon City, Eastern Manila District, Metro Manila, Philippines" }]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
});

const checkoutRequest = (body) => new Request("https://homeday.pages.dev/api/checkout", { method: "POST", body: JSON.stringify(body) });
const address = { name: "Ana Cruz", phone: "0917 123 4567", line1: "12 Rizal St", city: "Cebu City", province: "Cebu", postal: "6000" };

test("checkout opens a PayMongo session for a digital keepsake", async () => {
  const res = await handleCheckout(checkoutRequest({ timeline_id: "abcd2345", item: "digital" }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: "https://checkout.paymongo.com/cs_1" });

  const order = calls.find((c) => c.url.includes("create_order")).body;
  assert.equal(order.p.amount, 69900);
  assert.match(order.p.reference, /^HD-abcd2345-digital-[0-9a-f]{8}$/);

  const session = calls.find((c) => c.url.includes("checkout_sessions"));
  const attrs = session.body.data.attributes;
  assert.equal(session.opts.headers.Authorization, "Basic " + Buffer.from("sk_test_x:").toString("base64"));
  assert.equal(attrs.line_items[0].currency, "PHP");
  assert.equal(attrs.reference_number, order.p.reference);
  assert.equal(attrs.success_url, "https://homeday.pages.dev/thanks?t=abcd2345&item=digital");
});

test("checkout says payments are off when the PayMongo key is missing", async () => {
  const res = await handleCheckout(checkoutRequest({ timeline_id: "abcd2345", item: "digital" }), {});
  assert.equal(res.status, 503);
});

test("checkout refuses unknown items and malformed timeline ids", async () => {
  assert.equal((await handleCheckout(checkoutRequest({ timeline_id: "abcd2345", item: "yacht" }), env)).status, 400);
  assert.equal((await handleCheckout(checkoutRequest({ timeline_id: "../etc", item: "digital" }), env)).status, 400);
});

test("prints and books stay off until PRINTS_ENABLED is 1", async () => {
  const off = await handleCheckout(checkoutRequest({ timeline_id: "abcd2345", item: "print", shipping: address }), env);
  assert.equal(off.status, 400);
  const on = await handleCheckout(checkoutRequest({ timeline_id: "abcd2345", item: "print", shipping: address }), { ...env, PRINTS_ENABLED: "1" });
  assert.equal(on.status, 200);
});

test("overseas visitors pay the peso price until dollar charging is switched on", async () => {
  const res = await handleCheckout(checkoutRequest({ timeline_id: "abcd2345", item: "digital", currency: "USD" }), env);
  assert.equal(res.status, 200);
  const attrs = calls.find((c) => c.url.includes("checkout_sessions")).body.data.attributes;
  assert.deepEqual([attrs.line_items[0].currency, attrs.line_items[0].amount], ["PHP", 69900]);
  assert.equal(calls.find((c) => c.url.includes("create_order")).body.p.currency, "PHP");
  assert.deepEqual(await checkoutInfo(env).json(), { card: true, usd: false });
  assert.deepEqual(await checkoutInfo({}).json(), { card: false, usd: false });
});

test("with USD_CHARGING=1 overseas visitors are charged US$12 by card", async () => {
  const usdEnv = { ...env, USD_CHARGING: "1" };
  const res = await handleCheckout(checkoutRequest({ timeline_id: "abcd2345", item: "digital", currency: "USD" }), usdEnv);
  assert.equal(res.status, 200);
  const attrs = calls.find((c) => c.url.includes("checkout_sessions")).body.data.attributes;
  assert.deepEqual([attrs.line_items[0].currency, attrs.line_items[0].amount], ["USD", 1200]);
  assert.deepEqual(attrs.payment_method_types, ["card"]);
  const order = calls.find((c) => c.url.includes("create_order")).body.p;
  assert.deepEqual([order.currency, order.amount], ["USD", 1200]);
  assert.deepEqual(await checkoutInfo(usdEnv).json(), { card: true, usd: true });
});

test("a visitor in the Philippines is never charged in dollars", async () => {
  await handleCheckout(checkoutRequest({ timeline_id: "abcd2345", item: "digital" }), { ...env, USD_CHARGING: "1" });
  const attrs = calls.find((c) => c.url.includes("checkout_sessions")).body.data.attributes;
  assert.equal(attrs.line_items[0].currency, "PHP");
});

test("physical orders need a complete Philippine address", async () => {
  const res = await handleCheckout(checkoutRequest({ timeline_id: "abcd2345", item: "book", shipping: { ...address, postal: "60" } }), { ...env, PRINTS_ENABLED: "1" });
  assert.equal(res.status, 400);
});

const paidEvent = JSON.stringify({
  data: { attributes: { type: "checkout_session.payment.paid", livemode: false, data: { id: "cs_1", attributes: {
    reference_number: "HD-abcd2345-digital-0a1b2c3d",
    billing: { email: "ana@example.com" },
    payments: [{ id: "pay_1", attributes: { amount: 69900 } }],
  } } } },
});
const webhookRequest = (signature) => new Request("https://homeday.pages.dev/api/paymongo-webhook", {
  method: "POST", body: paidEvent, headers: { "paymongo-signature": signature },
});

test("webhook signature matches Node's HMAC-SHA256", async () => {
  const t = 1795190000;
  const expected = createHmac("sha256", "whsk_test").update(`${t}.${paidEvent}`).digest("hex");
  assert.equal(await hmacHex("whsk_test", `${t}.${paidEvent}`), expected);
  assert.ok(safeEqual(expected, expected));
  assert.ok(!safeEqual(expected, expected.slice(0, -1) + "0"));
});

test("webhook marks a correctly signed payment as paid", async () => {
  const t = 1795190000;
  const sig = await hmacHex("whsk_test", `${t}.${paidEvent}`);
  const res = await handleWebhook(webhookRequest(`t=${t},te=${sig},li=`), env);
  assert.equal(res.status, 200);
  const p = calls.find((c) => c.url.includes("mark_order_paid")).body.p;
  assert.equal(p.reference, "HD-abcd2345-digital-0a1b2c3d");
  assert.equal(p.amount, 69900);
  assert.equal(p.currency, "PHP");
  assert.equal(p.email, "ana@example.com");
});

test("webhook rejects forged signatures and live signatures on test events", async () => {
  const t = 1795190000;
  const sig = await hmacHex("whsk_test", `${t}.${paidEvent}`);
  assert.equal((await handleWebhook(webhookRequest(`t=${t},te=${"0".repeat(64)},li=`), env)).status, 401);
  assert.equal((await handleWebhook(webhookRequest(`t=${t},te=,li=${sig}`), env)).status, 401);
  assert.equal(calls.filter((c) => c.url.includes("mark_order_paid")).length, 0);
});

const weather = (query) => handleWeather(new Request(`https://homeday.pages.dev/api/weather?${query}`));

test("weather returns rounded NASA POWER values and caches old days for a year", async () => {
  const res = await weather("lat=14.651&lon=121.049&date=2019-03-16");
  assert.deepEqual(await res.json(), { hi: 31, lo: 23, rain: 1.7 });
  assert.match(res.headers.get("cache-control"), /s-maxage=31536000/);
});

test("weather explains days it can't answer", async () => {
  assert.deepEqual(await (await weather("lat=14.6&lon=121&date=1975-06-01")).json(), { none: "before-1981" });
  assert.deepEqual(await (await weather("lat=14.6&lon=121&date=2026-11-19")).json(), { none: "not-yet" });
  assert.equal((await weather("lat=999&lon=121&date=2019-03-16")).status, 400);
});

test("place lookup returns coordinates and a short label, with a real User-Agent", async () => {
  const res = await handleGeocode(new Request("https://homeday.pages.dev/api/geocode?q=Quezon%20City"));
  assert.deepEqual(await res.json(), { lat: 14.651, lon: 121.049, label: "Quezon City, Eastern Manila District" });
  assert.match(calls[0].opts.headers["User-Agent"], /^Homeday\//);
  const none = await handleGeocode(new Request("https://homeday.pages.dev/api/geocode?q=Nowhereville"));
  assert.deepEqual(await none.json(), { none: true });
});

test("security headers are the same on Vercel, Cloudflare and in the shared code", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url)));
  const all = Object.fromEntries(vercel.headers.find((h) => h.source === "/(.*)").headers.map((h) => [h.key, h.value]));
  assert.deepEqual(all, SECURITY_HEADERS);
  const cf = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.ok(cf.includes(`  ${k}: ${v}\n`), `_headers is missing ${k}`);
  assert.match(SECURITY_HEADERS["Content-Security-Policy"], /script-src 'self';/);
});
