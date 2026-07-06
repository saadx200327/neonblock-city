# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional cloud-save bridge and localStorage fallback.

## Current playable features

- Desktop controls: WASD/arrow keys to move, Shift to sprint, Space to jump, E to interact, R to unstuck, Esc to pause.
- Mobile controls: joystick movement plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed block-city chunks so the world expands around the player without rendering everything at once.
- Pickups, buyable lots, NPC pedestrians, drivable neon vehicles, autosave, save slots, and JSON import/export.
- PWA files are included for static hosting. The app can run offline after the first successful load.

## Firebase notes

`firebase-backend.js` is intentionally safe by default. It exposes a local fallback bridge at `window.NeonBlockCloud` and does not connect to any external Firebase project unless real SDK/config code is added later.

## Netlify/static hosting

Deploy the folder as a static site only. No build command is required. Do not put secrets in this repo.
