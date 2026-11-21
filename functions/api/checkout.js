// Cloudflare Pages route. The logic lives in lib/checkout.js, shared with Vercel.
import { handleCheckout, checkoutInfo } from "../../lib/checkout.js";
export const onRequestPost = (context) => handleCheckout(context.request, context.env);
export const onRequestGet = (context) => checkoutInfo(context.env);
