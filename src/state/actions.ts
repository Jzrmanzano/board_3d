import { BOARDS } from '../data/boards';
import { isAvailable, lockedBy, MISSIONS, PARTS, unlockedParts, type PartId } from '../data/missions';
import { ensureAudio } from '../sim/audio';
import { observe, runChecks } from '../sim/check';
import { analyze } from '../sim/circuit';
import { makeHW, makeReadout, type Readout, type VirtualHW } from '../sim/hardware';
import { run as runSketch, SimError, type RunControl } from '../sim/interpreter';
import { pushFrame, type Frame } from '../sim/timeline';
import { itemId, type BoardId, type Item } from '../types';
import { closePanel as closePanelIn, closeTop, isOpen, openPanel as openPanelIn, type Panel } from './panels';
import { defaultInput, flipped, holesOf, makeItem, movedWire, parseTerminal, placementError, TWO_POINT, type Tool } from './bench';
import { benchOf, burntOf, codeOf, keyOf, missionOf, saveBenches, saveProgress, useLab, type Tab } from './store';

const set = useLab.setState, get = useLab.getState;

/* --- messages about the bench --- */
let noticeId = 0, noticeTimer: ReturnType<typeof setTimeout> | undefined;
export function say(tone: 'error' | 'warn' | 'info', text: string, keepFor = 9000) {
  const id = ++noticeId;
  clearTimeout(noticeTimer);
  set({ notice: { id, tone, text } });
  if (keepFor) noticeTimer = setTimeout(() => { if (get().notice?.id === id) set({ notice: null }); }, keepFor);
}
export const dismissNotice = () => set({ notice: null });

/* --- running sketches --- */
let active: { hw: VirtualHW; ctl: RunControl } | null = null;
let serialBuf = '', flushQueued = false;

/** The virtual board of the sketch that is running, for the 3D view to read pin states from. */
export const activeHW = () => active?.hw ?? null;

/* --- recording a run, stepping through it and looking back --- */
let frames: Frame[] = [], lastHW: VirtualHW | null = null, stepping = false, waiter: (() => void) | null = null, bumpQueued = false;
let replayed: { cursor: number; tick: number; readout: Readout } | null = null;
export const getFrames = () => frames;
function bump() {
  if (bumpQueued) return;
  bumpQueued = true;
  requestAnimationFrame(() => { bumpQueued = false; set(s => ({ frameTick: s.frameTick + 1 })); });
}
function forgetRun() { frames = []; lastHW = null; replayed = null; set(s => ({ cursor: null, paused: false, line: null, frameTick: s.frameTick + 1 })); }
function release() { const w = waiter; waiter = null; w?.(); }

/** What the 3D view and the voltage readout should show: the frame being looked at, else the running board, else nothing. */
export function currentReadout(): Readout | null {
  const s = get();
  if (s.cursor != null && frames[s.cursor] && lastHW) {
    if (!replayed || replayed.cursor !== s.cursor || replayed.tick !== s.frameTick) {
      replayed = { cursor: s.cursor, tick: s.frameTick, readout: makeReadout(BOARDS[s.board], lastHW.analysis, frames[s.cursor], burntOf(s)) };
    }
    return replayed.readout;
  }
  return active?.hw.readout() ?? null;
}

function print(text: string) {
  serialBuf = (serialBuf + text).slice(-6000);
  if (flushQueued) return;
  flushQueued = true;
  requestAnimationFrame(() => { flushQueued = false; set({ serial: serialBuf }); });
}
export function clearSerial() { serialBuf = ''; set({ serial: '' }); }

/** Step mode: runs one more line, or starts the sketch held at its first line. While the sketch is running freely this pauses it at the next line. */
export function stepOnce() {
  if (!active) { requestRun(true); return; }
  stepping = true; active.hw.skipDelays = true;
  set({ cursor: null });
  if (waiter) release(); else active.hw.wakeUp();
}
/** Leaves step mode and lets the sketch run at full speed again. */
export function resumeRun() {
  if (!active) return;
  stepping = false; active.hw.skipDelays = false;
  set({ paused: false, line: null, cursor: null });
  release();
}
/** Looks at an earlier frame. Only while the sketch is stopped or held at a line. */
export function scrubTo(i: number) {
  if (!frames.length) return;
  const s = get();
  if (s.running && !s.paused) return;
  set({ cursor: Math.max(0, Math.min(frames.length - 1, Math.round(i))) });
}
export const goLive = () => set({ cursor: null });
export function setProbe(probe: { name: string; x: number; y: number } | null) {
  const cur = get().probe;
  if (!probe && !cur) return;
  if (probe && cur && probe.name === cur.name && Math.hypot(probe.x - cur.x, probe.y - cur.y) < 3) return;
  set({ probe });
}

