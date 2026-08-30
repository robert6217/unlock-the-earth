import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ZoomControl } from 'react-leaflet'
import './App.css';

import L from 'leaflet';

const createCustomIcon = (width = 30, height = 40) => {
	const pinPath = "M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z";
	const holePath = "M 192 132 a 60 60 0 1 0 0 120 a 60 60 0 1 0 0 -120";
	const svgString = `
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="${width}" height="${height}">
			<path 
				fill="#f1c40f" 
				stroke="#333" 
				stroke-width="15" 
				fill-rule="evenodd"
				d="${pinPath} ${holePath}"
			/>
		</svg>
	`;

	return L.divIcon({
		className: 'custom-pin-icon',
		html: svgString,
		iconSize: [width, height],
		iconAnchor: [width / 2, height],
		popupAnchor: [0, -height - 5],
	});
};

const markerIcon = createCustomIcon(20, 30);

function App() {
	const position = [20, 0];
	const mapInstanceRef = useRef(null);
	const [allLocations, setAllLocations] = useState([]);
	const [filteredLocations, setFilteredLocations] = useState([]);
	const [selectedContinents, setSelectedContinents] = useState(new Set());
	const [availableContinents, setAvailableContinents] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isCollapsed, setIsCollapsed] = useState(window.innerWidth < 600);
	const [latestEpisode, setLatestEpisode] = useState(null);

	const [isDarkMode, setIsDarkMode] = useState(() => {
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			return savedTheme === 'dark';
		}
		return window.matchMedia('(prefers-color-scheme: dark)').matches;
	});

	const toggleTheme = () => {
		setIsDarkMode(!isDarkMode);
	};

	useEffect(() => {
		localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
	}, [isDarkMode]);

	useEffect(() => {
		const API_URL = '/api/locations';

		fetch(API_URL)
			.then(res => res.json())
			.then(data => {
				setAllLocations(data.locations);
				setFilteredLocations(data.locations);
				setLatestEpisode(data.latest);

				const continents = new Set(data.locations.map(item => item.continent).filter(Boolean));
				setAvailableContinents([...continents]);
				setSelectedContinents(continents); // default select all
			})
			.catch(error => console.error("Error:", error))
			.finally(() => {
				setTimeout(() => {
					setIsLoading(false);
				}, 2500);
			});
	}, []);

	const handleCheckboxChange = (continent) => {
		const newSelected = new Set(selectedContinents);
		if (newSelected.has(continent)) {
			newSelected.delete(continent);
		} else {
			newSelected.add(continent);
		}
		setSelectedContinents(newSelected);

		const newFiltered = allLocations.filter(loc => newSelected.has(loc.continent));
		setFilteredLocations(newFiltered);
	};

	return (
		<div
			style={{ position: 'relative', height: '100vh', width: '100%' }}
			data-theme={isDarkMode ? "dark" : "light"}
		>
			<div style={{ position: 'relative', height: '100vh', width: '100%' }}>
				{isLoading && (
					<div className="loading-overlay">
						<div className="earth-spinner"></div>
						<div className="loading-text">UNLOCKING THE EARTH...</div>
					</div>
				)}
				<div className={`sidebar-container ${!isLoading ? 'visible' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
					<div className="sidebar-header" onClick={() => setIsCollapsed(!isCollapsed)}>
						<div className="header-top-row">
							<div className="header-title-group">
								<h3>解鎖地球</h3>
								<button className="toggle-btn">
									{isCollapsed ? (
										<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
									) : (
										<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
									)}
								</button>
							</div>
							<label className="theme-switch" onClick={(e) => e.stopPropagation()}>
								<input
									type="checkbox"
									checked={isDarkMode}
									onChange={toggleTheme}
								/>
								<span className="slider round">
								</span>
							</label>
						</div>
						<span className="subtitle">依洲別篩選</span>
					</div>

					<div className="sidebar-content">
						{latestEpisode && (
							<div className="sidebar-section">
								<h4 className="section-title">🔥 最新單集</h4>
								<div className="latest-card">
									<div className="latest-tag">NEW</div>
									<h3 className="latest-title">{latestEpisode.podcast.title}</h3>
									<a href={latestEpisode.podcast.url} target="_blank" rel="noopener noreferrer" className="play-btn">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											width="20"
											height="20"
											className="yt-icon"
										>
											<path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
										</svg>
										馬上收聽
									</a>
								</div>
							</div>
						)}

						<hr className="divider" />
						<div className="sidebar-section">
							<h4 className="section-title">🌍 篩選七大洲</h4>
							<div className="filter-list">
								{availableContinents.map(continent => (
									<label key={continent} className="custom-checkbox-wrapper">
										<input
											type="checkbox"
											checked={selectedContinents.has(continent)}
											onChange={() => handleCheckboxChange(continent)}
										/>
										<span className="checkmark"></span>
										<span className="label-text">{continent}</span>
									</label>
								))}
							</div>
						</div>

						<hr className="divider" />

						<div className="sidebar-section">
							<h4 className="section-title">🎧 收聽更多</h4>
							<div className="social-badges">
								{/* YouTube */}
								<a href="https://www.youtube.com/@unlocktheearthpodcast" target="_blank" rel="noreferrer">
									<img src="https://img.shields.io/badge/--red?logo=youtube&style=social" alt="YouTube Subscribe" />
								</a>

								{/* Apple Podcasts */}
								<a href="https://podcasts.apple.com/tw/podcast/-旅行-歷史-文化/id1476564589" target="_blank" rel="noreferrer">
									<img src="https://img.shields.io/badge/--purple?logo=applepodcasts&style=social" alt="Apple Podcasts" />
								</a>

								{/* Spotify */}
								<a href="https://open.spotify.com/show/0KAH1lIkmtgoe4kPEGed4a" target="_blank" rel="noreferrer">
									<img src="https://img.shields.io/badge/--green?logo=spotify&style=social" alt="Spotify" />
								</a>

								{/* Instagram */}
								<a href="https://www.instagram.com/unlock.the.earth.podcast/" target="_blank" rel="noreferrer">
									<img src="https://img.shields.io/badge/--red?logo=instagram&style=social" alt="Instagram" />
								</a>
							</div>
						</div>
					</div>

					<div className="sidebar-footer">
						Showing {filteredLocations.length} locations
					</div>
				</div>
				<div className={`map-wrapper ${!isLoading ? 'visible' : ''}`}>
					<MapContainer
						ref={mapInstanceRef}
						center={position}
						zoom={3}
						minZoom={2}
						maxBounds={[[-90, -180], [90, 180]]}
						maxBoundsViscosity={0.5}
						style={{ height: '100%', width: '100%' }}
						zoomControl={false}
					>
						<TileLayer
							attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
							url={isDarkMode
								? "http://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png?key=cb1_2k9c_1_098230c202b462bf7ec6cc85"
								: "http://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png?key=cb1_2k9c_1_098230c202b462bf7ec6cc85"
							}
						/>

						<ZoomControl position="bottomright" />

						{filteredLocations.map((loc, index) => (
							<Marker key={index} position={[loc.coordinates.lat, loc.coordinates.lng]} icon={markerIcon}>
								<Popup>
									<strong>{loc.name}</strong><br />
									{loc.podcast.title}<br />
									<a href={loc.podcast.url} target="_blank" rel="noopener noreferrer">
										收聽 Podcast
									</a>
								</Popup>
							</Marker>
						))}
					</MapContainer>
				</div>
			</div>
		</div>
	);
}

export default App;
