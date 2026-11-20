// Vercel route. The logic lives in lib/checkout.js, shared with Cloudflare.
import { handleCheckout } from "../lib/checkout.js";
export const POST = (request) => handleCheckout(request, process.env);
