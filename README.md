# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What is playable now

- Desktop movement: WASD / arrow keys, Q/E turn, Shift sprint, Space jump, F interact, Esc pause, F3 debug.
- Mobile movement: virtual joystick, drag-look, jump, sprint, interact, unstuck, and pause buttons.
- Streamed block city chunks around the player so the world expands without keeping every block loaded.
- Vehicles, purchasable lots, neon pickups, NPC props, minimap markers, waypoint arrow, and rotating missions.
- Save slots, autosave, save-on-background, JSON export/import, and optional Firebase cloud-save bridge.
- Static PWA files for Netlify-style hosting: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, and `sw.js`.

## Static deploy notes

No build step is required. Upload the repository folder as a static site. The game uses CDN Three.js from `index.html`; if CDN access fails, the loading screen shows a clear error instead of freezing silently.

## Optional Firebase cloud saves

Cloud saves are disabled by default. The game works fully with `localStorage`. To enable Firebase later, load Firebase compat SDKs and define `window.NEONBLOCK_FIREBASE_CONFIG` before `firebase-backend.js`. Do not commit private Firebase keys or change dashboard settings from this repo.
