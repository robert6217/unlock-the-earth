// Weekly job (see vercel.json "crons"): add new YouTube episodes to the Notion data source.
//
// Title + link of every new episode are added automatically, with duplicates skipped.
// With ANTHROPIC_API_KEY set, the location is suggested too (lib/places.js): one row per place,
// with Lat/Lng filled in and NeedsReview checked. Episodes without a clear place (or when the
// suggestion fails) get a single "待補地點" row WITHOUT Lat/Lng, which the map ignores;
// fill in Name / Continent / Lat / Lng in Notion when you have time.
//
// Required env vars:
//   NOTION_API_KEY        – the integration needs the "Insert content" capability
//   NOTION_DATA_SOURCE_ID – (or NOTION_DATABASE_ID)
//   CRON_SECRET           – Vercel sends it as "Authorization: Bearer <CRON_SECRET>"
// Optional:
//   SYNC_SKIP_PATTERN     – regex; matching titles are never added (e.g. "^《幕後")
//   ANTHROPIC_API_KEY     – enables location suggestions
//   PLACE_MODEL           – Claude model for suggestions (default claude-opus-5-5)
//
// Manual run:  curl -H "Authorization: Bearer $CRON_SECRET" "https://<site>/api/sync-latest?dryRun=1"

const {
	getNotion,
	getDataSourceId,
	fetchAllPages,
	extractYouTubeId,
	fetchYouTubeFeed,
} = require('../lib/episodes');
const { suggestionsEnabled, suggestPlaces } = require('../lib/places');

const PENDING_NAME = '待補地點';
const REVIEW_PROPERTY = 'NeedsReview'; // optional Notion checkbox; skipped if the data source lacks it
const DATE_PROPERTY = 'PublishedAt'; // optional Notion date, used by the map's timeline

async function suggestFor(video) {
	if (!suggestionsEnabled()) return { places: [] };
	try {
		return { places: await suggestPlaces(video.title) };
	} catch (error) {
		console.error(`place suggestion failed for "${video.title}":`, error.message);
		return { places: [], error: error.message };
	}
}

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

		const results = [];
		for (const video of toAdd) {
			results.push({ video, ...(await suggestFor(video)) });
		}

		if (!dryRun && results.length) {
			const notion = getNotion();
			const schema = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
			const canFlag = schema.properties?.[REVIEW_PROPERTY]?.type === 'checkbox';
			const canDate = schema.properties?.[DATE_PROPERTY]?.type === 'date';

			for (const { video, places } of results) {
				const published = video.publishedAt ? new Date(video.publishedAt) : null;
				const episode = {
					PodcastTitle: { rich_text: [{ text: { content: video.title.slice(0, 2000) } }] },
					PodcastUrl: { url: video.url },
					...(canDate && published && !isNaN(published) && {
						[DATE_PROPERTY]: { date: { start: published.toISOString().slice(0, 10) } },
					}),
				};
				const rows = places.length
					? places.map(p => ({
						Name: { title: [{ text: { content: p.name } }] },
						Continent: { select: { name: p.continent } },
						Lat: { number: p.lat },
						Lng: { number: p.lng },
						...(canFlag && { [REVIEW_PROPERTY]: { checkbox: true } }),
					}))
					: [{ Name: { title: [{ text: { content: PENDING_NAME } }] } }];

				for (const row of rows) {
					await notion.pages.create({
						parent: { type: 'data_source_id', data_source_id: dataSourceId },
						properties: { ...row, ...episode },
					});
				}
			}
		}

		res.status(200).json({
			dryRun,
			checked: feed.length,
			suggestions: suggestionsEnabled(),
			added: results.map(({ video, places, error }) => ({
				title: video.title,
				url: video.url,
				places,
				...(error && { suggestionError: error }),
			})),
		});
	} catch (error) {
		console.error('sync-latest error:', error);
		res.status(500).json({ error: 'Sync failed', details: error.message });
	}
};
