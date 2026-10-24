import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import './App.css';

const API_URL = '/api/locations';
const MIN_LOADING_MS = 1200; // keep the spinning earth on screen briefly, but never add a fixed delay after loading
const MAX_SEARCH_RESULTS = 30;
const CONTINENT_ORDER = ['亞洲', '歐洲', '非洲', '北美洲', '中美洲', '南美洲', '大洋洲', '澳洲', '南極洲', '其他'];

// CARTO basemaps now draw an "API KEY REQUIRED" watermark without a key. The key is a
// public client-side key (it ships in the bundle either way); REACT_APP_CARTO_API_KEY overrides it.
// Always HTTPS: the http:// URLs were mixed content on the HTTPS site.
const CARTO_API_KEY = process.env.REACT_APP_CARTO_API_KEY || 'cb1_2k9c_1_098230c202b462bf7ec6cc85';
const TILE_URL = {
	light: `https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
	dark: `https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
};
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

const PIN_PATH = 'M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z';
const HOLE_PATH = 'M 192 132 a 60 60 0 1 0 0 120 a 60 60 0 1 0 0 -120';

const createPinIcon = (width, height, { count = 1, active = false } = {}) => {
	const badge = count > 1 ? `<span class="pin-badge">${count}</span>` : '';
	return L.divIcon({
		className: `custom-pin-icon${active ? ' active' : ''}`,
		html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="${width}" height="${height}">
				<path fill="${active ? '#ff4757' : '#f1c40f'}" stroke="#333" stroke-width="15" fill-rule="evenodd" d="${PIN_PATH} ${HOLE_PATH}"/>
			</svg>${badge}`,
		iconSize: [width, height],
		iconAnchor: [width / 2, height],
		popupAnchor: [0, -height - 5],
	});
};

const iconCache = new Map();
const getPinIcon = (count, active) => {
	const key = `${Math.min(count, 99)}-${active}`;
	if (!iconCache.has(key)) iconCache.set(key, createPinIcon(20, 30, { count, active }));
	return iconCache.get(key);
};

const readStoredTheme = () => {
	try {
		const saved = window.localStorage.getItem('theme');
		if (saved === 'dark' || saved === 'light') return saved === 'dark';
	} catch (_) { /* storage blocked */ }
	return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, '');

// Episodes recorded at the same coordinates share one marker (previously they were stacked
// on top of each other and only the top one could be clicked).
const groupByPlace = (episodes) => {
	const groups = new Map();
	episodes.forEach(ep => {
		const key = `${ep.coordinates.lat.toFixed(4)},${ep.coordinates.lng.toFixed(4)}`;
		if (!groups.has(key)) groups.set(key, { key, position: [ep.coordinates.lat, ep.coordinates.lng], episodes: [] });
		groups.get(key).episodes.push(ep);
	});
	return [...groups.values()];
};

const placeKeyOf = (ep) => `${ep.coordinates.lat.toFixed(4)},${ep.coordinates.lng.toFixed(4)}`;

function App() {
	const [allLocations, setAllLocations] = useState([]);
	const [latestEpisode, setLatestEpisode] = useState(null);
	const [selectedContinents, setSelectedContinents] = useState(new Set());
	const [query, setQuery] = useState('');
	const [activeKey, setActiveKey] = useState(null);
	const [status, setStatus] = useState('loading'); // loading | ready | error
	const [showOverlay, setShowOverlay] = useState(true);
	const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 600);
	const [isDarkMode, setIsDarkMode] = useState(readStoredTheme);
	const [map, setMap] = useState(null);
	const markerRefs = useRef(new Map());

	useEffect(() => {
		document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
		try { window.localStorage.setItem('theme', isDarkMode ? 'dark' : 'light'); } catch (_) { /* ignore */ }
	}, [isDarkMode]);

	const load = useCallback(() => {
		const controller = new AbortController();
		const startedAt = Date.now();
		setStatus('loading');
		setShowOverlay(true);

		fetch(API_URL, { signal: controller.signal })
			.then(res => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then(data => {
				const locations = (data.locations || []).filter(loc =>
					loc.coordinates && Number.isFinite(loc.coordinates.lat) && Number.isFinite(loc.coordinates.lng));
				setAllLocations(locations);
				setLatestEpisode(data.latest || null);
				setSelectedContinents(new Set(locations.map(l => l.continent)));
				setStatus('ready');
			})
			.catch(error => {
				if (error.name === 'AbortError') return;
				console.error('Failed to load locations:', error);
				setStatus('error');
			})
			.finally(() => {
				if (controller.signal.aborted) return;
				const wait = Math.max(0, MIN_LOADING_MS - (Date.now() - startedAt));
				setTimeout(() => setShowOverlay(false), wait);
			});

		return () => controller.abort();
	}, []);

	useEffect(() => load(), [load]);

	const continentCounts = useMemo(() => {
		const counts = new Map();
		allLocations.forEach(l => counts.set(l.continent, (counts.get(l.continent) || 0) + 1));
		return counts;
	}, [allLocations]);

	const availableContinents = useMemo(() => {
		const rank = (c) => {
			const i = CONTINENT_ORDER.indexOf(c);
			return i === -1 ? CONTINENT_ORDER.length : i;
		};
		return [...continentCounts.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
	}, [continentCounts]);

	const normalizedQuery = normalize(query);

	const filteredLocations = useMemo(() => allLocations.filter(loc => {
		if (!selectedContinents.has(loc.continent)) return false;
		if (!normalizedQuery) return true;
		return normalize(loc.name).includes(normalizedQuery) || normalize(loc.podcast.title).includes(normalizedQuery);
	}), [allLocations, selectedContinents, normalizedQuery]);

	const places = useMemo(() => groupByPlace(filteredLocations), [filteredLocations]);

	const toggleContinent = (continent) => {
		setSelectedContinents(prev => {
			const next = new Set(prev);
			if (next.has(continent)) next.delete(continent); else next.add(continent);
			return next;
		});
	};

	const setAllContinents = (on) => setSelectedContinents(on ? new Set(availableContinents) : new Set());

	const focusEpisode = (ep) => {
		const key = placeKeyOf(ep);
		setActiveKey(key);
		if (window.innerWidth < 600) setIsCollapsed(true);
		if (!map) return;
		let opened = false;
		const openPopup = () => {
			if (opened) return;
			opened = true;
			markerRefs.current.get(key)?.openPopup();
		};
		map.once('moveend', openPopup);
		setTimeout(openPopup, 1200); // fallback in case the map was already there and no move happens
		map.flyTo([ep.coordinates.lat, ep.coordinates.lng], Math.max(map.getZoom(), 5), { duration: 0.8 });
	};

	const isLoading = status === 'loading';

	return (
		<div className="app-root" data-theme={isDarkMode ? 'dark' : 'light'}>
			{showOverlay && (
				<div className="loading-overlay" aria-live="polite">
					<div className="earth-spinner" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/earth.jpg)` }} />
					<div className="loading-text">UNLOCKING THE EARTH...</div>
				</div>
			)}

			<aside className={`sidebar-container ${!showOverlay ? 'visible' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
				<div className="sidebar-header" onClick={() => setIsCollapsed(c => !c)}>
					<div className="header-top-row">
						<div className="header-title-group">
							<h3>解鎖地球</h3>
							<button
								type="button"
								className="toggle-btn"
								aria-label={isCollapsed ? '展開側邊欄' : '收合側邊欄'}
								aria-expanded={!isCollapsed}
							>
								<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
									<polyline points={isCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15'} />
								</svg>
							</button>
						</div>
						<label className="theme-switch" onClick={(e) => e.stopPropagation()} title="切換深色模式">
							<input type="checkbox" checked={isDarkMode} onChange={() => setIsDarkMode(d => !d)} aria-label="深色模式" />
							<span className="slider round" />
						</label>
					</div>
					<span className="subtitle">用地圖探索每一集</span>
				</div>

				<div className="sidebar-content">
					{status === 'error' && (
						<div className="error-card" role="alert">
							<p>地點資料載入失敗，請稍後再試。</p>
							<button type="button" className="retry-btn" onClick={load}>重新載入</button>
						</div>
					)}

					{latestEpisode && (
						<section className="sidebar-section">
							<h4 className="section-title">🔥 最新單集</h4>
							<div className="latest-card">
								<div className="latest-tag">NEW</div>
								<h3 className="latest-title">{latestEpisode.podcast.title}</h3>
								{latestEpisode.podcast.url && (
									<a href={latestEpisode.podcast.url} target="_blank" rel="noopener noreferrer" className="play-btn">
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" className="yt-icon" aria-hidden="true">
											<path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
										</svg>
										馬上收聽
									</a>
								)}
							</div>
						</section>
					)}

					<hr className="divider" />

					<section className="sidebar-section">
						<h4 className="section-title">🔍 搜尋單集或城市</h4>
						<div className="search-box">
							<input
								type="search"
								value={query}
								placeholder="例如：京都、冰島、Ep.245"
								onChange={(e) => setQuery(e.target.value)}
								onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
								aria-label="搜尋單集或城市"
							/>
						</div>
						{normalizedQuery && (
							<ul className="search-results">
								{filteredLocations.length === 0 && <li className="search-empty">找不到符合的單集</li>}
								{filteredLocations.slice(0, MAX_SEARCH_RESULTS).map(ep => (
									<li key={ep.id}>
										<button type="button" onClick={() => focusEpisode(ep)}>
											<span className="result-name">{ep.name}</span>
											<span className="result-title">{ep.podcast.title}</span>
										</button>
									</li>
								))}
								{filteredLocations.length > MAX_SEARCH_RESULTS && (
									<li className="search-empty">還有 {filteredLocations.length - MAX_SEARCH_RESULTS} 筆，請輸入更精確的關鍵字</li>
								)}
							</ul>
						)}
					</section>

					<hr className="divider" />

					<section className="sidebar-section">
						<div className="section-title-row">
							<h4 className="section-title">🌍 依洲別篩選</h4>
							<div className="quick-toggle">
								<button type="button" onClick={() => setAllContinents(true)}>全選</button>
								<button type="button" onClick={() => setAllContinents(false)}>清除</button>
							</div>
						</div>
						<div className="filter-list">
							{availableContinents.map(continent => (
								<label key={continent} className="custom-checkbox-wrapper">
									<input
										type="checkbox"
										checked={selectedContinents.has(continent)}
										onChange={() => toggleContinent(continent)}
									/>
									<span className="checkmark" />
									<span className="label-text">{continent}</span>
									<span className="label-count">{continentCounts.get(continent)}</span>
								</label>
							))}
						</div>
					</section>

					<hr className="divider" />

					<section className="sidebar-section">
						<h4 className="section-title">🎧 收聽更多</h4>
						<div className="social-badges">
							<a href="https://www.youtube.com/@unlocktheearthpodcast" target="_blank" rel="noreferrer">
								<img src="https://img.shields.io/badge/--red?logo=youtube&style=social" alt="YouTube" />
							</a>
							<a href="https://podcasts.apple.com/tw/podcast/id1476564589" target="_blank" rel="noreferrer">
								<img src="https://img.shields.io/badge/--purple?logo=applepodcasts&style=social" alt="Apple Podcasts" />
							</a>
							<a href="https://open.spotify.com/show/0KAH1lIkmtgoe4kPEGed4a" target="_blank" rel="noreferrer">
								<img src="https://img.shields.io/badge/--green?logo=spotify&style=social" alt="Spotify" />
							</a>
							<a href="https://www.instagram.com/unlock.the.earth.podcast/" target="_blank" rel="noreferrer">
								<img src="https://img.shields.io/badge/--red?logo=instagram&style=social" alt="Instagram" />
							</a>
						</div>
					</section>
				</div>

				<div className="sidebar-footer">
					{isLoading ? '載入中…' : `顯示 ${filteredLocations.length} 集・${places.length} 個地點`}
				</div>
			</aside>

			<div className={`map-wrapper ${!showOverlay ? 'visible' : ''}`}>
				<MapContainer
					ref={setMap}
					center={[20, 0]}
					zoom={3}
					minZoom={2}
					maxBounds={[[-90, -180], [90, 180]]}
					maxBoundsViscosity={0.5}
					worldCopyJump={false}
					style={{ height: '100%', width: '100%' }}
					zoomControl={false}
				>
					<TileLayer
						key={isDarkMode ? 'dark' : 'light'}
						attribution={TILE_ATTRIBUTION}
						url={isDarkMode ? TILE_URL.dark : TILE_URL.light}
					/>
					<ZoomControl position="bottomright" />

					{places.map(place => (
						<Marker
							key={place.key}
							position={place.position}
							icon={getPinIcon(place.episodes.length, place.key === activeKey)}
							ref={(m) => { if (m) markerRefs.current.set(place.key, m); else markerRefs.current.delete(place.key); }}
							eventHandlers={{ click: () => setActiveKey(place.key) }}
						>
							<Popup maxWidth={280}>
								<div className="popup-content">
									<strong className="popup-place">{place.episodes[0].name}</strong>
									{place.episodes.length > 1 && <span className="popup-count">{place.episodes.length} 集</span>}
									<ul className="popup-list">
										{place.episodes.map(ep => (
											<li key={ep.id}>
												{ep.name !== place.episodes[0].name && <span className="popup-subplace">{ep.name}</span>}
												{ep.podcast.title && <span className="popup-title">{ep.podcast.title}</span>}
												{ep.podcast.url && (
													<a href={ep.podcast.url} target="_blank" rel="noopener noreferrer">收聽 Podcast →</a>
												)}
											</li>
										))}
									</ul>
								</div>
							</Popup>
						</Marker>
					))}
				</MapContainer>
			</div>
		</div>
	);
}

export default App;
