// Vercel route. The logic lives in lib/checkout.js, shared with Cloudflare.
import { handleCheckout, checkoutInfo } from "../lib/checkout.js";
export const POST = (request) => handleCheckout(request, process.env);
export const GET = () => checkoutInfo(process.env);
