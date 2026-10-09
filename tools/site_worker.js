// Serves duovox.net from Cloudflare (Workers static assets), keeping every address exactly as it was on
// GitHub Pages (9 Oct 2026).
//
// Why a script at all: Cloudflare's built-in HTML handling either redirects /calls.html to /calls (which
// every canonical link, the sitemap, hreflang alternates, the app and the Store listing point at), or, with
// html_handling "none", stops serving /es/ as /es/index.html. So html_handling is "none" (files are served
// exactly by name, no redirects) and this script handles only what does NOT match a file:
//   /  and  /es/      -> the folder's index.html
//   /es  (a folder)   -> 301 to /es/   (what GitHub Pages did)
//   anything else     -> 404.html with a real 404 status
// Requests that match a file never reach this script (run_worker_first is off), so they cost nothing.
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const asset = (path) => env.ASSETS.fetch(new Request(new URL(path, url.origin), request));

		if (url.pathname.endsWith("/")) {
			const res = await asset(url.pathname + "index.html");
			if (res.status !== 404) return res;
		} else if (!url.pathname.split("/").pop().includes(".")) {
			const res = await asset(url.pathname + "/index.html");
			if (res.status !== 404) {
				return Response.redirect(url.origin + url.pathname + "/" + url.search + url.hash, 301);
			}
		}
		const nf = await asset("/404.html");
		return new Response(nf.body, { status: 404, headers: nf.headers });
	},
};
