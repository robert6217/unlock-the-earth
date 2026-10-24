// Shared links (/?ep=288, /?place=冰島) are rewritten here by vercel.json, so link previews in
// LINE / Facebook / X show the episode instead of the generic site card. Crawlers don't run JS,
// so the tags have to be in the HTML: this returns the app's own index.html with the episode's
// title, description and YouTube thumbnail injected. Visitors get the normal app from it.
//
// Local test:  SHARE_HTML_ORIGIN=http://localhost:3000 (CRA dev server), then
//              curl "http://localhost:4000/api/share-page?ep=288"

const { fetchAllPages, formatPage } = require('../lib/episodes');
const { findSharedEpisodes, trustedSiteUrl, buildMeta, injectMeta, fallbackPage } = require('../lib/share');

module.exports = async (req, res) => {
	// Only a known host is used to build URLs or fetch the app shell (see trustedSiteUrl).
	const siteUrl = trustedSiteUrl(req.headers.host);
	const params = { ep: req.query?.ep, place: req.query?.place };
	const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();

	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	if (!siteUrl) {
		// misconfigured (no trusted site URL): fail closed, fetch nothing, just send the visitor to the app
		res.setHeader('Cache-Control', 'no-store');
		res.status(200).send(fallbackPage(null, `/#${query}`));
		return;
	}

	let meta = null;
	try {
		const locations = (await fetchAllPages()).map(formatPage).filter(l => l && l.coordinates);
		const matches = findSharedEpisodes(locations, params);
		if (matches.length) meta = buildMeta(matches, { siteUrl, shareUrl: `${siteUrl}/?${query}` });
	} catch (error) {
		console.error('share-page lookup error:', error.message);
	}

	let html = null;
	try {
		const response = await fetch(`${process.env.SHARE_HTML_ORIGIN || siteUrl}/index.html`);
		if (response.ok) html = await response.text();
	} catch (error) {
		console.error('share-page shell error:', error.message);
	}

	if (html) {
		res.setHeader('Cache-Control', meta ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'public, s-maxage=300');
		res.status(200).send(meta ? injectMeta(html, meta) : html);
		return;
	}
	// Couldn't load the app shell: crawlers still get the tags; visitors are sent to the app,
	// with the link in the #hash so this rewrite doesn't catch them again.
	res.setHeader('Cache-Control', 'no-store');
	res.status(200).send(fallbackPage(meta, `/#${query}`));
};
