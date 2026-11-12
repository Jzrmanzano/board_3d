/* The mission check engine: runs the student's own sketch on the student's own circuit, with scripted inputs, on a virtual clock. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blinks, observe, phases, runChecks } from '../src/sim/check';
import type { Item } from '../src/types';
import { oldLesson } from './fixtures-lessons';

const GOOD: Item[] = [
  { t: 'wire', id: 'in', a: 'U:13', b: 'a10', c: 'orange' },
  { t: 'led', id: 'led', a: 'e10', k: 'e11', color: 0xff3b30 },
  { t: 'res', a: 'c11', b: 'c15' },
  { t: 'wire', id: 'out', a: 'a15', b: 'U:GND2', c: 'black' },
];
const BLINK = oldLesson('uno', 'blink').code;
const button = oldLesson('uno', 'button');
const follows = phases('The LED follows the button', [
  { when: 'the button is not pressed', set: { button: 0 }, expect: { led: false } },
  { when: 'the button is held down', set: { button: 1 }, expect: { led: true } },
  { when: 'the button is let go again', set: { button: 0 }, expect: { led: false } },
]);

test('a sketch that follows the input passes, and the wiring check comes first', async () => {
  const r = await runChecks('uno', button.circuit, button.code, [follows]);
  assert.equal(r.length, 2);
  assert.match(r[0].label, /wiring/i);
  assert.deepEqual(r.map(x => x.pass), [true, true], JSON.stringify(r));
});

test('a sketch that ignores the input fails, and says what was expected when', async () => {
  const stuckOn = 'void setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); } void loop() {}';
  const r = await runChecks('uno', button.circuit, stuckOn, [follows]);
  assert.equal(r[1].pass, false);
  assert.match(r[1].detail, /the button is not pressed/i);
  assert.match(r[1].detail, /LED should be off/i);
});

test('inputs reach the sketch at the time the plan says', async () => {
  const knob = oldLesson('uno', 'knob'), code = 'void setup() { Serial.begin(9600); } void loop() { Serial.println(analogRead(A0)); delay(100); }';
  const plan = [{ from: 0, set: { pot: 0 } }, { from: 1000, set: { pot: 1 } }];
  const tr = await observe('uno', knob.circuit, code, plan, 2000);
  assert.match(tr.at(900).serial.trim().split('\n').pop()!, /^0$/);
  assert.match(tr.at(1900).serial.trim().split('\n').pop()!, /^1023$/);
});

test('a run is repeatable and does not wait in real time', async () => {
  const before = performance.now();
  const a = await observe('uno', GOOD, BLINK, [], 8000), b = await observe('uno', GOOD, BLINK, [], 8000);
  assert.ok(performance.now() - before < 1500, 'sixteen sketch-seconds in well under two real seconds');
  assert.deepEqual(a.samples.map(s => [s.t, s.leds]), b.samples.map(s => [s.t, s.leds]));
});

test('a sketch that never waits is stopped and the student is told why', async () => {
  const spin = 'void setup() {} void loop() { int x = 0; while (true) { x++; } }';
  const r = await runChecks('uno', GOOD, spin, [follows]);
  assert.equal(r[1].pass, false);
  assert.match(r[1].detail, /never|delay|waits/i);
});

test('a mistake in the sketch is reported with its line', async () => {
  const bad = 'void setup() {\n  digitalWrit(13, HIGH);\n}\nvoid loop() {}';
  const r = await runChecks('uno', GOOD, bad, [follows]);
  assert.equal(r[1].pass, false);
  assert.match(r[1].detail, /line 2/);
});

test('an LED that burns out during the checks fails them and the reason is given', async () => {
  const noRes = GOOD.filter(it => it.t !== 'res').concat({ t: 'wire', a: 'c11', b: 'c15', c: 'white' });
  const r = await runChecks('uno', noRes, BLINK, [blinks('The LED blinks', 'led')]);
  assert.equal(r[0].pass, false, 'the wiring check already sees the missing resistor');
  assert.match(r[0].detail, /resistor/i);
  assert.equal(r[1].pass, false);
  assert.match(r[1].detail, /burn/i);
});

test('a short circuit fails the wiring check, and the sketch checks say to fix it first', async () => {
  const short: Item[] = [...GOOD, { t: 'wire', a: 'U:5V', b: 'T+1', c: 'red' }, { t: 'wire', a: 'U:GND', b: 'T-1', c: 'black' }, { t: 'wire', a: 'T+9', b: 'T-9', c: 'yellow' }];
  const r = await runChecks('uno', short, BLINK, [blinks('The LED blinks', 'led')]);
  assert.equal(r[0].pass, false);
  assert.match(r[0].detail, /short/i);
  assert.match(r[1].detail, /short/i);
});

test('blinking: a steady one-second blink passes; a flicker, a slow blink and a steady light do not', async () => {
  const sketch = (on: number, off: number) => `void setup() { pinMode(13, OUTPUT); } void loop() { digitalWrite(13, HIGH); delay(${on}); digitalWrite(13, LOW); delay(${off}); }`;
  const check = blinks('The LED blinks about once a second', 'led');
  const verdict = async (code: string) => (await runChecks('uno', GOOD, code, [check]))[1];
  assert.equal((await verdict(sketch(1000, 1000))).pass, true);
  assert.equal((await verdict(sketch(500, 500))).pass, true);
  const flicker = await verdict(sketch(30, 30));
  assert.equal(flicker.pass, false); assert.match(flicker.detail, /too fast|flicker/i);
  const slow = await verdict(sketch(5000, 5000));
  assert.equal(slow.pass, false);
  const steady = await verdict('void setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); } void loop() {}');
  assert.equal(steady.pass, false); assert.match(steady.detail, /never turns off|stays on/i);
  const dark = await verdict('void setup() {} void loop() {}');
  assert.equal(dark.pass, false); assert.match(dark.detail, /never turns on|stays off|dark/i);
});

test("the board's own LED can be judged on an empty bench", async () => {
  const meet = oldLesson('uno', 'meet');
  const r = await runChecks('uno', [], meet.code, [blinks('The on-board LED blinks', 'builtin')], { wiring: false });
  assert.deepEqual(r.map(x => x.pass), [true], JSON.stringify(r));
});

test('with no LED on the bench the checks fail politely', async () => {
  const r = await runChecks('uno', [], BLINK, [follows]);
  assert.equal(r[1].pass, false);
  assert.match(r[1].detail, /could not find an LED/i);
});

test('sound and serial output can be expected too', async () => {
  const buzz: Item[] = [{ t: 'buzzer', id: 'bz', a: 'e20', b: 'e23' }, { t: 'wire', a: 'U:8', b: 'a20', c: 'purple' }, { t: 'wire', a: 'a23', b: 'U:GND', c: 'black' }];
  const code = 'void setup() { Serial.begin(9600); tone(8, 440); Serial.println("beep"); } void loop() {}';
  const r = await runChecks('uno', buzz, code, [phases('It beeps', [{ when: 'the sketch starts', expect: { sound: true, serial: /beep/ } }])]);
  assert.deepEqual(r.map(x => x.pass), [true, true], JSON.stringify(r));
  const quiet = await runChecks('uno', buzz, 'void setup() {} void loop() {}', [phases('It beeps', [{ when: 'the sketch starts', expect: { sound: true } }])]);
  assert.match(quiet[1].detail, /silent|sound/i);
});

test('brightness can be judged by how much of the time the LED is driven', async () => {
  const knob = oldLesson('uno', 'knob');
  const dim = phases('Brightness follows the knob', [
    { when: 'the knob is turned down low', set: { pot: 0.2 }, expect: { duty: [0.05, 0.3] } },
    { when: 'the knob is turned all the way up', set: { pot: 1 }, expect: { duty: [0.9, 1] } },
  ]);
  const r = await runChecks('uno', knob.circuit, knob.code, [dim]);
  assert.deepEqual(r.map(x => x.pass), [true, true], JSON.stringify(r));
  const onOff = 'void setup() { pinMode(9, OUTPUT); } void loop() { digitalWrite(9, analogRead(A0) > 500 ? HIGH : LOW); delay(20); }';
  const bad = await runChecks('uno', knob.circuit, onOff, [dim]);
  assert.equal(bad[1].pass, false);
  assert.match(bad[1].detail, /knob is turned down low/i);
});
