# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Current playable loop

- Mobile joystick with Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Desktop controls: WASD/arrow keys move, Shift sprint, Space jump, E interact, Esc pause.
- Procedural streamed city chunks around the player for better performance than loading one giant map.
- Missions: courier delivery, pickup collection, and vehicle test-drive objectives.
- Vehicles with enter/exit, steering, speed, gas, and HUD status.
- Property ownership: walk near marked towers and interact to buy them with cash.
- Pickups, NPC ambience, minimap, waypoint marker, FPS/debug panel, pause/settings/save menu.
- Save/load slots, JSON export/import, autosave, and optional Firebase cloud-save shim.
- PWA manifest and service worker for static hosting readiness.

## Static hosting

This project is intentionally static. It can run from `index.html` directly or from a static host like Netlify/GitHub Pages after merging. No live deployment was performed by this branch.

## Optional Firebase cloud saves

`firebase-backend.js` does not include secrets or project config. By default, saves use `localStorage`. To enable cloud saves later, load Firebase SDKs and define `window.NEONBLOCK_FIREBASE_CONFIG` before `app.js`. Do not put private keys or dashboard-only settings in this repository.

## Files

- `index.html` — game shell and HUD.
- `styles.css` — responsive mobile-first UI.
- `app.js` — playable Three.js game loop.
- `firebase-backend.js` — optional cloud-save adapter with safe fallback.
- `manifest.webmanifest` — PWA metadata.
- `sw.js` — static cache service worker.
