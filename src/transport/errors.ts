/**
 * Turns anything a Bluetooth API rejects with into readable text. Chrome
 * rejects with DOMExceptions, but Bluefy (iOS) can reject with a bare number
 * or string such as `2`, which on its own tells the user nothing.
 */
export function describeError(e: unknown): string {
  if (e instanceof StepError) return e.message;
  if (e instanceof Error) {
    const name = e.name && e.name !== 'Error' ? `${e.name}: ` : '';
    return `${name}${e.message || '(no message)'}`;
  }
  if (typeof e === 'number' || (typeof e === 'string' && /^\d+$/.test(e.trim()))) {
    return `error code ${String(e).trim()}`;
  }
  if (typeof e === 'string') return e || '(no message)';
  if (e && typeof e === 'object') {
    const o = e as { name?: unknown; message?: unknown; code?: unknown };
    const parts = [o.name, o.message, o.code !== undefined ? `code ${String(o.code)}` : undefined]
      .filter((p) => p !== undefined && p !== '')
      .map(String);
    if (parts.length) return parts.join(': ');
    try {
      return JSON.stringify(e);
    } catch {
      /* fall through */
    }
  }
  return String(e);
}

/** An error that says which connection step failed, e.g. "finding service FFF0". */
export class StepError extends Error {
  constructor(
    readonly step: string,
    readonly cause: unknown,
  ) {
    super(`${step} failed (${describeError(cause)})`);
    this.name = 'StepError';
  }
}

/** Runs one step, labelling any failure with the step name. */
export async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof StepError) throw e;
    throw new StepError(name, e);
  }
}