export function stopRun() {
  if (!active) return;
  active.ctl.stop = true; active.hw.wakeUp(); release(); active = null; stepping = false;
  set({ running: false, paused: false, line: null });
}
/** Starts the sketch. With stepFirst it is held before its first line, ready for Step. */
export function startRun(stepFirst = false) {
  stopRun();
  const s = get(), key = keyOf(s), bench = benchOf(s);
  clearSerial(); set({ errLine: null }); forgetRun();
  const trouble = analyze(s.board, bench).issues.find(i => i.kind === 'short');
  if (trouble) {
    print(`⚠ Not started: ${trouble.title}. ${trouble.plain}\n`);
    say('error', `${trouble.title}. The power was cut, so the sketch did not start. ${trouble.plain}`, 0);
    return;
  }
  set({ running: true });
  if (s.sound) ensureAudio();
  let hw: VirtualHW | undefined, hwDone = false;
  hw = makeHW(BOARDS[s.board], bench, () => get().inputs, print, {
    burnt: burntOf(s),
    onBurn: id => {
      const why = analyze(s.board, bench).issues.find(i => i.part === id && i.kind === 'led-no-resistor');
      const text = `The LED burned out. ${why ? why.plain : 'Too much current flowed through it.'} Remove it and place a new one.`;
      print(`\n🔥 ${text}\n`); say('error', text, 0);
      set(st => {
        const burnt = { ...st.burnt, [key]: [...(st.burnt[key] ?? []), id] };
        saveBenches(st.benches, burnt);
        return { burnt };
      });
    },
    onAlert: text => { print(`\n⚠ ${text}\n`); say('warn', text, 0); },
    onChange: () => { if (!stepping && !hwDone) { pushFrame(frames, hw!.snapshot()); bump(); } },
  });
  stepping = stepFirst; hw.skipDelays = stepFirst; lastHW = hw;
  const ctl: RunControl = {
    stop: false,
    step(line) {
      hw.line = line;
      if (!stepping) return;
      pushFrame(frames, hw.snapshot()); bump();
      set({ paused: true, line, cursor: null });
      return new Promise<void>(r => { waiter = r; });
    },
  };
  const mine = (active = { hw, ctl });
  runSketch(codeOf(s), hw, ctl)
    .catch((e: unknown) => {
      if (active !== mine) return;
      if (e instanceof SimError) { print(`\n⚠ Line ${e.line}: ${e.message}\n`); set({ errLine: e.line }); }
      else print(`\n⚠ The simulator hit a problem: ${e instanceof Error ? e.message : e}\n`);
    })
    .then(() => { hwDone = true; if (active === mine) { active = null; stepping = false; set({ running: false, paused: false, line: null }); } });
}
/* --- missions: the address bar hash (#uno-beacon) says which one is open --- */
const passedKeys = () => new Set(Object.keys(get().passed));
const saveMissionProgress = () => { const { passed, hintsUsed, predictions } = get(); saveProgress({ passed, hintsUsed, predictions }); };

export function openFromHash() {
  stopRun(); forgetRun();
  const home = /^#?$/.test(location.hash);
  const m = /^#?([a-z0-9]+)-([a-z0-9]+)$/.exec(location.hash);
  const board: BoardId = m && Object.hasOwn(BOARDS, m[1]) ? (m[1] as BoardId) : 'uno';
  const list = MISSIONS[board];
  let mission = Math.max(0, list.findIndex(x => x.id === m?.[2]));
  if (!isAvailable(board, list[mission], passedKeys())) {   // a mission that is still closed: start at the workshop tour instead
    mission = 0;
    if (!home) history.replaceState(null, '', `#${board}-${list[0].id}`);
  }
  serialBuf = '';
  set(s => ({ home, board, mission, hot: null, serial: '', errLine: null, tool: null, pending: null, point: null, notice: null, results: null, asking: null, checking: false, drag: null, panels: home || isPhone() ? s.panels : openPanelIn(s.panels, 'brief', isNarrow()) }));   // a new mission opens its brief, except on a phone where it would cover the bench
  syncInputs();
}

