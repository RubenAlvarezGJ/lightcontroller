# Sunset Lamp Controller

Control Tsrarey / MeRGBW "Sunset Lamp" lights over Bluetooth from a browser, without the vendor app. Power, brightness and color work on several lamps at once.

**Use it:** https://rubenalvarezgj.github.io/lightcontroller/ (available once the first deploy has run)

## Before you connect

- Close the official MeRGBW app and nRF Connect. Each lamp accepts only one Bluetooth connection.
- Use Chrome or Edge on Windows, macOS, Linux or Android. Safari on iPhone and iPad doesn't support Web Bluetooth; the Bluefy browser does.
- Open the app directly. Bluetooth is blocked when the page is embedded in another page.

On Android, open the menu and choose **Add to Home screen** to install it as an app.

## Features

- Connect several lamps; commands go to every lamp that's checked in the lamp list.
- Hue ring (drag, or arrow keys with Shift for bigger steps), color strength, brightness, power and eight presets.
- Per-lamp name and color format (RGB for the Sunset Lamp, hue/saturation for MeRGBW LED strips), saved in the browser.
- Automatic reconnect when a lamp drops out, and one-tap reconnect for lamps the browser remembers.
- Bluetooth log with every frame in hex, plus a raw frame sender for testing the protocol.

## Development

```sh
npm install
npm run dev        # dev server (localhost counts as a secure context, so Bluetooth works)
npm test           # unit and UI tests
npm run lint
npm run typecheck
npm run build      # production build in dist/
```

The protocol is documented in [`docs/MeRGBW Sunset Lamp Controller Implementation Handover.md`](docs/MeRGBW%20Sunset%20Lamp%20Controller%20Implementation%20Handover.md). It's reimplemented from those facts; the [homey-mergbw](https://github.com/smarthomesven/homey-mergbw) project that first described it is GPL-3.0, and none of its code is used here.
