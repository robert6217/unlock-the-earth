// Shareable links: https://<site>/?ep=288 · ?ep=99S · ?ep=<YouTube video id> · ?place=冰島
// The same rules are mirrored in lib/share.js for the Open Graph page (CRA can't import from outside src).

// "Ep.288 …" -> "288", "Ep 99S …" -> "99S"; titles without an episode number -> null
export const episodeNumberOf = (title) => {
	const m = (title || '').normalize('NFKC').trim().match(/^Ep\s*\.?\s*(\d+)(S?)\b/i);
	return m ? `${Number(m[1])}${m[2].toUpperCase()}` : null;
};

export const youtubeIdOf = (url) => {
	const m = (url || '').match(/(?:youtu\.be\/|[?&]v=|\/(?:shorts|live|embed)\/)([\w-]{11})/);
	return m ? m[1] : null;
};

// The shortest stable identifier for one episode row.
export const shareParamsFor = (ep) => {
	const number = episodeNumberOf(ep.podcast.title);
	if (number) return { ep: number };
	const video = youtubeIdOf(ep.podcast.url);
	if (video) return { ep: video };
	return { place: ep.name };
};

export const shareUrlFor = (ep, origin = window.location.origin) =>
	`${origin}/?${new URLSearchParams(shareParamsFor(ep))}`;

// Reads ?ep= / ?place= (or the same in the #hash, used by the share page's fallback redirect).
export const readShareParams = (location = window.location) => {
	const params = new URLSearchParams(location.search);
	const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
	const ep = params.get('ep') || hash.get('ep');
	const place = params.get('place') || hash.get('place');
	return ep || place ? { ep, place } : null;
};

// All location rows the link points at (an episode can cover several places).
export const findSharedEpisodes = (locations, { ep, place }) => {
	if (ep) {
		const code = ep.trim();
		const byNumber = locations.filter(l => episodeNumberOf(l.podcast.title) === code.toUpperCase());
		if (byNumber.length) return byNumber;
		return locations.filter(l => youtubeIdOf(l.podcast.url) === code || l.id === code);
	}
	if (place) {
		const name = place.trim();
		const exact = locations.filter(l => l.name === name);
		return exact.length ? exact : locations.filter(l => l.name.includes(name));
	}
	return [];
};