/** Gives every part with an on-screen control a value, and drops the values of parts that are gone. */
function syncInputs() {
  const s = get(), inputs: Record<string, number> = {};
  benchOf(s).forEach((it, k) => { if ('ctl' in it) inputs[itemId(it, k)] = s.inputs[itemId(it, k)] ?? defaultInput(it); });
  set({ inputs });
}
export const goTo = (board: BoardId, missionId: string) => { location.hash = `${board}-${missionId}`; };

/* --- editing the bench --- */
const HISTORY = 60;
/** Replaces the bench with a new one, remembering the old one for undo, and says so if the new one is a short circuit. */
function change(items: Item[], burnt = burntOf(get())) {
  const s = get(), key = keyOf(s), before = { items: benchOf(s), burnt: burntOf(s) };
  stopRun(); forgetRun();
  const benches = { ...s.benches, [key]: items }, burntAll = { ...s.burnt, [key]: burnt };
  saveBenches(benches, burntAll);
  set({
    benches, burnt: burntAll,
    undo: { ...s.undo, [key]: [...(s.undo[key] ?? []).slice(-HISTORY), before] }, redo: { ...s.redo, [key]: [] }, results: null,
  });
  syncInputs();
  const short = analyze(s.board, items).issues.find(i => i.kind === 'short');
  if (short) { set(st => ({ sparks: st.sparks + 1 })); say('error', `${short.title}! ${short.plain}`, 0); }
  else if (get().notice?.tone === 'error') dismissNotice();
}
function restore(from: 'undo' | 'redo') {
  const s = get(), key = keyOf(s), stack = s[from][key];
  if (!stack?.length) return;
  const snap = stack[stack.length - 1], other = from === 'undo' ? 'redo' : 'undo', here = { items: benchOf(s), burnt: burntOf(s) };
  stopRun(); forgetRun();
  const benches = { ...s.benches, [key]: snap.items }, burnt = { ...s.burnt, [key]: snap.burnt };
  saveBenches(benches, burnt);
  const stacks = { undo: s.undo, redo: s.redo };
  stacks[from] = { ...s[from], [key]: stack.slice(0, -1) };
  stacks[other] = { ...s[other], [key]: [...(s[other][key] ?? []), here] };
  set({ benches, burnt, ...stacks, results: null });
  syncInputs();
  dismissNotice();
}
export const undo = () => restore('undo');
export const redo = () => restore('redo');
export function resetBench() {
  if (!benchOf(get()).length && !burntOf(get()).length) return;
  change([], []); set({ hot: null, tool: null, pending: null });
  say('info', 'The bench is clear. Undo brings the circuit back.', 5000);
}
/** Builds the mission's reference circuit. Only offered with the last hint. */
export function showAnswer() {
  change(missionOf(get()).circuit.map(it => ({ ...it })), []); set({ hot: null, tool: null, pending: null });
  say('info', 'This is the mission\'s reference circuit. Undo puts your own back.', 6000);
}
export function removeItem(id: string) {
  const bench = benchOf(get());
  change(bench.filter((it, k) => itemId(it, k) !== id), burntOf(get()).filter(b => b !== id));
  set({ hot: null });
}
export function flipItem(id: string) {
  change(benchOf(get()).map((it, k) => (itemId(it, k) === id ? flipped(it) : it)));
}
const addItem = (it: Item) => change([...benchOf(get()), it]);

