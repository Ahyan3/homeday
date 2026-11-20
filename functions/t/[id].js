// Cloudflare: share preview for a saved timeline (the page itself is index.html).
import { preview } from "../../lib/preview.js";
export const onRequestGet = (context) => preview(context, String(context.params.id || "").toLowerCase());
