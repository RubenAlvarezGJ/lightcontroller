export type LogKind = 'tx' | 'rx' | 'info' | 'error';

export interface LogEntry {
  id: number;
  time: Date;
  kind: LogKind;
  text: string;
}

/** Ring buffer of Bluetooth activity, newest first. */
export class EventLog {
  private items: LogEntry[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();

  constructor(private readonly capacity = 500) {}

  add(kind: LogKind, text: string): void {
    this.items = [{ id: this.nextId++, time: new Date(), kind, text }, ...this.items].slice(
      0,
      this.capacity,
    );
    for (const cb of this.listeners) cb();
  }

  get entries(): readonly LogEntry[] {
    return this.items;
  }

  clear(): void {
    this.items = [];
    for (const cb of this.listeners) cb();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
