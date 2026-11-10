import { signal, type Signal } from '@preact/signals';
import type { LampManager } from '../devices/LampManager';
import { brightnessCmd, colorCmd, powerCmd } from '../protocol/commands';

export interface Preset {
  name: string;
  hue: number;
  sat: number;
}

export const PRESETS: readonly Preset[] = [
  { name: 'Sunset', hue: 22, sat: 100 },
  { name: 'Golden hour', hue: 38, sat: 100 },
  { name: 'Rose', hue: 340, sat: 85 },
  { name: 'Magenta', hue: 300, sat: 100 },
  { name: 'Violet', hue: 270, sat: 100 },
  { name: 'Ocean', hue: 205, sat: 100 },
  { name: 'Teal', hue: 170, sat: 100 },
  { name: 'Warm white', hue: 30, sat: 25 },
];

/** The CSS color that previews a hue/saturation pair (lighter as saturation drops). */
export function previewColor(hue: number, sat: number): string {
  return `hsl(${Math.round(hue)}, ${Math.max(sat, 8)}%, ${50 + (100 - sat) * 0.4}%)`;
}

export interface Controls {
  on: Signal<boolean>;
  hue: Signal<number>;
  sat: Signal<number>;
  bri: Signal<number>;
  setPower(on: boolean): void;
  setColor(hue: number, sat?: number): void;
  setBrightness(pct: number): void;
  /** Re-sends the current color to one lamp, e.g. after its encoding changed. */
  resendColor(lampId: string): void;
}

/**
 * The lamp state the UI shows, and the actions that change it. State is what
 * the app last sent; changing color or brightness turns the lamps on.
 */
export function createControls(manager: LampManager): Controls {
  const on = signal(false);
  const hue = signal(25);
  const sat = signal(100);
  const bri = signal(80);

  const sendColor = (lampId?: string) =>
    manager.send('color', (s) => colorCmd(hue.value, sat.value, s.encoding), lampId);

  const setPower = (next: boolean) => {
    on.value = next;
    manager.send('power', () => powerCmd(next));
  };

  // Sync replies from an included lamp update the power state without echoing a command back.
  manager.onPower((reported, lampId) => {
    const lamp = manager.lamps.find((l) => l.id === lampId);
    if (lamp?.settings.included !== false) on.value = reported;
  });

  return {
    on,
    hue,
    sat,
    bri,
    setPower,
    setColor(nextHue, nextSat = sat.value) {
      hue.value = ((nextHue % 360) + 360) % 360;
      sat.value = nextSat;
      if (!on.value) setPower(true);
      sendColor();
    },
    setBrightness(pct) {
      bri.value = pct;
      if (!on.value) setPower(true);
      manager.send('brightness', () => brightnessCmd(pct));
    },
    resendColor(lampId) {
      sendColor(lampId);
    },
  };
}
