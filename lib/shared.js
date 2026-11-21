// Shared server code. Runs on Cloudflare Pages Functions and on Vercel Functions,
// so it uses only web-standard APIs (fetch, Request, Response, crypto.subtle).
export const SUPABASE_URL = "https://qvdeqzdgyloqyyiqnbrh.supabase.co";
export const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2ZGVxemRneWxvcXl5aXFuYnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzI5OTAsImV4cCI6MjExMDc0ODk5MH0.hE1M5lCSydmP6uogb7GdNRvHs9N0eGnZ0zhF1c31lq4";

// Prices in centavos. Change them here and in public/index.html.
export const PRICES = {
  digital: { amount: 69900, label: "Digital keepsake" },
  gift: { amount: 69900, label: "Gift keepsake" },
  print: { amount: 299900, label: "Framed print" },
  book: { amount: 399900, label: "Memory book" },
};
// Prices in US cents for visitors outside the Philippines (digital items only; prints ship in the
// Philippines). Charged in dollars only when USD_CHARGING=1, after PayMongo turns on USD card
// acceptance for the account. Until then everyone is charged the peso price.
export const USD_PRICES = { digital: 1200, gift: 1200 };
export const usdOn = (env) => String(env.USD_CHARGING || "") === "1";
export const PHYSICAL = new Set(["print", "book"]);
// Security headers for every page. The same list is in vercel.json and public/_headers
// (tests/server.test.js checks they match). Cloudflare Functions responses get them from here.
export const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://qvdeqzdgyloqyyiqnbrh.supabase.co; font-src 'self'; connect-src 'self' https://qvdeqzdgyloqyyiqnbrh.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

// Prints and books stay off until PRINTS_ENABLED is set to 1 (and their rows are un-hidden in index.html).
export const printsOn = (env) => String(env.PRINTS_ENABLED || "") === "1";

export async function rpc(name, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${name} failed: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export function json(body, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache } });
}

export function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomHex(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}
