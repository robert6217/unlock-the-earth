// Quick end-to-end check of the API before deploying.
//   npm run smoke                                  -> http://localhost:4000
//   npm run smoke -- https://<preview>.vercel.app  -> any deployment
// The sync check is always a dry run, so nothing is written to Notion.
require('dotenv').config();

const base = (process.argv[2] || `http://localhost:${process.env.API_PORT || 4000}`).replace(/\/$/, '');
let failed = 0;

function check(name, ok, detail = '') {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
	if (!ok) failed++;
}

async function main() {
	console.log(`Testing ${base}\n`);

	const res = await fetch(`${base}/api/locations`);
	const data = await res.json().catch(() => null);
	check('GET /api/locations -> 200', res.status === 200, `got ${res.status}`);
	check('response has locations[]', Array.isArray(data?.locations), `${data?.locations?.length ?? 0} locations`);
	check('every location has valid coordinates', (data?.locations || []).every(l =>
		l.coordinates && Math.abs(l.coordinates.lat) <= 90 && Math.abs(l.coordinates.lng) <= 180));
	check('latest episode present', Boolean(data?.latest?.podcast?.title), data?.latest?.podcast?.title || '');
	if (typeof data?.pendingCount === 'number') console.log(`      ${data.pendingCount} Notion rows still waiting for coordinates`);
	console.log(`      Cache-Control: ${res.headers.get('cache-control')}`);

	const post = await fetch(`${base}/api/locations`, { method: 'POST' });
	check('POST /api/locations -> 405', post.status === 405, `got ${post.status}`);

	const noAuth = await fetch(`${base}/api/sync-latest?dryRun=1`);
	check('GET /api/sync-latest without secret -> 401', noAuth.status === 401, `got ${noAuth.status}`);

	if (!process.env.CRON_SECRET) {
		console.log('SKIP  sync dry run (CRON_SECRET not set in .env)');
	} else {
		const sync = await fetch(`${base}/api/sync-latest?dryRun=1`, {
			headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
		});
		const body = await sync.json().catch(() => null);
		check('sync-latest dry run -> 200', sync.status === 200, `got ${sync.status}${body?.details ? `: ${body.details}` : ''}`);
		if (body?.added) {
			console.log(`      checked ${body.checked} feed items, would add ${body.added.length}:`);
			body.added.forEach(v => console.log(`        - ${v.title}`));
		}
	}

	console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
	process.exit(failed ? 1 : 0);
}

main().catch(err => {
	console.error(`Cannot reach ${base}: ${err.message}`);
	console.error('Is the API server running? (npm run api  or  npm run api:mock)');
	process.exit(1);
});
