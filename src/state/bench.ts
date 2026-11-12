/* The rules of placing parts on the bench: which connection points exist, which are taken, and what a part needs. No 3D and no React in here. */
import { ESP_HOLES } from '../data/boards';
import { itemId, type BoardId, type Item, type WireColor } from '../types';

export type ToolKind = 'led' | 'res' | 'buzzer' | 'wire' | 'button' | 'pot' | 'sonar' | 'pad';
export interface Tool { kind: ToolKind; color?: number; ohms?: number }

/** Parts that go between two points the student picks one after the other. */
export const TWO_POINT: ToolKind[] = ['led', 'res', 'buzzer', 'wire'];
export const COLS = 30;
/** Columns 1 to 21 of the breadboard are under the ESP32. Its own pins take their place. */
const ESP_FIRST_FREE = 22;
const UNO_PINS = [...Array.from({ length: 14 }, (_, i) => String(i)), 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', '5V', '3V3', 'GND', 'GND2', 'GNDb', 'VIN'];

export const isHole = (n: string) => /^[a-j]\d+$/.test(n) || /^[TB][+-]\d+$/.test(n);
const colOf = (n: string) => +n.replace(/^\D+/, '');
const rowOf = (n: string) => n[0];

/** Every connection point the student can use on this bench. */
export function allTerminals(board: BoardId, items: Item[]): string[] {
  const out: string[] = [];
  const first = board === 'esp32' ? ESP_FIRST_FREE : 1;
  for (let c = first; c <= COLS; c++) for (const r of 'abcdefghij') out.push(r + c);
  for (let c = 1; c <= COLS; c++) for (const r of ['T+', 'T-', 'B+', 'B-']) out.push(r + c);
  if (board === 'uno') out.push(...UNO_PINS.map(p => 'U:' + p));
  else out.push(...Object.keys(ESP_HOLES).filter(p => p !== 'EN').map(p => 'E:' + p));
  if (items.some(it => it.t === 'pad')) out.push('PAD');
  return out;
}

/** The points an item sticks a leg or wire end into. */
export function holesOf(it: Item): string[] {
  switch (it.t) {
    case 'wire': case 'res': case 'buzzer': return [it.a, it.b];
    case 'led': return [it.a, it.k];
    case 'button': return [`e${it.col}`, `e${it.col + 2}`, `f${it.col}`, `f${it.col + 2}`];
    case 'pot': return [0, 1, 2].map(i => `${it.row}${it.col + i}`);
    case 'sonar': return [0, 1, 2, 3].map(i => `${it.row}${it.col + i}`);
    case 'pad': return [];
  }
}

const NAMES: Record<ToolKind, string> = { led: 'LED', res: 'resistor', buzzer: 'buzzer', wire: 'wire', button: 'button', pot: 'knob', sonar: 'distance sensor', pad: 'touch pad' };

/** Why an item cannot go on the bench as it is, or null when it can. */
export function placementError(board: BoardId, items: Item[], it: Item): string | null {
  const valid = new Set(allTerminals(board, items)), used = new Set(items.flatMap(holesOf)), leads = holesOf(it), what = NAMES[it.t];
  if ((it.t === 'button' || it.t === 'pot') && it.col + 2 > COLS) return `A ${what} needs three columns. Pick a column further left.`;
  if (it.t === 'sonar' && it.col + 3 > COLS) return 'A distance sensor needs four columns. Pick a column further left.';
  if (new Set(leads).size < leads.length) return 'Pick two different points.';
  for (const p of leads) {
    if (it.t !== 'wire' && !isHole(p)) return `A ${what} goes into the breadboard, not a board pin. Use a wire to reach the pin.`;
    if (!valid.has(p)) return /^[a-j]\d+$/.test(p) && board === 'esp32' ? 'That spot is under the ESP32. Use the free holes on the right, or its pins.' : `${p} is not a place on this bench.`;
    if (used.has(p)) return `${p} is already taken. Each hole holds one leg or wire end.`;
  }
  if ((it.t === 'pot' || it.t === 'sonar') && board === 'esp32' && it.col < ESP_FIRST_FREE) return 'That spot is under the ESP32. Use the free holes on the right.';
  if (it.t === 'pad' && items.some(x => x.t === 'pad')) return 'There is only one touch pad.';
  return null;
}

/** Points that carry power or ground, so wires to them can be coloured red and black. */
const isPlus = (n: string) => /^[TB]\+/.test(n) || /^[UE]:(5V|3V3|VIN)$/.test(n);
const isMinus = (n: string) => /^[TB]-/.test(n) || /^[UE]:GND/.test(n);
const WIRE_CYCLE: WireColor[] = ['orange', 'yellow', 'green', 'blue', 'purple', 'white'];

export function nextId(items: Item[], prefix: string): string {
  const taken = new Set(items.map((it, k) => itemId(it, k)));
  for (let n = 1; ; n++) if (!taken.has(prefix + n)) return prefix + n;
}

const DEFAULT_CTL: Partial<Record<ToolKind, string>> = { button: 'Hold to press the button', pot: 'Knob position', sonar: 'Distance to the wall', pad: 'Hold to touch the pad' };
export const defaultInput = (it: Item): number => (it.t === 'pot' ? 0.5 : it.t === 'sonar' ? 30 : 0);

/** Builds the item for a tool and the point(s) the student chose. */
export function makeItem(tool: Tool, items: Item[], a: string, b?: string): Item {
  const col = colOf(a), row = rowOf(a);
  switch (tool.kind) {
    case 'led': return { t: 'led', id: nextId(items, 'led'), a, k: b!, color: tool.color ?? 0xff3b30 };
    case 'res': return { t: 'res', id: nextId(items, 'res'), a, b: b!, ohms: tool.ohms ?? 220 };
    case 'buzzer': return { t: 'buzzer', id: nextId(items, 'buzz'), a, b: b! };
    case 'wire': {
      const color: WireColor = isPlus(a) || isPlus(b!) ? 'red' : isMinus(a) || isMinus(b!) ? 'black' : WIRE_CYCLE[items.filter(x => x.t === 'wire').length % WIRE_CYCLE.length];
      return { t: 'wire', id: nextId(items, 'wire'), a, b: b!, c: color };
    }
    case 'button': return { t: 'button', id: nextId(items, 'btn'), col, ctl: DEFAULT_CTL.button! };
    case 'pot': return { t: 'pot', id: nextId(items, 'pot'), row, col, ctl: DEFAULT_CTL.pot! };
    case 'sonar': return { t: 'sonar', id: nextId(items, 'sonar'), row, col, ctl: DEFAULT_CTL.sonar! };
    case 'pad': return { t: 'pad', id: nextId(items, 'pad'), ctl: DEFAULT_CTL.pad! };
  }
}

/** Turns what a student typed ("e10", "t+5", "13", "gnd", "d5") into a connection point name, or null. */
export function parseTerminal(board: BoardId, text: string, items: Item[] = []): string | null {
  const t = text.trim();
  if (!t) return null;
  const valid = new Set(allTerminals(board, items)), up = t.toUpperCase();
  const candidates = [t, t.toLowerCase(), up, `U:${up}`, `E:${up}`, `E:${up.replace(/^GPIO/, 'D')}`, up === 'GND' && board === 'esp32' ? 'E:GND' : '', /^\d+$/.test(t) && board === 'esp32' ? `E:D${t}` : ''];
  return candidates.find(c => c && valid.has(c)) ?? null;
}

/** Moves one end of a wire to another connection point. Gives back the new bench, or why the wire cannot go there. */
export function movedWire(board: BoardId, items: Item[], id: string, end: 'a' | 'b', to: string): { items: Item[] } | { error: string } {
  const k = items.findIndex((it, i) => itemId(it, i) === id), w = items[k];
  if (!w || w.t !== 'wire') return { error: 'That is not a wire.' };
  if (w[end] === to) return { items };
  const next = { ...w, [end]: to }, error = placementError(board, items.filter((_, i) => i !== k), next);   // the wire's own old ends do not count as taken
  if (error) return { error };
  const carries = isPlus(next.a) || isPlus(next.b) ? 'red' : isMinus(next.a) || isMinus(next.b) ? 'black' : null;
  const colour: WireColor = carries ?? (w.c === 'red' || w.c === 'black' ? WIRE_CYCLE[k % WIRE_CYCLE.length] : w.c);   // keep red and black for power and ground only
  return { items: items.map((it, i) => (i === k ? { ...next, c: colour } : it)) };
}

/** Turns an LED around, which swaps its long and short legs. */
export const flipped = (it: Item): Item => (it.t === 'led' ? { ...it, a: it.k, k: it.a } : it);
