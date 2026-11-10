/**
 * MeRGBW frame format (outgoing, written to characteristic FFF3):
 *
 *   0x55 | cmd | 0xFF | length | payload... | checksum
 *
 * length is the whole frame (5 + payload). checksum is the bitwise NOT of the
 * low byte of the sum of every preceding byte. The lamp silently drops frames
 * with a bad checksum, so keep tests/frame.test.ts in sync with any change here.
 */

export const SERVICE_UUID = 0xfff0;
export const WRITE_CHAR_UUID = 0xfff3;
export const NOTIFY_CHAR_UUID = 0xfff4;

export const HEADER_OUT = 0x55;
export const HEADER_IN = 0x56;
const SEQ_FIXED = 0xff;

export const CMD = {
  SYNC: 0x00,
  POWER: 0x01,
  COLOR: 0x03,
  BRIGHTNESS: 0x05,
  TIME: 0x0c,
} as const;

export function checksum(bytes: ArrayLike<number>, end = bytes.length): number {
  let sum = 0;
  for (let i = 0; i < end; i++) sum += bytes[i]!;
  return ~(sum & 0xff) & 0xff;
}

export function frame(cmd: number, payload: readonly number[] = []): Uint8Array {
  const len = 5 + payload.length;
  const b = new Uint8Array(len);
  b.set([HEADER_OUT, cmd & 0xff, SEQ_FIXED, len, ...payload.map((v) => v & 0xff)]);
  b[len - 1] = checksum(b, len - 1);
  return b;
}

/** Unsigned 16-bit big-endian. */
export function be16(v: number): [number, number] {
  return [(v >> 8) & 0xff, v & 0xff];
}

export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/** Parses "55 01 ff 06 01 a3" (any whitespace, case-insensitive). Throws on bad input. */
export function fromHex(hex: string): Uint8Array {
  const parts = hex.trim().split(/\s+/).filter(Boolean);
  return Uint8Array.from(parts, (p) => {
    if (!/^[0-9a-f]{1,2}$/i.test(p)) throw new Error(`Not a hex byte: "${p}"`);
    return parseInt(p, 16);
  });
}
