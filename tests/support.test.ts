import { describe, expect, it } from 'vitest';
import { checkSupport, type SupportEnv } from '../src/transport/support';

const ok: SupportEnv = {
  hasBluetooth: true,
  isFramed: false,
  policyAllowsBluetooth: true,
  isSecureContext: true,
};

describe('checkSupport', () => {
  it('is ok in a top-level secure page with Web Bluetooth', () => {
    expect(checkSupport(ok)).toBe('ok');
  });

  it('reports framing before anything else', () => {
    expect(checkSupport({ ...ok, isFramed: true, hasBluetooth: false })).toBe('framed');
  });

  it('reports a permissions-policy block', () => {
    expect(checkSupport({ ...ok, policyAllowsBluetooth: false })).toBe('policy');
  });

  it('reports an insecure context', () => {
    expect(checkSupport({ ...ok, isSecureContext: false, hasBluetooth: false })).toBe('insecure');
  });

  it('reports a browser without Web Bluetooth', () => {
    expect(checkSupport({ ...ok, hasBluetooth: false })).toBe('unsupported');
  });
});
