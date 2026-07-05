# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional cloud-save bridge and localStorage fallback.

## Current playable loop

- Move on desktop with **WASD / Arrow keys**, **Shift** to sprint, **Space** to jump, **E** to interact, **R** to unstuck, **Esc** to pause.
- Move on phones with the left joystick and the action buttons.
- Explore streamed city chunks with roads, sidewalks, generated buildings, NPCs, pickups, mission pads, vehicles, and buyable properties.
- Start missions at pink pads, drive vehicles, collect data chips, earn cash/XP, level up, buy properties, and save/load progress.

## Static hosting

This repo is designed to run as plain static files. No build step is required.

Required files:

- `index.html`
- `styles.css`
- `app.js`
- `firebase-backend.js`
- `manifest.webmanifest`
- `sw.js`

For Netlify drag-and-drop, upload the full folder containing those files. No external dashboard setting change is required for the current version.

## Saves

Game saves use `localStorage` first. `firebase-backend.js` exposes a safe optional `window.NeonBlockCloud` bridge that currently mirrors saves locally and can later be replaced with real Firebase SDK logic without breaking offline play.

## Notes

The game loads Three.js from a CDN in `index.html`. For fully offline production play, vendor the Three.js file into this repo and update the script tag.
