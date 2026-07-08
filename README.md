# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and a localStorage fallback.

## Current gameplay

- Desktop movement: `WASD` or arrow keys, `Shift` sprint, `Space` jump, `E` interact, `R` refuel, `M` missions, `U` unstuck, `H` session assist, `B` battery saver, `Ctrl/Cmd+S` quick save, `+/-` HUD scale, `C` camera mode, `[`/`]` camera zoom, `N` minimap size, `F` feedback panel, `G` route assist, `V` mobile shell panel, `Q` runtime QA panel, `K` driving assist panel, `X`/`Space` vehicle brake, `P` or `Esc` pause.
- Mobile movement: on-screen joystick plus Jump, Sprint, Interact, Brake, Refuel, Unstuck, and Pause buttons.
- Controller support: first connected gamepad maps left stick to movement, trigger/stick press to sprint, face buttons to jump/interact/unstuck, and Start to pause.
- Streamed neon city chunks around the player to keep the static game lighter on mobile.
- Missions: courier waypoint, crate collection, first-property ownership, and vehicle delivery objective.
- City Objectives: a lightweight live panel shows nearby streamed opportunities, tracks daily movement/driving/property goals, and lets players claim a daily cash/XP reward.
- Feedback polish: live interaction hints, save freshness, vehicle/gas guidance, optional sound pings, optional mobile haptics, and a hideable feedback panel.
- Route Assist: a hideable wayfinding panel shows mission distance, compass direction, objective-specific hints, and nearby streamed opportunities.
- Mobile Shell: a lightweight mobile/PWA control panel adds fullscreen, scroll-lock, larger touch targets, viewport stability hints, and double-tap zoom protection.
- Runtime QA: a hideable QA panel runs smoke checks against the live game API, confirms chunks/interact lists/save/load hooks, exposes an emergency save button, and recovers unsafe player bounds.
- Driving Assist: a hideable vehicle panel adds live speed/gas tips, desktop `X`/`Space` braking, a mobile Brake button, tab-hidden parking brake, and unsafe-speed stabilization for phone physics.
- Vehicles: enter or exit nearby cars with Interact; vehicles have gas, higher movement speed, braking support, and can be refueled with cash.
- Ownership: buy purple lots with in-game cash; owned lots turn green, persist in saves, and generate passive income.
- Saves: local autosave, quick save, manual save slots, hidden-page backup, storage-full warning, JSON export/import, active mission, active vehicle, collected crate IDs, and save-health report export.
- Camera/map polish: Settings includes camera mode, zoom, and minimap size controls; values persist locally for repeat sessions.
- Optional cloud saves: `firebase-backend.js` exposes a safe bridge only when Firebase globals are provided externally.

## Reliability fixes in this pass

- Keyboard movement now resets cleanly on key release instead of inheriting a stale desktop axis.
- Touch joystick state is separated from keyboard state so mobile and desktop inputs do not lock each other.
- Autosave now runs on a true 15-second timer instead of firing repeatedly during the same second.
- Streamed chunks now unregister their vehicles, crates, NPCs, and lots when unloaded so the interact scans and HUD stay fast.
- Owned lots re-apply their green owned material after a save is loaded and nearby chunks stream back in.
- Collected crate IDs now persist, so unloaded/reloaded chunks do not respawn already collected crates.
- The active mission and active vehicle state are saved and restored when possible.
- Vehicle gas warnings are throttled so the popup does not spam every animation frame.
- Controls are cleared on browser blur, and the current slot is saved when the page is hidden.
- Graphics quality now affects stream radius, building density, shadows, and pixel ratio so low mode is safer for phones.
- Mission board now has a visible Pause-menu entry point plus the `M` shortcut.
- Mission board Close now has a defensive handler even if the main runtime misses it.
- PWA install prompt can appear from Settings when the browser allows installation.
- WebGL context loss/restoration is surfaced through the HUD instead of failing silently.
- Online/offline changes update the HUD while local saves continue working.
- Reduced-motion users are nudged toward Low graphics.
- Runtime guard now runs before `app.js`, quarantines corrupt save JSON before startup load, keeps a recoverable corrupt-save copy, and exposes latest-good-save export/load buttons.
- Runtime guard recovers the player if physics or imported save data drops them below the map or extremely far outside the streamed world.
- Runtime health checks now keep scheduling after skipped checks instead of accidentally stopping after a throttled frame.
- Page lifecycle events now force a final save on `pagehide`/`freeze` for mobile browser tab switching.
- Portrait-phone players get a rotation tip because driving and mission tracking are easier in landscape.
- Runtime health checks flag stuck loading screens and overly heavy world/object counts through the debug HUD.
- Economy polish adds refueling, quick save hotkey/button, passive property income, collect-income button, and HUD hints for low gas or owned-lot income.
- Session polish adds an in-game Session Assist panel with a smoke-test checklist for movement, interaction, driving, ownership, and saving.
- Session polish adds a Battery Saver button/hotkey that drops graphics to Low and a snapshot exporter for quick QA/debug summaries.
- Accessibility polish adds adjustable HUD scaling through Settings and `+/-`, a persistent Low Motion toggle, save-slot health reporting, and a fallback loading message if the runtime never starts.
- Camera polish adds Settings controls and shortcuts for camera mode, zoom, and minimap sizing, plus a live camera-mode HUD hint.
- Objective polish adds a persistent City Objectives panel, daily reward loop, nearby opportunity hints, and safe reward saving through the existing runtime API.
- Feedback polish adds a persistent player guidance panel, contextual interaction prompts, save-age display, optional WebAudio pings, optional vibration haptics, and the `F` shortcut to hide/show the panel.
- Wayfinding polish adds a persistent Route Assist panel with the `G` shortcut, mission distance, compass direction, objective hints, and nearby streamed-opportunity guidance.
- Mobile shell polish adds a `V`-toggle panel for fullscreen, scroll lock, larger touch targets, viewport jump hints, orientation recalibration, and double-tap/gesture zoom protection.
- QA polish adds a `Q`-toggle runtime panel with a smoke-check runner, emergency save action, interact-list size guard, live chunk/object status, and secondary unsafe-bounds recovery.
- Driving polish adds a `K`-toggle Driving Assist panel, mobile Brake button, desktop `X`/`Space` braking while in vehicles, speed/gas tips, hidden-tab parking brake, and unsafe-speed clamping for mobile stability.
- Service worker cache now includes every runtime polish script and bumps the cache version so PWA/offline installs receive the new files.

