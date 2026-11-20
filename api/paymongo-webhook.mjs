// Vercel route. The logic lives in lib/webhook.js, shared with Cloudflare.
import { handleWebhook } from "../lib/webhook.js";
export const POST = (request) => handleWebhook(request, process.env);
