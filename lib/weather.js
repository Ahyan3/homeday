// Weather on one past day, from NASA POWER (free, no key; please credit "NASA POWER").
// GET /api/weather?lat=14.65&lon=121.05&date=2019-03-16 -> {hi, lo, rain} in °C and mm, or {none: reason}
import { json } from "./shared.js";

export async function handleWeather(request) {
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get("lat")), lon = Number(q.get("lon")), date = String(q.get("date") || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return json({ error: "Give lat, lon and date as YYYY-MM-DD." }, 400);
  if (+m[1] < 1981) return json({ none: "before-1981" }, 200, "public, max-age=31536000");

  const day = m[1] + m[2] + m[3];
  const ageDays = (Date.now() - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000;
  const url = "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&format=JSON&time-standard=LST" +
    `&latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&start=${day}&end=${day}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return json({ none: "unavailable" }, 200, "public, max-age=600");
    const p = (await r.json()).properties.parameter;
    const hi = p.T2M_MAX[day], lo = p.T2M_MIN[day], rain = p.PRECTOTCORR[day];
    if (hi == null || hi <= -999 || lo <= -999) return json({ none: "not-yet" }, 200, "public, max-age=21600");
    // Old days never change, so let the CDN keep them for a year.
    const cache = ageDays > 30 ? "public, max-age=86400, s-maxage=31536000" : "public, max-age=3600";
    return json({ hi: Math.round(hi), lo: Math.round(lo), rain: rain > -999 ? Math.round(rain * 10) / 10 : null }, 200, cache);
  } catch (e) {
    return json({ none: "unavailable" }, 200, "public, max-age=600");
  }
}
