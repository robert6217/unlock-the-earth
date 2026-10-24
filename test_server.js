// Local API server for development: `node test_server.js` (port 4000), then `npm start`.
// It mounts the exact same handlers Vercel deploys from /api, so local and production
// can no longer drift apart (they used to be two copies with different field mappings).
//
// `node test_server.js --mock` serves /api/locations from public/map_info/data.json instead
// of Notion/YouTube, so the frontend can be tested offline and without credentials.
require('dotenv').config();

const express = require('express');
const locationsHandler = require('./api/locations');
const syncLatestHandler = require('./api/sync-latest');
const sharePageHandler = require('./api/share-page');
const { isValidCoordinate } = require('./lib/episodes');

const app = express();
// Not PORT: react-scripts reads PORT from the same .env and the two servers would collide.
const port = process.env.API_PORT || 4000;
const useMock = process.argv.includes('--mock') || process.env.USE_MOCK === '1';

function mockLocationsHandler(req, res) {
	if (req.method === 'OPTIONS') return res.status(204).end();
	if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

	const rows = require('./public/map_info/data.json');
	const episodes = rows.map((row, i) => ({
		id: row._id?.$oid || String(i),
		name: row.name || '未命名',
		continent: row.continent || '其他',
		coordinates: isValidCoordinate(row.coordinates?.lat, row.coordinates?.lng) ? row.coordinates : null,
		podcast: { title: row.podcast?.title || '', url: row.podcast?.url || null },
	}));
	const locations = episodes.filter(ep => ep.coordinates);
	const newest = locations[locations.length - 1] || null;

	res.setHeader('Cache-Control', 'no-store');
	res.status(200).json({
		latest: newest && { id: newest.id, name: 'YouTube 最新上架', podcast: newest.podcast },
		locations,
		pendingCount: episodes.length - locations.length,
		updatedAt: new Date().toISOString(),
	});
}

app.all('/api/locations', useMock ? mockLocationsHandler : locationsHandler);
app.all('/api/sync-latest', syncLatestHandler);
// On Vercel, /?ep=… and /?place=… are rewritten to this (vercel.json); locally call it directly.
// It needs the app's index.html: set SHARE_HTML_ORIGIN=http://localhost:3000 while `npm start` runs.
app.get('/api/share-page', sharePageHandler);

app.listen(port, () => {
	console.log(`API server running on http://localhost:${port}${useMock ? ' (mock data, no Notion)' : ''}`);
});
