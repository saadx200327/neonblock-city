# NeonBlock City

Original Roblox-inspired neon block city browser game built with Three.js. It is a static, Netlify-ready PWA with local saves and an optional cloud-save bridge.

## Gameplay

- Desktop: WASD or arrow keys to move, Space to jump, Shift to sprint, E to interact, R to unstuck, Esc to pause.
- Mobile: on-screen joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- City chunks stream around the player and unload behind them for performance.
- Vehicles can be entered, driven, exited, and tracked on the HUD/minimap.
- Pickups, NPCs, purchasable lots, and rotating missions create a playable loop.
- Save slots, autosave, JSON export/import, and localStorage fallback are included.

## Static hosting notes

Serve these files as static assets:

- index.html
- styles.css
- app.js
- firebase-backend.js
- manifest.webmanifest
- sw.js

## Optional cloud saves

The default save system works locally without setup. A later config can be injected before firebase-backend.js loads to enable cloud saves. No external dashboard changes are required by this branch.

## QA checklist

1. Open index.html through a local static server.
2. Confirm the loading screen disappears and the city renders.
3. Test desktop movement, jump, sprint, interact, pause, save, load, export, and import.
4. Test mobile joystick/buttons in device emulation and on a real phone.
5. Confirm missing cloud config does not break offline saves.
6. Confirm refresh restores autosave/local save state.