/* --- moving the end of a wire --- */
const wireEnds = (name: string) => {
  const found: { id: string; end: 'a' | 'b' }[] = [];
  benchOf(get()).forEach((it, k) => { if (it.t === 'wire') for (const end of ['a', 'b'] as const) if (it[end] === name) found.push({ id: itemId(it, k), end }); });
  return found;
};
/** Is a wire plugged into this point? */
export const isWireEnd = (name: string) => wireEnds(name).length > 0;
/** The pointer went down on a wire end: it now follows the pointer. Returns true when there was a wire end to take hold of. */
export function beginMove(name: string): boolean {
  const e = wireEnds(name)[0];
  if (!e) return false;
  set({ drag: { ...e, to: name }, pending: null });
  return true;
}
export const moveTo = (to: string | null) => set(s => (s.drag && s.drag.to !== to ? { drag: { ...s.drag, to } } : {}));
/** The pointer came up: plug the wire end into the point it is over, if that is allowed. */
export function finishMove(to: string | null) {
  const d = get().drag, bench = benchOf(get());
  set({ drag: null });
  if (!d || !to) return;
  const r = movedWire(get().board, bench, d.id, d.end, to);
  if ('error' in r) { say('warn', r.error, 6000); return; }
  if (r.items !== bench) { change(r.items); set({ hot: d.id }); }
}
/** The keyboard way: type where each end of the selected wire should go. */
export function moveWireTyped(id: string, aText: string, bText: string): string | null {
  const s = get(), bench = benchOf(s);
  let items = bench;
  for (const [end, text] of [['a', aText], ['b', bText]] as const) {
    const to = parseTerminal(s.board, text, bench);
    if (!to) return `"${text}" is not a place on this bench. Holes look like e10, rails like T+5, pins like 13 or gnd.`;
    const r = movedWire(s.board, items, id, end, to);
    if ('error' in r) return r.error;
    items = r.items;
  }
  if (items !== bench) change(items);
  return null;
}

/* --- choosing and placing parts --- */
/** The tray part a tool belongs to. */
const partOf = (tool: Tool): PartId | undefined =>
  (Object.keys(PARTS) as PartId[]).find(id => { const t = PARTS[id].tool; return t.kind === tool.kind && t.color === tool.color && t.ohms === tool.ohms; });

export function pickTool(tool: Tool | null) {
  const part = tool && partOf(tool);
  if (part && !unlockedParts(Object.keys(get().passed)).has(part)) {   // a part that no mission has unlocked yet
    const by = lockedBy(part);
    say('info', `The ${PARTS[part].label} is locked.${by ? ` Pass the mission “${by.mission.title}” to unlock it.` : ''}`, 6000);
    return;
  }
  const same = tool && get().tool?.kind === tool.kind && get().tool?.color === tool.color && get().tool?.ohms === tool.ohms;
  if (!tool || same) { set({ tool: null, pending: null, point: null }); return; }
  set({ tool, pending: null, hot: null });
  if (tool.kind === 'pad') {
    const it = makeItem(tool, benchOf(get()), 'PAD');
    const err = placementError(get().board, benchOf(get()), it);
    if (err) say('warn', err, 6000); else addItem(it);
    set({ tool: null });
  } else dismissNotice();
}
export const cancelTool = () => set({ tool: null, pending: null });
export const setPoint = (point: string | null) => { if (get().point !== point) set({ point }); };

