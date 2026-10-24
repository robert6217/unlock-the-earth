// Weekly job (see vercel.json "crons"): add new YouTube episodes to the Notion data source.
//
// What it can do automatically: title + link of every new episode, with duplicates skipped.
// What it cannot do reliably: the location. A title like
// "Ep.245 高加索國家三角戀 | 亞美尼亞的聖山在土耳其?" does not map to one coordinate,
// so new rows are created WITHOUT Lat/Lng. The map ignores rows without coordinates,
// so nothing broken shows up; fill in Name / Continent / Lat / Lng in Notion when you have time.
//
// Required env vars:
//   NOTION_API_KEY        – the integration needs the "Insert content" capability
//   NOTION_DATA_SOURCE_ID – (or NOTION_DATABASE_ID)
//   CRON_SECRET           – Vercel sends it as "Authorization: Bearer <CRON_SECRET>"
// Optional:
//   SYNC_SKIP_PATTERN     – regex; matching titles are never added (e.g. "^《幕後")
//
// Manual run:  curl -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/sync-latest?dryRun=1"

const {
	getNotion,
	getDataSourceId,
	fetchAllPages,
	extractYouTubeId,
	fetchYouTubeFeed,
} = require('../lib/episodes');

const PENDING_NAME = '待補地點';

function isAuthorized(req) {
	const secret = process.env.CRON_SECRET;
	if (!secret) return false; // refuse to run unauthenticated in production
	return req.headers.authorization === `Bearer ${secret}`;
}

module.exports = async (req, res) => {
	res.setHeader('Cache-Control', 'no-store');

	if (!isAuthorized(req)) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}

	const dryRun = ['1', 'true'].includes(String(req.query?.dryRun || ''));

	try {
		const dataSourceId = getDataSourceId();
		const [pages, feed] = await Promise.all([fetchAllPages(dataSourceId), fetchYouTubeFeed()]);

		const known = new Set(
			pages.map(p => extractYouTubeId(p.properties?.PodcastUrl?.url)).filter(Boolean)
		);
		const skip = process.env.SYNC_SKIP_PATTERN ? new RegExp(process.env.SYNC_SKIP_PATTERN) : null;

		// RSS is newest-first; insert oldest-first so Notion's created order matches release order.
		const toAdd = feed
			.filter(v => v.videoId && !known.has(v.videoId))
			.filter(v => !(skip && skip.test(v.title)))
			.reverse();

		if (!dryRun) {
			const notion = getNotion();
			for (const video of toAdd) {
				await notion.pages.create({
					parent: { type: 'data_source_id', data_source_id: dataSourceId },
					properties: {
						Name: { title: [{ text: { content: PENDING_NAME } }] },
						PodcastTitle: { rich_text: [{ text: { content: video.title.slice(0, 2000) } }] },
						PodcastUrl: { url: video.url },
					},
				});
			}
		}

		res.status(200).json({
			dryRun,
			checked: feed.length,
			added: toAdd.map(v => ({ title: v.title, url: v.url })),
		});
	} catch (error) {
		console.error('sync-latest error:', error);
		res.status(500).json({ error: 'Sync failed', details: error.message });
	}
};
