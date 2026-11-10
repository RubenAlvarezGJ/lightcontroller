import { PRESETS, previewColor, type Controls } from './state';

export function ColorControls({ controls }: { controls: Controls }) {
  const { bri, sat, hue, setBrightness, setColor } = controls;
  return (
    <section class="controls" aria-label="Light settings">
      <label>
        <span class="row">
          <span>Brightness</span>
          <span>{bri.value}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={bri.value}
          onInput={(e) => setBrightness(+e.currentTarget.value)}
        />
      </label>
      <label>
        <span class="row">
          <span>Color strength</span>
          <span>{sat.value}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={sat.value}
          onInput={(e) => setColor(hue.value, +e.currentTarget.value)}
        />
      </label>
      <div>
        <span class="row" id="presets-label">
          <span>Presets</span>
        </span>
        <div class="presets" role="group" aria-labelledby="presets-label">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              title={p.name}
              aria-label={p.name}
              style={{ background: previewColor(p.hue, p.sat) }}
              onClick={() => setColor(p.hue, p.sat)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
