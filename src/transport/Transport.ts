/**
 * A connection to one lamp. The protocol and device layers only talk to lamps
 * through this interface, so a native transport (e.g. Capacitor for iPhone)
 * can be added without touching them.
 */
export interface LampLink {
  /** Stable per-browser id for the lamp; used as the settings key. */
  readonly id: string;
  /** Advertised name, or a fallback. */
  readonly name: string;
  /**
   * Opens the GATT connection and subscribes to notifications. Resolves once
   * commands can be written. A notification failure doesn't fail the connect;
   * it is reported in the result instead.
   */
  connect(): Promise<{ notifyError?: string }>;
  /** User-initiated disconnect. onDisconnect listeners still fire. */
  disconnect(): void;
  write(bytes: Uint8Array): Promise<void>;
  onNotify(cb: (bytes: Uint8Array) => void): void;
  onDisconnect(cb: () => void): void;
}

export interface Transport {
  /** Opens the system picker. Resolves null if the user closes it. */
  requestLamp(): Promise<LampLink | null>;
  /** Lamps this browser already has permission for. Empty when unsupported. */
  getRememberedLamps(): Promise<LampLink[]>;
}
