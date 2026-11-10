// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { colorCmd, powerCmd } from '../src/protocol/commands';
import { toHex } from '../src/protocol/frame';
import { App } from '../src/ui/App';
import { createAppServices } from '../src/ui/services';
import { FakeLamp, FakeTransport } from './fakes';

const SYNC = '55 00 FF 05 A6';
const userWrites = (lamp: FakeLamp) =>
  lamp.writes.filter((w) => w !== SYNC && !w.startsWith('55 0C'));

async function setupConnected(...ids: string[]) {
  const transport = new FakeTransport();
  const services = createAppServices(transport, 'ok');
  render(<App services={services} />);
  const lamps: FakeLamp[] = [];
  for (const id of ids) {
    const lamp = new FakeLamp(id, `Lamp ${id}`);
    transport.next = lamp;
    fireEvent.click(screen.getByRole('button', { name: 'Connect lamp' }));
    await screen.findByText(`Lamp ${id}`);
    await waitFor(() => expect(lamp.writes).toContain(SYNC));
    lamps.push(lamp);
  }
  return { services, lamps };
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('App', () => {
  it('explains when Bluetooth is unavailable and disables connecting', () => {
    render(<App services={createAppServices(new FakeTransport(), 'framed')} />);
    expect(screen.getByRole('alert').textContent).toMatch(/embedded in another page/);
    expect(screen.getByRole('button', { name: 'Connect lamp' })).toHaveProperty('disabled', true);
  });

  it('shows the connect hint when a lamp fails to connect', async () => {
    const transport = new FakeTransport();
    const lamp = new FakeLamp('a');
    lamp.failConnects = 1;
    transport.next = lamp;
    render(<App services={createAppServices(transport, 'ok')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect lamp' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/official app/);
  });

  it('toggles power on every connected lamp', async () => {
    const {
      lamps: [a, b],
    } = await setupConnected('a', 'b');
    expect(screen.getByRole('status').textContent).toBe('2 lamps connected');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(userWrites(a!)).toEqual([toHex(powerCmd(true))]));
    await waitFor(() => expect(userWrites(b!)).toEqual([toHex(powerCmd(true))]));
    expect(screen.getByRole('button', { name: 'Turn off' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('changes color from the keyboard and turns the lamp on', async () => {
    const {
      lamps: [a],
    } = await setupConnected('a');
    const ring = screen.getByRole('slider', { name: 'Color' });
    fireEvent.keyDown(ring, { key: 'ArrowRight' }); // 25 -> 30
    await waitFor(() =>
      expect(userWrites(a!)).toEqual([toHex(powerCmd(true)), toHex(colorCmd(30, 100, 'rgb'))]),
    );
    expect(ring.getAttribute('aria-valuenow')).toBe('30');
  });

  it('applies presets', async () => {
    const {
      lamps: [a],
    } = await setupConnected('a');
    fireEvent.click(screen.getByRole('button', { name: 'Ocean' }));
    await waitFor(() => expect(userWrites(a!)).toContain(toHex(colorCmd(205, 100, 'rgb'))));
  });

  it('leaves out lamps the user unchecks', async () => {
    const {
      lamps: [a, b],
    } = await setupConnected('a', 'b');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send commands to Lamp b' }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(userWrites(a!)).toEqual([toHex(powerCmd(true))]));
    await new Promise((r) => setTimeout(r, 150)); // give b's queue time to flush
    expect(userWrites(b!)).toEqual([]);
    expect(screen.getByText(/not controlled/)).toBeTruthy();
  });

  it('updates the power button from a lamp’s sync reply', async () => {
    const {
      lamps: [a],
    } = await setupConnected('a');
    a!.reply('56 00 FF 07 01 32');
    await screen.findByRole('button', { name: 'Turn off' });
  });
});
