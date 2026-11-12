import { Canvas } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ITEM_INFO } from '../data/boards';
import { lockedBy, PARTS, unlockedParts, type PartId } from '../data/missions';
import { Bench, view } from '../scene/Bench';
import { analyze } from '../sim/circuit';
import { cancelTool, currentReadout, dismissNotice, escapePanel, flipItem, moveWireTyped, pickTool, placeTyped, redo, removeItem, requestRun, resetBench, resumeRun, selectHot, setHelp, setInput, setNav, stepOnce, stopRun, toggleLabels, togglePanel, toggleSound, undo } from '../state/actions';
import { TWO_POINT, type Tool, type ToolKind } from '../state/bench';
import { benchOf, boardOf, keyOf, missionOf, useLab } from '../state/store';
import { itemId, type Item } from '../types';
import { Icon } from './Icons';

/** Shows a message in place of the 3D view on devices where WebGL cannot start. */
class Fallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p className="fail">The 3D view could not start on this device. The missions, code editor and serial monitor still work.</p>
      : this.props.children;
  }
}

/* --- the parts tray --- */
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
  const canUndo = useLab(s => !!s.undo[keyOf(s)]?.length), canRedo = useLab(s => !!s.redo[keyOf(s)]?.length);
  const passed = useLab(s => s.passed), have = useMemo(() => unlockedParts(Object.keys(passed)), [passed]);
  const hasParts = useLab(s => benchOf(s).length > 0);
  return (
    <section className="tray" aria-label="Parts tray">
      <b className="tray-title">Parts</b>
      {(Object.keys(PARTS) as PartId[]).filter(id => !PARTS[id].only || PARTS[id].only === board).map(id => {
        const p = PARTS[id], locked = !have.has(id), by = lockedBy(id);
        return (
          <button
            key={id} type="button" className={locked ? 'part locked' : 'part'} aria-pressed={locked ? undefined : same(tool, p.tool)} aria-disabled={locked || undefined}
            title={locked && by ? `Locked. Pass “${by.mission.title}” to unlock it.` : undefined} onClick={() => pickTool(p.tool)}
          >
            {p.swatch && <i className="sw" style={{ background: p.swatch }} />}{p.label}{locked && <><Icon name="lock" /><span className="sr-only"> (locked)</span></>}
          </button>
        );
      })}
      <span className="tray-gap" />
      <button type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"><Icon name="undo" /><span className="lbl">Undo</span></button>
      <button type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)"><Icon name="redo" /><span className="lbl">Redo</span></button>
      <button type="button" onClick={resetBench} disabled={!hasParts} aria-label="Reset bench" title="Clear the bench. Undo brings it back."><Icon name="trash" /><span className="lbl">Reset bench</span></button>
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

