import { LampManager } from '../devices/LampManager';
import { EventLog } from '../devices/log';
import { LocalSettingsStore } from '../devices/settings';
import { checkSupport, readSupportEnv, type SupportStatus } from '../transport/support';
import type { Transport } from '../transport/Transport';
import { WebBluetoothTransport } from '../transport/webBluetooth';
import { createControls, type Controls } from './state';

export interface AppServices {
  support: SupportStatus;
  manager: LampManager;
  log: EventLog;
  controls: Controls;
}

/** Wires the app together. Tests build their own with a fake transport. */
export function createAppServices(
  transport: Transport = new WebBluetoothTransport(),
  support: SupportStatus = checkSupport(readSupportEnv()),
): AppServices {
  const log = new EventLog();
  const manager = new LampManager({ transport, settings: new LocalSettingsStore(), log });
  return { support, manager, log, controls: createControls(manager) };
}
