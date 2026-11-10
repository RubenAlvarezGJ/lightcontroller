export type Rgb = [number, number, number];

/**
 * Hue (degrees, any range) and saturation (0-100) at full value to 8-bit RGB.
 * Value is fixed at 100% because brightness is a separate lamp command.
 */
export function hsvToRgb(hue: number, sat: number): Rgb {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(sat, 0, 100) / 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
