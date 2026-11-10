import { be16, CMD, frame } from './frame';
import { clamp, hsvToRgb } from './color';

/**
 * How a lamp reads the 0x03 color payload.
 * - rgb: [R, G, B, 0x00]. The Sunset Lamp. Sending HSV here shows every color as green.
 * - hsv: [hue BE16 0-360, saturation BE16 0-1000]. MeRGBW LED strips.
 */
export type ColorEncoding = 'rgb' | 'hsv';

export const BRIGHTNESS_MIN = 50;
export const BRIGHTNESS_MAX = 1000;

export const syncCmd = (): Uint8Array => frame(CMD.SYNC);

export const powerCmd = (on: boolean): Uint8Array => frame(CMD.POWER, [on ? 1 : 0]);

/** Raw brightness value, 50-1000, sent as 2 bytes big-endian. */
export function brightnessRawCmd(value: number): Uint8Array {
  return frame(CMD.BRIGHTNESS, be16(Math.round(clamp(value, BRIGHTNESS_MIN, BRIGHTNESS_MAX))));
}

/** The app's 0-100% slider mapped onto the lamp's (i + 5) * 10 scale, i = 0..95. */
export function brightnessPercentToRaw(pct: number): number {
  const i = Math.round((clamp(pct, 0, 100) / 100) * 95);
  return (i + 5) * 10;
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
