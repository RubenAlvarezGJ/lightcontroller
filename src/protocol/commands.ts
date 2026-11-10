import { be16, CMD, frame } from './frame';
import { clamp, hsvToRgb } from './color';

/**
 * How a lamp reads the 0x03 color payload.
 * - rgb: [R, G, B, 0x00]. The Sunset Lamp. Sending HSV here shows every color as green.
 * - hsv: [hue BE16 0-360, saturation BE16 0-1000]. MeRGBW LED strips.
 */
export type ColorEncoding = 'rgb' | 'hsv';

/**
 * Brightness range for 0x05. The MeRGBW strip app tops out at 1000, but the
 * Sunset Lamp keeps getting brighter up to 25000 (0x61A8), which matches the
 * physical remote's peak (found by hand on the lamp, Nov 2026).
 */
export const BRIGHTNESS_MIN = 50;
export const BRIGHTNESS_MAX = 25000;

export const syncCmd = (): Uint8Array => frame(CMD.SYNC);

export const powerCmd = (on: boolean): Uint8Array => frame(CMD.POWER, [on ? 1 : 0]);

/** Raw brightness value, 50-25000, sent as 2 bytes big-endian. */
export function brightnessRawCmd(value: number): Uint8Array {
  return frame(CMD.BRIGHTNESS, be16(Math.round(clamp(value, BRIGHTNESS_MIN, BRIGHTNESS_MAX))));
}

/**
 * The app's 0-100% slider mapped onto the lamp's raw range along a squared
 * curve. Perceived LED brightness rises steeply at low values, so a straight
 * line would cram everything from dim to bright into the first few percent.
 */
export function brightnessPercentToRaw(pct: number): number {
  const t = clamp(pct, 0, 100) / 100;
  return Math.round(BRIGHTNESS_MIN + (BRIGHTNESS_MAX - BRIGHTNESS_MIN) * t * t);
}

export const brightnessCmd = (pct: number): Uint8Array =>
  brightnessRawCmd(brightnessPercentToRaw(pct));

/** Hue in degrees, saturation 0-100. */
export function colorCmd(hue: number, sat: number, encoding: ColorEncoding): Uint8Array {
  if (encoding === 'rgb') return frame(CMD.COLOR, [...hsvToRgb(hue, sat), 0x00]);
  const h = Math.round(((hue % 360) + 360) % 360);
  const s = Math.round(clamp(sat, 0, 100) * 10);
  return frame(CMD.COLOR, [...be16(h), ...be16(s)]);
}

/** Raw RGB color, for testing channel order on hardware. */
export const rgbCmd = (r: number, g: number, b: number, w = 0): Uint8Array =>
  frame(CMD.COLOR, [r, g, b, w]);

/** Local time: year BE16, month, day, hour, minute, second, weekday (Mon=1..Sun=7). */
export function timeSyncCmd(d: Date): Uint8Array {
  const weekday = ((d.getDay() + 6) % 7) + 1;
  return frame(CMD.TIME, [
    ...be16(d.getFullYear()),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    weekday,
  ]);
}
