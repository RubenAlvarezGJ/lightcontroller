import { useEffect, useState } from 'preact/hooks';
import { CONNECT_HINT } from '../devices/LampManager';
import { describeError } from '../transport/errors';
import { SUPPORT_MESSAGES } from '../transport/support';
import { ColorControls } from './Controls';
import { useStore } from './hooks';
import { HueRing } from './HueRing';
import { LampList } from './LampList';
import { LogPanel } from './LogPanel';
import type { AppServices } from './services';
import { previewColor } from './state';

export function App({ services }: { services: AppServices }) {
  const { support, manager, log, controls } = services;
  const lamps = useStore(manager, () => manager.lamps);
  const [connectError, setConnectError] = useState('');
  const [picking, setPicking] = useState(false);
  const supported = support === 'ok';

  useEffect(() => {
    if (supported) void manager.restoreRemembered();
  }, [manager, supported]);

  // Drives the glow, thumb and focus-ring color.
  const glow = previewColor(controls.hue.value, controls.sat.value);
  useEffect(() => {
    document.documentElement.style.setProperty('--glow', glow);
  }, [glow]);

  const connectLamp = async () => {
    setConnectError('');
    setPicking(true);
    try {
      await manager.requestLamp();
    } catch (e) {
      setConnectError(`Couldn’t connect. ${describeError(e)}. ${CONNECT_HINT}`);
    } finally {
      setPicking(false);
    }
  };

  const connected = lamps.filter((l) => l.status === 'connected').length;
  const status = connected
    ? `${connected} lamp${connected > 1 ? 's' : ''} connected`
    : 'No lamps connected';

  return (
    <main>
      <header>
        <div>
          <h1>Sunset Lamp</h1>
          <p class="status" role="status">
            {status}
          </p>
        </div>
        <button type="button" onClick={connectLamp} disabled={!supported || picking}>
          Connect lamp
        </button>
      </header>

      {!supported && (
        <p class="note" role="alert">
          {SUPPORT_MESSAGES[support]}
        </p>
      )}
      {connectError && (
        <p class="note error" role="alert">
          {connectError}
        </p>
      )}

      <HueRing controls={controls} />
      <ColorControls controls={controls} />
      <LampList lamps={lamps} manager={manager} controls={controls} />
      <LogPanel log={log} manager={manager} lamps={lamps} />
    </main>
  );
}
