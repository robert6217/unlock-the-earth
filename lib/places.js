// Suggest map locations for a new episode from its title.
//
// 1. Claude reads the title and returns the places it is about (Traditional Chinese name,
//    continent, an English geocoding query and its own rough coordinates).
// 2. Each query is geocoded with OpenStreetMap Nominatim. If Nominatim finds nothing, or
//    lands far away from Claude's estimate (same-named town elsewhere), Claude's estimate is used.
//
// Suggestions are written to Notion with NeedsReview = true; they are guesses, not facts.

const { Anthropic } = require('@anthropic-ai/sdk');
const { isValidCoordinate } = require('./episodes');

const MODEL = process.env.PLACE_MODEL || 'claude-opus-5-5';
const MAX_PLACES = 5;
const MAX_GEOCODE_DISTANCE_KM = 300;
// Continent values must match the Notion "Continent" select options.
const CONTINENTS = ['亞洲', '歐洲', '非洲', '北美洲', '南美洲', '大洋洲', '南極洲'];

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Nominatim's usage policy asks for an identifying User-Agent and at most 1 request per second.
const USER_AGENT = 'unlock-the-earth/1.2 (+https://unlock-the-earth.vercel.app)';
const GEOCODE_INTERVAL_MS = 1100;

const SYSTEM_PROMPT = `You place episodes of a Taiwanese travel/history podcast ("解鎖地球") on a world map.
Given one episode title, list the specific places the episode is about.

Rules:
- Only places the title clearly says the episode covers. Skip places only mentioned in passing or as a guest's background, and skip Taiwan unless the episode is about travelling in Taiwan.
- If the title has no specific geographic focus (careers, digital nomad life, behind-the-scenes chat, general travel tips), return an empty list.
- At most ${MAX_PLACES} places, most important first. Prefer the most specific place named (city, region, landmark); use a country only when no smaller place is named.
- name: the place name in Traditional Chinese as commonly written in Taiwan (e.g. 札格雷布, 黃刀鎮, 冰島).
- continent: one of ${CONTINENTS.join(', ')}. Mexico, Central America and the Caribbean are 北美洲; Egypt and North Africa are 非洲; Russia west of the Urals, Turkey's European side and the Caucasus count as 歐洲 only if the title frames them that way, otherwise 亞洲.
- query: an English search string a geocoder can resolve unambiguously, e.g. "Zagreb, Croatia", "Plitvice Lakes National Park, Croatia".
- lat / lng: your best estimate of the place's coordinates in decimal degrees.

Examples:
"Ep.288 克羅埃西亞自駕大縱走 | 走入冰與火之歌 | 微醺海島赫瓦爾、十六湖、羅維尼、札格雷布 with 魚魚" -> 札格雷布, 十六湖, 赫瓦爾, 羅維尼 (歐洲)
"Ep.270 極光導遊三要素 | 黃刀鎮打工度假生存之道 | 追極光必看！" -> 黃刀鎮 (北美洲)
"Ep 284 離職後的出走指南 | 厭世社畜裸辭去：數位遊牧 4 年實錄 with Dori" -> []`;

const PLACES_SCHEMA = {
	type: 'object',
	properties: {
		places: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					continent: { type: 'string', enum: CONTINENTS },
					query: { type: 'string' },
					lat: { type: 'number' },
					lng: { type: 'number' },
				},
				required: ['name', 'continent', 'query', 'lat', 'lng'],
				additionalProperties: false,
			},
		},
	},
	required: ['places'],
	additionalProperties: false,
};

let anthropicClient = null;
function getAnthropic() {
	if (!anthropicClient) anthropicClient = new Anthropic(); // reads ANTHROPIC_API_KEY
	return anthropicClient;
}

// Suggestions are opt-in: without a key the sync keeps creating "待補地點" rows as before.
function suggestionsEnabled() {
	return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function extractPlaces(title, { client = getAnthropic() } = {}) {
	const response = await client.beta.messages.create({
		model: MODEL,
		max_tokens: 4000,
		// A declined request is retried server-side on Anthropic's recommended fallback model.
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		output_config: {
			effort: 'low',
			format: { type: 'json_schema', schema: PLACES_SCHEMA },
		},
		system: SYSTEM_PROMPT,
		messages: [{ role: 'user', content: title }],
	});

	if (response.stop_reason === 'refusal') {
		throw new Error(`Claude declined to extract places (${response.stop_details?.category || 'no category'})`);
	}
	if (response.stop_reason === 'max_tokens') {
		throw new Error('Claude response was cut off before the JSON was complete');
	}
	const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
	const { places } = JSON.parse(text);

	return places
		.filter(p => p.name && CONTINENTS.includes(p.continent))
		.slice(0, MAX_PLACES);
}

let lastGeocodeAt = 0;
async function geocode(query, { fetchImpl = fetch } = {}) {
	const wait = lastGeocodeAt + GEOCODE_INTERVAL_MS - Date.now();
	if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
	lastGeocodeAt = Date.now();

	const url = `${NOMINATIM_URL}?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' })}`;
	const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
	if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
	const [hit] = await res.json();
	if (!hit) return null;
	const lat = Number(hit.lat);
	const lng = Number(hit.lon);
	return isValidCoordinate(lat, lng) ? { lat, lng } : null;
}

function distanceKm(a, b) {
	const rad = (d) => d * Math.PI / 180;
	const dLat = rad(b.lat - a.lat);
	const dLng = rad(b.lng - a.lng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const round = (n) => Math.round(n * 1e6) / 1e6;

// Returns [{ name, continent, lat, lng, source: 'geocoder' | 'model' }]; [] when the title has no place.
async function suggestPlaces(title, deps = {}) {
	const places = await extractPlaces(title, deps);
	const suggestions = [];

	for (const place of places) {
		const estimate = isValidCoordinate(place.lat, place.lng) ? { lat: place.lat, lng: place.lng } : null;
		let found = null;
		try {
			found = await geocode(place.query, deps);
		} catch (err) {
			console.error(`geocode failed for "${place.query}":`, err.message);
		}

		let coords = null;
		let source = null;
		if (found && (!estimate || distanceKm(found, estimate) <= MAX_GEOCODE_DISTANCE_KM)) {
			coords = found;
			source = 'geocoder';
		} else if (estimate) {
			coords = estimate;
			source = 'model';
		}
		if (!coords) continue;

		suggestions.push({ name: place.name, continent: place.continent, lat: round(coords.lat), lng: round(coords.lng), source });
	}
	return suggestions;
}

module.exports = {
	CONTINENTS,
	suggestionsEnabled,
	extractPlaces,
	geocode,
	distanceKm,
	suggestPlaces,
};
