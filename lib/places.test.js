// node --test lib/   (npm run test:api) — no network: Claude and Nominatim are stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestPlaces, extractPlaces, distanceKm } = require('./places');

const fakeClient = (places, extra = {}) => ({
	beta: {
		messages: {
			create: async (params) => {
				fakeClient.lastParams = params;
				return {
					stop_reason: 'end_turn',
					content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ places }) }],
					...extra,
				};
			},
		},
	},
});

const fakeFetch = (byQuery) => async (url) => {
	const q = new URL(url).searchParams.get('q');
	const hit = byQuery[q];
	return { ok: true, json: async () => (hit ? [{ lat: String(hit[0]), lon: String(hit[1]) }] : []) };
};

test('uses geocoder coordinates when they agree with the estimate', async () => {
	const client = fakeClient([{ name: '札格雷布', continent: '歐洲', query: 'Zagreb, Croatia', lat: 45.8, lng: 16.0 }]);
	const result = await suggestPlaces('Ep.288 ...', { client, fetchImpl: fakeFetch({ 'Zagreb, Croatia': [45.815, 15.9819] }) });
	assert.deepEqual(result, [{ name: '札格雷布', continent: '歐洲', lat: 45.815, lng: 15.9819, source: 'geocoder' }]);
	assert.equal(fakeClient.lastParams.output_config.format.type, 'json_schema');
});

test('falls back to the estimate when the geocoder finds a far-away namesake or nothing', async () => {
	const client = fakeClient([
		{ name: '白馬', continent: '北美洲', query: 'Whitehorse, Yukon', lat: 60.72, lng: -135.05 },
		{ name: '鯨魚谷', continent: '非洲', query: 'Wadi Al-Hitan, Egypt', lat: 29.27, lng: 30.04 },
	]);
	const result = await suggestPlaces('Ep.x', {
		client,
		fetchImpl: fakeFetch({ 'Whitehorse, Yukon': [51.5, -0.1] }), // wrong match in London; Wadi Al-Hitan not found
	});
	assert.deepEqual(result.map(r => [r.name, r.source, r.lat]), [['白馬', 'model', 60.72], ['鯨魚谷', 'model', 29.27]]);
});

test('returns no places for titles without a location', async () => {
	const result = await suggestPlaces('Ep 284 數位遊牧', { client: fakeClient([]), fetchImpl: fakeFetch({}) });
	assert.deepEqual(result, []);
});

test('drops unknown continents and caps the number of places', async () => {
	const many = Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, continent: '亞洲', query: `q${i}`, lat: 1, lng: 1 }));
	many.unshift({ name: 'X', continent: 'Mars', query: 'x', lat: 0, lng: 0 });
	const places = await extractPlaces('t', { client: fakeClient(many) });
	assert.equal(places.length, 5);
	assert.ok(places.every(p => p.continent === '亞洲'));
});

test('throws on refusal so the sync falls back to a pending row', async () => {
	const client = fakeClient([], { stop_reason: 'refusal', stop_details: { category: null } });
	await assert.rejects(extractPlaces('t', { client }), /declined/);
});

test('distanceKm is roughly right', () => {
	const km = distanceKm({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 }); // London–Paris
	assert.ok(km > 330 && km < 360, String(km));
});
