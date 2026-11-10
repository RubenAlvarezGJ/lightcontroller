import { describe, expect, it } from 'vitest';
import { hsvToRgb } from '../src/protocol/color';
import { fromHex } from '../src/protocol/frame';
import { parseReply } from '../src/protocol/parse';

describe('hsvToRgb', () => {
  it.each([
    [0, 100, [255, 0, 0]],
    [120, 100, [0, 255, 0]],
    [240, 100, [0, 0, 255]],
    [60, 100, [255, 255, 0]],
    [360, 100, [255, 0, 0]],
    [-120, 100, [0, 0, 255]],
    [200, 0, [255, 255, 255]],
  ])('hue %d sat %d -> %j', (h, s, rgb) => {
    expect(hsvToRgb(h, s)).toEqual(rgb);
  });

  it('desaturates toward white', () => {
    expect(hsvToRgb(0, 50)).toEqual([255, 128, 128]);
  });
});

describe('parseReply', () => {
  it('ignores frames without the 0x56 reply header', () => {
    expect(parseReply(fromHex('55 01 FF 06 01 A3'))).toBeNull();
    expect(parseReply(new Uint8Array([0x56]))).toBeNull();
  });

  it('reads power on and off from a sync reply', () => {
    expect(parseReply(fromHex('56 00 FF 07 01 32'))?.power).toBe(true);
    expect(parseReply(fromHex('56 00 FF 07 01 33'))?.power).toBe(false);
  });

  it('does not reject replies with a bad checksum', () => {
    // The last byte is not a valid checksum; it's still the power field.
    const reply = parseReply(fromHex('56 00 FF 0A 11 22 33 44 55 32'));
    expect(reply).not.toBeNull();
    expect(reply?.cmd).toBe(0x00);
    expect(reply?.power).toBe(true);
  });

  it('leaves power undefined for unknown values and other commands', () => {
    expect(parseReply(fromHex('56 00 FF 07 01 40'))?.power).toBeUndefined();
    expect(parseReply(fromHex('56 01 FF 06 32'))?.power).toBeUndefined();
    expect(parseReply(fromHex('56 01 FF 06 32'))?.cmd).toBe(0x01);
  });
});
