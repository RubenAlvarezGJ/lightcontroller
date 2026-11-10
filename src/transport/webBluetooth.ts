import { NOTIFY_CHAR_UUID, SERVICE_UUID, WRITE_CHAR_UUID } from '../protocol/frame';
import type { LampLink, Transport } from './Transport';

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
    let server: BluetoothRemoteGATTServer;
    try {
      server = await gatt.connect();
    } catch (e) {
      // A remembered lamp may need to be seen advertising before Chrome can connect.
      if (!(await this.waitForAdvertisement())) throw e;
      server = await gatt.connect();
    }
    const service = await server.getPrimaryService(SERVICE_UUID);
    this.writeChar = await service.getCharacteristic(WRITE_CHAR_UUID);

    try {
      this.notifyChar?.removeEventListener('characteristicvaluechanged', this.handleNotify);
      this.notifyChar = await service.getCharacteristic(NOTIFY_CHAR_UUID);
      this.notifyChar.addEventListener('characteristicvaluechanged', this.handleNotify);
      await this.notifyChar.startNotifications();
      return {};
    } catch (e) {
      return { notifyError: errorMessage(e) };
    }
  }

  disconnect(): void {
    this.device.gatt?.disconnect();
  }

  async write(bytes: Uint8Array): Promise<void> {
    const char = this.writeChar;
    if (!char) throw new Error('Not connected');
    const data = bytes as Uint8Array<ArrayBuffer>;
    if (char.properties.writeWithoutResponse && char.writeValueWithoutResponse) {
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
    try {
      // The lamp's advertisement contents are unconfirmed, so this can't filter yet.
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      });
      return this.wrap(device);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return null; // picker closed
      throw e;
    }
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

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
