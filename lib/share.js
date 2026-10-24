// Open Graph previews for shareable links (/?ep=288, /?ep=<YouTube id>, /?place=冰島).
// Link rules mirror src/shareLinks.js (CRA can't import from outside src, so they live in both places).

const SITE_NAME = '解鎖地球地圖';

function episodeNumberOf(title) {
	const m = (title || '').normalize('NFKC').trim().match(/^Ep\s*\.?\s*(\d+)(S?)\b/i);
	return m ? `${Number(m[1])}${m[2].toUpperCase()}` : null;
}

function youtubeIdOf(url) {
	const m = (url || '').match(/(?:youtu\.be\/|[?&]v=|\/(?:shorts|live|embed)\/)([\w-]{11})/);
	return m ? m[1] : null;
}

// locations: rows in the /api/locations shape (with coordinates)
function findSharedEpisodes(locations, { ep, place }) {
	if (ep) {
		const code = String(ep).trim();
		const byNumber = locations.filter(l => episodeNumberOf(l.podcast.title) === code.toUpperCase());
		if (byNumber.length) return byNumber;
		return locations.filter(l => youtubeIdOf(l.podcast.url) === code || l.id === code);
	}
	if (place) {
		const name = String(place).trim();
		const exact = locations.filter(l => l.name === name);
		return exact.length ? exact : locations.filter(l => l.name.includes(name));
	}
	return [];
}

// The site's own URL, never taken blindly from request headers (it decides where index.html is
// fetched from and ends up in CDN-cached HTML). The request's Host is used only when it is one of
// the hosts this deployment is known to answer on (Vercel system env vars, SITE_URL, or localhost
// outside Vercel); anything else falls back to the production URL. null = nothing trusted.
function trustedSiteUrl(requestHost, env = process.env) {
	const host = String(requestHost || '').trim().toLowerCase();
	let configured = null;
	try { configured = env.SITE_URL ? new URL(env.SITE_URL).host : null; } catch (_) { /* invalid SITE_URL: ignore */ }
	const allowed = new Set([configured, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL, env.VERCEL_URL]
		.filter(Boolean)
		.map(h => h.toLowerCase()));
	if (allowed.has(host)) return `https://${host}`;
	if (!env.VERCEL && /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) return `http://${host}`;
	if (configured) return env.SITE_URL.replace(/\/$/, '');
	if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
	return null;
}

const escapeHtml = (s) => String(s)
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;')
	.replace(/'/g, '&#39;');

const unique = (list) => [...new Set(list.filter(Boolean))];

function buildMeta(matches, { siteUrl, shareUrl }) {
	const first = matches[0];
	const sameEpisode = unique(matches.map(m => m.podcast.title)).length === 1;
	const title = sameEpisode ? (first.podcast.title || first.name) : `${first.name}：${matches.length} 集`;
	const places = unique(matches.map(m => m.name)).join('、');
	const continents = unique(matches.map(m => m.continent)).join('、');
	const video = youtubeIdOf(first.podcast.url);
	return {
		title,
		description: `地點：${places}${continents ? `（${continents}）` : ''}。`
			+ (sameEpisode ? '在《解鎖地球》互動地圖上看這一集去了哪裡。' : '在《解鎖地球》互動地圖上看這裡的每一集。'),
		image: video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : `${siteUrl}/logo512.png`,
		url: shareUrl,
	};
}

function renderMetaTags(meta) {
	const tags = [
		['property', 'og:type', 'website'],
		['property', 'og:site_name', SITE_NAME],
		['property', 'og:title', meta.title],
		['property', 'og:description', meta.description],
		['property', 'og:image', meta.image],
		['property', 'og:url', meta.url],
		['name', 'twitter:card', 'summary_large_image'],
		['name', 'twitter:title', meta.title],
		['name', 'twitter:description', meta.description],
		['name', 'twitter:image', meta.image],
	];
	return tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`).join('');
}

// Replace the app shell's title / description / default og:+twitter: tags with the episode's.
function injectMeta(html, meta) {
	const pageTitle = escapeHtml(`${meta.title} | ${SITE_NAME}`);
	return html
		.replace(/<meta\s+(?:property|name)="(?:og|twitter):[^"]*"[^>]*>/gi, '')
		.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(meta.description)}" />`)
		.replace(/<title>[\s\S]*?<\/title>/i, `<title>${pageTitle}</title>`)
		.replace(/<\/head>/i, `${renderMetaTags(meta)}</head>`);
}

// Used only if the app shell can't be fetched: the tags for crawlers, then off to the app.
function fallbackPage(meta, redirectTo) {
	const target = escapeHtml(redirectTo);
	return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" />`
		+ `<title>${escapeHtml(meta ? `${meta.title} | ${SITE_NAME}` : SITE_NAME)}</title>`
		+ (meta ? renderMetaTags(meta) : '')
		+ `<meta http-equiv="refresh" content="0; url=${target}" /></head>`
		+ `<body><a href="${target}">${escapeHtml(SITE_NAME)}</a></body></html>`;
}

module.exports = {
	episodeNumberOf,
	youtubeIdOf,
	findSharedEpisodes,
	trustedSiteUrl,
	escapeHtml,
	buildMeta,
	renderMetaTags,
	injectMeta,
	fallbackPage,
};
