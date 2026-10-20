// Store click counter (20 Oct 2026). When a visitor clicks a Microsoft Store link, tell api.duovox.net so the
// DuoVox admin can show how many visitors go on to open the Store listing. Sends only the site, the product id
// and the page path - nothing about the visitor (no cookie, no id). Never delays or blocks the click.
(function () {
	var URL_ = 'https://api.duovox.net/web/store-click';
	document.addEventListener('click', function (e) {
		var a = e.target && e.target.closest ? e.target.closest('a[href*="apps.microsoft.com/detail/"]') : null;
		if (!a) return;
		var m = a.href.match(/detail\/([0-9A-Za-z]{12})/);
		if (!m) return;
		var body = JSON.stringify({ site: location.hostname.replace(/^www\./, ''), product: m[1], page: location.pathname });
		try {
			if (navigator.sendBeacon) navigator.sendBeacon(URL_, new Blob([body], { type: 'text/plain' }));
			else fetch(URL_, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' });
		} catch (err) { /* counting must never break the link */ }
	}, true);
})();
