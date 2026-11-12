import type { Board, Item } from '../types';
import { analyze, LED_BURN_AMPS, PIN_MAX_AMPS, type Analysis, type Drive, type Solution } from './circuit';
import type { Hardware } from './interpreter';
import type { Frame } from './timeline';

export interface HWHooks {
  /** LEDs that already burnt out on this bench. They stay open circuits. */
  burnt?: Iterable<string>;
  onBurn?(id: string): void;
  onAlert?(text: string): void;
  /** A pin, a note or the clock moved: a moment worth recording. */
  onChange?(): void;
}

/** What the 3D view needs to draw one moment: how bright each LED is, which note sounds, and the current in every wire. */
export interface Readout {
  circuit: Solution;
  ledGlow(id: string): number;
  buzzFreq(id: string): number;
  /** The board's own LED, 0 to 1. */
  builtinGlow: number;
}

function readoutOf(board: Board, circuit: Solution, drive: (pin: number) => Drive, tones: Record<number, number>): Readout {
  const d = drive(board.builtin);
  return {
    circuit,
    ledGlow: id => circuit.ledGlow(id),
    buzzFreq: id => (circuit.buzzVolts(id) < 1 ? 0 : Math.max(0, ...circuit.pinsDriving(id).map(p => tones[p] || 0))),
    builtinGlow: d.mode === 'out' ? d.level : d.mode === 'pullup' ? 0.07 : 0,   // a pin left as INPUT can only make an LED glow faintly
  };
}

/** The board as it was at a recorded frame. */
export function makeReadout(board: Board, analysis: Analysis, frame: Frame, burnt: Iterable<string> = []): Readout {
  const off: Drive = { mode: 'in', level: 0 }, drive = (p: number): Drive => (frame.tones[p] ? { mode: 'out', level: 1 } : frame.drive[p] ?? off);
  return readoutOf(board, analysis.solve(drive, frame.inputs, burnt), drive, frame.tones);
}

export interface VirtualHW extends Hardware {
  /** Frequency currently sounding on each pin, 0 when silent. */
  tones: Record<number, number>;
  /** Ends a delay() early so a stopped sketch returns at once. */
  wakeUp(): void;
  /** How brightly the LEDs driven by this pin shine, 0 to 1 (the board's own LED counts for its pin). */
  glow(pin: number): number;
  /** How brightly one LED shines, 0 to 1. */
  ledGlow(id: string): number;
  /** The note a buzzer is sounding in hertz, 0 when it is silent. */
  buzzFreq(id: string): number;
  /** The electrical state of the whole circuit right now. */
  circuit(): Solution;
  /** The same, packaged for drawing. */
  readout(): Readout;
  /** Where the pins, notes and inputs stand, with the sketch's clock and the line about to run. */
  snapshot(): Frame;
  /** The line of the sketch about to run, set by the step hook. */
  line: number;
  /** When true, delay() returns at once but still moves the sketch's clock forward. Step mode uses it. */
  skipDelays: boolean;
  analysis: Analysis;
}

