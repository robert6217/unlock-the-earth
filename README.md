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
* [ ] Suggest coordinates for new episodes automatically (e.g. geocoding a place name from the title).

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
| `API_PORT` | local only | Port of the local API server (default `4000`). |
| `USE_MOCK` | local only | `1` = same as `npm run api:mock`. |

## Weekly Episode Sync

`vercel.json` schedules `/api/sync-latest` every Monday 04:00 UTC (12:00 Taiwan time). It reads the channel's YouTube RSS feed, skips Shorts and episodes already in Notion (matched by YouTube video ID), and creates a row for each new one with `Name = 待補地點`, `PodcastTitle` and `PodcastUrl`.

Rows without `Lat`/`Lng` are **not shown on the map**, so the site never shows a wrong pin. Fill in `Name`, `Continent`, `Lat`, `Lng` in Notion and the episode appears after the cache refreshes (≤ 10 min).

Preview without writing anything:

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