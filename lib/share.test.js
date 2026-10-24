const test = require('node:test');
const assert = require('node:assert/strict');
const { episodeNumberOf, youtubeIdOf, findSharedEpisodes, trustedSiteUrl, buildMeta, injectMeta, fallbackPage } = require('./share');

const row = (id, name, title, url, continent = '歐洲') => ({ id, name, continent, coordinates: { lat: 1, lng: 1 }, podcast: { title, url } });
const rows = [
	row('a', '札格雷布', 'Ep.288 克羅埃西亞自駕大縱走', 'https://www.youtube.com/watch?v=9YYWgsIdT7g'),
	row('b', '十六湖', 'Ep.288 克羅埃西亞自駕大縱走', 'https://www.youtube.com/watch?v=9YYWgsIdT7g'),
	row('c', '印度', 'Ep.99S Ping 又來！', 'https://youtu.be/AAAAAAAAAAA?si=x', '亞洲'),
	row('d', '曼谷', '《明信片 #68+69》曼谷 <script>', 'https://www.youtube.com/watch?v=UcJp3-1xQBk', '亞洲'),
	row('e', '香港', '《特別篇》香港', 'https://podcasts.apple.com/x', '亞洲'),
	row('f', '冰島', 'Ep.157 冰島', 'https://youtu.be/BBBBBBBBBBB'),
];

test('episode numbers and video ids', () => {
	assert.equal(episodeNumberOf('Ep.288 克羅埃西亞'), '288');
	assert.equal(episodeNumberOf('Ep 284 離職'), '284');
	assert.equal(episodeNumberOf('Ep.99S Ping'), '99S');
	assert.equal(episodeNumberOf('《明信片 #68+69》'), null);
	assert.equal(youtubeIdOf('https://youtu.be/AAAAAAAAAAA?si=x'), 'AAAAAAAAAAA');
	assert.equal(youtubeIdOf('https://www.youtube.com/watch?v=9YYWgsIdT7g'), '9YYWgsIdT7g');
	assert.equal(youtubeIdOf('https://podcasts.apple.com/x'), null);
});

test('finds shared episodes by number, video id, row id and place', () => {
	assert.deepEqual(findSharedEpisodes(rows, { ep: '288' }).map(r => r.id), ['a', 'b']);
	assert.deepEqual(findSharedEpisodes(rows, { ep: '99s' }).map(r => r.id), ['c']);
	assert.deepEqual(findSharedEpisodes(rows, { ep: 'UcJp3-1xQBk' }).map(r => r.id), ['d']);
	assert.deepEqual(findSharedEpisodes(rows, { ep: 'e' }).map(r => r.id), ['e']);
	assert.deepEqual(findSharedEpisodes(rows, { place: '冰島' }).map(r => r.id), ['f']);
	assert.deepEqual(findSharedEpisodes(rows, { place: '十六' }).map(r => r.id), ['b']);
	assert.deepEqual(findSharedEpisodes(rows, { ep: '999' }), []);
});

test('meta uses the episode title, its places and the YouTube thumbnail', () => {
	const meta = buildMeta(findSharedEpisodes(rows, { ep: '288' }), { siteUrl: 'https://x.app', shareUrl: 'https://x.app/?ep=288' });
	assert.equal(meta.title, 'Ep.288 克羅埃西亞自駕大縱走');
	assert.match(meta.description, /札格雷布、十六湖（歐洲）/);
	assert.equal(meta.image, 'https://i.ytimg.com/vi/9YYWgsIdT7g/hqdefault.jpg');
	const noVideo = buildMeta([rows[4]], { siteUrl: 'https://x.app', shareUrl: 'u' });
	assert.equal(noVideo.image, 'https://x.app/logo512.png');
});

test('injectMeta replaces the default tags and escapes HTML', () => {
	const shell = '<html><head><meta name="description" content="site"><meta property="og:title" content="site"/><meta name="twitter:card" content="summary"><title>Unlock the Earth</title></head><body></body></html>';
	const meta = buildMeta([rows[3]], { siteUrl: 'https://x.app', shareUrl: 'https://x.app/?ep=UcJp3-1xQBk' });
	const html = injectMeta(shell, meta);
	assert.equal((html.match(/og:title/g) || []).length, 1);
	assert.equal((html.match(/twitter:card/g) || []).length, 1);
	assert.match(html, /<title>《明信片 #68\+69》曼谷 &lt;script&gt; \| 解鎖地球地圖<\/title>/);
	assert.ok(!html.includes('<script>'));
	assert.match(html, /<meta name="description" content="地點：曼谷/);
});

test('only known hosts are trusted for the site URL', () => {
	const vercel = { VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'unlock-the-earth.vercel.app', VERCEL_URL: 'unlock-the-earth-abc123.vercel.app' };
	assert.equal(trustedSiteUrl('unlock-the-earth.vercel.app', vercel), 'https://unlock-the-earth.vercel.app');
	assert.equal(trustedSiteUrl('UNLOCK-THE-EARTH-ABC123.vercel.app', vercel), 'https://unlock-the-earth-abc123.vercel.app');
	// a forged / unknown Host falls back to production instead of being fetched
	assert.equal(trustedSiteUrl('evil.example', vercel), 'https://unlock-the-earth.vercel.app');
	assert.equal(trustedSiteUrl('localhost:4000', vercel), 'https://unlock-the-earth.vercel.app');
	// local development (not on Vercel)
	assert.equal(trustedSiteUrl('localhost:4000', {}), 'http://localhost:4000');
	assert.equal(trustedSiteUrl('evil.example', {}), null);
	// custom domain via SITE_URL
	assert.equal(trustedSiteUrl('map.example.com', { VERCEL: '1', SITE_URL: 'https://map.example.com/' }), 'https://map.example.com');
	assert.equal(trustedSiteUrl('x', { SITE_URL: 'not a url' }), null);
});

test('fallback page redirects to the app with the link in the hash', () => {
	const html = fallbackPage(null, '/#ep=288');
	assert.match(html, /http-equiv="refresh" content="0; url=\/#ep=288"/);
});
