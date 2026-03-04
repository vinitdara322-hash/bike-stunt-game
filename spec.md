# Bike Stunt Game

## Current State
A 2D bike stunt game built with React and Canvas API. Player rides a bike across procedurally generated terrain doing flips, wheelies, and collecting boost pickups. Features HUD with score/combo/speed, particle effects, stunt banners, and a game over overlay. No audio of any kind currently exists.

## Requested Changes (Diff)

### Add
- Web Audio API-based sound engine (no external files, all synthesized)
- Engine sound: continuous low hum that rises in pitch/volume with speed
- Flip/stunt sound: whoosh on takeoff, "ding" on landing after flip
- Boost pickup sound: short ascending chime
- Landing impact sound: thud that scales with landing velocity
- Crash/game-over sound: descending crash noise
- Wheelie sound: subtle revving tick while wheelied
- Mute toggle button in the HUD (top-right corner)

### Modify
- BikeGame.tsx: add a `useSoundEngine` hook or inline audio logic using Web Audio API; trigger sounds from existing game events (boost pickup, stunt detection, landing, crash)

### Remove
- Nothing removed
