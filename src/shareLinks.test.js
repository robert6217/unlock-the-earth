import { shareParamsFor, shareUrlFor, readShareParams, findSharedEpisodes } from './shareLinks';

const ep = (id, name, title, url) => ({ id, name, continent: '亞洲', coordinates: { lat: 1, lng: 1 }, podcast: { title, url } });
const kyoto = ep('1', '京都', 'Ep.231 日本京都的千年時光旅行', 'https://youtu.be/AAAAAAAAAAA');
const postcard = ep('2', '曼谷', '《明信片 #68+69》曼谷', 'https://www.youtube.com/watch?v=UcJp3-1xQBk');
const special = ep('3', '香港', '《特別篇》香港', 'https://podcasts.apple.com/x');

test('share links prefer the episode number, then the video id, then the place', () => {
	expect(shareParamsFor(kyoto)).toEqual({ ep: '231' });
	expect(shareParamsFor(postcard)).toEqual({ ep: 'UcJp3-1xQBk' });
	expect(shareParamsFor(special)).toEqual({ place: '香港' });
	expect(shareUrlFor(special, 'https://site.app')).toBe('https://site.app/?place=%E9%A6%99%E6%B8%AF');
});

test('reads links from the query string or the hash', () => {
	expect(readShareParams({ search: '?ep=231', hash: '' })).toEqual({ ep: '231', place: null });
	expect(readShareParams({ search: '', hash: '#place=%E9%A6%99%E6%B8%AF' })).toEqual({ ep: null, place: '香港' });
	expect(readShareParams({ search: '?foo=1', hash: '' })).toBeNull();
});

test('a link round-trips back to its episode', () => {
	const all = [kyoto, postcard, special];
	for (const item of all) {
		const params = readShareParams({ search: `?${new URLSearchParams(shareParamsFor(item))}`, hash: '' });
		expect(findSharedEpisodes(all, params)).toEqual([item]);
	}
});
