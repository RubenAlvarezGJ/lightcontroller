export type SupportStatus = 'ok' | 'framed' | 'policy' | 'insecure' | 'unsupported';

export interface SupportEnv {
  hasBluetooth: boolean;
  isFramed: boolean;
  policyAllowsBluetooth: boolean;
  isSecureContext: boolean;
}

export function readSupportEnv(): SupportEnv {
  let isFramed: boolean;
  try {
    isFramed = window.self !== window.top;
  } catch {
    isFramed = true; // cross-origin parent
  }
  // featurePolicy is non-standard (Chromium only) and not in the DOM typings.
  const policy = (document as Document & { featurePolicy?: { allowsFeature(f: string): boolean } })
    .featurePolicy;
  return {
    hasBluetooth: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
    isFramed,
    policyAllowsBluetooth: policy ? policy.allowsFeature('bluetooth') : true,
    isSecureContext: window.isSecureContext,
  };
}

/** Order matters: an embedded preview should say so, not claim the browser is unsupported. */
export function checkSupport(env: SupportEnv): SupportStatus {
  if (env.isFramed) return 'framed';
  if (!env.policyAllowsBluetooth) return 'policy';
  if (!env.isSecureContext) return 'insecure';
  if (!env.hasBluetooth) return 'unsupported';
  return 'ok';
}

export const SUPPORT_MESSAGES: Record<Exclude<SupportStatus, 'ok'>, string> = {
  framed:
    'Bluetooth is blocked because this page is embedded in another page. Open it directly in Chrome or Edge.',
  policy:
    'Bluetooth is turned off for this page by its permissions policy. Open it directly in Chrome or Edge.',
  insecure: 'Bluetooth needs a secure (https) connection. Open the https address of this app.',
  unsupported:
    'This browser can’t use Bluetooth. Use Chrome or Edge on a computer or Android. On iPhone or iPad, use the Bluefy browser.',
};
