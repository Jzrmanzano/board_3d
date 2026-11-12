/* Runs every lesson's starter sketch on the virtual board and checks what the pins do. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOARDS } from '../src/data/boards';
import { OLD_LESSONS, oldLesson } from './fixtures-lessons';
import { makeHW } from '../src/sim/hardware';
import { run, SimError } from '../src/sim/interpreter';
import type { BoardId } from '../src/types';

/** Runs a sketch for a few passes of loop() with delays skipped, and returns the board state and serial text. */
async function play(boardId: BoardId, lessonId: string, inputs: Record<string, number> = {}, opts: { code?: string; loops?: number; each?: (pass: number) => void } = {}) {
  const board = BOARDS[boardId], lesson = oldLesson(boardId, lessonId);
  let serial = '', pass = 0;
  const hw = makeHW(board, lesson.circuit, () => inputs, s => { serial += s; });
  hw.sleep = () => new Promise<void>(r => setTimeout(r, 0));
  const ctl = { stop: false, onLoop() { pass++; opts.each?.(pass); if (pass >= (opts.loops ?? 3)) ctl.stop = true; } };
  await run(opts.code ?? lesson.code, hw, ctl);
  return { hw, serial };
}

for (const board of Object.values(BOARDS)) {
  for (const lesson of OLD_LESSONS[board.id]) {
    test(`${board.id}/${lesson.id} starter sketch runs`, async () => {
      const inputs: Record<string, number> = {};
      for (const it of lesson.circuit) if ('ctl' in it) inputs[it.id] = it.t === 'pot' ? 0.5 : it.t === 'sonar' ? 30 : 0;
      await play(board.id, lesson.id, inputs);
    });
  }
}

test('blink ends each pass with the LED off', async () => {
  const seen: number[] = [];
  const code = oldLesson('uno', 'blink').code.replace('delay(1000);\n}', 'delay(1000);\n  Serial.println(digitalRead(LED_PIN));\n}');
  const { serial } = await play('uno', 'blink', {}, { code });
  serial.trim().split('\n').forEach(v => seen.push(+v));
  assert.deepEqual(seen, [0, 0, 0]);
});

test('hello message reaches the serial monitor', async () => {
  assert.match((await play('uno', 'meet')).serial, /^Hello from the Uno!\n/);
  assert.match((await play('esp32', 'meet')).serial, /^Hello from the ESP32!\n/);
});

test('button lights the LED only while pressed', async () => {
  assert.equal((await play('uno', 'button', { btn: 1 })).hw.glow(13), 1);
  assert.equal((await play('uno', 'button', { btn: 0 })).hw.glow(13), 0);
});

test('knob sets brightness on both boards', async () => {
  const uno = await play('uno', 'knob', { pot: 1 });
  assert.equal(uno.hw.glow(9), 1);
  assert.match(uno.serial, /knob = 1023 {3}brightness = 255/);
  const esp = await play('esp32', 'knob', { pot: 1 });
  assert.match(esp.serial, /4095 {3}3\.30 V/);
  assert.ok(Math.abs(esp.hw.glow(5) - 1) < 0.01);
  assert.equal((await play('uno', 'knob', { pot: 0 })).hw.glow(9), 0);
});

test('moving a wire without changing the code leaves the LED dark', async () => {
  const code = oldLesson('uno', 'blink').code.replace('LED_PIN = 13', 'LED_PIN = 12').replace('digitalWrite(LED_PIN, LOW);', '');
  assert.equal((await play('uno', 'blink', {}, { code })).hw.glow(13), 0);
});

test('distance alarm trips under 20 cm', async () => {
  const near = await play('uno', 'distance', { sonar: 10 });
  assert.equal(near.hw.glow(13), 1);
  assert.match(near.serial, /^(9|10)\.\d\d cm\n/);
  assert.equal((await play('uno', 'distance', { sonar: 60 })).hw.glow(13), 0);
});

test('ESP32 button toggles on each press', async () => {
  const inputs = { btn: 0 };
  const { hw, serial } = await play('esp32', 'button', inputs, { loops: 6, each: pass => { inputs.btn = pass % 2; } });
  assert.equal(serial, 'LED on\nLED off\nLED on\n');
  assert.equal(hw.glow(5), 1);
});

test('touch pad lights the LED', async () => {
  assert.equal((await play('esp32', 'touch', { pad: 1 })).hw.glow(5), 1);
  assert.equal((await play('esp32', 'touch', { pad: 0 })).hw.glow(5), 0);
});

test('buzzer plays the scale and the siren', async () => {
  const uno = await play('uno', 'sound', {}, { loops: 1 });
  assert.equal(uno.serial, '262\n294\n330\n349\n392\n440\n494\n523\n');
  assert.equal(uno.hw.tones[8], 0);
  assert.equal((await play('esp32', 'sound', {}, { loops: 1 })).hw.tones[18], 400);
});

test('mistakes are reported with their line number', async () => {
  const bad = (code: string) => assert.rejects(play('uno', 'meet', {}, { code }), (e: unknown) => e instanceof SimError && e.line === 2);
  await bad('void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}');
  await bad('void setup() {\n  digitalWrit(13, HIGH);\n}\nvoid loop() {}');
  await bad('void setup() {\n  x = 5;\n}\nvoid loop() {}');
  await bad('void setup() {}\nvoid loop() { int a[2]; a[5] = 1; }');
  await bad('void setup() {\n  int n = 1 / 0;\n}\nvoid loop() {}');
});

test('language features: floats, strings, arrays, functions, loops', async () => {
  const code = String.raw`#define N 3
int total(int v[], int n) { int s = 0; for (int i = 0; i < n; i++) s += v[i]; return s; }
float half(float x) { return x / 2; }
String name = "pin";
int vals[] = {1, 2, 3};
void setup() {
  Serial.println(total(vals, N));
  Serial.println(half(5));
  Serial.println(7 / 2);
  Serial.println(name + " " + String(13));
  int i = 0;
  while (true) { i++; if (i < 3) continue; break; }
  do { i--; } while (i > 0);
  Serial.println(i == 0 ? "done" : "not done");
  Serial.println(3.14159, 3);
  Serial.println((int)2.9 + (5 % 3) + (1 << 3));
}
void loop() {}`;
  assert.equal((await play('uno', 'meet', {}, { code, loops: 1 })).serial, '6\n2.50\n3\npin 13\ndone\n3.142\n12\n');
});
