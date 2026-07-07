# NeonBlock City

Original block-style open-world browser game built with Three.js. The project is static-host friendly and can run on Netlify, GitHub Pages, or any plain web server without a required backend.

## Current gameplay

- Playable third-person movement with WASD/arrow keys, jump, sprint, pointer camera turning, and mobile joystick controls.
- Streamed neon city chunks with roads, buildings, crates, NPC tips, vehicles, and buyable green ownership lots.
- Mission loop for crate collection, first drive distance, and first lot ownership.
- Vehicle enter/exit, gas/HP HUD, minimap, reward popups, pause menu, settings, unstuck, and debug readout on desktop.
- Local autosave, two manual save slots, JSON export/import, and optional cloud-save bridge.

## Controls

### Desktop

- Move: `WASD` or arrow keys
- Turn camera: drag on the game canvas
- Jump: `Space`
- Sprint: `Shift`
- Interact: `E`
- Enter/exit vehicle: `F`
- Pause: `Esc`
- Unstuck: `R`

### Mobile

- Move: left joystick
- Actions: Jump, Sprint, Interact, Unstuck, Pause buttons

## Optional Firebase/cloud saves

`firebase-backend.js` does not include credentials and does not initialize any external Firebase project. It only exposes a safe bridge. To enable cloud saves later, define `window.NeonBlockFirebaseAdapter` before the game calls save/load:

```js
window.NeonBlockFirebaseAdapter = {
  async save(slot, data) {
    // write data to your backend
  },
  async load(slot) {
    // return saved data or null
  }
};
```

If no adapter exists, the game automatically uses localStorage.

## Static/PWA readiness

- `index.html` loads `styles.css`, `app.js`, `manifest.webmanifest`, and `sw.js`.
- `manifest.webmanifest` and `assets/icon.svg` support installable PWA metadata.
- `sw.js` caches local static files and the Three.js CDN request for offline-friendly reloads after first load.

No deployment or external dashboard changes are required for this branch.
