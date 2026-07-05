# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What is playable now

- Desktop controls: WASD / arrow keys move, Q/E rotate camera, Shift sprint/drive faster, Space jump, F interact, R unstuck, Esc pause.
- Mobile controls: touch joystick, Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed block city: nearby chunks generate around the player and far chunks unload for performance.
- Vehicles: walk up to a car and press Interact/F to enter or exit. Vehicle gas and HP show in the HUD.
- Missions: rotating delivery, driving, and ownership goals with cash and XP rewards.
- Ownership: buy nearby building blocks with in-game cash.
- Saves: automatic localStorage saves plus manual save/load slots and JSON export/import.
- Optional cloud saves: `firebase-backend.js` is a safe no-op until a Firebase config is intentionally provided.
- PWA readiness: includes `manifest.webmanifest` and `sw.js` for static hosting.

## Static hosting

Upload the repository files to Netlify or another static host. No server build step is required.

## Firebase cloud saves

Cloud saves are optional. The game runs offline without Firebase setup. To enable Firebase later, define `window.NEONBLOCK_FIREBASE_CONFIG` before loading `firebase-backend.js` and add matching Firestore security rules in the Firebase console. This repo change does not modify any external Firebase or Netlify dashboard settings.

## Files

- `index.html` — game shell and HUD
- `styles.css` — responsive HUD, menus, and mobile controls
- `app.js` — Three.js game loop, controls, city streaming, missions, vehicles, ownership, saves
- `firebase-backend.js` — optional Firebase save bridge with offline fallback
- `manifest.webmanifest` — PWA metadata
- `sw.js` — app-shell cache service worker
