/* A record of what the board's pins were doing over time, so the student can scrub back through a run. */
import type { Drive } from './circuit';

/** The pins, the notes and the on-screen inputs at one moment, and the line of the sketch that was about to run. */
export interface Frame {
  /** Milliseconds on the sketch's own clock, which also counts delays that step mode skipped. */
  t: number;
  line: number;
  drive: Record<number, Drive>;
  tones: Record<number, number>;
  inputs: Record<string, number>;
}

export const MAX_FRAMES = 1500;

const same = (a: Frame, b: Frame) =>
  a.line === b.line && a.t === b.t && JSON.stringify(a.drive) === JSON.stringify(b.drive) && JSON.stringify(a.tones) === JSON.stringify(b.tones);

/** Adds a frame unless it repeats the last one, and forgets the oldest frames beyond the ceiling. */
export function pushFrame(frames: Frame[], f: Frame): void {
  const last = frames[frames.length - 1];
  if (last && same(last, f)) return;
  frames.push(f);
  if (frames.length > MAX_FRAMES) frames.splice(0, frames.length - MAX_FRAMES);
}

/** How high a pin was at each frame: 0 low (or not an output), 1 high, in between for PWM. */
export function trace(frames: Frame[], pin: number): number[] {
  return frames.map(f => {
    if (f.tones[pin]) return 1;
    const d = f.drive[pin];
    return d && d.mode === 'out' ? d.level : 0;
  });
}

/** The pins that were outputs at any point, in order, for the rows of the chart. */
export function outputPins(frames: Frame[]): number[] {
  const pins = new Set<number>();
  for (const f of frames) {
    for (const [p, d] of Object.entries(f.drive)) if (d.mode === 'out') pins.add(+p);
    for (const p of Object.keys(f.tones)) pins.add(+p);
  }
  return [...pins].sort((a, b) => a - b);
}

/** The last frame at or before a time on the sketch clock. */
export function frameAt(frames: Frame[], t: number): number {
  let at = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i].t <= t) at = i;
  return at;
}
