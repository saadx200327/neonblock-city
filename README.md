# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js.

## Current playable build

- Desktop movement: WASD or arrow keys.
- Sprint: Shift.
- Jump: Space or Q.
- Interact: E.
- Unstuck: R.
- Pause: Esc.
- Mobile movement: virtual joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- City chunks stream around the player for better performance.
- Includes pickups, NPCs, vehicles, purchasable lots, a mission board, minimap, autosave, save slots, and JSON import/export.
- Includes `manifest.webmanifest` and `sw.js` for installable static-site readiness.
- `firebase-backend.js` is an optional bridge that safely falls back to localStorage.

## Files

- `index.html`
- `styles.css`
- `app.js`
- `firebase-backend.js`
- `manifest.webmanifest`
- `sw.js`

The base game runs as a static browser app and does not require a backend.
