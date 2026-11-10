import type { Controls } from './state';

const KEY_STEP = 5;
const KEY_STEP_LARGE = 30;

/** Hue from a pointer position: 0° at the top, increasing clockwise (matches the conic gradient). */
export function hueFromPoint(x: number, y: number, rect: DOMRect): number {
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
}

/** The lamp: a draggable hue ring around a glowing power button. */
export function HueRing({ controls }: { controls: Controls }) {
  const { on, hue, bri, setColor, setPower } = controls;

  const onPointer = (e: PointerEvent) => {
    const ring = e.currentTarget as HTMLElement;
    if (e.type === 'pointerdown') ring.setPointerCapture(e.pointerId);
    else if (!ring.hasPointerCapture(e.pointerId)) return;
    setColor(hueFromPoint(e.clientX, e.clientY, ring.getBoundingClientRect()));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const delta: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      PageUp: KEY_STEP_LARGE,
      PageDown: -KEY_STEP_LARGE,
    };
    if (e.key in delta) setColor(hue.value + delta[e.key]!);
    else if (e.key === 'Home') setColor(0);
    else if (e.key === 'End') setColor(359);
    else return;
    e.preventDefault();
  };

  const h = Math.round(hue.value);
  return (
    <div class="lamp">
      <div
        class="ring"
        tabIndex={0}
        role="slider"
        aria-label="Color"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={h}
        aria-valuetext={`Hue ${h}°`}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onKeyDown={onKeyDown}
      />
      <div class="thumb-arm" style={{ transform: `rotate(${h}deg)` }} aria-hidden="true">
        <div class="thumb" />
      </div>
      <button
        type="button"
        class={on.value ? 'disc' : 'disc off'}
        aria-pressed={on.value}
        style={on.value ? { opacity: 0.55 + bri.value / 220 } : undefined}
        onClick={() => setPower(!on.value)}
      >
        {on.value ? 'Turn off' : 'Turn on'}
      </button>
    </div>
  );
}
