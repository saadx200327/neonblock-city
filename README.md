# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional cloud-save hooks and localStorage fallback.

## Current playable features

- Keyboard controls: `WASD` / arrows to move, `Shift` sprint, `Space` jump, `E` interact, `U` unstuck, `Esc` pause.
- Mobile controls: virtual joystick, Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed block city chunks around the player to keep the scene lighter on phones.
- Missions: courier pickups, test-drive waypoint, and first-property ownership.
- Vehicles: enter/exit nearby cruisers and drive through the city.
- Ownership: buy glowing properties with in-game cash.
- Saves: local save slots, autosave, JSON export/import, and optional Firebase adapter shim.
- PWA basics: web manifest and service worker for static hosting.

## Run locally

Open `index.html` with a local static server so the service worker and module script behave correctly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy readiness

This repo is static-host friendly. For Netlify, publish the repo root. No build command is required.

## Optional Firebase cloud saves

`firebase-backend.js` does not include credentials and does not change any external Firebase settings. To enable real cloud saves later, define `window.NEONBLOCK_FIREBASE_ADAPTER` before `app.js` loads:

```js
window.NEONBLOCK_FIREBASE_ADAPTER = {
  async save(slot, data) {
    // write to your authenticated Firebase user document
  },
  async load(slot) {
    // return saved data or null
  }
};
```

Without that adapter, the game safely uses localStorage only.
