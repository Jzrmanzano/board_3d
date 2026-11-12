import { Canvas } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ITEM_INFO } from '../data/boards';
import { Bench, view } from '../scene/Bench';
import { analyze } from '../sim/circuit';
import { cancelTool, currentReadout, dismissNotice, flipItem, moveWireTyped, pickTool, placeTyped, redo, removeItem, resetBench, selectHot, setInput, setNav, toggleLabels, toggleSound, undo } from '../state/actions';
import { TWO_POINT, type Tool, type ToolKind } from '../state/bench';
import { benchOf, boardOf, useLab } from '../state/store';
import { itemId, type Item } from '../types';

/** Shows a message in place of the 3D view on devices where WebGL cannot start. */
class Fallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p className="fail">The 3D view could not start on this device. The lessons, code editor and serial monitor still work.</p>
      : this.props.children;
  }
}

/* --- the parts tray --- */
interface TrayPart { label: string; tool: Tool; swatch?: string; only?: 'uno' | 'esp32' }
const TRAY: TrayPart[] = [
  { label: 'Red LED', tool: { kind: 'led', color: 0xff3b30 }, swatch: '#ff3b30' },
  { label: 'Green LED', tool: { kind: 'led', color: 0x2ecc40 }, swatch: '#2ecc40' },
  { label: '220 Ω', tool: { kind: 'res', ohms: 220 } },
  { label: '1 kΩ', tool: { kind: 'res', ohms: 1000 } },
  { label: '10 kΩ', tool: { kind: 'res', ohms: 10000 } },
  { label: 'Wire', tool: { kind: 'wire' } },
  { label: 'Button', tool: { kind: 'button' } },
  { label: 'Knob', tool: { kind: 'pot' } },
  { label: 'Buzzer', tool: { kind: 'buzzer' } },
  { label: 'Distance sensor', tool: { kind: 'sonar' } },
  { label: 'Touch pad', tool: { kind: 'pad' }, only: 'esp32' },
];
const same = (a: Tool | null, b: Tool) => !!a && a.kind === b.kind && a.color === b.color && a.ohms === b.ohms;

const STEPS: Record<ToolKind, [string, string?]> = {
  led: ['Click the hole for the LED\'s long leg (+).', 'Now click the hole for its short leg (−).'],
  res: ['Click the hole for one end of the resistor.', 'Now click the hole for its other end.'],
  buzzer: ['Click the hole for one buzzer leg.', 'Now click the hole for the other leg.'],
  wire: ['Click or drag from one hole or board pin…', '…to the point it should connect to.'],
  button: ['Click a hole. The button sits across the middle gap, covering that column and the one two to the right.'],
  pot: ['Click the hole for the knob\'s left leg. It uses three columns in a row.'],
  sonar: ['Click the hole for the sensor\'s VCC leg. It uses four columns in a row.'],
  pad: ['The touch pad sits on the table. Connect it with a wire to PAD.'],
};

function Tray() {
  const board = useLab(s => s.board), tool = useLab(s => s.tool);
  const canUndo = useLab(s => !!s.undo[`${s.board}-${boardOf(s).lessons[s.lesson].id}`]?.length), canRedo = useLab(s => !!s.redo[`${s.board}-${boardOf(s).lessons[s.lesson].id}`]?.length);
  const hasParts = useLab(s => benchOf(s).length > 0);
  return (
    <section className="tray" aria-label="Parts tray">
      <div className="tray-row" role="toolbar" aria-label="Parts">
        <b className="tray-title">Parts</b>
        {TRAY.filter(p => !p.only || p.only === board).map(p => (
          <button key={p.label} type="button" className="part" aria-pressed={same(tool, p.tool)} onClick={() => pickTool(p.tool)}>
            {p.swatch && <i className="sw" style={{ background: p.swatch }} />}{p.label}
          </button>
        ))}
        <span className="tray-gap" />
        <button type="button" onClick={undo} disabled={!canUndo}>Undo</button>
        <button type="button" onClick={redo} disabled={!canRedo}>Redo</button>
        <button type="button" onClick={resetBench} disabled={!hasParts}>Reset bench</button>
      </div>
    </section>
  );
}

/** What to do next with the chosen part. It floats over the 3D view, so showing it never moves the bench under the pointer. */
function Help() {
  const board = useLab(s => s.board), tool = useLab(s => s.tool), pending = useLab(s => s.pending), point = useLab(s => s.point);
  const [typed, setTyped] = useState(''), [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { setTyped(''); setProblem(null); }, [tool, board]);
  if (!tool) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = placeTyped(typed);
    setProblem(err);
    if (!err) setTyped('');
  };
  const step = STEPS[tool.kind][TWO_POINT.includes(tool.kind) && pending ? 1 : 0];
  return (
    <div className="tray-help">
      <p aria-live="polite">{step}<span className="at"> {point ? <>Pointing at <code>{point.replace(/^[UE]:/, '')}</code></> : ''}</span></p>
      {tool.kind !== 'pad' && (
        <form onSubmit={submit}>
          <label>or type it: <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={TWO_POINT.includes(tool.kind) ? 'e10 e11' : 'd24'} autoComplete="off" spellCheck={false} /></label>
          <button type="submit">Place</button>
        </form>
      )}
      <button type="button" onClick={cancelTool}>Done</button>
      {problem && <p className="problem" role="alert">{problem}</p>}
    </div>
  );
}

