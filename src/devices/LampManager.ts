import { syncCmd, timeSyncCmd } from '../protocol/commands';
import { toHex } from '../protocol/frame';
import { parseReply } from '../protocol/parse';
import { describeError as errorMessage } from '../transport/errors';
import type { LampLink, Transport } from '../transport/Transport';
import type { EventLog } from './log';
import type { LampSettings, SettingsStore } from './settings';

export type LampStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** Immutable snapshot of one lamp, for the UI. */
export interface LampView {
  id: string;
  advertisedName: string;
  displayName: string;
  status: LampStatus;
  settings: LampSettings;
  /** False when the lamp connected but notifications (status replies) failed. */
  notifyAvailable: boolean;
}

/** Builds a frame for one lamp, so per-lamp settings like color encoding apply. */
export type FrameBuilder = (settings: LampSettings) => Uint8Array;

export interface LampManagerOptions {
  transport: Transport;
  settings: SettingsStore;
  log: EventLog;
  /** Pause between writes to one lamp. Faster writes overwhelm BLE and lag. */
  writeSpacingMs?: number;
  /** Delay before each automatic reconnect attempt; gives up after the last. */
  reconnectDelaysMs?: readonly number[];
  now?: () => Date;
}

interface Entry {
  link: LampLink;
  status: LampStatus;
  notifyAvailable: boolean;
  /** Latest pending frame per command kind; insertion order is send order. */
  queue: Map<string, Uint8Array>;
  flushing: boolean;
  userDisconnected: boolean;
  retrying: boolean;
  attempt: number;
  retryTimer?: ReturnType<typeof setTimeout>;
}

export const DEFAULT_WRITE_SPACING_MS = 40;
export const DEFAULT_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export const CONNECT_HINT =
  'Make sure the lamp is powered and the official app or nRF Connect is closed: each lamp accepts only one connection.';

/**
 * Owns every lamp connection. Commands go to all connected lamps the user has
 * left included. Each lamp has its own write queue, so a slow lamp can't delay
 * the others, and rapid updates (dragging the hue ring) collapse to the latest
 * frame per command kind.
 */
export class LampManager {
  private readonly entries = new Map<string, Entry>();
  private readonly wired = new WeakSet<LampLink>();
  private readonly listeners = new Set<() => void>();
  private readonly powerListeners = new Set<(on: boolean, lampId: string) => void>();
  private snapshot: LampView[] = [];
  private readonly spacing: number;
  private readonly delays: readonly number[];
  private readonly now: () => Date;

  constructor(private readonly opts: LampManagerOptions) {
    this.spacing = opts.writeSpacingMs ?? DEFAULT_WRITE_SPACING_MS;
    this.delays = opts.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
    this.now = opts.now ?? (() => new Date());
  }

  // ---- Observing ----

  get lamps(): readonly LampView[] {
    return this.snapshot;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Fires when a lamp reports its power state (sync reply). */
  onPower(cb: (on: boolean, lampId: string) => void): () => void {
    this.powerListeners.add(cb);
    return () => this.powerListeners.delete(cb);
  }

  // ---- Connecting ----

  /** Opens the system picker and connects the chosen lamp. Returns false if cancelled. */
  async requestLamp(): Promise<boolean> {
    const link = await this.opts.transport.requestLamp();
    if (!link) return false;
    await this.add(link);
    return true;
  }

  /** Lists lamps the browser remembers, without connecting, so the user can connect in one tap. */
  async restoreRemembered(): Promise<void> {
    for (const link of await this.opts.transport.getRememberedLamps()) {
      if (!this.entries.has(link.id)) this.createEntry(link, 'disconnected');
    }
    this.emit();
  }

  /** Connects a new or known lamp. Rejects if the first attempt fails. */
  async add(link: LampLink): Promise<void> {
    const existing = this.entries.get(link.id);
    if (existing && (existing.status === 'connected' || existing.status === 'connecting')) return;
    const entry = existing ?? this.createEntry(link, 'disconnected');
    this.resetRetry(entry);
    entry.userDisconnected = false;
    await this.open(entry, { throwOnError: true });
  }

  /** Manual connect for a listed lamp, e.g. after automatic reconnect gave up. */
  async connect(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) await this.add(entry.link);
  }

  disconnect(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.userDisconnected = true;
    this.resetRetry(entry);
    entry.queue.clear();
    if (entry.status === 'connected' || entry.status === 'connecting') entry.link.disconnect();
    entry.status = 'disconnected';
    this.emit();
  }

  /** Disconnects and drops the lamp from the list. Its settings are kept. */
  remove(id: string): void {
    this.disconnect(id);
    this.entries.delete(id);
    this.emit();
  }

  // ---- Settings ----

  updateSettings(id: string, patch: Partial<LampSettings>): void {
    this.opts.settings.set(id, patch);
    this.emit();
  }

  // ---- Sending ----

  /**
   * Queues a command of the given kind for every connected, included lamp
   * (or only lampId). A newer frame of the same kind replaces a pending one.
   */
  send(kind: string, build: FrameBuilder, lampId?: string): void {
    for (const [id, entry] of this.entries) {
      if (lampId !== undefined && id !== lampId) continue;
      if (entry.status !== 'connected') continue;
      const settings = this.opts.settings.get(id);
      if (!settings.included) continue;
      this.enqueue(entry, kind, build(settings));
    }
  }

