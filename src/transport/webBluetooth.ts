import { NOTIFY_CHAR_UUID, SERVICE_UUID, WRITE_CHAR_UUID } from '../protocol/frame';
import { describeError, step, StepError } from './errors';
import type { LampLink, Transport } from './Transport';

/**
 * Full 128-bit form of a 16-bit Bluetooth UUID. Chrome accepts plain numbers,
 * but Bluefy on iOS needs the canonical lowercase string.
 */
export function uuid16(short: number): string {
  return `0000${short.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
}

const SERVICE = uuid16(SERVICE_UUID);
const WRITE_CHAR = uuid16(WRITE_CHAR_UUID);
const NOTIFY_CHAR = uuid16(NOTIFY_CHAR_UUID);

const ADVERTISEMENT_WAIT_MS = 10_000;

class WebBluetoothLamp implements LampLink {
  readonly id: string;
  readonly name: string;
  private writeChar?: BluetoothRemoteGATTCharacteristic;
  private notifyChar?: BluetoothRemoteGATTCharacteristic;
  private notifyListeners = new Set<(bytes: Uint8Array) => void>();
  private disconnectListeners = new Set<() => void>();

  constructor(private readonly device: BluetoothDevice) {
    this.id = device.id;
    this.name = device.name?.trim() || 'Unnamed lamp';
    device.addEventListener('gattserverdisconnected', () => {
      this.writeChar = undefined;
      for (const cb of this.disconnectListeners) cb();
    });
  }

  async connect(): Promise<{ notifyError?: string }> {
    const gatt = this.device.gatt;
    if (!gatt) throw new Error('This device has no GATT server.');
    const server = await step('Opening the Bluetooth connection', async () => {
      try {
        return await gatt.connect();
      } catch (e) {
        // A remembered lamp may need to be seen advertising before Chrome can connect.
        if (!(await this.waitForAdvertisement())) throw e;
        return await gatt.connect();
      }
    });
    const service = await step('Finding the lamp service (FFF0)', () =>
      server.getPrimaryService(SERVICE),
    );
    this.writeChar = await step('Finding the command channel (FFF3)', () =>
      service.getCharacteristic(WRITE_CHAR),
    );

    try {
      this.notifyChar?.removeEventListener('characteristicvaluechanged', this.handleNotify);
      this.notifyChar = await service.getCharacteristic(NOTIFY_CHAR);
      this.notifyChar.addEventListener('characteristicvaluechanged', this.handleNotify);
      await this.notifyChar.startNotifications();
      return {};
    } catch (e) {
      return { notifyError: describeError(e) };
    }
  }

  disconnect(): void {
    this.device.gatt?.disconnect();
  }

  async write(bytes: Uint8Array): Promise<void> {
    const char = this.writeChar;
    if (!char) throw new Error('Not connected');
    const data = bytes as Uint8Array<ArrayBuffer>;
    if (char.properties?.writeWithoutResponse && char.writeValueWithoutResponse) {
      await char.writeValueWithoutResponse(data);
    } else if (char.writeValueWithResponse) {
      await char.writeValueWithResponse(data);
    } else {
      await char.writeValue(data);
    }
  }

  onNotify(cb: (bytes: Uint8Array) => void): void {
    this.notifyListeners.add(cb);
  }

  onDisconnect(cb: () => void): void {
    this.disconnectListeners.add(cb);
  }

  private handleNotify = (e: Event) => {
    const value = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const bytes = new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
    for (const cb of this.notifyListeners) cb(bytes);
  };

  private async waitForAdvertisement(): Promise<boolean> {
    if (typeof this.device.watchAdvertisements !== 'function') return false;
    const abort = new AbortController();
    try {
      const seen = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), ADVERTISEMENT_WAIT_MS);
        this.device.addEventListener(
          'advertisementreceived',
          () => {
            clearTimeout(timer);
            resolve(true);
          },
          { once: true },
        );
      });
      await this.device.watchAdvertisements({ signal: abort.signal });
      return await seen;
    } catch {
      return false;
    } finally {
      abort.abort();
    }
  }
}

export class WebBluetoothTransport implements Transport {
  private readonly lamps = new Map<string, WebBluetoothLamp>();

  async requestLamp(): Promise<LampLink | null> {
    let device: BluetoothDevice;
    try {
      // The lamp's advertisement contents are unconfirmed, so this can't filter yet.
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE],
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return null; // picker closed
      throw new StepError('Choosing a lamp', e);
    }
    return this.wrap(device);
  }

  async getRememberedLamps(): Promise<LampLink[]> {
    if (typeof navigator.bluetooth?.getDevices !== 'function') return [];
    try {
      return (await navigator.bluetooth.getDevices()).map((d) => this.wrap(d));
    } catch {
      return [];
    }
  }

  /** Reuses one wrapper per device so event listeners aren't registered twice. */
  private wrap(device: BluetoothDevice): WebBluetoothLamp {
    let lamp = this.lamps.get(device.id);
    if (!lamp) {
      lamp = new WebBluetoothLamp(device);
      this.lamps.set(device.id, lamp);
    }
    return lamp;
  }
}
