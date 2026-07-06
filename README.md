# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js.

## Current playable features

- Static Netlify-ready front end; no required backend.
- Desktop controls: WASD or arrow keys to move, Space to jump, Shift to sprint, E to interact, U to unstuck, Esc to pause.
- Mobile controls: touch joystick, Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed block city chunks around the player for better performance.
- Pickups, NPC pedestrians, vehicles, purchasable city lots, missions, cash, XP, level, minimap, and debug overlay.
- Autosave, manual save slots, JSON export/import, and localStorage fallback.
- Optional `window.NeonBlockCloud` bridge in `firebase-backend.js` so real Firebase can be connected later without breaking offline play.
- PWA files: `manifest.webmanifest` and `sw.js`.

## Local testing

Open `index.html` through a local static server. Example:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deploy note

This repo is static-host ready, but this update does not deploy the site or change Firebase/Netlify dashboard settings.