let dragging = false;
function finishTwo(a: string, b: string) {
  const s = get(), tool = s.tool!, it = makeItem(tool, benchOf(s), a, b), err = placementError(s.board, benchOf(s), it);
  set({ pending: null });
  if (err) say('warn', err, 6000); else { dismissNotice(); addItem(it); }
}
/** The pointer went down on a connection point (or on nothing). Returns true when the press belongs to the placing tool, so the camera should not move. */
export function pressPoint(name: string | null): boolean {
  const { tool, pending } = get();
  if (!tool || !name) return false;
  if (TWO_POINT.includes(tool.kind)) {
    if (pending && pending !== name) { finishTwo(pending, name); return true; }
    const probe = firstPointError(name);
    if (probe) { say('warn', probe, 6000); return true; }
    set({ pending: name }); dragging = true;
    return true;
  }
  const it = makeItem(tool, benchOf(get()), name), err = placementError(get().board, benchOf(get()), it);
  if (err) say('warn', err, 6000); else { dismissNotice(); addItem(it); }
  return true;
}
/** The pointer came up. A drag from one point to another places the part; a click on one point keeps it waiting for the second. */
export function releasePoint(name: string | null) {
  if (!dragging) return;
  dragging = false;
  const { pending } = get();
  if (!pending) return;
  if (name && name !== pending) finishTwo(pending, name);
  else if (!name) set({ pending: null });
}
function firstPointError(name: string): string | null {
  const s = get(), tool = s.tool!;
  if (benchOf(s).flatMap(holesOf).includes(name)) return `${name} is already taken. Each hole holds one leg or wire end.`;
  if (tool.kind !== 'wire' && !/^[a-j]\d+$|^[TB][+-]\d+$/.test(name)) return 'Parts go into the breadboard. Use a wire to reach a board pin.';
  return null;
}
/** Places a part from typed point names, the keyboard way: "e10 e11" for an LED, "d24" for a knob. */
export function placeTyped(text: string): string | null {
  const s = get(), tool = s.tool;
  if (!tool) return 'Choose a part first.';
  const words = text.split(/[\s,]+/).filter(Boolean), want = TWO_POINT.includes(tool.kind) ? 2 : tool.kind === 'pad' ? 0 : 1;
  if (words.length !== want) return want === 2 ? 'Type two points, such as e10 e11.' : 'Type one hole, such as d24.';
  const pts = words.map(w => parseTerminal(s.board, w, benchOf(s)));
  const bad = pts.findIndex(p => !p);
  if (bad >= 0 && s.board === 'esp32' && /^[a-j]([1-9]|1d|2[01])$/i.test(words[bad])) return 'That spot is under the ESP32. Use the free holes on the right (columns 22 to 30), or its pins such as d5 and gnd.';
  if (bad >= 0) return `"${words[bad]}" is not a place on this bench. Holes look like e10, rails like T+5, pins like 13 or gnd.`;
  const it = makeItem(tool, benchOf(s), pts[0]!, pts[1] ?? undefined), err = placementError(s.board, benchOf(s), it);
  if (err) return err;
  addItem(it); set({ pending: null });
  return null;
}

/* --- everything else --- */
export const setTab = (tab: Tab) => set({ tab });
/** Selects a part, or clears the selection when it is already selected or id is null. */
export const selectHot = (id: string | null) => set(s => ({ hot: id && id !== s.hot ? id : null }));
export const setInput = (id: string, value: number) => set(s => ({ inputs: { ...s.inputs, [id]: value } }));
export const editCode = (code: string) => set(s => ({ edits: { ...s.edits, [keyOf(s)]: code }, errLine: null, results: null }));
export function resetCode() {
  stopRun();
  set(s => { const edits = { ...s.edits }; delete edits[keyOf(s)]; return { edits, errLine: null, results: null }; });
}
export const setNav = (nav: 'pan' | 'rotate') => set({ nav });
export const toggleLabels = () => set(s => ({ labels: !s.labels }));
export function toggleSound() {
  set(s => ({ sound: !s.sound }));
  if (get().sound) ensureAudio();
}

/* --- missions: predicting, checking, hints and progress --- */

/** The Run and Step buttons come here. Before the first run of a mission, the student is asked what they expect to see. */
export function requestRun(stepFirst = false) {
  const s = get(), m = missionOf(s);
  const short = analyze(s.board, benchOf(s)).issues.some(i => i.kind === 'short');   // a short circuit cannot run anyway: let the run say so
  if (!m.predict || m.sandbox || s.predictions[keyOf(s)] || short) { startRun(stepFirst); return; }
  set({ asking: { step: stepFirst } });
}
export const cancelPrediction = () => set({ asking: null });

/** The student has picked what they think will happen. Play the sketch on the quiet, compare, then run it for real. */
export async function submitPrediction(picked: string) {
  const s = get(), m = missionOf(s), p = m.predict, key = keyOf(s), step = s.asking?.step ?? false;
  set({ asking: null });
  if (!p) { startRun(step); return; }
  const tr = await observe(s.board, benchOf(s), codeOf(s), p.demo, p.run);
  if (keyOf(get()) !== key) return;   // the student moved to another mission meanwhile
  if (tr.error || tr.timedOut || tr.shorted) {   // there is nothing to compare yet: let the run itself show what is wrong
    say('warn', 'Your sketch ran into a problem, so there is nothing to compare with your prediction yet. The Serial Monitor shows what went wrong. Fix it and press Run again.', 0);
    startRun(step);
    return;
  }
  const actual = p.classify(tr), right = picked === actual, name = (id: string) => p.options.find(o => o.id === id)?.label ?? id;
  set(st => ({ predictions: { ...st.predictions, [key]: { picked, actual, right } } }));
  saveMissionProgress();
  say(right ? 'info' : 'warn', `${right ? 'Your prediction was right.' : `Not quite. You predicted “${name(picked)}”. What happened: “${name(actual)}”.`} ${p.explain[actual] ?? ''}`, 0);
  startRun(step);
}

