import { BOARDS } from '../data/boards';
import { ensureAudio } from '../sim/audio';
import { makeHW, type VirtualHW } from '../sim/hardware';
import { run as runSketch, SimError, type RunControl } from '../sim/interpreter';
import type { BoardId } from '../types';
import { codeOf, keyOf, lessonOf, saveDone, useLab, type Tab } from './store';

const set = useLab.setState, get = useLab.getState;

/* --- running sketches --- */
let active: { hw: VirtualHW; ctl: RunControl } | null = null;
let serialBuf = '', flushQueued = false;

/** The virtual board of the sketch that is running, for the 3D view to read pin states from. */
export const activeHW = () => active?.hw ?? null;

function print(text: string) {
  serialBuf = (serialBuf + text).slice(-6000);
  if (flushQueued) return;
  flushQueued = true;
  requestAnimationFrame(() => { flushQueued = false; set({ serial: serialBuf }); });
}
export function clearSerial() { serialBuf = ''; set({ serial: '' }); }

export function stopRun() {
  if (!active) return;
  active.ctl.stop = true; active.hw.wakeUp(); active = null;
  set({ running: false });
}
export function startRun() {
  stopRun();
  const s = get(), key = keyOf(s);
  clearSerial(); set({ running: true, errLine: null });
  if (s.sound) ensureAudio();
  const hw = makeHW(BOARDS[s.board], lessonOf(s).circuit, () => get().inputs, print);
  const ctl: RunControl = { stop: false, onLoop() { ctl.onLoop = undefined; markDone(key); } };
  const mine = (active = { hw, ctl });
  runSketch(codeOf(s), hw, ctl)
    .catch((e: unknown) => {
      if (active !== mine) return;
      if (e instanceof SimError) { print(`\n⚠ Line ${e.line}: ${e.message}\n`); set({ errLine: e.line }); }
      else print(`\n⚠ The simulator hit a problem: ${e instanceof Error ? e.message : e}\n`);
    })
    .then(() => { if (active === mine) { active = null; set({ running: false }); } });
}
function markDone(key: string) {
  const { done } = get();
  if (done.includes(key)) return;
  const next = [...done, key];
  saveDone(next); set({ done: next });
}

/* --- lessons: the address bar hash (#uno-blink) says which one is open --- */
export function openFromHash() {
  stopRun();
  const m = /^#?([a-z0-9]+)-([a-z0-9]+)$/.exec(location.hash);
  const board: BoardId = m && Object.hasOwn(BOARDS, m[1]) ? (m[1] as BoardId) : 'uno';
  const lesson = Math.max(0, BOARDS[board].lessons.findIndex(l => l.id === m?.[2]));
  const inputs: Record<string, number> = {};
  for (const it of BOARDS[board].lessons[lesson].circuit) if ('ctl' in it) inputs[it.id] = it.t === 'pot' ? 0.5 : it.t === 'sonar' ? 30 : 0;
  serialBuf = '';
  set({ board, lesson, hot: null, inputs, serial: '', errLine: null });
}
export const goTo = (board: BoardId, lessonId: string) => { location.hash = `${board}-${lessonId}`; };

/* --- everything else --- */
export const setTab = (tab: Tab) => set({ tab });
/** Selects a part, or clears the selection when it is already selected or id is null. */
export const selectHot = (id: string | null) => set(s => ({ hot: id && id !== s.hot ? id : null }));
export const setInput = (id: string, value: number) => set(s => ({ inputs: { ...s.inputs, [id]: value } }));
export const editCode = (code: string) => set(s => ({ edits: { ...s.edits, [keyOf(s)]: code }, errLine: null }));
export function resetCode() {
  stopRun();
  set(s => { const edits = { ...s.edits }; delete edits[keyOf(s)]; return { edits, errLine: null }; });
}
export const toggleLabels = () => set(s => ({ labels: !s.labels }));
export function toggleSound() {
  set(s => ({ sound: !s.sound }));
  if (get().sound) ensureAudio();
}