function Hold({ id, label }: { id: string; label: string }) {
  const down = useLab(s => !!s.inputs[id]);
  const press = (on: boolean) => () => setInput(id, on ? 1 : 0);
  const key = (on: boolean) => (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') setInput(id, on ? 1 : 0); };
  return (
    <button type="button" className={down ? 'hold down' : 'hold'}
      onPointerDown={press(true)} onPointerUp={press(false)} onPointerLeave={press(false)} onPointerCancel={press(false)}
      onKeyDown={key(true)} onKeyUp={key(false)} onBlur={press(false)}>
      {label}
    </button>
  );
}

function Slider({ it, id, label }: { it: Control; id: string; label: string }) {
  const value = useLab(s => s.inputs[id] ?? 0), sonar = it.t === 'sonar';
  const shown = sonar ? value : Math.round(value * 100);   // the wall is stored in cm, the knob as 0 to 1
  return (
    <label>
      {label}
      <input type="range" min={sonar ? 2 : 0} max={100} value={shown} onChange={e => setInput(id, sonar ? +e.target.value : +e.target.value / 100)} />
      <output>{sonar ? `${shown} cm` : `${shown}%`}</output>
    </label>
  );
}

function Controls() {
  const bench = useLab(benchOf), names = useLab(missionOf).controls;
  const items = bench.map((it, k) => [it, itemId(it, k)] as const).filter((x): x is readonly [Control, string] => 'ctl' in x[0]);
  if (!items.length) return null;
  return (
    <div className="controls">
      {items.map(([it, id]) => (it.t === 'button' || it.t === 'pad' ? <Hold key={id} id={id} label={names?.[it.t] ?? it.ctl} /> : <Slider key={id} it={it} id={id} label={names?.[it.t] ?? it.ctl} />))}
    </div>
  );
}

/** Everything the keyboard can do without a mouse. The help dialog lists these. */
function useHotkeys() {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (useLab.getState().running) stopRun(); else requestRun(); return; }   // works inside the editor too
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select') || e.altKey || document.querySelector('[aria-modal="true"]')) return;   // typing, or a dialog has the keyboard
      const s = useLab.getState(), k = e.key;
      if (e.ctrlKey || e.metaKey) {
        if (k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        else if (k.toLowerCase() === 'y') { e.preventDefault(); redo(); }
        return;
      }
      if (k === 'Escape') { if (s.tool) cancelTool(); else if (s.hot) selectHot(null); else escapePanel(); }
      else if ((k === 'Delete' || k === 'Backspace') && s.hot && benchOf(s).some((it, i) => itemId(it, i) === s.hot)) { e.preventDefault(); removeItem(s.hot); }
      else if (k === '?') setHelp(true);
      else if (k === '+' || k === '=') view.zoom(1.25);
      else if (k === '-' || k === '_') view.zoom(0.8);
      else if (!e.shiftKey) {
        const letter = k.toLowerCase();
        if (letter === 'm') togglePanel('map');
        else if (letter === 'b') togglePanel('brief');
        else if (letter === 'c') togglePanel('code');
        else if (letter === 't') view.top();
        else if (k === '0') view.fit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Run, step and stop stay on the bench, so the sketch can be run without opening the code. */
function RunBar() {
  const running = useLab(s => s.running), paused = useLab(s => s.paused), line = useLab(s => s.line), looking = useLab(s => s.cursor != null);
  const status = looking ? 'Looking back' : paused && line ? `Held · line ${line}` : running ? 'Running' : 'Stopped';
  return (
    <div className="runbar" role="group" aria-label="Run the sketch">
      <button type="button" className={running ? 'run on' : 'run'} onClick={running ? stopRun : () => requestRun()} aria-keyshortcuts="Control+Enter" title={running ? 'Stop the sketch (Ctrl+Enter)' : 'Run the sketch (Ctrl+Enter)'}>
        <Icon name={running ? 'stop' : 'play'} /><span className="lbl">{running ? 'Stop' : 'Run'}</span>
      </button>
      <button type="button" onClick={stepOnce} aria-label="Step one line" title="Run one line, then wait. While running freely this pauses at the next line."><Icon name="step" /><span className="lbl">Step</span></button>
      {paused && <button type="button" onClick={resumeRun} aria-label="Continue at full speed" title="Run at full speed again"><Icon name="forward" /><span className="lbl">Continue</span></button>}
      <span className={running ? 'state on' : 'state'} role="status">{status}</span>
    </div>
  );
}

/** Moving around the bench: zoom, how a drag moves the view, the flat top view, and what to show. */
function Tools() {
  const labels = useLab(s => s.labels), nav = useLab(s => s.nav), sound = useLab(s => s.sound);
  return (
    <div className="tools" role="toolbar" aria-label="View">
      <div className="group">
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => view.zoom(1.25)}><Icon name="zoomIn" /></button>
        <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={() => view.zoom(0.8)}><Icon name="zoomOut" /></button>
        <button type="button" aria-label="Look straight down" title="Top view (T)" onClick={() => view.top()}><Icon name="top" /></button>
        <button type="button" aria-label="Reset the view" title="Reset the view (0)" onClick={() => view.fit()}><Icon name="fit" /></button>
      </div>
      <div className="group">
        <button type="button" aria-label="Drag to move the view" aria-pressed={nav === 'pan'} title="Dragging slides the view. Right-drag turns it. Arrow keys slide it." onClick={() => setNav('pan')}><Icon name="move" /></button>
        <button type="button" aria-label="Drag to turn the view" aria-pressed={nav === 'rotate'} title="Dragging turns the view. Right-drag slides it." onClick={() => setNav('rotate')}><Icon name="rotate" /></button>
      </div>
      <div className="group">
        <button type="button" aria-label="Part labels" aria-pressed={labels} title="Show or hide the part labels" onClick={toggleLabels}><Icon name="tag" /></button>
        <button type="button" aria-label="Sound" aria-pressed={sound} title={sound ? 'Sound is on' : 'Sound is off'} onClick={toggleSound}><Icon name={sound ? 'volume' : 'mute'} /></button>
        <button type="button" aria-label="Keyboard help" title="Keyboard help (?)" onClick={() => setHelp(true)}><Icon name="help" /></button>
      </div>
    </div>
  );
}

/** The 3D bench with everything that sits on it. The panels (map, brief, code) open over it from the side. */
export function Stage() {
  const labels = useLab(s => s.labels);
  const down = useRef([0, 0]), labelLayer = useRef<HTMLDivElement>(null);
  useHotkeys();
  return (
    <div className="stage" onPointerDown={e => { down.current = [e.clientX, e.clientY]; }}>
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
      <RunBar />
      <Tools />
      <div className="base">
        <div className="dock">
          <div className="stack">
            <Notice />
            <PartCard />
            <Checks />
          </div>
          <Controls />
          <Help />
        </div>
        <Tray />
      </div>
    </div>
  );
}
