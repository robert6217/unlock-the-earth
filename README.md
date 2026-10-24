# Unlock the Earth

**Unlock the Earth** is a web-based visualization project that maps the content of the Taiwanese podcast 《解鎖地球》("Unlock the Earth"). The goal is to present podcast episodes in an interactive and geographical format, allowing users to explore stories and insights from around the world through a visual interface.

## Project Purpose

This project transforms the rich travel and cultural content of the podcast into a map-based experience. Each episode is linked to a specific country or city, helping users discover global destinations and their stories in an intuitive and engaging way.

## Disclaimer (免責聲明)

This is an **unofficial, fan-made project**. I am not affiliated with, endorsed by, or connected to the official *Unlock the Earth* (解鎖地球) podcast team.

* **Content Rights**: All podcast content, logos, brand names, and audio links belong to the original creators of *Unlock the Earth*.
* **Purpose**: This project is created voluntarily for educational and non-commercial purposes, serving as a fan tribute and a technical portfolio piece.

本專案為聽眾**自發製作的非官方作品**，與《解鎖地球》官方團隊無任何隸屬或合作關係。所有 Podcast 內容、Logo 及音檔版權皆歸原創團隊所有。本網站僅供學習與交流使用，不涉及任何商業行為。

如果你也是解鎖地球的聽眾，希望對你有幫助!

## Features

* **🌍 Interactive Map Visualization**: Utilizing Leaflet.js to map podcast episodes globally, allowing users to explore content geographically.
* **🔍 Continent Filtering**: A glassmorphism-styled sidebar allows users to filter episodes by continent (Asia, Europe, Africa, etc.) in real-time.
* **🌓 Dark/Light Mode**: Includes a theme toggle switch. The app automatically saves the user's preference to `localStorage`, ensuring a consistent experience across visits.
* **📍 Custom SVG Markers**: Replaced standard image markers with custom-coded, scalable SVG pins that support hover animations and dynamic resizing.
* **🎧 Direct Podcast Links**: Clicking on a map marker opens a popup with the episode title and a direct link to listen.
* **⚡ Optimized Data Fetching**: The backend implements pagination loops to handle Notion API limits, and the response is cached on Vercel's CDN (10 min, stale-while-revalidate) so page views don't hit Notion every time.
* **🔎 Search**: Search episodes by city, country, title or episode number; click a result to fly to it on the map.
* **📌 Grouped Markers**: Episodes recorded at the same place share one pin with a count badge; the popup lists all of them.
* **🔥 Marker Clustering**: Zoomed out, nearby pins merge into bubbles showing how many episodes the area holds — the deeper the yellow and the bigger the glow, the more episodes. Click a bubble to zoom in; pins that still overlap at city level fan out.
* **🔗 Shareable Links**: Every episode has a link (the "分享" button in its popup) that opens the map on that episode, with its own preview card on LINE / Facebook / X (see below).
* **🕰 Timeline Playback**: Press "▶ 時間軸播放" to watch the map fill up in release order, one release date per step (or drag the slider).
* **🤖 Weekly Sync**: A Vercel Cron job adds new YouTube episodes to Notion every week (see below).

## Tech Stack

