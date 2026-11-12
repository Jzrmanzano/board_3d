import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { getFrames, goLive, scrubTo } from '../state/actions';
import { useLab } from '../state/store';
import { outputPins, trace } from '../sim/timeline';

const W = 396, LEFT = 30, ROW = 20, TOP = 6;

/** The pins that were outputs, drawn as steps over the recorded frames. Drag across it, or use the arrows, to look back at the board as it was. */
export function Timeline() {
  const tick = useLab(s => s.frameTick), cursor = useLab(s => s.cursor), running = useLab(s => s.running), paused = useLab(s => s.paused);
  const svg = useRef<SVGSVGElement>(null);
  void tick;   // the frames live outside the store, so a change of tick is what asks for a redraw
  const frames = getFrames(), n = frames.length;
  if (!n) return null;
  const pins = outputPins(frames), canLook = !running || paused, shown = Math.min(cursor ?? n - 1, n - 1), f = frames[shown];
  const x = (i: number) => LEFT + (n === 1 ? 0 : ((W - LEFT - 8) * i) / (n - 1));
  const rows = Math.max(1, pins.length), H = TOP * 2 + rows * ROW;
  const at = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    scrubTo(((px - LEFT) / (W - LEFT - 8)) * (n - 1));
  };
  const key = (e: KeyboardEvent) => {
    if (!canLook) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); scrubTo(shown - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); scrubTo(shown + 1); }
    if (e.key === 'Home') { e.preventDefault(); scrubTo(0); }
    if (e.key === 'End') { e.preventDefault(); scrubTo(n - 1); }
  };
  return (
    <section className="timeline" aria-label="Pin timeline">
      <div className="timeline-head">
        <span>Timeline</span>
        <small title={canLook ? undefined : 'Press Step to pause the sketch, then drag across the chart to look back'}>{cursor != null ? 'looking back' : canLook ? 'now' : 'live · Step to pause'} · {shown + 1}/{n} · {(f.t / 1000).toFixed(2)} s{f.line ? ` · line ${f.line}` : ''}</small>
        <button type="button" disabled={!canLook || shown <= 0} onClick={() => scrubTo(shown - 1)} aria-label="Previous frame">◀</button>
        <button type="button" disabled={!canLook || shown >= n - 1} onClick={() => scrubTo(shown + 1)} aria-label="Next frame">▶</button>
        <button type="button" disabled={cursor == null} onClick={goLive}>Now</button>
      </div>
      <svg
        ref={svg} viewBox={`0 0 ${W} ${H}`} className={canLook ? 'chart can' : 'chart'} role="slider" tabIndex={canLook ? 0 : -1}
        aria-label="Frame" aria-valuemin={1} aria-valuemax={n} aria-valuenow={shown + 1} aria-valuetext={`frame ${shown + 1} of ${n}, line ${f.line}`} aria-disabled={!canLook}
        onPointerDown={e => { if (canLook) { e.currentTarget.setPointerCapture(e.pointerId); at(e); } }}
        onPointerMove={e => { if (canLook && e.buttons) at(e); }}
        onKeyDown={key}
      >
        {!pins.length && <text x={LEFT} y={TOP + 14} className="none">No pin has been set as an output yet.</text>}
        {pins.map((p, r) => {
          const lv = trace(frames, p), y = (v: number) => TOP + r * ROW + 4 + (1 - v) * (ROW - 10);
          let d = `M${x(0).toFixed(1)} ${y(lv[0]).toFixed(1)}`;
          for (let i = 1; i < n; i++) d += `H${x(i).toFixed(1)}V${y(lv[i]).toFixed(1)}`;
          return (
            <g key={p}>
              <line x1={LEFT} x2={W - 8} y1={TOP + (r + 1) * ROW - 3} y2={TOP + (r + 1) * ROW - 3} className="rule" />
              <text x={LEFT - 6} y={TOP + r * ROW + 14} textAnchor="end">{p}</text>
              <path d={d} className="trace" />
            </g>
          );
        })}
        <line x1={x(shown)} x2={x(shown)} y1={2} y2={H - 2} className="cursor" />
      </svg>
    </section>
  );
}
