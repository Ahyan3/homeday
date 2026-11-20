// Vercel route. The logic lives in lib/geocode.js, shared with Cloudflare.
import { handleGeocode } from "../lib/geocode.js";
export const GET = (request) => handleGeocode(request);
