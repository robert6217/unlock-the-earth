// Inline SVG icons in one style (24px grid, rounded 2px strokes) — same look as the theme switch's
// sun and moon. They inherit the text colour (currentColor) unless a colour is passed.
import React from 'react';

const Icon = ({ size = 18, color = 'currentColor', fill = 'none', strokeWidth = 2, className, children, ...rest }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill={fill}
		stroke={color}
		strokeWidth={strokeWidth}
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
		aria-hidden="true"
		focusable="false"
		{...rest}
	>
		{children}
	</svg>
);

// --- Section titles ---
export const FlameIcon = (props) => (
	<Icon {...props}>
		<path d="M12 22a7 7 0 0 0 7-7c0-2.4-1.1-4.4-2.6-6.1-.6 1.4-1.6 2.4-2.9 2.8C13.8 8.3 12.6 5 10 2.5 9.6 6.4 5 8.8 5 15a7 7 0 0 0 7 7z" />
		<path d="M12 22a3 3 0 0 1-3-3c0-1.7 1.4-2.7 2.2-4 .8 1 1.6 1.4 2.4 1.6.9.4 1.4 1.4 1.4 2.4a3 3 0 0 1-3 3z" />
	</Icon>
);

export const SearchIcon = (props) => (
	<Icon {...props}>
		<circle cx="11" cy="11" r="7" />
		<path d="M16.5 16.5L21 21" />
	</Icon>
);

export const GlobeIcon = (props) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="10" />
		<path d="M2 12h20" />
		<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
	</Icon>
);

export const HeadphonesIcon = (props) => (
	<Icon {...props}>
		<path d="M3 18v-6a9 9 0 0 1 18 0v6" />
		<path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
		<path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
	</Icon>
);

// --- Controls ---
export const PlayIcon = (props) => (
	<Icon fill="currentColor" {...props}>
		<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
	</Icon>
);

export const PauseIcon = (props) => (
	<Icon fill="currentColor" {...props}>
		<rect x="6" y="5" width="4" height="14" rx="1" />
		<rect x="14" y="5" width="4" height="14" rx="1" />
	</Icon>
);

export const CloseIcon = (props) => (
	<Icon {...props}>
		<path d="M18 6L6 18M6 6l12 12" />
	</Icon>
);

export const ShareIcon = (props) => (
	<Icon {...props}>
		<path d="M12 3v12" />
		<path d="M7.5 7.5L12 3l4.5 4.5" />
		<path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
	</Icon>
);

export const ArrowRightIcon = (props) => (
	<Icon {...props}>
		<path d="M5 12h14M13 6l6 6-6 6" />
	</Icon>
);

// --- Listening platforms (line versions of each brand mark, in the brand colour) ---
export const YouTubeIcon = (props) => (
	<Icon {...props}>
		<rect x="2" y="5" width="20" height="14" rx="4.5" />
		<path d="M10 9.2v5.6l4.8-2.8z" fill={props.color || 'currentColor'} />
	</Icon>
);

export const ApplePodcastsIcon = (props) => (
	<Icon {...props}>
		<circle cx="12" cy="10.5" r="2.2" fill={props.color || 'currentColor'} />
		<path d="M12 14.5v6.5" />
		<path d="M8.3 15a5.5 5.5 0 1 1 7.4 0" />
		<path d="M5.6 18a9 9 0 1 1 12.8 0" />
	</Icon>
);

export const SpotifyIcon = (props) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="10" />
		<path d="M7 9.4c3.6-1 7.4-.7 10.4 1" />
		<path d="M7.6 12.7c2.9-.8 6-.5 8.6.9" />
		<path d="M8.2 15.9c2.3-.6 4.6-.4 6.6.6" />
	</Icon>
);

export const InstagramIcon = (props) => (
	<Icon {...props}>
		<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
		<circle cx="12" cy="12" r="4.2" />
		<circle cx="17.4" cy="6.6" r="0.6" fill={props.color || 'currentColor'} />
	</Icon>
);
