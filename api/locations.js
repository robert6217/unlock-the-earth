const { fetchAllPages, formatPage, fetchYouTubeFeed, newestEpisode } = require('../lib/episodes');

// Let Vercel's CDN serve the response for 10 minutes and keep serving the stale copy
// (while refreshing in the background) for a day. Without this every page view
// hit Notion and YouTube, which is slow and burns the Notion rate limit.
const CACHE_HEADER = 'public, s-maxage=600, stale-while-revalidate=86400';
// When YouTube couldn't be reached, "latest" is only a fallback: cache it briefly so the
// real newest video shows up again within a minute or two instead of sticking for hours.
const FALLBACK_CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

module.exports = async (req, res) => {
	// The frontend is served from the same origin; CORS is only for third parties reading the JSON.
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

	if (req.method === 'OPTIONS') {
		res.status(204).end();
		return;
	}
	if (req.method !== 'GET') {
		res.setHeader('Allow', 'GET, OPTIONS');
		res.status(405).json({ error: 'Method Not Allowed' });
		return;
	}

	try {
		const [pages, youtube] = await Promise.all([
			fetchAllPages(),
			fetchYouTubeFeed().catch(err => {
				console.error('YouTube RSS error:', err.message);
				return [];
			}),
		]);

		const episodes = pages.map(formatPage).filter(Boolean);
		// Places suggested by the weekly sync stay off the map until NeedsReview is unticked in Notion.
		const locations = pages
			.filter(page => page.properties?.NeedsReview?.checkbox !== true)
			.map(formatPage)
			.filter(ep => ep && ep.coordinates);

		const newest = youtube[0];
		// Fallback when YouTube is unreachable: the most recently released episode in Notion
		// (by PublishedAt), not simply the first row of the query, which is in creation order.
		const latest = newest
			? { id: newest.videoId, name: 'YouTube 最新上架', podcast: { title: newest.title, url: newest.url } }
			: newestEpisode(episodes);

		res.setHeader('Cache-Control', newest ? CACHE_HEADER : FALLBACK_CACHE_HEADER);
		res.status(200).json({
			latest,
			locations,
			pendingCount: episodes.length - locations.length, // rows still waiting for coordinates or review
			updatedAt: new Date().toISOString(),
		});
	} catch (error) {
		console.error('locations error:', error);
		res.setHeader('Cache-Control', 'no-store');
		res.status(500).json({ error: 'Internal Server Error' });
	}
};