  /** Sends to one lamp regardless of whether it's included. For diagnostics. */
  sendRaw(lampId: string, bytes: Uint8Array): void {
    const entry = this.entries.get(lampId);
    if (entry?.status === 'connected') this.enqueue(entry, `raw:${toHex(bytes)}`, bytes);
  }

  // ---- Internals ----

  private createEntry(link: LampLink, status: LampStatus): Entry {
    const entry: Entry = {
      link,
      status,
      notifyAvailable: true,
      queue: new Map(),
      flushing: false,
      userDisconnected: false,
      retrying: false,
      attempt: 0,
    };
    this.entries.set(link.id, entry);
    if (!this.wired.has(link)) {
      this.wired.add(link);
      link.onNotify((bytes) => this.handleNotify(link.id, bytes));
      link.onDisconnect(() => this.handleDisconnect(link.id));
    }
    return entry;
  }

  private async open(entry: Entry, { throwOnError }: { throwOnError: boolean }): Promise<void> {
    entry.status = entry.retrying ? 'reconnecting' : 'connecting';
    this.emit();
    try {
      const { notifyError } = await entry.link.connect();
      if (this.entries.get(entry.link.id) !== entry || entry.userDisconnected) {
        entry.link.disconnect(); // removed or disconnected while connecting
        return;
      }
      entry.status = 'connected';
      entry.notifyAvailable = !notifyError;
      entry.retrying = false;
      entry.attempt = 0;
      this.log('info', `${this.nameOf(entry)} connected`);
      if (notifyError)
        this.log('error', `${this.nameOf(entry)}: notifications unavailable: ${notifyError}`);
      this.emit();
      // Connect sequence: ask for current state, then set the lamp's clock.
      this.enqueue(entry, 'sync', syncCmd());
      this.enqueue(entry, 'time', timeSyncCmd(this.now()));
    } catch (e) {
      this.log('error', `Couldn’t connect to ${this.nameOf(entry)}: ${errorMessage(e)}`);
      if (entry.retrying && !entry.userDisconnected) {
        this.scheduleRetry(entry);
      } else {
        entry.status = 'disconnected';
        this.emit();
        if (throwOnError) throw e;
      }
    }
  }

  private handleDisconnect(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.queue.clear();
    if (entry.userDisconnected) {
      entry.status = 'disconnected';
      this.log('info', `${this.nameOf(entry)} disconnected`);
      this.emit();
      return;
    }
    // A drop during a connect attempt is reported by open(); don't schedule a second retry.
    if (entry.status !== 'connected') return;
    this.log('error', `${this.nameOf(entry)} connection lost`);
    entry.retrying = true;
    entry.attempt = 0;
    this.scheduleRetry(entry);
  }

  private scheduleRetry(entry: Entry): void {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = undefined;
    const delay = this.delays[entry.attempt];
    if (delay === undefined) {
      entry.retrying = false;
      entry.status = 'disconnected';
      this.log('error', `Gave up reconnecting to ${this.nameOf(entry)}. ${CONNECT_HINT}`);
      this.emit();
      return;
    }
    entry.attempt++;
    entry.status = 'reconnecting';
    this.emit();
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = undefined;
      if (this.entries.get(entry.link.id) !== entry || entry.userDisconnected) return;
      this.log('info', `Reconnecting to ${this.nameOf(entry)} (attempt ${entry.attempt})`);
      void this.open(entry, { throwOnError: false });
    }, delay);
  }

  private resetRetry(entry: Entry): void {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = undefined;
    entry.retrying = false;
    entry.attempt = 0;
  }

  private handleNotify(id: string, bytes: Uint8Array): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.log('rx', `${this.nameOf(entry)} ← ${toHex(bytes)}`);
    const reply = parseReply(bytes);
    if (reply?.power !== undefined) {
      for (const cb of this.powerListeners) cb(reply.power, id);
    }
  }

  private enqueue(entry: Entry, kind: string, bytes: Uint8Array): void {
    entry.queue.set(kind, bytes);
    if (!entry.flushing) void this.flush(entry);
  }

  private async flush(entry: Entry): Promise<void> {
    entry.flushing = true;
    try {
      while (entry.queue.size && entry.status === 'connected') {
        const [kind, bytes] = entry.queue.entries().next().value!;
        entry.queue.delete(kind);
        try {
          await entry.link.write(bytes);
          this.log('tx', `${this.nameOf(entry)} → ${toHex(bytes)}`);
        } catch (e) {
          this.log('error', `Write to ${this.nameOf(entry)} failed: ${errorMessage(e)}`);
        }
        await sleep(this.spacing);
      }
    } finally {
      entry.flushing = false;
    }
  }

  private nameOf(entry: Entry): string {
    return this.opts.settings.get(entry.link.id).name || entry.link.name;
  }

  private log(kind: 'tx' | 'rx' | 'info' | 'error', text: string): void {
    this.opts.log.add(kind, text);
  }

  private emit(): void {
    this.snapshot = [...this.entries.values()].map((e) => {
      const settings = this.opts.settings.get(e.link.id);
      return {
        id: e.link.id,
        advertisedName: e.link.name,
        displayName: settings.name || e.link.name,
        status: e.status,
        settings,
        notifyAvailable: e.notifyAvailable,
      };
    });
    for (const cb of this.listeners) cb();
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
