import { useState } from 'preact/hooks';
import type { LampManager, LampView } from '../devices/LampManager';
import type { EventLog } from '../devices/log';
import { checksum, fromHex } from '../protocol/frame';
import { useStore } from './hooks';

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface Props {
  log: EventLog;
  manager: LampManager;
  lamps: readonly LampView[];
}

export function LogPanel({ log, manager, lamps }: Props) {
  const entries = useStore(log, () => log.entries);
  return (
    <details class="log">
      <summary>Bluetooth log</summary>
      <div class="log-tools">
        <button type="button" class="small" onClick={() => log.clear()}>
          Clear
        </button>
      </div>
      <pre aria-live="off">
        {entries.length === 0
          ? 'Nothing yet.'
          : entries
              .map(
                (e) => `${timeFormat.format(e.time)}  ${e.kind === 'error' ? '! ' : ''}${e.text}`,
              )
              .join('\n')}
      </pre>
      <RawFrameForm manager={manager} lamps={lamps} />
    </details>
  );
}

/**
 * Sends hand-written frames for testing the protocol's open questions on real
 * hardware (channel order, the fourth color byte, scene indices).
 */
function RawFrameForm({ manager, lamps }: { manager: LampManager; lamps: readonly LampView[] }) {
  const connected = lamps.filter((l) => l.status === 'connected');
  const [text, setText] = useState('55 03 FF 09 00 FF 00 00');
  const [target, setTarget] = useState('');
  const [fixChecksum, setFixChecksum] = useState(true);
  const [error, setError] = useState('');

  if (connected.length === 0) return null;
  const lampId = connected.some((l) => l.id === target) ? target : connected[0]!.id;

  const submit = (e: Event) => {
    e.preventDefault();
    try {
      let bytes = fromHex(text);
      if (bytes.length === 0) throw new Error('Enter at least one byte.');
      if (fixChecksum) bytes = Uint8Array.from([...bytes, checksum(bytes)]);
      manager.sendRaw(lampId, bytes);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form class="raw" onSubmit={submit}>
      <strong>Send a raw frame</strong>
      <label>
        <span>Bytes (hex)</span>
        <input
          type="text"
          value={text}
          spellcheck={false}
          autocomplete="off"
          onInput={(e) => setText(e.currentTarget.value)}
        />
      </label>
      <label class="inline">
        <input
          type="checkbox"
          checked={fixChecksum}
          onChange={(e) => setFixChecksum(e.currentTarget.checked)}
        />
        <span>Append checksum</span>
      </label>
      <label>
        <span>Lamp</span>
        <select value={lampId} onChange={(e) => setTarget(e.currentTarget.value)}>
          {connected.map((l) => (
            <option key={l.id} value={l.id}>
              {l.displayName}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" class="small">
        Send
      </button>
    </form>
  );
}
