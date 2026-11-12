import { create } from 'zustand';
import { BOARDS } from '../data/boards';
import type { BoardId, Item } from '../types';
import type { Tool } from './bench';

export type Tab = 'guide' | 'wiring' | 'pinout';

/** What the bench held at one moment, for undo. */
export interface Snap { items: Item[]; burnt: string[] }
export interface Notice { id: number; tone: 'error' | 'warn' | 'info'; text: string }

export interface LabState {
  /** True while the landing page shows instead of the lab (empty address bar hash). */
  home: boolean;
  board: BoardId;
  /** Index into the board's lessons. */
  lesson: number;
  tab: Tab;
  /** The highlighted part, if any. */
  hot: string | null;
  /** Sketches the student has changed, by lesson key. */
  edits: Record<string, string>;
  /** The circuit the student has built, by lesson key. */
  benches: Record<string, Item[]>;
  /** LEDs that burnt out, by lesson key. */
  burnt: Record<string, string[]>;
  undo: Record<string, Snap[]>;
  redo: Record<string, Snap[]>;
  /** The part being placed, the first point already chosen for a two-point part, and the point under the pointer. */
  tool: Tool | null;
  pending: string | null;
  point: string | null;
  /** A wire end being dragged to a new place, and the point it is over right now. */
  drag: { id: string; end: 'a' | 'b'; to: string | null } | null;
  /** A message about the last thing that happened on the bench. */
  notice: Notice | null;
  /** Step mode: the sketch is held before the line shown, waiting for Step. */
  paused: boolean;
  line: number | null;
  /** Which recorded frame the student is looking at, or null for the present. */
  cursor: number | null;
  /** Changes whenever the recording does, so panels know to redraw. */
  frameTick: number;
  /** The connection point under the pointer and where on the 3D view it is, for the voltage readout. */
  probe: { name: string; x: number; y: number } | null;
  /** Counts short circuits, so the 3D view can flash each one. */
  sparks: number;
  /** On-screen inputs by part id: 1 or 0 for a held button or pad, 0 to 1 for a knob, centimetres for the wall. */
  inputs: Record<string, number>;
  /** Lesson keys whose sketch has run. */
  done: string[];
  sound: boolean;
  /** What a left-button drag on the bench does: slide the view sideways and up or down, or turn it. */
  nav: 'pan' | 'rotate';
  labels: boolean;
  running: boolean;
  errLine: number | null;
  serial: string;
}

const DONE_KEY = 'boardlab-done', BENCH_KEY = 'boardlab-benches';
function loadDone(): string[] {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); } catch { return []; }   // progress just starts empty
}
export function saveDone(done: string[]) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(done)); } catch { /* not saved, still counted for this visit */ }
}
function loadBenches(): { benches: Record<string, Item[]>; burnt: Record<string, string[]> } {
  try {
    const v = JSON.parse(localStorage.getItem(BENCH_KEY) || '{}');
    return { benches: v.benches && typeof v.benches === 'object' ? v.benches : {}, burnt: v.burnt && typeof v.burnt === 'object' ? v.burnt : {} };
  } catch { return { benches: {}, burnt: {} }; }
}
export function saveBenches(benches: Record<string, Item[]>, burnt: Record<string, string[]>) {
  try { localStorage.setItem(BENCH_KEY, JSON.stringify({ benches, burnt })); } catch { /* the bench just is not remembered */ }
}

const saved = loadBenches();
export const useLab = create<LabState>(() => ({
  home: true, board: 'uno', lesson: 0, tab: 'guide', hot: null, edits: {}, ...saved, undo: {}, redo: {},
  tool: null, pending: null, point: null, notice: null, drag: null, sparks: 0, paused: false, line: null, cursor: null, frameTick: 0, probe: null,
  inputs: {}, done: loadDone(),
  sound: false, nav: 'pan', labels: true, running: false, errLine: null, serial: '',
}));

const NONE: Item[] = [], NONE_IDS: string[] = [];
export const boardOf = (s: LabState) => BOARDS[s.board];
export const lessonOf = (s: LabState) => BOARDS[s.board].lessons[s.lesson];
export const keyOf = (s: LabState) => `${s.board}-${lessonOf(s).id}`;
export const codeOf = (s: LabState) => s.edits[keyOf(s)] ?? lessonOf(s).code;
/** The parts and wires the student has placed for the open lesson. */
export const benchOf = (s: LabState) => s.benches[keyOf(s)] ?? NONE;
export const burntOf = (s: LabState) => s.burnt[keyOf(s)] ?? NONE_IDS;