/** The pins of a virtual board, connected through the student's wiring to the parts of one circuit. `inputs` reads the on-screen button, knob and wall. */
export function makeHW(board: Board, circuit: Item[], inputs: () => Record<string, number>, print: (text: string) => void, hooks: HWHooks = {}): VirtualHW {
  const mode: Record<number, number> = {}, level: Record<number, number> = {}, tones: Record<number, number> = {}, t0 = performance.now();
  const analysis = analyze(board.id, circuit), burnt = new Set(hooks.burnt ?? []), warned = new Set<number>();
  const logic = board.id === 'uno' ? 5 : 3.3;
  let wake: (() => void) | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  let version = 0, key = '', sol!: Solution, skew = 0;

  const raw = (p: number): Drive => {
    if (mode[p] === 1) return { mode: 'out', level: level[p] || 0 };
    return (level[p] || 0) > 0.5 ? { mode: 'pullup', level: 1 } : { mode: 'in', level: 0 };   // writing HIGH to an input turns its pull-up on
  };
  const drive = (p: number): Drive => (tones[p] ? { mode: 'out', level: 1 } : raw(p));
  /** The circuit solved for the pins and inputs as they are now, solved again only when something changed. */
  function circuitNow(): Solution {
    const k = version + JSON.stringify(inputs()) + JSON.stringify(tones);
    if (key && k === key) return sol;
    for (let again = 0; again < 4; again++) {   // a burnt LED changes the circuit, so look again after each
      sol = analysis.solve(drive, inputs(), burnt);
      let changed = false;
      for (const it of circuit) {
        if (it.t !== 'led' || burnt.has(it.id) || sol.ledAmps(it.id) <= LED_BURN_AMPS) continue;
        burnt.add(it.id); changed = true; hooks.onBurn?.(it.id);
      }
      if (!changed) break;
    }
    for (const p of Object.keys(mode).map(Number)) {
      if (mode[p] !== 1 || warned.has(p) || Math.abs(sol.pinAmps(p)) <= PIN_MAX_AMPS) continue;
      warned.add(p);
      hooks.onAlert?.(`Pin ${p} is supplying ${Math.round(Math.abs(sol.pinAmps(p)) * 1000)} mA. A pin can only handle about 40 mA, so on a real board it could be damaged. Check what this pin is wired to.`);
    }
    key = version + JSON.stringify(inputs()) + JSON.stringify(tones);
    return sol;
  }
  const changed = () => { version++; circuitNow(); hooks.onChange?.(); };
  const find = <T extends Item['t']>(t: T, test: (it: Extract<Item, { t: T }>) => boolean) =>
    circuit.find((it): it is Extract<Item, { t: T }> => it.t === t && test(it as Extract<Item, { t: T }>));
  const ledIds = circuit.filter(it => it.t === 'led').map(it => (it as Extract<Item, { t: 'led' }>).id);

  const hw: VirtualHW = {
    consts: board.consts, tones, print, analysis, line: 0, skipDelays: false,
    sleep: ms => { if (hw.skipDelays) { skew += ms; hooks.onChange?.(); return Promise.resolve(); } return new Promise<void>(r => { wake = r; timer = setTimeout(r, ms); }); },
    pause: () => new Promise<void>(r => setTimeout(r, 0)),
    wakeUp() { clearTimeout(timer); wake?.(); },
    now: () => performance.now() - t0 + skew,
    pinMode(p, m) { mode[p] = m; if (m !== 1) level[p] = m === 2 ? 1 : 0; changed(); },
    digitalWrite(p, v) { level[p] = v ? 1 : 0; changed(); },
    analogWrite(p, v) { mode[p] = 1; level[p] = Math.min(255, Math.max(0, v)) / 255; changed(); },
    digitalRead(p) {
      if (mode[p] === 1) return level[p] > 0.5 ? 1 : 0;
      return circuitNow().pinVolt(p) > logic * 0.6 ? 1 : 0;
    },
    analogRead(p) {
      if (board.id === 'uno' && p >= 0 && p < 6) p += 14;
      return Math.round(Math.min(1, Math.max(0, circuitNow().pinVolt(p) / logic)) * board.adcMax);
    },
    tone(p, f, d) { tones[p] = f; changed(); if (d) setTimeout(() => { if (tones[p] === f) { tones[p] = 0; changed(); } }, d); },
    noTone(p) { tones[p] = 0; changed(); },
    pulseIn(p) {
      const s = find('sonar', it => analysis.pinAt(`${it.row}${it.col + 2}`) === p);
      if (!s) return 0;
      const now = circuitNow();
      const powered = now.volt(`${s.row}${s.col}`) - now.volt(`${s.row}${s.col + 3}`) >= 4.5, triggered = analysis.pinAt(`${s.row}${s.col + 1}`) != null;
      return powered && triggered ? Math.round(inputs()[s.id] * 58.31 + Math.random() * 20 - 10) : 0;
    },
    touchRead(p) { const pd = find('pad', () => analysis.pinAt('PAD') === p); return pd && inputs()[pd.id] ? 8 + Math.floor(Math.random() * 6) : 62 + Math.floor(Math.random() * 8); },
    glow(p) {
      const builtin = p === board.builtin ? (mode[p] === 1 ? (level[p] || 0) : level[p] ? 0.07 : 0) : 0, now = circuitNow();
      return Math.max(builtin, ...ledIds.filter(id => now.pinsDriving(id).includes(p)).map(id => now.ledGlow(id)));
    },
    ledGlow: id => circuitNow().ledGlow(id),
    buzzFreq(id) {
      const now = circuitNow();
      if (now.buzzVolts(id) < 1) return 0;
      return Math.max(0, ...now.pinsDriving(id).map(p => tones[p] || 0));
    },
    circuit: circuitNow,
    readout: () => readoutOf(board, circuitNow(), drive, tones),
    snapshot: () => {
      const pins = new Set([...Object.keys(mode), ...Object.keys(level), ...Object.keys(tones)].map(Number)), snap: Frame = { t: hw.now(), line: hw.line, drive: {}, tones: { ...tones }, inputs: { ...inputs() } };
      for (const p of pins) snap.drive[p] = raw(p);
      return snap;
    },
  };
  return hw;
}
