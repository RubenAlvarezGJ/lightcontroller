import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LampManager } from '../src/devices/LampManager';
import { EventLog } from '../src/devices/log';
import { LocalSettingsStore, MemorySettingsStore } from '../src/devices/settings';
import { colorCmd, powerCmd } from '../src/protocol/commands';
import { fromHex, toHex } from '../src/protocol/frame';
import { FakeLamp, FakeTransport } from './fakes';

const SYNC = '55 00 FF 05 A6';
const POWER_ON = toHex(powerCmd(true));
const POWER_OFF = toHex(powerCmd(false));

function setup() {
  const transport = new FakeTransport();
  const settings = new MemorySettingsStore();
  const log = new EventLog();
  const manager = new LampManager({
    transport,
    settings,
    log,
    writeSpacingMs: 40,
    reconnectDelaysMs: [1000, 2000, 4000],
    now: () => new Date(2025, 10, 10, 13, 4, 5),
  });
  async function connect(lamp: FakeLamp) {
    transport.next = lamp;
    await manager.requestLamp();
    await vi.advanceTimersByTimeAsync(200); // flush the connect sequence
    lamp.writes = [];
  }
  return { transport, settings, log, manager, connect };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('connecting', () => {
  it('sends a sync request and the time after connecting', async () => {
    const { manager, transport } = setup();
    const lamp = new FakeLamp('a');
    transport.next = lamp;
    await manager.requestLamp();
    await vi.advanceTimersByTimeAsync(100);
    expect(lamp.writes).toEqual([SYNC, '55 0C FF 0D 07 E9 0B 0A 0D 04 05 01 76']);
    expect(manager.lamps[0]?.status).toBe('connected');
  });

  it('returns false when the picker is closed', async () => {
    const { manager } = setup();
    expect(await manager.requestLamp()).toBe(false);
    expect(manager.lamps).toHaveLength(0);
  });

  it('rejects and marks the lamp disconnected when the first connect fails', async () => {
    const { manager, transport } = setup();
    const lamp = new FakeLamp('a');
    lamp.failConnects = 1;
    transport.next = lamp;
    await expect(manager.requestLamp()).rejects.toThrow('GATT connect failed');
    expect(manager.lamps[0]?.status).toBe('disconnected');
  });

  it('reports power from sync replies', async () => {
    const { manager, connect } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    const seen: boolean[] = [];
    manager.onPower((on) => seen.push(on));
    lamp.reply('56 00 FF 07 01 33');
    lamp.reply('56 00 FF 07 01 32');
    expect(seen).toEqual([false, true]);
  });

  it('keeps working without notifications', async () => {
    const { manager, connect, log } = setup();
    const lamp = new FakeLamp('a');
    lamp.notifyError = 'not supported';
    await connect(lamp);
    expect(manager.lamps[0]?.notifyAvailable).toBe(false);
    expect(log.entries.some((e) => e.text.includes('not supported'))).toBe(true);
    manager.send('power', () => powerCmd(true));
    await vi.advanceTimersByTimeAsync(50);
    expect(lamp.writes).toEqual([POWER_ON]);
  });

  it('lists remembered lamps without connecting them', async () => {
    const { manager, transport } = setup();
    const lamp = new FakeLamp('a');
    transport.remembered = [lamp];
    await manager.restoreRemembered();
    expect(manager.lamps.map((l) => [l.id, l.status])).toEqual([['a', 'disconnected']]);
    expect(lamp.connected).toBe(false);
    await manager.connect('a');
    expect(manager.lamps[0]?.status).toBe('connected');
  });
});

describe('sending', () => {
  it('coalesces rapid updates to the latest frame per kind', async () => {
    const { manager, connect } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    for (let hue = 0; hue < 50; hue++) {
      manager.send('color', (s) => colorCmd(hue, 100, s.encoding));
      await vi.advanceTimersByTimeAsync(0.8);
    }
    await vi.advanceTimersByTimeAsync(200);
    expect(lamp.writes.length).toBeLessThanOrEqual(2);
    expect(lamp.writes.at(-1)).toBe(toHex(colorCmd(49, 100, 'rgb')));
  });

  it('spaces writes by the configured interval and keeps kinds in order', async () => {
    const { manager, connect } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    manager.send('power', () => powerCmd(true));
    manager.send('color', (s) => colorCmd(0, 100, s.encoding));
    await vi.advanceTimersByTimeAsync(10);
    expect(lamp.writes).toEqual([POWER_ON]);
    await vi.advanceTimersByTimeAsync(40);
    expect(lamp.writes).toEqual([POWER_ON, '55 03 FF 09 FF 00 00 00 A0']);
  });

  it('sends to every connected lamp', async () => {
    const { manager, connect } = setup();
    const a = new FakeLamp('a');
    const b = new FakeLamp('b');
    await connect(a);
    await connect(b);
    manager.send('power', () => powerCmd(false));
    await vi.advanceTimersByTimeAsync(50);
    expect(a.writes).toEqual([POWER_OFF]);
    expect(b.writes).toEqual([POWER_OFF]);
  });

  it('skips excluded lamps', async () => {
    const { manager, connect } = setup();
    const a = new FakeLamp('a');
    const b = new FakeLamp('b');
    await connect(a);
    await connect(b);
    manager.updateSettings('b', { included: false });
    manager.send('power', () => powerCmd(true));
    await vi.advanceTimersByTimeAsync(50);
    expect(a.writes).toEqual([POWER_ON]);
    expect(b.writes).toEqual([]);
    expect(manager.lamps.find((l) => l.id === 'b')?.settings.included).toBe(false);
  });

  it('builds frames with each lamp’s own color encoding', async () => {
    const { manager, connect } = setup();
    const a = new FakeLamp('a');
    const b = new FakeLamp('b');
    await connect(a);
    await connect(b);
    manager.updateSettings('b', { encoding: 'hsv' });
    manager.send('color', (s) => colorCmd(25, 100, s.encoding));
    await vi.advanceTimersByTimeAsync(50);
    expect(a.writes).toEqual([toHex(colorCmd(25, 100, 'rgb'))]);
    expect(b.writes).toEqual([toHex(colorCmd(25, 100, 'hsv'))]);
  });

  it('does not let a slow lamp delay the others', async () => {
    const { manager, connect } = setup();
    const slow = new FakeLamp('slow');
    const fast = new FakeLamp('fast');
    await connect(slow);
    await connect(fast);
    slow.writeDelayMs = 1000;
    manager.send('power', () => powerCmd(true));
    await vi.advanceTimersByTimeAsync(10);
    expect(fast.writes).toEqual([POWER_ON]);
    expect(slow.writes).toEqual([]);
  });

  it('logs a failed write and carries on with the queue', async () => {
    const { manager, connect, log } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    lamp.failWrites = 1;
    manager.send('power', () => powerCmd(true));
    manager.send('color', (s) => colorCmd(0, 100, s.encoding));
    await vi.advanceTimersByTimeAsync(100);
    expect(lamp.writes).toEqual(['55 03 FF 09 FF 00 00 00 A0']);
    expect(log.entries.some((e) => e.kind === 'error' && e.text.includes('write failed'))).toBe(
      true,
    );
  });

  it('does not send to disconnected lamps', async () => {
    const { manager, connect } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    manager.disconnect('a');
    manager.send('power', () => powerCmd(true));
    await vi.advanceTimersByTimeAsync(100);
    expect(lamp.writes).toEqual([]);
  });

  it('sendRaw reaches an excluded lamp', async () => {
    const { manager, connect } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    manager.updateSettings('a', { included: false });
    manager.sendRaw('a', fromHex('55 03 FF 09 00 FF 00 00 A1'));
    await vi.advanceTimersByTimeAsync(10);
    expect(lamp.writes).toEqual(['55 03 FF 09 00 FF 00 00 A1']);
  });
});

describe('reconnecting', () => {
  it('retries with backoff after the connection drops, then resyncs', async () => {
    const { manager, connect } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    lamp.failConnects = 1;
    lamp.dropConnection();
    expect(manager.lamps[0]?.status).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(1000); // attempt 1 fails
    expect(manager.lamps[0]?.status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1999);
    expect(lamp.connected).toBe(false);
    await vi.advanceTimersByTimeAsync(1); // attempt 2, after 2 s, succeeds
    expect(manager.lamps[0]?.status).toBe('connected');
    await vi.advanceTimersByTimeAsync(100);
    expect(lamp.writes[0]).toBe(SYNC);
  });

  it('gives up after the last delay and allows a manual reconnect', async () => {
    const { manager, connect, log } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    lamp.failConnects = 99;
    lamp.dropConnection();
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    expect(manager.lamps[0]?.status).toBe('disconnected');
    expect(log.entries.some((e) => e.text.startsWith('Gave up'))).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    lamp.failConnects = 0;
    expect(lamp.connected).toBe(false); // no more automatic attempts
    await manager.connect('a');
    expect(manager.lamps[0]?.status).toBe('connected');
  });

  it('does not reconnect after a user disconnect', async () => {
    const { manager, connect } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    manager.disconnect('a');
    expect(manager.lamps[0]?.status).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lamp.connected).toBe(false);
  });

  it('stops retrying when the lamp is removed', async () => {
    const { manager, connect } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    lamp.dropConnection();
    manager.remove('a');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lamp.connected).toBe(false);
    expect(manager.lamps).toHaveLength(0);
  });

  it('drops queued frames on disconnect', async () => {
    const { manager, connect } = setup();
    const lamp = new FakeLamp('a');
    await connect(lamp);
    manager.send('power', () => powerCmd(true));
    manager.send('color', (s) => colorCmd(0, 100, s.encoding));
    await vi.advanceTimersByTimeAsync(1);
    lamp.dropConnection();
    await vi.advanceTimersByTimeAsync(500);
    expect(lamp.writes).toEqual([POWER_ON]);
  });
});

