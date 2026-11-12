/* Phase 2: seeing inside the circuit. Current in each wire, stepping through a sketch one line at a time, and replaying earlier moments. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOARDS } from '../src/data/boards';
import { analyze, type Drive } from '../src/sim/circuit';
import { makeHW, makeReadout } from '../src/sim/hardware';
import { run, type RunControl } from '../src/sim/interpreter';
import type { Frame } from '../src/sim/timeline';
import { frameAt, pushFrame, trace } from '../src/sim/timeline';
import type { Item } from '../src/types';

const HIGH: Drive = { mode: 'out', level: 1 }, LOW: Drive = { mode: 'out', level: 0 };
const near = (a: number, b: number, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

const GOOD: Item[] = [
  { t: 'wire', id: 'in', a: 'U:13', b: 'a10', c: 'orange' },
  { t: 'led', id: 'led', a: 'e10', k: 'e11', color: 0xff3b30 },
  { t: 'res', a: 'c11', b: 'c15' },
  { t: 'wire', id: 'out', a: 'a15', b: 'U:GND2', c: 'black' },
];

test('the same current flows out of the pin, through the LED and back into GND', () => {
  const s = analyze('uno', GOOD).solve({ 13: HIGH });
  const led = s.ledAmps('led');
  assert.ok(led > 0.008);
  near(s.wireAmps('in'), led);      // from the pin into the board, a to b
  near(s.wireAmps('out'), led);     // from the board into the GND pin, a to b
  near(s.pinAmps(13), led);
});

test('wire current changes sign when the wire is drawn the other way round', () => {
  const flipped = GOOD.map(it => (it.t === 'wire' && it.id === 'in' ? { ...it, a: it.b, b: it.a } : it));
  const s = analyze('uno', flipped).solve({ 13: HIGH });
  near(s.wireAmps('in'), -s.ledAmps('led'));
});

test('no current flows when the pin is low', () => {
  const s = analyze('uno', GOOD).solve({ 13: LOW });
  near(s.wireAmps('in'), 0, 1e-6);
  near(s.wireAmps('out'), 0, 1e-6);
});

test('current splits between two branches and joins again', () => {
  const split: Item[] = [
    { t: 'wire', id: 'feed', a: 'U:13', b: 'a10', c: 'orange' },
    { t: 'res', id: 'r1', a: 'b10', b: 'b15', ohms: 220 }, { t: 'res', id: 'r2', a: 'c10', b: 'c16', ohms: 1000 },
    { t: 'wire', id: 'w1', a: 'a15', b: 'T-1', c: 'black' }, { t: 'wire', id: 'w2', a: 'a16', b: 'T-2', c: 'black' },
    { t: 'wire', id: 'back', a: 'U:GND', b: 'T-3', c: 'black' },
  ];
  const s = analyze('uno', split).solve({ 13: HIGH });
  const total = s.wireAmps('feed');
  near(s.wireAmps('w1') + s.wireAmps('w2'), total, 1e-6);
  near(s.wireAmps('back'), -total, 1e-6);          // drawn from the rail to the pin, so it runs b to a
  assert.ok(s.wireAmps('w1') > 4 * s.wireAmps('w2'), 'the 220 ohm branch takes the most current');
  near(s.wireAmps('w2'), (total * 220) / (220 + 1000), 1e-4);
});

test('the voltage at each point follows the circuit', () => {
  const s = analyze('uno', GOOD).solve({ 13: HIGH });
  assert.ok(s.volt('U:13') > 4.6 && s.volt('U:13') < 5, 'the pin sags a little under load');
  near(s.volt('a10'), s.volt('U:13'), 1e-9);       // a wire has no drop
  assert.ok(s.volt('e11') < s.volt('e10') - 1.8, 'about 1.9 V is used up by the LED');
  near(s.volt('a15'), 0, 0.01);
});

/* --- stepping --- */
const SKETCH = `void setup() {
  pinMode(13, OUTPUT);
  digitalWrite(13, HIGH);
  delay(500);
}
void loop() {
  digitalWrite(13, LOW);
  delay(500);
}`;

function bench(items: Item[] = GOOD) {
  const hw = makeHW(BOARDS.uno, items, () => ({}), () => {});
  hw.skipDelays = true;
  return hw;
}

test('step mode reports each statement line once, in order, and skips the braces', async () => {
  const hw = bench(), lines: number[] = [];
  let pass = 0;
  const ctl: RunControl = { stop: false, step: line => { lines.push(line); }, onLoop() { if (++pass === 2) ctl.stop = true; } };
  await run(SKETCH, hw, ctl);
  assert.deepEqual(lines, [2, 3, 4, 7, 8, 7, 8]);
});

