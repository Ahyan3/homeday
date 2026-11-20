// Cloudflare: adds the full share-image URL to the home page.
import { preview } from "../lib/preview.js";
export const onRequestGet = (context) => preview(context, null);
