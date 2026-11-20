// Cloudflare Pages route. The logic lives in lib/weather.js, shared with Vercel.
import { handleWeather } from "../../lib/weather.js";
export const onRequestGet = (context) => handleWeather(context.request);