/* --- notices, the part card and the circuit check --- */
function Notice() {
  const n = useLab(s => s.notice);
  if (!n) return null;
  return (
    <div className={`notice ${n.tone}`} role={n.tone === 'info' ? 'status' : 'alert'}>
      <p>{n.text}</p>
      <button type="button" aria-label="Dismiss" onClick={dismissNotice}>×</button>
    </div>
  );
}

/** Where each end of a wire is plugged in, as text the student can change. The same as dragging an end, for keyboards and small screens. */
function WireEnds({ id, a, b }: { id: string; a: string; b: string }) {
  const [from, setFrom] = useState(a), [to, setTo] = useState(b), [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { setFrom(a); setTo(b); setProblem(null); }, [a, b, id]);
  return (
    <form className="ends" onSubmit={(e: FormEvent) => { e.preventDefault(); setProblem(moveWireTyped(id, from, to)); }}>
      <label>From <input value={from} onChange={e => setFrom(e.target.value)} autoComplete="off" spellCheck={false} /></label>
      <label>To <input value={to} onChange={e => setTo(e.target.value)} autoComplete="off" spellCheck={false} /></label>
      <button type="submit">Move ends</button>
      {problem && <p className="problem" role="alert">{problem}</p>}
    </form>
  );
}

function PartCard() {
  const hot = useLab(s => s.hot), board = useLab(boardOf), bench = useLab(benchOf);
  if (!hot) return null;
  const at = bench.findIndex((it, k) => itemId(it, k) === hot), item = at >= 0 ? bench[at] : null;
  const info = board.parts[hot] ?? (item && ITEM_INFO[item.t]);
  if (!info) return null;
  return (
    <div className="card">
      <button type="button" className="x" aria-label="Close" onClick={() => selectHot(null)}>×</button>
      <b>{info[0]}</b>
      <p>{info[1]}</p>
      {item?.t === 'wire' && <WireEnds id={hot} a={item.a} b={item.b} />}
      {item && (
        <div className="card-actions">
          {item.t === 'led' && <button type="button" onClick={() => flipItem(hot)}>Flip</button>}
          <button type="button" onClick={() => removeItem(hot)}>Remove</button>
        </div>
      )}
    </div>
  );
}