* **Frontend**: React, Leaflet (react-leaflet), CSS3 (Variables & Animations)
* **Backend**: Node.js, Express
* **Database/CMS**: Notion API (Using Notion as the database)
* **Deployment**: [Vercel](https://vercel.com/)
* **Vibe Coding**: [Google Gemini](https://gemini.google.com/) 😎

## TODO

* [x] Automatically fetch and insert the latest episode into the database every week. *(title + link are automatic; location still needs to be filled in by hand — see below)*
* [x] Add search functionality for specific episodes or cities.
* [x] Suggest coordinates for new episodes automatically: extract the place name from the title (e.g. with the Claude API), geocode it, and write it to Notion with a "needs review" checkbox. *(see Weekly Episode Sync)*
* [ ] Notify after each weekly sync (email / Discord / LINE): which episodes were added and which still need a location, plus an alert when the sync fails.
* [x] Shareable episode links (e.g. `?ep=288` or `/place/冰島`) that fly to the place and open its popup, with per-episode Open Graph preview cards. *(as `?ep=288` / `?place=冰島`, see Shareable Links)*
* [x] Marker clustering when zoomed out (e.g. `react-leaflet-cluster`), so dense areas like Europe and Japan stay readable. *(bubbles are shaded by episode count)*
* [x] Timeline playback: a slider that lights up episodes in release order (needs a `PublishedAt` property in Notion, which the sync can fill from RSS).
* [ ] Footprint stats: shade visited countries and show "countries unlocked" plus per-continent progress.
* [ ] Guest filter: parse guests from `ft.` / `with` in titles and list all episodes for a guest.
* [ ] "Take me somewhere" button that flies to a random episode.
* [ ] Play episodes inside the popup with an embedded YouTube player.

## Local Development

```bash
npm install
cp .env.example .env   # fill in your Notion credentials
npm run api            # API server on http://localhost:4000 (same handlers as Vercel)
npm start              # React dev server; /api requests are proxied to :4000
```

No Notion credentials (or offline)? `npm run api:mock` serves `/api/locations` from `public/map_info/data.json` instead.

Before pushing:

```bash
npm run test:ci        # unit tests, single run
npm run test:api       # API helper tests (lib/), no network
npm run smoke          # checks the running API server (sync is always a dry run)
npm run build          # make sure the production build compiles
npm run smoke -- https://<preview>.vercel.app   # same checks against a Vercel preview deployment
```

## Environment Variables

| Name | Required | Purpose |
| --- | --- | --- |
| `NOTION_API_KEY` | ✅ | Notion integration token. Needs *Read content*; the weekly sync also needs *Insert content*. |
| `NOTION_DATA_SOURCE_ID` | ✅ | Notion data source ID (`NOTION_DATABASE_ID` is still accepted for backward compatibility). |
| `CRON_SECRET` | for sync | Random string. Vercel sends it to `/api/sync-latest` automatically; requests without it are rejected. |
| `SYNC_SKIP_PATTERN` | optional | Regex of titles the sync should never add, e.g. `^《幕後`. |
| `ANTHROPIC_API_KEY` | optional | Enables location suggestions in the weekly sync. Without it, new episodes are added as `待補地點`. |
| `PLACE_MODEL` | optional | Claude model used for suggestions (default `claude-opus-5-5`). |
| `API_PORT` | local only | Port of the local API server (default `4000`). |
| `USE_MOCK` | local only | `1` = same as `npm run api:mock`. |
| `SITE_URL` | optional | Public site URL, e.g. a custom domain (`https://map.example.com`). Share previews only trust this, Vercel's own deployment hosts, and localhost in development. |
| `SHARE_HTML_ORIGIN` | local only | Where `/api/share-page` fetches the app's `index.html` (`http://localhost:3000` with `npm start`). Not needed on Vercel. |

## Shareable Links

| Link | Opens |
| --- | --- |
| `/?ep=288`, `/?ep=99S` | that numbered episode |
| `/?ep=<YouTube video id>` | an episode without a number (《明信片》, 《特別篇》…) |
| `/?place=冰島` | every episode at that place |

The map flies to the episode and opens its popup; an episode covering several places shows all of them and opens the first. The "分享" button in each popup copies the shortest of these links (on phones it opens the system share sheet).

Link previews: crawlers don't run JavaScript, so `vercel.json` rewrites `/?ep=…` and `/?place=…` to `api/share-page.js`, which returns the app's `index.html` with that episode's title, places and YouTube thumbnail as Open Graph / Twitter tags (cached on the CDN for an hour). Everything else gets the default site card from `public/index.html`.

Check a preview locally (with `npm start` running and `SHARE_HTML_ORIGIN=http://localhost:3000`):

```bash
curl "http://localhost:4000/api/share-page?ep=288"
```

## Weekly Episode Sync

`vercel.json` schedules `/api/sync-latest` every Wednesday 04:00 UTC (12:00 Taiwan time). It reads the channel's YouTube RSS feed and skips Shorts and episodes already in Notion (matched by YouTube video ID).

**With `ANTHROPIC_API_KEY` set**, each new title is sent to Claude, which lists the places the episode is about (Traditional Chinese name, continent, an English geocoding query). Each place is geocoded with OpenStreetMap Nominatim; if Nominatim finds nothing or lands more than 300 km from Claude's own estimate, Claude's estimate is used. One row is created per place with `Name`, `Continent`, `Lat`, `Lng`, `PodcastTitle`, `PodcastUrl` and **`NeedsReview` checked**. These rows stay **off the map** until reviewed — filter Notion by `NeedsReview`, fix anything wrong, and untick it; the pin appears after the cache refreshes (≤ 10 min).

Every new row also gets `PublishedAt` (the YouTube upload date), which the timeline uses. Existing rows were filled once from the podcast RSS feed with `node scripts/backfill-published-at.js --write` (safe to re-run; it only fills empty dates).

Episodes with no clear place (or when the suggestion fails, or without the API key) get one row with `Name = 待補地點` and no coordinates. Rows without `Lat`/`Lng` are **not shown on the map**; fill in `Name`, `Continent`, `Lat`, `Lng` in Notion and the episode appears after the cache refreshes (≤ 10 min).

Preview without writing anything (the response lists the suggested places for each new episode):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://unlock-the-earth.vercel.app/api/sync-latest?dryRun=1"
```

# Live Demo

[👉 Check it out here](https://unlock-the-earth.vercel.app)

![](snapshot.png "unlock the earth")

# Listen to the Podcast

Please support the official creators!

[![Apple Podcasts](https://img.shields.io/badge/解鎖地球--purple?logo=applepodcasts&style=social)](https://podcasts.apple.com/tw/podcast/解鎖地球-旅行-歷史-文化/id1476564589)
[![Spotify](https://img.shields.io/badge/解鎖地球--green?logo=spotify&style=social)](https://open.spotify.com/show/0KAH1lIkmtgoe4kPEGed4a)
[![YouTube](https://img.shields.io/badge/解鎖地球--red?logo=youtube&style=social)](https://www.youtube.com/@unlocktheearthpodcast)