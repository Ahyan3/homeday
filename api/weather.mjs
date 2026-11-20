// Vercel route. The logic lives in lib/weather.js, shared with Cloudflare.
import { handleWeather } from "../lib/weather.js";
export const GET = (request) => handleWeather(request);