describe('LocalSettingsStore', () => {
  function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k) => map.get(k) ?? null,
      key: (i) => [...map.keys()][i] ?? null,
      removeItem: (k) => void map.delete(k),
      setItem: (k, v) => void map.set(k, v),
    };
  }

  it('persists settings across instances', () => {
    const storage = memoryStorage();
    new LocalSettingsStore(storage).set('a', { name: 'Bedroom', encoding: 'hsv' });
    expect(new LocalSettingsStore(storage).get('a')).toEqual({
      name: 'Bedroom',
      encoding: 'hsv',
      included: true,
    });
  });

  it('falls back to defaults on corrupt data or unavailable storage', () => {
    const storage = memoryStorage();
    storage.setItem('lightcontroller.lamps.v1', '{not json');
    expect(new LocalSettingsStore(storage).get('a').encoding).toBe('rgb');

    const throwing = memoryStorage();
    throwing.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    const store = new LocalSettingsStore(throwing);
    expect(store.set('a', { name: 'x' }).name).toBe('x');
    expect(store.get('a').name).toBe('x');
  });

  it('sanitizes unexpected stored values', () => {
    const storage = memoryStorage();
    storage.setItem(
      'lightcontroller.lamps.v1',
      JSON.stringify({ a: { name: 3, encoding: 'xyz', included: 'yes' } }),
    );
    expect(new LocalSettingsStore(storage).get('a')).toEqual({
      name: '',
      encoding: 'rgb',
      included: true,
    });
  });
});
