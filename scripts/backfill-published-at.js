// One-off: fill the Notion "PublishedAt" date for existing rows from the podcast RSS feed
// (it lists every episode; the YouTube feed only has the latest 15).
//   node scripts/backfill-published-at.js           -> dry run, prints unmatched rows
//   node scripts/backfill-published-at.js --write   -> adds the property if missing and writes dates
// Rows that already have a PublishedAt are left alone.
require('dotenv').config({ quiet: true });

const Parser = require('rss-parser');
const { getNotion, getDataSourceId, fetchAllPages } = require('../lib/episodes');

const PODCAST_RSS_URL = 'https://feed.firstory.me/rss/user/cjzryn64q34i607580oyblh1u';
const PROPERTY = 'PublishedAt';
const write = process.argv.includes('--write');

// "Ep.99S Ping 又來…" -> "ep99s", "《明信片 #49+50》…" -> "明信片#49+50", "《特別篇》…" -> null (matched by title)
function episodeKey(title) {
	const s = (title || '').normalize('NFKC').trim();
	const ep = s.match(/^Ep\s*\.?\s*(\d+)(S?)\b/i);
	if (ep) return `ep${Number(ep[1])}${ep[2].toLowerCase()}`;
	const series = s.match(/^《\s*([^》#]+?)\s*#\s*([\d+]+)\s*》/);
	if (series) return `${series[1]}#${series[2]}`;
	return null;
}

const normalizeTitle = (t) => (t || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

(async () => {
	const feed = await new Parser({ timeout: 20000 }).parseURL(PODCAST_RSS_URL);
	const byKey = new Map();
	const byTitle = new Map();
	for (const item of feed.items) {
		const date = (item.isoDate || '').slice(0, 10);
		if (!date) continue;
		const key = episodeKey(item.title);
		if (key && !byKey.has(key)) byKey.set(key, date);
		byTitle.set(normalizeTitle(item.title), date);
	}

	const notion = getNotion();
	const dataSourceId = getDataSourceId();
	const pages = await fetchAllPages(dataSourceId);

	let matched = 0;
	let skipped = 0;
	const unmatched = [];
	const updates = [];
	for (const page of pages) {
		if (page.properties?.[PROPERTY]?.date?.start) { skipped++; continue; }
		const title = (page.properties?.PodcastTitle?.rich_text || []).map(t => t.plain_text).join('');
		const key = episodeKey(title);
		let date = key ? byKey.get(key) : null;
		if (!date) {
			// Titles without an episode key (《特別篇》, 《中美洲特輯》…): exact or prefix title match.
			const norm = normalizeTitle(title);
			date = byTitle.get(norm);
			if (!date && norm.length >= 12) {
				for (const [t, d] of byTitle) if (t.startsWith(norm.slice(0, 20)) || norm.startsWith(t.slice(0, 20))) { date = d; break; }
			}
		}
		if (date) { matched++; updates.push({ page, date }); } else unmatched.push(title || `(no title) ${page.id}`);
	}

	console.log(`feed items: ${feed.items.length}, rows: ${pages.length}, already dated: ${skipped}, matched: ${matched}, unmatched: ${unmatched.length}`);
	unmatched.forEach(t => console.log(`  UNMATCHED ${t.slice(0, 70)}`));

	if (!write) { console.log('dry run — pass --write to update Notion'); return; }

	const schema = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
	if (!schema.properties?.[PROPERTY]) {
		await notion.dataSources.update({ data_source_id: dataSourceId, properties: { [PROPERTY]: { date: {} } } });
		console.log(`added "${PROPERTY}" date property`);
	}
	for (const [i, { page, date }] of updates.entries()) {
		await notion.pages.update({ page_id: page.id, properties: { [PROPERTY]: { date: { start: date } } } });
		if ((i + 1) % 50 === 0) console.log(`  updated ${i + 1}/${updates.length}`);
	}
	console.log(`updated ${updates.length} rows`);
})().catch(err => { console.error(err.message); process.exit(1); });