test('a step that waits holds the sketch before the line runs', async () => {
  const hw = bench();
  let release: (() => void) | null = null, atLine3: number | undefined;
  let pass = 0;
  const ctl: RunControl = {
    stop: false,
    step: line => { if (line !== 3) return; atLine3 = hw.snapshot().drive[13]?.level; return new Promise<void>(r => { release = r; }); },
    onLoop() { if (++pass === 1) ctl.stop = true; },
  };
  const done = run(SKETCH, hw, ctl);
  await new Promise(r => setTimeout(r, 30));
  assert.ok(release, 'the sketch is waiting at line 3');
  assert.equal(atLine3, 0, 'digitalWrite on line 3 has not run yet');
  assert.equal(hw.snapshot().drive[13]?.level, 0);
  (release as () => void)();
  await done;
  assert.equal(hw.snapshot().drive[13]?.level, 0, 'loop() has since written LOW');
});

test('skipped delays advance the clock without waiting', async () => {
  const hw = bench();
  const before = performance.now();
  let pass = 0;
  const ctl: RunControl = { stop: false, onLoop() { if (++pass === 2) ctl.stop = true; } };
  await run(SKETCH, hw, ctl);
  assert.ok(performance.now() - before < 300, 'no real waiting');
  assert.ok(hw.now() >= 1500, `the sketch clock is ${hw.now()} ms`);
});

/* --- the timeline --- */
async function recorded(items: Item[] = GOOD) {
  const hw = bench(items), frames: Frame[] = [];
  let pass = 0;
  const ctl: RunControl = { stop: false, step: line => { hw.line = line; pushFrame(frames, hw.snapshot()); }, onLoop() { if (++pass === 2) ctl.stop = true; } };
  await run(SKETCH, hw, ctl);
  return { hw, frames };
}

test('every step is recorded with its line and the time on the sketch clock', async () => {
  const { frames } = await recorded();
  assert.deepEqual(frames.map(f => f.line), [2, 3, 4, 7, 8, 7, 8]);
  assert.ok(frames.every((f, i) => i === 0 || f.t >= frames[i - 1].t), 'time never goes backwards');
  assert.ok(frames[4].t - frames[3].t < 1 && frames[5].t - frames[4].t >= 500, 'a delay shows up as time passing');
});

test('replaying an earlier frame shows the LED as it was then', async () => {
  const { frames } = await recorded();
  const at = (line: number, nth = 0) => frames.filter(f => f.line === line)[nth];
  const lit = (f: Frame) => makeReadout(BOARDS.uno, analyze('uno', GOOD), f).ledGlow('led');
  assert.equal(lit(at(3)), 0, 'before digitalWrite(HIGH)');
  assert.ok(lit(at(4)) > 0.9, 'after digitalWrite(HIGH), before the delay');
  assert.equal(lit(at(8)), 0, 'after digitalWrite(LOW)');
  assert.ok(lit(frames[3 - 1]) > 0.9);
});

test('a replayed frame also shows the current in the wires', async () => {
  const { frames } = await recorded();
  const on = makeReadout(BOARDS.uno, analyze('uno', GOOD), frames[2]);
  assert.ok(on.circuit.wireAmps('in') > 0.008);
  const off = makeReadout(BOARDS.uno, analyze('uno', GOOD), frames[4]);
  near(off.circuit.wireAmps('in'), 0, 1e-6);
});

test('a pin trace lists its level at every frame, and frames can be found by time', async () => {
  const { frames } = await recorded();
  assert.deepEqual(trace(frames, 13), [0, 0, 1, 1, 0, 0, 0].map(v => v), 'low, low, high after line 3, ...');
  assert.equal(frameAt(frames, 0), 0);
  assert.equal(frameAt(frames, 10_000), frames.length - 1);
});

test('identical neighbouring frames are not stored twice, and the list has a ceiling', () => {
  const f: Frame = { t: 0, line: 1, drive: {}, tones: {}, inputs: {} }, frames: Frame[] = [];
  pushFrame(frames, f); pushFrame(frames, { ...f });
  assert.equal(frames.length, 1);
  for (let i = 0; i < 5000; i++) pushFrame(frames, { ...f, line: i + 2, t: i });
  assert.ok(frames.length <= 1500);
  assert.equal(frames[frames.length - 1].line, 5001, 'the newest frames are the ones kept');
});

test('the readout of a running board matches the board', async () => {
  const hw = makeHW(BOARDS.uno, GOOD, () => ({}), () => {});
  await run('void setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); } void loop() {}', hw, { stop: false, onLoop() { this.stop = true; } });
  const r = hw.readout();
  assert.ok(r.ledGlow('led') > 0.9);
  assert.ok(r.builtinGlow > 0.9, 'the on-board LED shares pin 13');
  assert.ok(r.circuit.wireAmps('in') > 0.008);
});
