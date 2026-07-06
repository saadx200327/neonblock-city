# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js.

## What is included

- Static `index.html`, `styles.css`, and `app.js` game client.
- Desktop movement: `WASD` / arrow keys, `Shift` sprint, `Space` jump, `E` interact, `U` unstuck, `Esc` pause.
- Mobile controls: virtual joystick, jump, sprint, interact, unstuck, and pause buttons.
- Streamed city chunks around the player for better browser performance.
- Pickups, NPC walkers, hover vehicles, purchasable lots, missions, XP, levels, cash, minimap, and HUD.
- Save slots, autosave, JSON export/import, localStorage fallback, and optional `window.NEONBLOCK_FIREBASE` cloud-save bridge.
- PWA-ready `manifest.webmanifest` and `sw.js` for static hosting.

## Run locally

Because the app uses a service worker, preview it through a local static server instead of opening the file directly.

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Netlify/static hosting

No build step is required. Publish the repository root as a static site. This repo does not require changing Firebase or Netlify dashboard settings to run locally or as a static PWA.

## Optional cloud saves

`firebase-backend.js` is deliberately safe by default and does not include Firebase keys. If a host injects `window.NEONBLOCK_FIREBASE.saveGame(slot, payload)` and `window.NEONBLOCK_FIREBASE.loadGame(slot)`, the game will use those functions. Otherwise it stores saves in localStorage.
