import type { LampManager, LampStatus, LampView } from '../devices/LampManager';
import type { ColorEncoding } from '../protocol/commands';
import type { Controls } from './state';

const STATUS_TEXT: Record<LampStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  disconnected: 'Not connected',
};

interface Props {
  lamps: readonly LampView[];
  manager: LampManager;
  controls: Controls;
}

export function LampList({ lamps, manager, controls }: Props) {
  return (
    <section class="lamps" aria-labelledby="lamps-title">
      <h2 id="lamps-title">Lamps</h2>
      {lamps.length === 0 ? (
        <p class="muted">
          None yet. Make sure the official app is closed, then select Connect lamp.
        </p>
      ) : (
        <ul>
          {lamps.map((lamp) => (
            <LampRow key={lamp.id} lamp={lamp} manager={manager} controls={controls} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LampRow({
  lamp,
  manager,
  controls,
}: {
  lamp: LampView;
  manager: LampManager;
  controls: Controls;
}) {
  const { id, settings, status } = lamp;
  const live = status === 'connected' || status === 'connecting' || status === 'reconnecting';
  const nameId = `lamp-name-${cssId(id)}`;

  return (
    <li class={`lamp-row status-${status}`}>
      <div class="lamp-head">
        <label class="include">
          <input
            type="checkbox"
            checked={settings.included}
            onChange={(e) => manager.updateSettings(id, { included: e.currentTarget.checked })}
          />
          <span class="sr-only">Send commands to {lamp.displayName}</span>
        </label>
        <div class="lamp-title">
          <strong>{lamp.displayName}</strong>
          <span class="muted">
            {STATUS_TEXT[status]}
            {!settings.included && ' · not controlled'}
            {status === 'connected' && !lamp.notifyAvailable && ' · no status replies'}
          </span>
        </div>
        {live ? (
          <button type="button" class="small" onClick={() => manager.disconnect(id)}>
            Disconnect
          </button>
        ) : (
          <button type="button" class="small" onClick={() => manager.connect(id).catch(() => {})}>
            Connect
          </button>
        )}
      </div>
      <details class="lamp-settings">
        <summary>Lamp settings</summary>
        <div class="lamp-settings-body">
          <label for={nameId}>
            <span>Name</span>
            <input
              id={nameId}
              type="text"
              value={settings.name}
              placeholder={lamp.advertisedName}
              maxLength={40}
              onChange={(e) => manager.updateSettings(id, { name: e.currentTarget.value.trim() })}
            />
          </label>
          <label>
            <span>Color format</span>
            <select
              value={settings.encoding}
              onChange={(e) => {
                manager.updateSettings(id, { encoding: e.currentTarget.value as ColorEncoding });
                controls.resendColor(id);
              }}
            >
              <option value="rgb">RGB (Sunset Lamp)</option>
              <option value="hsv">Hue and saturation (MeRGBW strips)</option>
            </select>
          </label>
          {!live && (
            <button type="button" class="small" onClick={() => manager.remove(id)}>
              Remove from list
            </button>
          )}
        </div>
      </details>
    </li>
  );
}

function cssId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
