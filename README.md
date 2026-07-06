# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Current gameplay

- Desktop controls: `WASD` / arrows to move, mouse drag to rotate camera, `Space` jump, `Shift` sprint, `E` interact, `F` unstuck, `Esc` pause, `F3` debug overlay.
- Mobile controls: left joystick, Jump, Sprint, Interact, Unstuck, and Pause buttons with safe-area spacing for phones.
- Streamed city chunks load around the player and unload behind the player to keep the browser lighter.
- Green pickups give cash/XP, red vehicles can be entered/driven, yellow lots can be purchased and persist as owned lots.
- Mission chain tracks pickup collection, first property ownership, and driving distance.
- Saves use localStorage slots, autosave, save-on-background, and JSON import/export.
- `firebase-backend.js` is optional. It does not include credentials or change Firebase settings; it only exposes a bridge if an initialized Firebase object is provided by the page.

## Static hosting

Open `index.html` locally or upload the repository as a static site. No server build step is required. The service worker is intentionally minimal so registration succeeds safely without changing deployment settings.

## Files

- `index.html` - game shell, HUD, menus, mobile controls, scripts.
- `styles.css` - responsive HUD, mobile control, safe-area, and menu styling.
- `app.js` - Three.js runtime, movement, streaming, missions, vehicles, lots, saves, minimap, and UI wiring.
- `manifest.webmanifest` - PWA metadata.
- `sw.js` - minimal service worker placeholder.
- `firebase-backend.js` - optional cloud-save adapter.
