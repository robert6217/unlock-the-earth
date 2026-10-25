import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// react-leaflet is ESM-only and needs a real layout engine; jsdom has neither,
// so the map is replaced with plain elements. The sidebar logic is what we test here.
// react-leaflet-cluster is ESM-only too; render its children directly.
jest.mock('react-leaflet-cluster', () => ({ children }) => children);

jest.mock('react-leaflet', () => {
	const React = require('react');
	const Pass = ({ children }) => React.createElement('div', null, children);
	return {
		MapContainer: Pass,
		TileLayer: () => null,
		ZoomControl: () => null,
		Marker: Pass,
		Popup: () => null,
	};
});

const mockData = {
	latest: { id: 'x', name: 'YouTube 最新上架', podcast: { title: 'Ep.999 測試最新單集', url: 'https://youtu.be/x' } },
	locations: [
		{ id: '1', name: '京都', continent: '亞洲', coordinates: { lat: 35.01, lng: 135.76 }, publishedAt: '2024-01-02', podcast: { title: 'Ep.235 東京到京都的浮世繪之路', url: 'https://youtu.be/a' } },
		{ id: '2', name: '雷克雅維克', continent: '歐洲', coordinates: { lat: 64.14, lng: -21.94 }, publishedAt: '2025-06-03', podcast: { title: 'Ep.100 冰島', url: 'https://youtu.be/b' } },
	],
};

beforeEach(() => {
	window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
	global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(mockData) }));
});

test('renders the latest episode and continent filters from the API', async () => {
	render(<App />);
	expect(await screen.findByText('Ep.999 測試最新單集')).toBeInTheDocument();
	expect(screen.getByText('亞洲')).toBeInTheDocument();
	expect(screen.getByText('歐洲')).toBeInTheDocument();
	expect(screen.getByText(/顯示 2 集/)).toBeInTheDocument();
});

test('search narrows the episode list', async () => {
	render(<App />);
	await screen.findByText(/顯示 2 集/);
	fireEvent.change(screen.getByLabelText('搜尋單集或城市'), { target: { value: '京都' } });
	await waitFor(() => expect(screen.getByText(/顯示 1 集/)).toBeInTheDocument());
	expect(screen.getByText('Ep.235 東京到京都的浮世繪之路')).toBeInTheDocument();
});

test('shows an error with retry when the API fails', async () => {
	global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
	render(<App />);
	expect(await screen.findByRole('alert')).toBeInTheDocument();
	expect(screen.getByText('重新載入')).toBeInTheDocument();
});

test('timeline reveals episodes up to the selected release date', async () => {
	render(<App />);
	await screen.findByText(/顯示 2 集/);
	fireEvent.click(await screen.findByRole('button', { name: '時間軸播放' }, { timeout: 3000 })); // shown after the loading overlay
	expect(screen.getByText('2024/01/02')).toBeInTheDocument();
	expect(screen.getByText('已解鎖 1 集')).toBeInTheDocument();

	fireEvent.change(screen.getByLabelText('時間軸'), { target: { value: '1' } });
	expect(screen.getByText('2025/06/03')).toBeInTheDocument();
	expect(screen.getByText('已解鎖 2 集')).toBeInTheDocument();

	fireEvent.click(screen.getByLabelText('關閉時間軸'));
	expect(screen.getByText(/顯示 2 集/)).toBeInTheDocument();
});

test('"take me somewhere" says so when the filters leave nothing to visit', async () => {
	render(<App />);
	const button = await screen.findByRole('button', { name: '帶我去旅行' }, { timeout: 3000 }); // shown after the loading overlay
	fireEvent.click(screen.getByText('清除')); // untick every continent
	fireEvent.click(button);
	expect(await screen.findByRole('status')).toHaveTextContent('目前的篩選條件下沒有單集');
});
