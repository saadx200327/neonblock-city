# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional cloud saves and localStorage fallback.

## Play

Open `index.html` through any static server. The game is fully client-side and does not require a build step.

Controls:

- Desktop: WASD / arrow keys to move, Shift to sprint, E to interact, Esc to pause.
- Mobile: left joystick to move, action buttons for sprint, interact, unstuck, and pause.

## Current gameplay loop

- Streamed neon city chunks around the player.
- Collect neon crates for cash and XP.
- Enter/exit vehicles and drive between districts.
- Buy lots for ownership progression.
- Talk to NPCs for tips.
- Mission chain tracks crates, ownership, and driving.
- Autosave, manual save slots, and JSON export/import.

## Saves

By default, saves use `localStorage` with slots named `slot1` and `slot2`. `firebase-backend.js` is a safe optional bridge only. It does not configure an external Firebase project by itself. A hosted page can attach `window.NeonBlockCloud` with async `save(slot, data)` and `load(slot)` methods to enable cloud saves.

## Static/PWA readiness

The repo includes `manifest.webmanifest`, `icon.svg`, and `sw.js` so static hosts can install/cache the app. No live deployment or dashboard configuration is required by the code changes.
