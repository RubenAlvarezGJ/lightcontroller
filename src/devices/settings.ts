import type { ColorEncoding } from '../protocol/commands';

export interface LampSettings {
  /** User-chosen display name; falls back to the advertised name when empty. */
  name: string;
  encoding: ColorEncoding;
  /** Whether commands are sent to this lamp. */
  included: boolean;
}

export const DEFAULT_SETTINGS: LampSettings = { name: '', encoding: 'rgb', included: true };

export interface SettingsStore {
  get(id: string): LampSettings;
  set(id: string, patch: Partial<LampSettings>): LampSettings;
}

export class MemorySettingsStore implements SettingsStore {
  protected data: Record<string, LampSettings> = {};

  get(id: string): LampSettings {
    return { ...DEFAULT_SETTINGS, ...this.data[id] };
  }

  set(id: string, patch: Partial<LampSettings>): LampSettings {
    const next = { ...this.get(id), ...patch };
    this.data[id] = next;
    this.persist();
    return next;
  }

  protected persist(): void {}
}

const STORAGE_KEY = 'lightcontroller.lamps.v1';

/**
 * Per-lamp settings in localStorage. Storage can be unavailable (private mode,
 * blocked site data), so every access is guarded and the app keeps working
 * with in-memory settings.
 */
export class LocalSettingsStore extends MemorySettingsStore {
  constructor(private readonly storage: Storage | undefined = safeLocalStorage()) {
    super();
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) this.data = sanitize(JSON.parse(raw));
    } catch {
      this.data = {};
    }
  }

  protected override persist(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore quota or access errors; settings stay in memory for this session.
    }
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function sanitize(value: unknown): Record<string, LampSettings> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, LampSettings> = {};
  for (const [id, v] of Object.entries(value as Record<string, Partial<LampSettings>>)) {
    if (!v || typeof v !== 'object') continue;
    out[id] = {
      name: typeof v.name === 'string' ? v.name : DEFAULT_SETTINGS.name,
      encoding: v.encoding === 'hsv' ? 'hsv' : 'rgb',
      included: typeof v.included === 'boolean' ? v.included : DEFAULT_SETTINGS.included,
    };
  }
  return out;
}
