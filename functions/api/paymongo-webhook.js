// Cloudflare Pages route. The logic lives in lib/webhook.js, shared with Vercel.
import { handleWebhook } from "../../lib/webhook.js";
export const onRequestPost = (context) => handleWebhook(context.request, context.env);
