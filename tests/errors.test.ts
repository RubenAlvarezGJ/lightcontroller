import { describe, expect, it } from 'vitest';
import { describeError, step, StepError } from '../src/transport/errors';
import { uuid16 } from '../src/transport/webBluetooth';

describe('describeError', () => {
  it('explains bare numeric rejections (Bluefy)', () => {
    expect(describeError(2)).toBe('error code 2');
    expect(describeError('2')).toBe('error code 2');
  });
  it('keeps DOMException names', () => {
    expect(describeError(new DOMException('No services', 'NotFoundError'))).toBe(
      'NotFoundError: No services',
    );
  });
  it('reads plain objects', () => {
    expect(describeError({ message: 'boom', code: 7 })).toBe('boom: code 7');
  });
  it('labels the failing step', async () => {
    const err = await step('Finding the lamp service (FFF0)', () => Promise.reject(2)).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(StepError);
    expect(describeError(err)).toBe('Finding the lamp service (FFF0) failed (error code 2)');
  });
});

describe('uuid16', () => {
  it('expands to the canonical 128-bit form', () => {
    expect(uuid16(0xfff0)).toBe('0000fff0-0000-1000-8000-00805f9b34fb');
  });
});
