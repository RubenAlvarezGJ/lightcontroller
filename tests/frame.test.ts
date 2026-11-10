import { describe, expect, it } from 'vitest';
import { checksum, CMD, frame, fromHex, toHex } from '../src/protocol/frame';
import {
  brightnessCmd,
  brightnessPercentToRaw,
  brightnessRawCmd,
  colorCmd,
  powerCmd,
  rgbCmd,
  syncCmd,
  timeSyncCmd,
} from '../src/protocol/commands';

// Known-good frames from the handover's Protocol reference, verified on the lamp.
const KNOWN_GOOD: [string, () => Uint8Array, string][] = [
  ['power on', () => powerCmd(true), '55 01 FF 06 01 A3'],
  ['power off', () => powerCmd(false), '55 01 FF 06 00 A4'],
  ['red (rgb)', () => rgbCmd(0xff, 0, 0), '55 03 FF 09 FF 00 00 00 A0'],
  ['blue (rgb)', () => rgbCmd(0, 0, 0xff), '55 03 FF 09 00 00 FF 00 A0'],
  ['brightness raw 525', () => brightnessRawCmd(525), '55 05 FF 07 02 0D 90'],
  ['sync request', () => syncCmd(), '55 00 FF 05 A6'],
];

describe('known-good frames', () => {
  it.each(KNOWN_GOOD)('%s', (_name, build, expected) => {
    expect(toHex(build())).toBe(expected);
  });

  it('red and blue via hue use the same bytes as the raw frames', () => {
    expect(toHex(colorCmd(0, 100, 'rgb'))).toBe('55 03 FF 09 FF 00 00 00 A0');
    expect(toHex(colorCmd(240, 100, 'rgb'))).toBe('55 03 FF 09 00 00 FF 00 A0');
  });
});

describe('frame', () => {
  it('sets header, sequence byte and total length', () => {
    const f = frame(0x0f, [1, 2, 3]);
    expect(f.length).toBe(8);
    expect([f[0], f[1], f[2], f[3]]).toEqual([0x55, 0x0f, 0xff, 8]);
  });

  it('ends with a checksum the lamp accepts for every frame', () => {
    for (const [, build] of KNOWN_GOOD) {
      const f = build();
      expect(f[f.length - 1]).toBe(checksum(f, f.length - 1));
    }
  });

  it('masks payload values to bytes', () => {
    expect(toHex(frame(CMD.POWER, [0x101]))).toBe(toHex(frame(CMD.POWER, [0x01])));
  });
});

describe('brightness', () => {
  it('maps 0-100% onto 50-1000 in steps of 10', () => {
    expect(brightnessPercentToRaw(0)).toBe(50);
    expect(brightnessPercentToRaw(100)).toBe(1000);
    expect(brightnessPercentToRaw(50)).toBe(530);
    expect(brightnessPercentToRaw(1)).toBe(60);
  });

  it('clamps out-of-range input', () => {
    expect(brightnessPercentToRaw(-20)).toBe(50);
    expect(brightnessPercentToRaw(250)).toBe(1000);
    expect(toHex(brightnessRawCmd(5000))).toBe(toHex(brightnessRawCmd(1000)));
    expect(toHex(brightnessRawCmd(0))).toBe(toHex(brightnessRawCmd(50)));
  });

  it('builds a 2-byte big-endian frame', () => {
    expect(toHex(brightnessCmd(100))).toMatch(/^55 05 FF 07 03 E8 /);
  });
});

describe('color', () => {
  it('rgb encoding sends R, G, B and a zero fourth byte', () => {
    expect(toHex(colorCmd(120, 100, 'rgb'))).toMatch(/^55 03 FF 09 00 FF 00 00 /);
  });

  it('hsv encoding sends hue and saturation*10 as big-endian 16-bit values', () => {
    // The bytes that made the Sunset Lamp show green: orange, hue 25.
    expect(toHex(colorCmd(25, 100, 'hsv'))).toMatch(/^55 03 FF 09 00 19 03 E8 /);
    expect(toHex(colorCmd(240, 100, 'hsv'))).toMatch(/^55 03 FF 09 00 F0 03 E8 /);
  });

  it('wraps hue in hsv encoding', () => {
    expect(toHex(colorCmd(370, 50, 'hsv'))).toBe(toHex(colorCmd(10, 50, 'hsv')));
    expect(toHex(colorCmd(-10, 50, 'hsv'))).toBe(toHex(colorCmd(350, 50, 'hsv')));
  });
});

describe('time sync', () => {
  it('encodes local date and time with Monday=1', () => {
    // Monday 10 Nov 2025, 13:04:05 local time.
    const f = timeSyncCmd(new Date(2025, 10, 10, 13, 4, 5));
    expect(toHex(f.subarray(0, 12))).toBe('55 0C FF 0D 07 E9 0B 0A 0D 04 05 01');
  });

  it('encodes Sunday as 7', () => {
    const f = timeSyncCmd(new Date(2025, 10, 16, 0, 0, 0));
    expect(f[11]).toBe(7);
  });
});

describe('hex helpers', () => {
  it('round-trips', () => {
    expect(toHex(fromHex('55 01 ff 06 01 a3'))).toBe('55 01 FF 06 01 A3');
  });

  it('rejects non-hex input', () => {
    expect(() => fromHex('55 zz')).toThrow(/zz/);
  });
});
