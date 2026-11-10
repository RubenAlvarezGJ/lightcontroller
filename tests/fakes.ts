import { fromHex, toHex } from '../src/protocol/frame';
import type { LampLink, Transport } from '../src/transport/Transport';

export class FakeLamp implements LampLink {
  writes: string[] = [];
  connected = false;
  failConnects = 0;
  failWrites = 0;
  notifyError: string | undefined;
  /** Resolves each write after this many ms (simulates a slow lamp). */
  writeDelayMs = 0;
  private notify = new Set<(b: Uint8Array) => void>();
  private drop = new Set<() => void>();

  constructor(
    readonly id: string,
    readonly name = id,
  ) {}

  async connect() {
    if (this.failConnects > 0) {
      this.failConnects--;
      throw new Error('GATT connect failed');
    }
    this.connected = true;
    return { notifyError: this.notifyError };
  }
  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    for (const cb of this.drop) cb();
  }
  async write(bytes: Uint8Array) {
    if (this.writeDelayMs) await new Promise((r) => setTimeout(r, this.writeDelayMs));
    if (this.failWrites > 0) {
      this.failWrites--;
      throw new Error('write failed');
    }
    this.writes.push(toHex(bytes));
  }
  onNotify(cb: (b: Uint8Array) => void) {
    this.notify.add(cb);
  }
  onDisconnect(cb: () => void) {
    this.drop.add(cb);
  }
  /** The lamp went out of range or lost power. */
  dropConnection() {
    this.connected = false;
    for (const cb of this.drop) cb();
  }
  reply(hex: string) {
    for (const cb of this.notify) cb(fromHex(hex));
  }
}

export class FakeTransport implements Transport {
  next: FakeLamp | null = null;
  remembered: FakeLamp[] = [];
  async requestLamp() {
    return this.next;
  }
  async getRememberedLamps() {
    return this.remembered;
  }
}
