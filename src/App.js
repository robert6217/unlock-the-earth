import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'; // animations + spider legs; the bubbles are styled in App.css
import './App.css';
import {
	FlameIcon, SearchIcon, GlobeIcon, HeadphonesIcon, PlayIcon, PauseIcon, CloseIcon, ArrowRightIcon,
	YouTubeIcon, ApplePodcastsIcon, SpotifyIcon, InstagramIcon,
} from './icons';

const PLATFORMS = [
	{ name: 'YouTube', url: 'https://www.youtube.com/@unlocktheearthpodcast', Icon: YouTubeIcon, color: '#ff0033' },
	{ name: 'Apple Podcasts', url: 'https://podcasts.apple.com/tw/podcast/id1476564589', Icon: ApplePodcastsIcon, color: '#a347d9' },
	{ name: 'Spotify', url: 'https://open.spotify.com/show/0KAH1lIkmtgoe4kPEGed4a', Icon: SpotifyIcon, color: '#1db954' },
	{ name: 'Instagram', url: 'https://www.instagram.com/unlock.the.earth.podcast/', Icon: InstagramIcon, color: '#e1306c' },
];

const API_URL = '/api/locations';
const MIN_LOADING_MS = 1200; // keep the spinning earth on screen briefly, but never add a fixed delay after loading
const MAX_SEARCH_RESULTS = 30;
const CONTINENT_ORDER = ['亞洲', '歐洲', '非洲', '北美洲', '中美洲', '南美洲', '大洋洲', '澳洲', '南極洲', '其他'];
const TIMELINE_STEP_MS = 110; // one release date per step (~30 s for the whole history)

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

