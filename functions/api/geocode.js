// Cloudflare Pages route. The logic lives in lib/geocode.js, shared with Vercel.
import { handleGeocode } from "../../lib/geocode.js";
export const onRequestGet = (context) => handleGeocode(context.request);
