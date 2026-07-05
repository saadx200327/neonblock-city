# NeonBlock City

Roblox-inspired original open-world block-style browser game built as a Netlify-ready static PWA.

## Current playable build

- Canvas-based open city with streamed chunks around the player
- Desktop controls: WASD/Arrow keys to move, Shift to sprint, E to interact, M for missions, P/Escape to pause, R to unstuck
- Mobile controls: joystick, sprint, interact, unstuck, pause
- Vehicles with gas and HP HUD
- Mission board with delivery, taxi, and repair missions
- Pickups, NPCs, wanted level, property ownership, XP, levels, and cash rewards
- Local save/load slots with JSON export/import
- Optional Firebase bridge that stays disabled unless a real config is supplied
- PWA manifest and service worker for static hosting readiness

## Local preview

Use any static server from the repository folder:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Netlify readiness

This project is static. Drag the repository folder into Netlify or connect the GitHub repo. No build command is required and no dashboard settings are changed by this repo.

## Firebase note

`firebase-backend.js` is a safe optional shim. It does not contain credentials. Local saves work without Firebase. Cloud saves only activate if Firebase SDK globals and `window.NEONBLOCK_FIREBASE_CONFIG` are provided later.
