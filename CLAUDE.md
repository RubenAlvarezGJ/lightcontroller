# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Preact + TypeScript PWA that controls Tsrarey "Sunset Lamp" T3 lights (MeRGBW protocol) over Web Bluetooth, replacing the vendor app. Hosted on GitHub Pages at `/lightcontroller/` (the Vite `base`).

- `docs/MeRGBW Sunset Lamp Controller Implementation Handover.md` is the spec: BLE profile, frame format, command table, known-good frames, open hardware questions. Read it before protocol work.
- `docs/sunset-lamp-controller-poc.html` is the original single-file proof of concept, verified on real lamps. Reference only.

## Commands

```sh
npm run dev                       # Vite dev server
npm test                          # Vitest, all tests
npx vitest run tests/frame.test.ts -t "power on"   # one file / one test
npm run lint                      # ESLint
npx prettier --check .            # formatting (CI runs this)
npm run typecheck                 # tsc -b
npm run build                     # typecheck + production build + service worker
node scripts/make-icons.mjs       # regenerate PWA PNG icons
```

CI (`.github/workflows/ci.yml`) runs lint, prettier, tests and build. `deploy.yml` publishes `dist/` to Pages on push to `main`.

Web Bluetooth only works in a top-level secure page (https or localhost) in Chrome/Edge. It is blocked in iframes, which includes IDE and chat previews, and it isn't available in headless Chrome, so the UI shows its "unsupported" banner there. Real lamp testing has to be done by the user.

## Architecture

```
src/protocol/   pure frame building/parsing; no DOM or BLE (ESLint enforces this)
src/transport/  Transport/LampLink interfaces, Web Bluetooth implementation, support detection
src/devices/    LampManager (connections, queues, reconnect), settings store, event log
src/ui/         Preact components; state.ts holds signals + actions; services.ts wires everything
tests/          fakes.ts (FakeLamp/FakeTransport) drives LampManager and UI tests without hardware
```

- Commands go to every **connected and included** lamp. `LampManager.send(kind, build)` calls `build(settings)` per lamp, because color encoding is a per-lamp setting.
- Each lamp has its own queue that keeps only the latest frame per command kind and waits 40 ms between writes. This prevents BLE floods when dragging the hue ring and stops one slow lamp from delaying the others.
- On connect: subscribe to FFF4, send sync (`0x00`), then time sync (`0x0C`). An unexpected drop triggers reconnect with backoff (1, 2, 4, 8, 16, 30 s), then the lamp is marked disconnected for a manual reconnect.
- UI state (`on`, `hue`, `sat`, `bri`) is what the app last sent. Only power is read back from lamps (sync replies). Color and brightness changes turn the lamps on.
- Settings live in localStorage under `lightcontroller.lamps.v1`, and every access is guarded.

## Protocol facts that are easy to get wrong

- Frame: `55 <cmd> FF <len=5+payload> <payload…> <checksum>`, checksum `~(sum & 0xFF) & 0xFF`. **The lamp silently drops bad frames.** Any frame change needs the known-good frames in `tests/frame.test.ts` to still pass.
- **Color `0x03` is RGB on this lamp (`[R, G, B, 0x00]`), not HSV.** Sending HSV shows every color as green. `hsv` encoding is only for MeRGBW strips.
- Brightness `0x05` is BE16 **50 to 25000** on this lamp (found by hand; 25000 matches the remote's peak). The reference project's 1000 cap came from the strip app and left the lamp at a fraction of its output. The slider maps percentages along a squared curve, `50 + 24950 × (pct/100)²`, so the dim end stays controllable.
- Reply checksums are unreliable, so parse by position and never reject a reply on checksum. Only power is decoded: the last byte of a sync reply is `0x32` on, `0x33` off.
- Commands marked "Reference" in the handover are untested on this lamp. Don't add them to the UI until they have been verified on hardware. Use the raw frame sender in the log panel to test them.

## Licensing

The protocol facts come from homey-mergbw (GPL-3.0). Reimplement from the handover. Do not copy that project's code.
