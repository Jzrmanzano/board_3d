import { Canvas } from '@react-three/fiber';
import { Component, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ITEM_INFO } from '../data/boards';
import { Bench, view } from '../scene/Bench';
import { selectHot, setInput, toggleLabels, toggleSound } from '../state/actions';
import { boardOf, lessonOf, useLab } from '../state/store';
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

function PartCard() {
  const hot = useLab(s => s.hot), board = useLab(boardOf), lesson = useLab(lessonOf);
  if (!hot) return null;
  const item = lesson.circuit.find((it, k) => itemId(it, k) === hot);
  const info = board.parts[hot] ?? (item && ITEM_INFO[item.t]);
  if (!info) return null;
  return (
    <div className="card">
      <button type="button" className="x" aria-label="Close" onClick={() => selectHot(null)}>×</button>
      <b>{info[0]}</b>
      <p>{info[1]}</p>
    </div>
  );
}

type Control = Extract<Item, { ctl: string }>;

function Hold({ it }: { it: Control }) {
  const down = useLab(s => !!s.inputs[it.id]);
  const press = (on: boolean) => () => setInput(it.id, on ? 1 : 0);
  const key = (on: boolean) => (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') setInput(it.id, on ? 1 : 0); };
  return (
    <button type="button" className={down ? 'hold down' : 'hold'}
      onPointerDown={press(true)} onPointerUp={press(false)} onPointerLeave={press(false)} onPointerCancel={press(false)}
      onKeyDown={key(true)} onKeyUp={key(false)} onBlur={press(false)}>
      {it.ctl}
    </button>
  );
}

function Slider({ it }: { it: Control }) {
  const value = useLab(s => s.inputs[it.id] ?? 0), sonar = it.t === 'sonar';
  const shown = sonar ? value : Math.round(value * 100);   // the wall is stored in cm, the knob as 0 to 1
  return (
    <label>
      {it.ctl}
      <input type="range" min={sonar ? 2 : 0} max={100} value={shown} onChange={e => setInput(it.id, sonar ? +e.target.value : +e.target.value / 100)} />
      <output>{sonar ? `${shown} cm` : `${shown}%`}</output>
    </label>
  );
}

function Controls() {
  const items = useLab(lessonOf).circuit.filter((it): it is Control => 'ctl' in it);
  if (!items.length) return null;
  return (
    <div className="controls">
      {items.map(it => (it.t === 'button' || it.t === 'pad' ? <Hold key={it.id} it={it} /> : <Slider key={it.id} it={it} />))}
    </div>
  );
}

export function Stage() {
  const labels = useLab(s => s.labels), sound = useLab(s => s.sound);
  const down = useRef([0, 0]), labelLayer = useRef<HTMLDivElement>(null);
  return (
    <main className="stage" onPointerDown={e => { down.current = [e.clientX, e.clientY]; }}>
      <Fallback>
        {/* legacy linear flat: plain colours in, plain colours out. The toon look needs no colour management or tone mapping. */}
        <Canvas
          orthographic legacy linear flat
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          camera={{ manual: true, near: 1, far: 4000 }}
          style={{ position: 'absolute', inset: 0 }}
          onPointerMissed={e => { if (Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) < 5) selectHot(null); }}
        >
          <Bench labelLayer={labelLayer} />
        </Canvas>
      </Fallback>
      <div className="hotlayer" ref={labelLayer} hidden={!labels} />
      <div className="tools">
        <button type="button" aria-label="Zoom out" onClick={() => view.zoom(0.8)}>−</button>
        <button type="button" aria-label="Zoom in" onClick={() => view.zoom(1.25)}>+</button>
        <button type="button" onClick={() => view.fit()}>Reset view</button>
        <button type="button" aria-pressed={labels} onClick={toggleLabels}>Labels</button>
        <button type="button" aria-pressed={sound} onClick={toggleSound}>{sound ? 'Sound on' : 'Sound off'}</button>
      </div>
      <PartCard />
      <Controls />
    </main>
  );
}