const createPinIcon = (width, height, { count = 1, active = false, fresh = false } = {}) => {
	const badge = count > 1 ? `<span class="pin-badge">${count}</span>` : '';
	return L.divIcon({
		className: `custom-pin-icon${active ? ' active' : ''}${fresh ? ' fresh' : ''}`,
		html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="${width}" height="${height}">
				<path fill="${active ? '#ff4757' : '#f1c40f'}" stroke="#333" stroke-width="15" fill-rule="evenodd" d="${PIN_PATH} ${HOLE_PATH}"/>
			</svg>${badge}`,
		iconSize: [width, height],
		iconAnchor: [width / 2, height],
		popupAnchor: [0, -height - 5],
	});
};

const iconCache = new Map();
const getPinIcon = (count, active, fresh = false) => {
	const key = `${Math.min(count, 99)}-${active}-${fresh}`;
	if (!iconCache.has(key)) iconCache.set(key, createPinIcon(20, 30, { count, active, fresh }));
	return iconCache.get(key);
};

const formatDate = (iso) => iso.replace(/-/g, '/');

// Zoomed out, nearby pins merge into one bubble showing how many episodes it holds; clicking it
// zooms in. Pins that still overlap at the map's max zoom (e.g. several London neighbourhoods)
// fan out ("spiderfy") instead, so every one of them stays clickable.
const MAX_ZOOM = 12; // city level; the map has no street-level content
const CLUSTER_OPTIONS = {
	maxClusterRadius: 45,
	showCoverageOnHover: false,
	spiderfyOnMaxZoom: true,
	spiderLegPolylineOptions: { weight: 1.5, color: '#f1c40f', opacity: 0.8 },
	chunkedLoading: true,
};

// Heat levels: the more episodes in a cluster, the deeper its yellow (colours in App.css .heat-1 … .heat-5).
const HEAT_LEVELS = [
	{ min: 2, label: '2–3' },
	{ min: 4, label: '4–6' },
	{ min: 7, label: '7–10' },
	{ min: 11, label: '11–19' },
	{ min: 20, label: '20+' },
];
const heatLevelOf = (count) => HEAT_LEVELS.filter(l => count >= l.min).length || 1;

const createClusterIcon = (cluster) => {
	// count episodes, not pins: a pin can hold several episodes (see groupByPlace)
	const count = cluster.getAllChildMarkers().reduce((n, m) => n + (m.options.episodeCount || 1), 0);
	const size = count < 10 ? 34 : count < 50 ? 40 : 46;
	return L.divIcon({
		html: `<div class="cluster-bubble heat-${heatLevelOf(count)}"><span>${count}</span></div>`,
		className: 'episode-cluster',
		iconSize: L.point(size, size),
	});
};

// Phones (portrait: bottom sheet) and landscape phones (very little height) start with the sidebar collapsed.
const isCompactViewport = () => window.innerWidth < 600 || window.innerHeight < 500;

// Part of the map (container pixels) not covered by the sidebar / bottom sheet or the timeline bar.
// Measured when a popup opens, so it follows rotation, window resizes and the sidebar state.
const getFreeArea = (map) => {
	const box = map.getContainer().getBoundingClientRect();
	const area = { top: 12, left: 12, right: box.width - 12, bottom: box.height - 12 };
	const sidebar = document.querySelector('.sidebar-container.visible');
	if (sidebar) {
		const r = sidebar.getBoundingClientRect();
		if (r.width >= box.width - 1) area.bottom = Math.min(area.bottom, r.top - box.top - 12); // bottom sheet
		else if (!sidebar.classList.contains('collapsed')) area.left = Math.max(area.left, r.right - box.left + 12);
	}
	const timeline = document.querySelector('.timeline-bar, .timeline-open');
	if (timeline) {
		const r = timeline.getBoundingClientRect();
		if (r.top - box.top < box.height / 2) area.top = Math.max(area.top, r.bottom - box.top + 8);
		else area.bottom = Math.min(area.bottom, r.top - box.top - 8);
	}
	return area;
};

// Pans so the open popup sits inside the free area: always centred on phones,
// otherwise only when part of it is hidden. A popup taller than the area keeps its top edge visible.
const fitPopup = (map, popup, center) => {
	const el = popup.getElement();
	if (!el) return;
	const box = map.getContainer().getBoundingClientRect();
	const r = el.getBoundingClientRect();
	const p = { top: r.top - box.top, bottom: r.bottom - box.top, left: r.left - box.left, right: r.right - box.left };
	const free = getFreeArea(map);
	const inside = p.top >= free.top && p.bottom <= free.bottom && p.left >= free.left && p.right <= free.right;
	if (inside && !center) return;
	const dx = (p.left + p.right - free.left - free.right) / 2;
	const dy = p.bottom - p.top > free.bottom - free.top
		? p.top - free.top
		: (p.top + p.bottom - free.top - free.bottom) / 2;
	if (Math.abs(dx) > 1 || Math.abs(dy) > 1) map.panBy([dx, dy]);
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
	const [isCollapsed, setIsCollapsed] = useState(isCompactViewport);
	const [isDarkMode, setIsDarkMode] = useState(readStoredTheme);
	const [map, setMap] = useState(null);
	const [timelineOn, setTimelineOn] = useState(false);
	const [timelineIndex, setTimelineIndex] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const markerRefs = useRef(new Map());
	const clusterRef = useRef(null);

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

	useEffect(() => {
		if (!map) return undefined;
		const onOpen = ({ popup }) => {
			// react-leaflet renders the popup content after this event, so measure two frames later
			requestAnimationFrame(() => requestAnimationFrame(() => fitPopup(map, popup, isCompactViewport())));
		};
		map.on('popupopen', onOpen);
		return () => map.off('popupopen', onOpen);
	}, [map]);

	// Clicking empty map (which also closes the popup) turns the red active pin back to yellow.
	// Marker and cluster clicks don't reach the map, so they keep working as before.
	useEffect(() => {
		if (!map) return undefined;
		const clearActive = () => setActiveKey(null);
		map.on('click', clearActive);
		return () => map.off('click', clearActive);
	}, [map]);

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

	// Distinct release dates, oldest first; each timeline step reveals the episodes of one date.
	const timelineDates = useMemo(
		() => [...new Set(allLocations.map(l => l.publishedAt).filter(Boolean))].sort(),
		[allLocations]
	);
	const cutoff = timelineOn ? timelineDates[Math.min(timelineIndex, timelineDates.length - 1)] : null;

	const filteredLocations = useMemo(() => allLocations.filter(loc => {
		if (!selectedContinents.has(loc.continent)) return false;
		if (cutoff && !(loc.publishedAt && loc.publishedAt <= cutoff)) return false;
		if (!normalizedQuery) return true;
		return normalize(loc.name).includes(normalizedQuery) || normalize(loc.podcast.title).includes(normalizedQuery);
	}), [allLocations, selectedContinents, normalizedQuery, cutoff]);

	const places = useMemo(() => groupByPlace(filteredLocations), [filteredLocations]);

	useEffect(() => {
		if (!isPlaying) return undefined;
		const timer = setInterval(() => {
			setTimelineIndex(i => Math.min(i + 1, timelineDates.length - 1));
		}, TIMELINE_STEP_MS);
		return () => clearInterval(timer);
	}, [isPlaying, timelineDates.length]);

	useEffect(() => {
		if (isPlaying && timelineIndex >= timelineDates.length - 1) setIsPlaying(false);
	}, [isPlaying, timelineIndex, timelineDates.length]);

	const openTimeline = () => {
		setTimelineOn(true);
		setTimelineIndex(0);
		setIsPlaying(true);
	};

	const closeTimeline = () => {
		setIsPlaying(false);
		setTimelineOn(false);
	};

	const togglePlay = () => {
		if (!isPlaying && timelineIndex >= timelineDates.length - 1) setTimelineIndex(0); // replay from the start
		setIsPlaying(p => !p);
	};

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
		if (isCompactViewport()) setIsCollapsed(true);
		if (!map) return;
		let opened = false;
		const openPopup = () => {
			if (opened) return;
			opened = true;
			const marker = markerRefs.current.get(key);
			if (!marker) return;
			// the pin may still be inside a cluster: zoom in / spiderfy until it is visible, then open it
			if (clusterRef.current) clusterRef.current.zoomToShowLayer(marker, () => marker.openPopup());
			else marker.openPopup();
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
							<h4 className="section-title"><FlameIcon size={16} className="section-icon" />最新單集</h4>
							<div className="latest-card">
								<div className="latest-tag">NEW</div>
								<h3 className="latest-title">{latestEpisode.podcast.title}</h3>
								{latestEpisode.podcast.url && (
									<a href={latestEpisode.podcast.url} target="_blank" rel="noopener noreferrer" className="play-btn">
										<YouTubeIcon size={20} color="#ff0033" />
										馬上收聽
									</a>
								)}
							</div>
						</section>
					)}

					<hr className="divider" />

					<section className="sidebar-section">
						<h4 className="section-title"><SearchIcon size={16} className="section-icon" />搜尋單集或城市</h4>
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
							<h4 className="section-title"><GlobeIcon size={16} className="section-icon" />依洲別篩選</h4>
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
						<h4 className="section-title"><HeadphonesIcon size={16} className="section-icon" />收聽更多</h4>
						<div className="platform-links">
							{PLATFORMS.map(({ name, url, Icon, color }) => (
								<a key={name} href={url} target="_blank" rel="noreferrer" className="platform-link" style={{ '--brand': color }}>
									<Icon size={20} color={color} />
									<span>{name}</span>
								</a>
							))}
						</div>
					</section>
				</div>

				<div className="sidebar-footer">
					<div className="heat-legend" aria-label="地圖上的叢集顏色越深，代表該區域的集數越多">
						<span>集數</span>
						<span className="heat-legend-end">少</span>
						{HEAT_LEVELS.map((level, i) => (
							<i key={level.min} className={`heat-swatch heat-${i + 1}`} title={`${level.label} 集`} />
						))}
						<span className="heat-legend-end">多</span>
					</div>
					{isLoading ? '載入中…' : `顯示 ${filteredLocations.length} 集・${places.length} 個地點`}
				</div>
			</aside>

			<div className={`map-wrapper ${!showOverlay ? 'visible' : ''}`}>
				<MapContainer
					ref={setMap}
					center={[20, 0]}
					zoom={3}
					minZoom={2}
					maxZoom={MAX_ZOOM}
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

					<MarkerClusterGroup ref={clusterRef} iconCreateFunction={createClusterIcon} {...CLUSTER_OPTIONS}>
						{places.map(place => (
							<Marker
								key={place.key}
								position={place.position}
								episodeCount={place.episodes.length}
								icon={getPinIcon(
									place.episodes.length,
									place.key === activeKey,
									Boolean(cutoff) && place.episodes.some(ep => ep.publishedAt === cutoff)
								)}
								ref={(m) => { if (m) markerRefs.current.set(place.key, m); else markerRefs.current.delete(place.key); }}
								eventHandlers={{ click: () => setActiveKey(place.key) }}
							>
								<Popup maxWidth={280} autoPan={false}>
									<div className="popup-content">
										<strong className="popup-place">{place.episodes[0].name}</strong>
										{place.episodes.length > 1 && <span className="popup-count">{place.episodes.length} 集</span>}
										<ul className="popup-list">
											{place.episodes.map(ep => (
												<li key={ep.id}>
													{ep.name !== place.episodes[0].name && <span className="popup-subplace">{ep.name}</span>}
													{ep.podcast.title && <span className="popup-title">{ep.podcast.title}</span>}
													{ep.podcast.url && (
														<a href={ep.podcast.url} target="_blank" rel="noopener noreferrer" className="popup-link">收聽 Podcast<ArrowRightIcon size={14} /></a>
													)}
												</li>
											))}
										</ul>
									</div>
								</Popup>
							</Marker>
						))}
					</MarkerClusterGroup>
				</MapContainer>
			</div>

			{!showOverlay && timelineDates.length > 1 && (
				timelineOn ? (
					<div className="timeline-bar" role="group" aria-label="時間軸播放">
						<button
							type="button"
							className="timeline-play"
							onClick={togglePlay}
							aria-label={isPlaying ? '暫停' : '播放'}
						>
							{isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
						</button>
						<input
							type="range"
							className="timeline-slider"
							min={0}
							max={timelineDates.length - 1}
							value={Math.min(timelineIndex, timelineDates.length - 1)}
							onChange={(e) => { setIsPlaying(false); setTimelineIndex(Number(e.target.value)); }}
							aria-label="時間軸"
							aria-valuetext={formatDate(cutoff)}
						/>
						<div className="timeline-info">
							<span className="timeline-date">{formatDate(cutoff)}</span>
							<span className="timeline-count">已解鎖 {filteredLocations.length} 集</span>
						</div>
						<button type="button" className="timeline-close" onClick={closeTimeline} aria-label="關閉時間軸"><CloseIcon size={16} /></button>
					</div>
				) : (
					<button type="button" className="timeline-open" onClick={openTimeline}>
						<PlayIcon size={14} />時間軸播放
					</button>
				)
			)}
		</div>
	);
}

export default App;
