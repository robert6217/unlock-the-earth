const test = require('node:test');
const assert = require('node:assert/strict');
const { YOUTUBE_FEED_URLS, parseFeedWithRetry, newestEpisode } = require('./episodes');

test('feed URLs: channel feed first, then the uploads playlist', () => {
	assert.match(YOUTUBE_FEED_URLS[0], /channel_id=UCK3UVOXNDeMOKpQcc8ix82w$/);
	assert.match(YOUTUBE_FEED_URLS[1], /playlist_id=UUK3UVOXNDeMOKpQcc8ix82w$/);
});

test('retries alternate between the feeds until one answers', async () => {
	const tried = [];
	const parse = async (url) => {
		tried.push(url);
		if (tried.length < 3) throw new Error('Status code 404');
		return { items: ['ok'] };
	};
	const feed = await parseFeedWithRetry(6, ['a', 'b'], parse, 1);
	assert.deepEqual(feed, { items: ['ok'] });
	assert.deepEqual(tried, ['a', 'b', 'a']);
});

test('gives up after the last attempt with the last error', async () => {
	const parse = async () => { throw new Error('Status code 500'); };
	await assert.rejects(parseFeedWithRetry(3, ['a', 'b'], parse, 1), /500/);
});

test('fallback latest is the newest by release date, not the first row', () => {
	const rows = [
		{ id: 'postcard', publishedAt: '2026-08-04' },
		{ id: 'ep288', publishedAt: '2026-10-20' },
		{ id: 'undated', publishedAt: null },
		{ id: 'ep2', publishedAt: '2019-08-22' },
	];
	assert.equal(newestEpisode(rows).id, 'ep288');
	assert.equal(newestEpisode([]), null);
});
