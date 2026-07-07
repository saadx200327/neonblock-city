# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase/cloud-save adapter and localStorage fallback.

## What is playable now

- Desktop movement: **WASD / arrows**, **Space** jump, **Shift** sprint, **E** interact, **F** exit vehicle, **M** missions, **P/Esc** pause, **R** unstuck.
- Mobile movement: virtual joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed block-city chunks with roads, buildings, pickups, NPC tips, buyable lots, and vehicles.
- Missions: crate collection, cab/vehicle travel, and property ownership loop.
- Progression: cash, XP, level, wanted placeholder, vehicle HP/gas display.
- Saves: local autosave, two save slots, JSON import/export.
- Cloud saves: optional adapter bridge in `firebase-backend.js`; no Firebase config is required or changed.
- PWA: manifest, SVG icon, and service worker for static-host readiness.

## Static hosting

This is a static site. For Netlify or any static host, publish the repository root. No build command is required.

## Safety notes

- This project does not require external dashboard changes.
- Firebase is optional and disabled unless a host page provides `window.NEONBLOCK_FIREBASE_ADAPTER`.
- The game is original and Roblox-inspired; it does not use Roblox assets.
