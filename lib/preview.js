// Cloudflare only: gives shared links a proper preview on Facebook, Messenger and WhatsApp.
// "/" gets the full image URL; "/t/<id>" also gets the pet's name, and is kept out of search engines.
import { rpc, SECURITY_HEADERS } from "./shared.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function preview(context, id) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;
  const page = await env.ASSETS.fetch(new URL("/", origin));
  let title = null, desc = null;
  if (id) {
    try {
      const t = await rpc("get_timeline", { p_id: id });
      if (t) {
        title = (t.memorial ? `In memory of ${t.name}` : `${t.name}’s life with you`) + " · Homeday";
        desc = t.memorial
          ? `A timeline of every day with ${t.name}. Leave a few words in the guestbook.`
          : `Every day since ${t.name} came home, with the weather, the moon and the number one song that day.`;
      }
    } catch (e) { /* fall back to the plain page */ }
  }
  const set = (attr) => ({ element(el) { el.setAttribute("content", attr); } });
  let rw = new HTMLRewriter()
    .on('meta[property="og:image"]', set(`${origin}/og.jpg`))
    .on("head", { element(el) { el.append(`<meta property="og:url" content="${esc(origin + new URL(request.url).pathname)}">`, { html: true }); } });
  if (title) {
    rw = rw
      .on("title", { element(el) { el.setInnerContent(title); } })
      .on('meta[property="og:title"]', set(title))
      .on('meta[property="og:description"]', set(desc))
      .on('meta[name="description"]', set(desc));
  }
  const out = rw.transform(page);
  const headers = new Headers(out.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  if (id) headers.set("X-Robots-Tag", "noindex");
  return new Response(out.body, { status: 200, headers });
}
