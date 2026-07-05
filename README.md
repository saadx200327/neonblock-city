# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. It is a static PWA-style project that can run from `index.html` and is ready to preview locally or on a static host after review.

## What is included

- Playable third-person block character
- Desktop controls: WASD or arrows to move, Shift to sprint, Space to jump, E to interact, R to unstuck, P/Escape to pause
- Mobile controls: touch joystick plus jump, interact, unstuck, and pause buttons
- Streamed procedural city chunks so the world expands around the player
- Neon bolt pickups, drivable vehicles, purchasable city lots, and simple mission progression
- Local save/load slots plus JSON export/import
- Optional `firebase-backend.js` cloud-save bridge with local fallback behavior
- `manifest.webmanifest` and `sw.js` for PWA/static-host readiness

## Local preview

Open `index.html` in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Files

- `index.html` - app shell and HUD
- `styles.css` - responsive HUD, menu, and controls
- `app.js` - game runtime, world streaming, missions, vehicles, ownership, and saves
- `firebase-backend.js` - optional save bridge
- `manifest.webmanifest` - PWA metadata
- `sw.js` - service worker cache for static assets

## Notes

This branch does not require Firebase or Netlify dashboard changes. Cloud saves are optional and the game continues to work offline through browser storage.
