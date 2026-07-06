# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with local saves and an optional Firebase cloud-save bridge.

## What is playable now

- Third-person block character with WASD/arrow-key movement, sprint, jump, camera drag, and mobile joystick controls.
- Streamed neon city chunks with roads, sidewalks, generated buildings, pickups, NPC tips, cars, and buyable ownership lots.
- Vehicle enter/exit, driving, gas tracking, and vehicle HUD.
- Mission loop: pickup collection, driving objective, and first-lot ownership objective.
- Autosave, manual save/load slots, background save, JSON import/export, and localStorage fallback.
- Optional Firebase bridge via `window.NEONBLOCK_FIREBASE_CONFIG`; no dashboard or external Firebase settings are required for offline play.
- PWA manifest and service worker for static hosting readiness.

## Controls

Desktop:

- Move: `WASD` or arrow keys
- Sprint: `Shift`
- Jump: `Space`
- Interact / enter car / buy lot: `E`
- Mission board: `M`
- Pause: `Esc`
- Debug overlay: `F3`
- Camera: hold left mouse button and drag

Mobile:

- Move: left joystick
- Look: drag on the game screen
- Jump, Sprint, Interact, Unstuck, Pause: right-side action buttons

## Static hosting notes

This project is intentionally static. Upload the repository contents to Netlify or another static host. Do not put secrets in the client. Firebase is optional and should only be enabled with safe Firestore rules in your own Firebase project.

## Files

- `index.html` — game shell and HUD
- `styles.css` — responsive HUD, menus, joystick, safe-area mobile layout
- `app.js` — main playable game loop
- `firebase-backend.js` — optional cloud-save bridge
- `manifest.webmanifest` — PWA metadata
- `sw.js` — static asset cache service worker
