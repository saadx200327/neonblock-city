# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with localStorage saves and an optional cloud-save adapter.

## Current gameplay

- Desktop controls: WASD or arrow keys to move, Shift to sprint, Space to jump, E to interact, M for missions, R to unstuck, Escape to pause, backtick for debug.
- Mobile controls: virtual joystick, Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed city chunks with roads, grass blocks, buildings, crates, NPCs, vehicles, and buyable ownership lots.
- Missions: waypoint courier run, crate collection, and first-lot ownership loop.
- Vehicles: enter/exit nearby cars, drive with gas tracking, and see vehicle HP/gas in the HUD.
- Saves: autosave, manual save/load slots, JSON import/export, and localStorage fallback.
- PWA: manifest and service worker are included for static hosting readiness.

## Static hosting

This repo is designed to run as a plain static site. No build step is required.

1. Open `index.html` locally or host the folder on Netlify.
2. Keep `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, and `firebase-backend.js` together at the site root.
3. Firebase is optional. The included `firebase-backend.js` is a safe no-op adapter unless a real project is wired later.

## Notes

- The game does not require Firebase or Netlify dashboard changes to run.
- Existing saves use keys beginning with `neonblock-city-save` in localStorage.
