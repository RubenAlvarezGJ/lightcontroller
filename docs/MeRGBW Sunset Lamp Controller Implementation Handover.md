# MeRGBW Sunset Lamp Controller: Implementation Handover

Nov 10, 2026 · @Ruben

## Summary

The lamp can be fully controlled over Bluetooth Low Energy without the vendor app; power, brightness and color are confirmed working from a browser proof of concept. The goal now is a maintainable controller app usable from both a phone and a laptop.

- **Device:** Tsrarey Sunset Lamp T3 (Amazon ASIN B0BDRXFQYX), bought Oct 2025. Several units in use.
- **Problem:** the official MeRGBW app (Shenzhen Dingyun Future Technology) stopped working. The lamps and their physical remote still work.
- **Status:** protocol identified, power/brightness/color verified on real hardware, single-file Web Bluetooth page working in desktop Chrome.
- **Ask for Claude Code:** turn the proof of concept into a structured, tested app (see Implementation plan).

## Hardware and BLE profile

The lamp is a BLE peripheral exposing one vendor service with a write and a notify characteristic, read with nRF Connect.

| UUID | Type | Properties | Role |
| --- | --- | --- | --- |
| `0000fff0-0000-1000-8000-00805f9b34fb` | Primary service | n/a | Vendor control service |
| `0000fff3-0000-1000-8000-00805f9b34fb` | Characteristic | Write, Write without response | Commands to the lamp |
| `0000fff4-0000-1000-8000-00805f9b34fb` | Characteristic | Notify | Replies and status from the lamp |

Relevant listing specs: 5 V USB rechargeable, E27 base, Bluetooth connectivity, IR/RF remote included.

Discovery hints, from the open-source reference implementation (not yet verified on this lamp):

- Advertised local name may be `LED Lights`.
- Advertised service UUIDs may include `fff0` or `3519`.
- Manufacturer data may contain the ASCII tag `TG201A`.

The proof of concept uses `acceptAllDevices` with `optionalServices: [0xfff0]` because the advertisement contents are unconfirmed. Tightening the scan filter is a task (see Open questions).

The lamp accepts one BLE connection at a time. The vendor app, nRF Connect or another controller must be disconnected first.

## Protocol reference

