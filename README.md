# NeonBlock City

Roblox-inspired original open-world block-style browser game built as a Netlify-ready static PWA.

## Current gameplay

- Playable desktop movement with `WASD` / arrow keys, `Shift` sprint, `E` interact, `M` missions, `Esc` pause, and `F3` debug.
- Mobile joystick, sprint, interact, unstuck, and pause controls.
- Streamed neon city chunks around the player so the map can expand without drawing the whole world at once.
- Collectible neon crates, NPC tips, drivable cars, buyable city lots, minimap markers, and mission rewards.
- Local autosave every 30 seconds plus manual save/load slots and JSON import/export.
- Optional cloud-save adapter through `window.NeonBlockFirebaseAdapter`; no Firebase credentials are stored in the repo.
- PWA manifest and service worker for static hosting/offline readiness.

## Static hosting

Open `index.html` locally or upload the repository to Netlify as a static site. No build command is required.

## Optional Firebase bridge

`firebase-backend.js` is intentionally safe by default. It only forwards calls if another script defines:

```js
window.NeonBlockFirebaseAdapter = {
  async save(slot, payload) {},
  async load(slot) { return null; }
};
```

This keeps Firebase optional and prevents this repo from changing any external Firebase or Netlify settings.
