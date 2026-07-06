# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with local saves and a safe optional Firebase cloud-save adapter.

## Current playable features

- Desktop movement: `WASD` / arrows, `Space` jump, `Shift` sprint, `E` interact, `M` mission board, `Esc` pause, `F3` debug overlay.
- Mobile movement: left joystick, drag-look on the play area, jump/sprint/interact/unstuck/pause buttons.
- Streamed neon city chunks around the player to keep performance stable.
- Collectible Neon Cubes for cash and XP.
- Enterable vehicles with gas tracking and drive-distance missions.
- Buyable ownership lots that persist between saves.
- NPC tips and mission board.
- Save slots, autosave, JSON import/export, and localStorage fallback.
- PWA files: `manifest.webmanifest` and `sw.js` for static hosting readiness.

## Files

- `index.html` - HUD, menus, mobile controls, Three.js script load, PWA registration.
- `styles.css` - responsive/mobile-first HUD, controls, pause menu, and safe-area handling.
- `app.js` - core game loop, controls, world streaming, missions, vehicles, ownership, saves.
- `firebase-backend.js` - no-op optional adapter so the game never crashes without Firebase config.
- `manifest.webmanifest` - installable web app metadata.
- `sw.js` - app-shell cache for static deployment readiness.

## Safe hosting notes

This is a static site. It can run locally by opening `index.html` from a static server, or by hosting the repository on Netlify/GitHub Pages. No Firebase or Netlify dashboard changes are required for the local-save version.