Every command is a single frame written to `FFF3`: header `0x55`, command code, fixed `0xFF`, total length, payload, then a checksum. The format comes from the open-source [homey-mergbw](https://github.com/smarthomesven/homey-mergbw) project (GPL-3.0), which reverse-engineered the official app's `CommandUtils` class.

| Byte | Value | Meaning |
| --- | --- | --- |
| 0 | `0x55` | Header (outgoing frames) |
| 1 | command code | See command table |
| 2 | `0xFF` | Sequence byte, fixed for normal commands |
| 3 | `5 + payload length` | Total frame length in bytes |
| 4 to n-2 | payload | Command arguments |
| n-1 | checksum | Bitwise NOT of (sum of bytes 0 to n-2, mod 256) |

Checksum, as implemented in the proof of concept:

```javascript
function frame(cmd, payload = []) {
  const len = 5 + payload.length;
  const b = new Uint8Array(len);
  b.set([0x55, cmd, 0xff, len, ...payload]);
  let sum = 0;
  for (let i = 0; i < len - 1; i++) sum += b[i];
  b[len - 1] = (~(sum & 0xff)) & 0xff;
  return b;
}
```

Command codes. "Verified" means tested on this lamp; "Reference" means listed in homey-mergbw but not yet tested here.

| Code | Name | Payload | Status |
| --- | --- | --- | --- |
| `0x00` | Sync status request | none | Sent on connect; reply format partly known |
| `0x01` | Power | 1 byte: `1` on, `0` off | Verified |
| `0x02` | Firmware info | unknown | Reference |
| `0x03` | Set color | 4 bytes: R, G, B, `0x00` on this lamp | Accepted; RGB layout inferred (see Color encoding) |
| `0x04` | Set part color | unknown | Reference |
| `0x05` | Brightness | 2 bytes big-endian, `(i + 5) * 10` with i = 0 to 95, so 50 to 1000 | Verified |
| `0x06` | Scene / effect mode | 2 bytes big-endian scene index | Reference |
| `0x07` | Music mode | unknown | Reference |
| `0x08` | Music sensitivity | unknown | Reference |
| `0x09` | DIY mode | unknown (uses a non-fixed sequence byte) | Reference |
| `0x0A` | Timer | unknown | Reference |
| `0x0B` | LED count | unknown | Reference |
| `0x0C` | Time sync | 8 bytes: year (2, BE), month, day, hour, minute, second, weekday (Mon=1 to Sun=7) | Sent on connect; effect unverified |
| `0x0D` | Config mode | unknown | Reference |
| `0x0E` | Check bind state | unknown | Reference |
| `0x0F` | Effect speed | 1 byte, 0 to 255 | Reference |
| `0x10` | White light | unknown | Reference |
| `0x11` | White brightness | unknown | Reference |
| `0x12` | Cold and warm | unknown | Reference |

Known-good frames for unit tests (hex):

| Action | Frame |
| --- | --- |
| Power on | `55 01 FF 06 01 A3` |
| Power off | `55 01 FF 06 00 A4` |
| Red (RGB) | `55 03 FF 09 FF 00 00 00 A0` |
| Blue (RGB) | `55 03 FF 09 00 00 FF 00 A0` |
| Brightness \~50% (value 525) | `55 05 FF 07 02 0D 90` |
| Sync request | `55 00 FF 05 A6` |

Writes use write-without-response when available, falling back to write-with-response.

## Color encoding: RGB, not HSV

This lamp reads the `0x03` color payload as raw R, G, B bytes, unlike the MeRGBW LED strips in the reference project, which take hue and saturation. The RGB layout is inferred from observed behavior and still needs a channel-order check.

Evidence: the first build sent HSV (hue 0 to 360 as 2 bytes, saturation 0 to 1000 as 2 bytes). Every color showed as green, with only the brightness changing.

| Picked | HSV bytes sent | Read as RGB |
| --- | --- | --- |
| Orange, hue 25 | `00 19 03 E8` | R 0, G 25, B 3: dim green |
| Blue, hue 240 | `00 F0 03 E8` | R 0, G 240, B 3: bright green |

The hue's low byte landed in the green slot, which explains the symptom exactly.

Current encoding in the proof of concept: convert the UI's hue and saturation to RGB at full value, send `[R, G, B, 0x00]`, and control brightness separately with `0x05`. The fourth byte is kept because the 4-byte payload was accepted; it may be a white channel.

The app should keep both encodings behind a per-device setting (`rgb` default, `hsv` for MeRGBW strips).

To confirm before building on it:

- [ ] Pure red, green and blue each display correctly (rules out GRB or BGR ordering)
- [ ] Effect of a non-zero fourth byte (white channel or ignored)
- [ ] Whether a 3-byte payload is also accepted

## Notifications and state sync

Only the power state can be read back reliably so far; everything else in the lamp's replies is undecoded.

- Replies arrive on `FFF4` and start with `0x56`. Byte 1 echoes the command code.
- After a sync request (`0x00`), the last byte of the reply is `0x32` when on and `0x33` when off.
- Reply checksums are not consistent, per the reference project. Parse replies by position; do not reject them on checksum.
- Brightness, color and mode fields in the sync reply are unknown.

On connect, the proof of concept subscribes to `FFF4`, sends a sync request, then a time sync. Any changes made with the physical remote are not reflected unless a sync is requested again.

Decoding the full sync reply is a stretch goal: capture replies after setting known states with the remote, then correlate bytes.

## Proof of concept

A single self-contained HTML file, `sunset-lamp-controller.html`, controls one or more lamps from desktop Chrome using the Web Bluetooth API. Treat it as a reference for behavior, not as code to extend directly.

What it does:

- Connects to multiple lamps; every command is broadcast to all connected lamps.
- Hue ring (pointer drag and arrow keys), color-strength slider, brightness slider, power toggle and eight color presets.
- Settings switch between RGB and HSV color encoding.
- Bluetooth log panel showing every frame sent and received, in hex.
- Light and dark themes; detects unsupported browsers and embedded previews.

Lessons learned:

| Issue | Cause | Handling |
| --- | --- | --- |
| `requestDevice` blocked by permissions policy | Page ran inside an iframe (the chat file preview), where Bluetooth is disallowed | Must run as a top-level page; detect framing and show a clear message |
| Only green displayed | Lamp expects RGB, page sent HSV | RGB encoding by default |
| Lamp not found or connect fails | Another app or nRF Connect holds the single BLE connection | Tell the user to close other controllers |
| Lag when dragging the color ring | Dozens of writes per second overwhelm BLE | Coalesce: keep only the latest pending frame per command type, about 40 ms between writes |
| Wrong bytes silently ignored | Lamp drops frames with a bad checksum | Unit-test the frame builder against known-good frames |

Platform support for Web Bluetooth: works in Chrome and Edge on Windows, macOS, Linux and Android. Requires HTTPS or `file://`. Safari on iPhone and iPad does not support it; the third-party Bluefy browser does. Android Chrome cannot easily open a local file, so the page needs HTTPS hosting for phone use.

## Implementation plan for Claude Code

Build a TypeScript web app (installable PWA) hosted over HTTPS, with the protocol in a pure, unit-tested module behind a transport interface. One codebase then covers laptop and Android, and a native transport can be added later for iPhone.

### Recommended stack

- Vite + TypeScript, no heavy UI framework required (Preact or Svelte acceptable).
- Vitest for unit tests.
- Hosting: GitHub Pages or Netlify (HTTPS is required for Web Bluetooth).
- PWA manifest and service worker so it installs to the phone home screen.

### Module layout

```
src/
  protocol/
    frame.ts        // frame builder + checksum
    commands.ts     // power, brightness, color (rgb | hsv), sync, time
    parse.ts        // notify parsing (0x56 frames)
    color.ts        // hsv <-> rgb
  transport/
    Transport.ts    // interface: connect, write, onNotify, onDisconnect
    webBluetooth.ts // Web Bluetooth implementation
  devices/
    LampManager.ts  // multi-lamp, write coalescing, reconnect, per-lamp settings
  ui/               // hue ring, sliders, presets, lamp list, log
  main.ts
tests/
  frame.test.ts     // known-good frames from Protocol reference
```

The protocol layer must not import any browser or BLE API, so it can be tested in Node and reused by a Python or native port.

### Tasks

1. Scaffold the project, linting, Vitest and CI.
2. Port the frame builder and commands; test against every known-good frame in this doc.
3. Implement the Web Bluetooth transport and `LampManager` (write coalescing per command type, about 40 ms spacing, write-without-response with fallback).
4. Build the UI to parity with the proof of concept, keyboard accessible, light and dark themes.
5. Per-lamp settings in localStorage: display name, color encoding (`rgb` default, `hsv`).
6. Auto-reconnect on disconnect, and remember previously paired lamps where `navigator.bluetooth.getDevices()` is available.
7. Add the PWA manifest and deploy to HTTPS hosting.
8. Stretch: effect modes (`0x06`), effect speed (`0x0F`), timer (`0x0A`), after testing each on hardware.

### Acceptance criteria

- [ ] Frame builder unit tests pass for all known-good frames
- [ ] Connects to at least two lamps at once from desktop Chrome and Android Chrome
- [ ] Power, brightness and color work on every connected lamp
- [ ] Dragging the hue ring stays responsive with no write errors in the log
- [ ] Unsupported browser or embedded frame shows a clear explanation instead of an error
- [ ] Works when installed as a PWA on Android

### Later options

- **iPhone:** wrap the app with Capacitor and a native BLE plugin, implementing a second `Transport`.
- **Laptop CLI or automations:** a small Python port using `bleak`, reusing the same test frames.
- **Remote control from anywhere:** an ESP32 BLE bridge or Home Assistant, outside this scope.

Licensing note: homey-mergbw is GPL-3.0. Reimplementing the protocol from the facts in this doc is fine; copying its source code into this project would bring GPL obligations with it.

## Open questions

Each can be answered with nRF Connect or the proof of concept's log panel before or during implementation.

| Question | How to test |
| --- | --- |
| RGB channel order (RGB vs GRB vs BGR) | Send pure red, green, blue frames; check each color |
| Meaning of the fourth color byte | Send `FF 00 00 FF`, then `00 00 00 FF`; watch for white light |
| Advertisement contents (name, service UUIDs, manufacturer data) | Read the scan record in nRF Connect; use it for a tighter scan filter |
| Scene indices for effect modes (`0x06`) | Send indices 0 to 20 one at a time and record what each does |
| Full sync reply layout | Set known states with the remote, request sync, correlate the bytes |
| Whether the time sync and timer matter for this lamp | Send time sync, then set a timer, and observe |

## Sources

- [homey-mergbw source code](https://github.com/smarthomesven/homey-mergbw), Sven Serlier, GPL-3.0: frame format, command codes, sync parsing.
- [MeRGBW app for Homey](https://homey.app/en-us/app/com.szwest/): confirms BLE-only control of MeRGBW devices.
- [MeRGBW on the App Store](https://apps.apple.com/us/app/mergbw/id6463129603): official app, Shenzhen Dingyun Future Technology Co., Ltd.
- Hands-on testing with nRF Connect and the proof of concept, November 2026.