/** Runs the mission's checks on the student's own build and sketch. The mission is passed only when every one of them passes. */
export async function checkMission() {
  const s = get(), m = missionOf(s), key = keyOf(s), bench = benchOf(s), code = codeOf(s);
  if (m.sandbox || s.checking) return;
  set({ checking: true, results: null });
  const results = await runChecks(s.board, bench, code, m.checks);
  const now = get();
  if (keyOf(now) !== key || benchOf(now) !== bench || codeOf(now) !== code) { set({ checking: false }); return; }   // something changed while the checks ran
  set({ checking: false, results });
  if (results.every(r => r.pass)) passMission();
}

function passMission() {
  const s = get(), m = missionOf(s), key = keyOf(s), before = passedKeys();
  if (s.passed[key]) { say('info', `Still passing: ${m.title}.`, 6000); return; }
  const guess = s.predictions[key];
  set(st => ({ passed: { ...st.passed, [key]: { at: Date.now(), hints: st.hintsUsed[key] ?? 0, predicted: guess ? (guess.right ? 'right' : 'wrong') : 'skipped' } } }));
  saveMissionProgress();
  const after = passedKeys(), had = unlockedParts(before), have = unlockedParts(after);
  const parts = [...have].filter(id => !had.has(id)).map(id => PARTS[id].label);
  const opened = MISSIONS[s.board].filter(x => !isAvailable(s.board, x, before) && isAvailable(s.board, x, after)).map(x => x.title);
  say('info', [`Mission complete: ${m.title}.`, parts.length ? `New in the tray: ${parts.join(', ')}.` : '', opened.length ? `Now open on the map: ${opened.join(', ')}.` : ''].filter(Boolean).join(' '), 0);
}

/** Opens the next of the three hints: a nudge, then the idea, then the answer. */
export function revealHint() {
  const key = keyOf(get()), n = get().hintsUsed[key] ?? 0;
  if (n >= 3) return;
  set(st => ({ hintsUsed: { ...st.hintsUsed, [key]: n + 1 } }));
  saveMissionProgress();
}
/** Puts the mission's reference sketch in the editor. Only offered with the last hint. */
export function fillAnswerCode() {
  set(s => ({ edits: { ...s.edits, [keyOf(s)]: missionOf(s).answer }, errLine: null, results: null }));
}

/* --- panels over the bench --- */
/** Narrow screens show one panel at a time. */
const isNarrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 1100px)').matches;
const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches;

/** Puts the keyboard focus back on the button that opens a panel, once it has closed. */
function focusToggle(name: Panel) {
  requestAnimationFrame(() => {
    const buttons = [...document.querySelectorAll<HTMLElement>(`[data-toggle="${name}"]`)];
    (buttons.find(b => b.offsetParent !== null) ?? buttons[0])?.focus();
  });
}
export function openPanel(name: Panel) {
  set(s => ({ panels: openPanelIn(s.panels, name, isNarrow()), focusPanel: { name, n: (s.focusPanel?.n ?? 0) + 1 } }));
}
export function closePanel(name: Panel) {
  set(s => ({ panels: closePanelIn(s.panels, name) }));
  focusToggle(name);
}
export function togglePanel(name: Panel) { if (isOpen(get().panels, name)) closePanel(name); else openPanel(name); }
/** Escape: closes the panel opened last. Says whether there was one. */
export function escapePanel(): boolean {
  const { panels } = get(), next = closeTop(panels);
  if (next === panels) return false;
  const name = (panels.last && isOpen(panels, panels.last) ? panels.last : panels.right ?? panels.left) as Panel;
  set({ panels: next });
  focusToggle(name);
  return true;
}
export const setHelp = (help: boolean) => set({ help });
