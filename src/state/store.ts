import { create } from 'zustand';
import { BOARDS } from '../data/boards';
import type { BoardId } from '../types';

export type Tab = 'guide' | 'wiring' | 'pinout';

export interface LabState {
  board: BoardId;
  /** Index into the board's lessons. */
  lesson: number;
  tab: Tab;
  /** The highlighted part, if any. */
  hot: string | null;
  /** Sketches the student has changed, by lesson key. */
  edits: Record<string, string>;
  /** On-screen inputs by part id: 1 or 0 for a held button or pad, 0 to 1 for a knob, centimetres for the wall. */
  inputs: Record<string, number>;
  /** Lesson keys whose sketch has run. */
  done: string[];
  sound: boolean;
  labels: boolean;
  running: boolean;
  errLine: number | null;
  serial: string;
}

const DONE_KEY = 'boardlab-done';
function loadDone(): string[] {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]'); } catch { return []; }   // progress just starts empty
}
export function saveDone(done: string[]) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(done)); } catch { /* not saved, still counted for this visit */ }
}

export const useLab = create<LabState>(() => ({
  board: 'uno', lesson: 0, tab: 'guide', hot: null, edits: {}, inputs: {}, done: loadDone(),
  sound: false, labels: true, running: false, errLine: null, serial: '',
}));

export const boardOf = (s: LabState) => BOARDS[s.board];
export const lessonOf = (s: LabState) => BOARDS[s.board].lessons[s.lesson];
export const keyOf = (s: LabState) => `${s.board}-${lessonOf(s).id}`;
export const codeOf = (s: LabState) => s.edits[keyOf(s)] ?? lessonOf(s).code;
