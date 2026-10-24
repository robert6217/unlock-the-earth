// Shared data-access helpers for the Vercel functions (api/*) and the local dev server.
// Kept outside /api so Vercel does not deploy it as its own endpoint.

const { Client } = require('@notionhq/client');
const Parser = require('rss-parser');

const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCK3UVOXNDeMOKpQcc8ix82w';
const YOUTUBE_RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

const parser = new Parser({ timeout: 8000 });

let notionClient = null;
function getNotion() {
	if (!process.env.NOTION_API_KEY) {
		throw new Error('Missing NOTION_API_KEY');
	}
	if (!notionClient) {
		notionClient = new Client({ auth: process.env.NOTION_API_KEY });
	}
	return notionClient;
}

// @notionhq/client v5 queries *data sources*. NOTION_DATA_SOURCE_ID is the accurate name;
// NOTION_DATABASE_ID is still accepted so existing Vercel settings keep working.
function getDataSourceId() {
	const id = process.env.NOTION_DATA_SOURCE_ID || process.env.NOTION_DATABASE_ID;
	if (!id) {
		throw new Error('Missing NOTION_DATA_SOURCE_ID (or NOTION_DATABASE_ID)');
	}
	return id;
}

async function fetchAllPages(dataSourceId = getDataSourceId()) {
	const notion = getNotion();
	const results = [];
	let cursor;

	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			start_cursor: cursor,
			page_size: 100,
		});
		results.push(...response.results);
		cursor = response.has_more ? response.next_cursor : undefined;
	} while (cursor);

	return results;
}

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

function isValidCoordinate(lat, lng) {
	return isFiniteNumber(lat) && isFiniteNumber(lng)
		&& lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function plainText(richText) {
	return (richText || []).map(t => t.plain_text).join('').trim();
}

// Convert one Notion page into the shape the frontend uses.
// Missing coordinates become null (they used to become 0,0 and pile up in the Gulf of Guinea).
function formatPage(page) {
	if (!page || !page.properties) return null;
	const props = page.properties;
	const lat = props.Lat?.number;
	const lng = props.Lng?.number;
	const hasLocation = isValidCoordinate(lat, lng);

	return {
		id: page.id,
		name: plainText(props.Name?.title) || '未命名',
		continent: props.Continent?.select?.name || '其他',
		coordinates: hasLocation ? { lat, lng } : null,
		publishedAt: props.PublishedAt?.date?.start?.slice(0, 10) || null, // YYYY-MM-DD, for the timeline
		podcast: {
			title: plainText(props.PodcastTitle?.rich_text),
			url: props.PodcastUrl?.url || null,
		},
	};
}

// Accepts youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /live/ID, /embed/ID, or "yt:video:ID".
function extractYouTubeId(input) {
	if (!input) return null;
	const s = String(input);
	if (s.startsWith('yt:video:')) return s.slice('yt:video:'.length);
	try {
		const u = new URL(s);
		if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
		if (u.hostname.endsWith('youtube.com')) {
			if (u.searchParams.get('v')) return u.searchParams.get('v');
			const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
			if (m) return m[1];
		}
	} catch (_) {
		/* not a URL */
	}
	return null;
}

// YouTube's RSS endpoint intermittently answers 404/500 for valid channels, so retry a few times.
async function parseFeedWithRetry(attempts = 3) {
	for (let i = 1; ; i++) {
		try {
			return await parser.parseURL(YOUTUBE_RSS_URL);
		} catch (err) {
			if (i >= attempts) throw err;
			await new Promise(resolve => setTimeout(resolve, 500 * i));
		}
	}
}

async function fetchYouTubeFeed() {
	const feed = await parseFeedWithRetry();
	return (feed.items || [])
		.filter(item => !/\/shorts\//.test(item.link || '')) // Shorts are not episodes
		.map(item => ({
			videoId: extractYouTubeId(item.id) || extractYouTubeId(item.link),
			title: (item.title || '').trim(),
			url: item.link,
			publishedAt: item.pubDate || item.isoDate || null,
		}));
}

module.exports = {
	YOUTUBE_RSS_URL,
	getNotion,
	getDataSourceId,
	fetchAllPages,
	formatPage,
	isValidCoordinate,
	extractYouTubeId,
	fetchYouTubeFeed,
};
