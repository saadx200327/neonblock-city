# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Current playable features

- Third-person player movement with WASD / arrow keys and mobile joystick.
- Mobile action buttons for jump, sprint, interact, unstuck, and pause.
- Streamed city chunks around the player so the world keeps expanding without loading one giant map.
- Procedural neon buildings, roads, pickups, NPCs, vehicles, and buyable properties.
- Missions with waypoints, rewards, XP, level progression, and a minimap.
- Vehicles with gas/HP HUD values and enter/exit interaction.
- Local autosave, manual save slots, JSON export/import, and an optional cloud-save bridge.
- Static PWA files for installability and offline cache support.

## Controls

### Desktop

- Move: `WASD` or arrow keys
- Sprint: `Shift`
- Jump: `Space`
- Interact / buy / collect / talk: `E`
- Enter or exit vehicle: `F`
- Mission board: `M`
- Unstuck: `R`
- Pause: `Esc`

### Mobile

Use the left joystick to move. Use the right-side buttons for jump, sprint, interact, unstuck, and pause.

## Running locally

Because this is a static app, it can run from any basic local server:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Deploy notes

This repo is ready for static hosting such as Netlify by publishing the repository root. No build command is required.

Do not put secrets in this repository. Firebase support is intentionally optional and defaults to local-only saves unless a real Firebase adapter is wired later.

## File map

- `index.html` - page shell, HUD, menus, and script loading.
- `styles.css` - responsive game HUD, mobile controls, and menu styling.
- `app.js` - complete playable game runtime.
- `firebase-backend.js` - optional cloud-save bridge with safe local fallback.
- `manifest.webmanifest` - PWA metadata.
- `sw.js` - static service worker cache.
