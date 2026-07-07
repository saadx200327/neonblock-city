# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA shell with optional cloud saves and localStorage fallback.

## Current playable features

- Desktop movement: WASD / arrow keys, Space to jump, Shift to sprint, E to interact, M for missions, Escape for pause.
- Mobile movement: touch joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streaming neon city chunks with roads, buildings, signs, collectible crates, NPCs, lots, and vehicles.
- Vehicle entry/exit, vehicle fuel/HP HUD, and checkpoint-driving mission support.
- Mission board with crate, driving, and ownership missions.
- Buyable ownership lots saved locally.
- Autosave, two save slots, JSON export/import, and safe localStorage fallback.
- Optional cloud save adapter through `window.NeonBlockCloud`; no Firebase credentials are stored in the repo.
- Static hosting ready: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, and `assets/icon.svg`.

## Local preview

Open `index.html` in a browser or serve the folder with any static server.

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Deployment notes

Do not put Firebase secrets in this repo. If cloud saves are enabled later, inject Firebase config through the hosting environment and expose a small `window.NeonBlockCloud` adapter with `save(slot, data)` and `load(slot)` methods.
