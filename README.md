# NeonBlock City

Roblox-inspired original open-world block-style browser game built as a static Three.js-ready/PWA-friendly web app. Version 10 makes the current repo playable without any external backend requirement.

## What is included

- Playable top-down neon block city loop in `app.js`
- Desktop keyboard controls
- Mobile virtual joystick and action buttons
- Streamed procedural city chunks around the player
- NPCs, pickups, missions, vehicles, and property ownership
- Autosave, manual save slots, JSON export/import
- Optional cloud-save bridge in `firebase-backend.js` with localStorage fallback
- PWA manifest and service worker for static hosting readiness
- Netlify-ready static file structure

## Controls

### Desktop

- `WASD` or arrow keys: move
- `Shift`: sprint
- `E`: interact / enter vehicle / exit vehicle / collect / buy
- `M`: mission board
- `R`: unstuck to city center
- `Esc`: pause / resume

### Mobile

- Left joystick: move
- Sprint: faster movement
- Interact: enter/exit vehicles, collect parcels, buy property, open missions
- Unstuck: return to city center
- Pause: open menu

## Save system

The game saves to localStorage automatically about every 25 seconds and supports manual save/load slots. `firebase-backend.js` is intentionally safe: it does not include credentials and does not change external Firebase settings. It exposes `window.NBCCloud` as an optional bridge and falls back to localStorage shadow saves.

## Static hosting

This repo can be served as plain static files:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

For Netlify, upload or connect the repo as static files only. No external Netlify dashboard changes are required by this PR.

## Files

- `index.html` — game shell and HUD
- `styles.css` — mobile-first HUD, controls, and menus
- `app.js` — playable game loop
- `firebase-backend.js` — optional save bridge/fallback
- `manifest.webmanifest` — install metadata
- `sw.js` — simple static cache service worker

## Notes

The game is original and only Roblox-inspired in the sense of blocky, accessible, city-play vibes. It does not use Roblox assets, branding, or APIs.
