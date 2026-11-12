import type { Board, Item } from '../types';
import type { Hardware } from './interpreter';

export interface VirtualHW extends Hardware {
  /** Frequency currently sounding on each pin, 0 when silent. */
  tones: Record<number, number>;
  /** Ends a delay() early so a stopped sketch returns at once. */
  wakeUp(): void;
  /** How brightly an LED on this pin shines, 0 to 1. */
  glow(pin: number): number;
}

/** The pins of a virtual board, wired to the parts of one lesson's circuit. `inputs` reads the on-screen button, knob and wall. */
export function makeHW(board: Board, circuit: Item[], inputs: () => Record<string, number>, print: (text: string) => void): VirtualHW {
  const mode: Record<number, number> = {}, level: Record<number, number> = {}, tones: Record<number, number> = {}, t0 = performance.now();
  let wake: (() => void) | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  const find = <T extends Item['t']>(t: T, test: (it: Extract<Item, { t: T }>) => boolean) =>
    circuit.find((it): it is Extract<Item, { t: T }> => it.t === t && test(it as Extract<Item, { t: T }>));
  return {
    consts: board.consts, tones, print,
    sleep: ms => new Promise<void>(r => { wake = r; timer = setTimeout(r, ms); }),
    pause: () => new Promise<void>(r => setTimeout(r, 0)),
    wakeUp() { clearTimeout(timer); wake?.(); },
    now: () => performance.now() - t0,
    pinMode(p, m) { mode[p] = m; if (m !== 1) level[p] = m === 2 ? 1 : 0; },
    digitalWrite(p, v) { level[p] = v ? 1 : 0; },
    analogWrite(p, v) { mode[p] = 1; level[p] = Math.min(255, Math.max(0, v)) / 255; },
    digitalRead(p) {
      if (mode[p] === 1) return level[p] > 0.5 ? 1 : 0;
      const bt = find('button', it => it.pin === p);
      return bt && inputs()[bt.id] ? 0 : mode[p] === 2 ? 1 : 0;
    },
    analogRead(p) {
      if (board.id === 'uno' && p >= 0 && p < 6) p += 14;
      const pt = find('pot', it => it.pin === p);
      return pt ? Math.round(inputs()[pt.id] * board.adcMax) : 0;
    },
    tone(p, f, d) { tones[p] = f; if (d) setTimeout(() => { if (tones[p] === f) tones[p] = 0; }, d); },
    noTone(p) { tones[p] = 0; },
    pulseIn(p) { const s = find('sonar', it => it.echo === p); return s ? Math.round(inputs()[s.id] * 58.31 + Math.random() * 20 - 10) : 0; },
    touchRead(p) { const pd = find('pad', it => it.pin === p); return pd && inputs()[pd.id] ? 8 + Math.floor(Math.random() * 6) : 62 + Math.floor(Math.random() * 8); },
    glow(p) { return mode[p] === 1 ? (level[p] || 0) : level[p] ? 0.07 : 0; },   // a pin left as INPUT can only make an LED glow faintly
  };
}
