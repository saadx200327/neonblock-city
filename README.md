# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and a localStorage fallback.

## What works now

- Playable third-person movement on desktop and mobile.
- Keyboard controls: WASD / arrows to move, Shift sprint, Space jump, E interact, M missions, R unstuck, Escape pause.
- Mobile controls: virtual joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed procedural neon city chunks to keep the world expandable without loading everything at once.
- Pickups, NPC walkers, driveable vehicles, purchasable ownership lots, missions, XP, cash, levels, minimap, and waypoint arrow.
- Save slots, autosave, JSON export/import, localStorage persistence, and optional Firebase bridge.
- Static PWA files: `manifest.webmanifest` and `sw.js`.

## Local preview

Open `index.html` with a static server, not the filesystem, so the service worker and module files behave correctly:

```bash
python3 -m http.server 8888
```

Then open `http://localhost:8888`.

## Optional Firebase cloud saves

The game works without Firebase. To enable Firestore saves later, load Firebase compat SDKs and define `window.NEONBLOCK_FIREBASE_CONFIG` before `firebase-backend.js`. If config or SDKs are missing, the game automatically uses local saves only.

## Static hosting notes

- No build step is required.
- Root publish directory can stay as the repository root.
- Do not deploy from automation unless explicitly requested.
- The app is safe to preview locally or through a static host branch preview.