function Checks() {
  const board = useLab(s => s.board), bench = useLab(benchOf);
  const issues = useMemo(() => analyze(board, bench).issues, [board, bench]);
  if (!bench.length) return null;
  return (
    <details className={issues.length ? 'checks bad' : 'checks ok'} open={issues.length > 0 && issues.length < 3}>
      <summary>{issues.length ? `Circuit check: ${issues.length} thing${issues.length > 1 ? 's' : ''} to fix` : 'Circuit check: no problems found'}</summary>
      <ul>
        {issues.map((i, n) => (
          <li key={n} className={i.severity}>
            <b>{i.title}</b>
            <span>{i.plain}</span>
            {i.part && <button type="button" onClick={() => selectHot(i.part!)}>Show part</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/* --- the voltage under the pointer --- */
const LOGIC: Record<string, number> = { uno: 5, esp32: 3.3 };
/** In plain words: "Hole e10", "Pin 13", "Plus rail". */
function nameOf(point: string): string {
  let m;
  if ((m = /^U:(\d+)$/.exec(point))) return `Pin ${m[1]}`;
  if ((m = /^[UE]:(.+)$/.exec(point))) return `Pin ${m[1].replace('GNDf', 'GND').replace(/GND[2b]/, 'GND')}`;
  if ((m = /^([TB])([+-])/.exec(point))) return `${m[2] === '+' ? 'Plus' : 'Minus'} rail, ${m[1] === 'T' ? 'far' : 'near'} side`;
  return point === 'PAD' ? 'Touch pad' : `Hole ${point}`;
}

/** Point at a hole or pin to read its voltage. It follows the sketch while it runs and the recorded frame while the student looks back. */
function Probe() {
  const probe = useLab(s => s.probe), board = useLab(s => s.board), bench = useLab(benchOf), inputs = useLab(s => s.inputs);
  const analysis = useMemo(() => analyze(board, bench), [board, bench]);
  const [, redraw] = useState(0), name = probe?.name;
  useEffect(() => {
    if (!name) return;
    const id = setInterval(() => redraw(n => n + 1), 100);
    return () => clearInterval(id);
  }, [name]);
  if (!probe) return null;
  const live = currentReadout(), sol = live ? live.circuit : analysis.solve({}, inputs), v = sol.volt(probe.name), logic = LOGIC[board];
  const level = v > logic * 0.6 ? 'high' : v < logic * 0.3 ? 'low' : 'in between', pin = analysis.pinAt(probe.name), amps = pin != null ? sol.pinAmps(pin) : 0;
  return (
    <div className="probe" role="status" style={{ left: probe.x + 14, top: probe.y + 14 }}>
      <b>{nameOf(probe.name)}</b>
      <span className="volts">{v.toFixed(2)} V</span>
      <small>{level}{live ? '' : ' · no sketch running'}</small>
      {Math.abs(amps) >= 0.0005 && <small>{amps > 0 ? 'supplying' : 'taking in'} {Math.abs(amps * 1000).toFixed(1)} mA</small>}
    </div>
  );
}

/* --- on-screen inputs --- */
type Control = Extract<Item, { ctl: string }>;

function Hold({ it, id }: { it: Control; id: string }) {
  const down = useLab(s => !!s.inputs[id]);
  const press = (on: boolean) => () => setInput(id, on ? 1 : 0);
  const key = (on: boolean) => (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') setInput(id, on ? 1 : 0); };
  return (
    <button type="button" className={down ? 'hold down' : 'hold'}
      onPointerDown={press(true)} onPointerUp={press(false)} onPointerLeave={press(false)} onPointerCancel={press(false)}
      onKeyDown={key(true)} onKeyUp={key(false)} onBlur={press(false)}>
      {it.ctl}
    </button>
  );
}

function Slider({ it, id }: { it: Control; id: string }) {
  const value = useLab(s => s.inputs[id] ?? 0), sonar = it.t === 'sonar';
  const shown = sonar ? value : Math.round(value * 100);   // the wall is stored in cm, the knob as 0 to 1
  return (
    <label>
      {it.ctl}
      <input type="range" min={sonar ? 2 : 0} max={100} value={shown} onChange={e => setInput(id, sonar ? +e.target.value : +e.target.value / 100)} />
      <output>{sonar ? `${shown} cm` : `${shown}%`}</output>
    </label>
  );
}

function Controls() {
  const bench = useLab(benchOf);
  const items = bench.map((it, k) => [it, itemId(it, k)] as const).filter((x): x is readonly [Control, string] => 'ctl' in x[0]);
  if (!items.length) return null;
  return (
    <div className="controls">
      {items.map(([it, id]) => (it.t === 'button' || it.t === 'pad' ? <Hold key={id} it={it} id={id} /> : <Slider key={id} it={it} id={id} />))}
    </div>
  );
}

/** Keyboard shortcuts for the bench: Escape puts the part down, Delete removes the selected one, Ctrl+Z and Ctrl+Y undo and redo. */
function useBenchKeys() {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select') || e.altKey) return;
      const s = useLab.getState();
      if (e.key === 'Escape') { if (s.tool) cancelTool(); else selectHot(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && s.hot && benchOf(s).some((it, k) => itemId(it, k) === s.hot)) { e.preventDefault(); removeItem(s.hot); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function Stage() {
  const labels = useLab(s => s.labels), nav = useLab(s => s.nav), sound = useLab(s => s.sound);
  const down = useRef([0, 0]), labelLayer = useRef<HTMLDivElement>(null);
  useBenchKeys();
  return (
    <main className="stage" onPointerDown={e => { down.current = [e.clientX, e.clientY]; }}>
      <Tray />
      <div className="view">
        <Fallback>
          {/* legacy linear flat: plain colours in, plain colours out. The toon look needs no colour management or tone mapping. */}
          <Canvas
            orthographic legacy linear flat
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            camera={{ manual: true, near: 1, far: 4000 }}
            style={{ position: 'absolute', inset: 0 }}
            onPointerMissed={e => { if (Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) < 5 && !useLab.getState().tool) selectHot(null); }}
          >
            <Bench labelLayer={labelLayer} />
          </Canvas>
        </Fallback>
        <div className="hotlayer" ref={labelLayer} hidden={!labels} />
        <Probe />
        <div className="tools">
          <button type="button" aria-label="Zoom out" onClick={() => view.zoom(0.8)}>−</button>
          <button type="button" aria-label="Zoom in" onClick={() => view.zoom(1.25)}>+</button>
          <button type="button" aria-pressed={nav === 'pan'} title="Dragging slides the view sideways and up or down. Right-drag turns it." onClick={() => setNav('pan')}>Move</button>
          <button type="button" aria-pressed={nav === 'rotate'} title="Dragging turns the view. Right-drag slides it." onClick={() => setNav('rotate')}>Rotate</button>
          <button type="button" title="Look straight down at the bench" onClick={() => view.top()}>Top view</button>
          <button type="button" onClick={() => view.fit()}>Reset view</button>
          <button type="button" aria-pressed={labels} onClick={toggleLabels}>Labels</button>
          <button type="button" aria-pressed={sound} onClick={toggleSound}>{sound ? 'Sound on' : 'Sound off'}</button>
        </div>
        <div className="dock">
          <div className="stack">
            <Notice />
            <PartCard />
            <Checks />
          </div>
          <Controls />
          <Help />
        </div>
      </div>
    </main>
  );
}