## Static hosting

This project is intentionally static. It can be previewed locally with any static server and uploaded to Netlify without changing Netlify dashboard settings.

```bash
python3 -m http.server 8080
```

Then open the local server page in a browser and test desktop, mobile viewport, controller input, missions, City Objectives daily reward, Route Assist distance/direction, Mobile Shell `V` panel, fullscreen, scroll lock, double-tap zoom prevention, vehicle brake `X`/`Space`, mobile Brake button, vehicle refuel, property income, session assist, battery saver, HUD scaling, low motion, camera mode/zoom, minimap sizing, feedback prompts/sound/haptics, QA panel `Q`, smoke check, emergency save, save-health export, save/export, and PWA install behavior.

## Files

- `index.html` - app shell, HUD, Pause menu, Mission Board, mobile controls, and safe script boot order.
- `styles.css` - responsive HUD, mobile controls, pause/save panels.
- `app.js` - playable Three.js game runtime, persistence, streaming, missions, vehicles, and graphics quality.
- `neonblock-runtime-guard.js` - pre-start corrupt-save quarantine, latest-good-save recovery, fall-through recovery, page lifecycle saves, and runtime health checks.
- `neonblock-hardening.js` - touch, blur, backup, FPS, and gas-warning hardening.
- `neonblock-input-polish.js` - controller input, PWA install, storage, network, and WebGL recovery polish.
- `neonblock-economy-polish.js` - refuel controls, passive property income, quick save, and live economy HUD hints.
- `neonblock-session-polish.js` - Session Assist checklist, mission tracking hint, Battery Saver, and QA snapshot export.
- `neonblock-accessibility-polish.js` - HUD scale controls, Low Motion mode, save-health reporting, and startup fallback messaging.
- `neonblock-camera-polish.js` - camera mode/zoom controls, minimap sizing, and camera-mode HUD hint.
- `neonblock-objective-polish.js` - City Objectives panel, daily movement/driving/property goals, nearby opportunity hints, and reward claiming.
- `neonblock-feedback-polish.js` - feedback panel, interaction prompts, save freshness, optional sound, and optional haptics.
- `neonblock-wayfinding-polish.js` - Route Assist panel, mission distance, compass direction, objective hints, and nearby opportunity guidance.
- `neonblock-mobile-shell-polish.js` - mobile fullscreen/scroll-lock panel, safe touch targets, viewport stability hints, and mobile gesture protection.
- `neonblock-qa-polish.js` - Runtime QA panel, smoke-check runner, emergency save, live object counts, and unsafe-bounds recovery.
- `neonblock-driving-polish.js` - Driving Assist panel, desktop/mobile braking, speed/gas tips, parking brake, and unsafe-speed stabilization.
- `firebase-backend.js` - optional cloud-save adapter; localStorage works without Firebase.
- `manifest.webmanifest`, `sw.js`, `icon.svg` - PWA install/offline readiness.
