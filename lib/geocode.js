// Finds a town or city with OpenStreetMap's Nominatim (free; data © OpenStreetMap contributors, ODbL).
// Their policy: at most one request a second and a real User-Agent, so answers are cached for 30 days.
// GET /api/geocode?q=Quezon%20City -> {lat, lon, label} or {none: true}
import { json } from "./shared.js";

export async function handleGeocode(request) {
  const q = String(new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return json({ error: "Give a place name." }, 400);
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(q), {
      headers: { "User-Agent": "Homeday/1.0 (pet timeline website)", "Accept-Language": "en" },
    });
    if (!r.ok) return json({ none: true }, 200, "public, max-age=300");
    const g = (await r.json())[0];
    if (!g) return json({ none: true }, 200, "public, max-age=86400, s-maxage=2592000");
    const label = String(g.display_name || g.name || q).split(",").slice(0, 2).join(",").trim();
    return json({ lat: Number(g.lat), lon: Number(g.lon), label }, 200, "public, max-age=86400, s-maxage=2592000");
  } catch (e) {
    return json({ none: true }, 200, "public, max-age=300");
  }
}
