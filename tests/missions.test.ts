/* Every mission: the structure holds together, the intended solution passes its checks, and wrong solutions do not. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_PARTS, isAvailable, lockedBy, missionKey, MISSIONS, partIdOf, PARTS, unlockedParts, type Mission } from '../src/data/missions';
import { observe, runChecks } from '../src/sim/check';
import type { BoardId, Item } from '../src/types';

const BOARD_IDS: BoardId[] = ['uno', 'esp32'];
const all = BOARD_IDS.flatMap(board => MISSIONS[board].map(m => ({ board, m })));
const get = (board: BoardId, id: string): Mission => {
  const m = MISSIONS[board].find(x => x.id === id);
  assert.ok(m, `${board}/${id} exists`);
  return m;
};
const failures = (r: { label: string; pass: boolean; detail: string }[]) => r.filter(x => !x.pass).map(x => `${x.label}: ${x.detail}`);

test('every mission is complete and refers only to missions that come before it', () => {
  for (const board of BOARD_IDS) {
    const seen = new Set<string>();
    for (const m of MISSIONS[board]) {
      const where = `${board}/${m.id}`;
      assert.ok(!seen.has(m.id), `${where} has a unique id`);
      assert.ok(m.title && m.place && m.hook && m.story && m.goal, `${where} has its texts`);
      assert.equal(m.hints.length, 3, `${where} has a nudge, an idea and an answer`);
      assert.ok(m.hints.every(h => h.length > 20), `${where} hints say something`);
      assert.ok(m.map[0] >= 0 && m.map[0] <= 100 && m.map[1] >= 0 && m.map[1] <= 100, `${where} is on the map`);
      for (const a of m.after) assert.ok(seen.has(a), `${where} comes after ${a}, which exists earlier in the list`);
      if (m.sandbox) assert.equal(m.checks.length, 0, `${where} is free build, so it has no checks`);
      else {
        assert.ok(m.checks.length >= 2, `${where} has checks`);
        assert.ok(m.predict, `${where} asks for a prediction`);
        assert.ok(m.predict!.options.some(o => o.id === m.predict!.works), `${where} names the option that means it works`);
      }
      seen.add(m.id);
    }
  }
});

test('the parts every mission needs are unlocked by the missions before it', () => {
  for (const board of BOARD_IDS) {
    const byId = new Map(MISSIONS[board].map(m => [m.id, m]));
    for (const m of MISSIONS[board]) {
      if (m.sandbox) continue;
      const before = new Set<string>(), walk = (id: string) => { if (before.has(id)) return; before.add(id); byId.get(id)!.after.forEach(walk); };
      m.after.forEach(walk);
      const have = unlockedParts([...before].map(id => missionKey(board, id)));
      for (const it of m.circuit) {
        const part = partIdOf(it);
        assert.ok(have.has(part), `${board}/${m.id} uses ${part}, which nothing before it unlocks`);
      }
    }
  }
});

test('passing missions unlocks their parts, one mission at a time', () => {
  assert.deepEqual([...unlockedParts([])].sort(), [...BASE_PARTS].sort());
  const after = unlockedParts([missionKey('uno', 'beacon')]);
  for (const p of get('uno', 'beacon').unlocks) assert.ok(after.has(p));
  assert.ok(after.size > BASE_PARTS.length);
  assert.equal(lockedBy('knob')?.mission.id, 'beacon');
  assert.equal(lockedBy('wire'), null, 'a part that starts unlocked is not locked by anything');
  for (const id of Object.keys(PARTS)) assert.ok(BASE_PARTS.includes(id as never) || lockedBy(id as never), `${id} is unlocked by some mission`);
});

test('a mission opens when the ones before it are passed, and the workshop opens after the first pass', () => {
  const nothing = new Set<string>();
  assert.equal(isAvailable('uno', get('uno', 'tour'), nothing), true);
  assert.equal(isAvailable('uno', get('uno', 'beacon'), nothing), true);
  assert.equal(isAvailable('uno', get('uno', 'nightlight'), nothing), false);
  assert.equal(isAvailable('uno', get('uno', 'nightlight'), new Set([missionKey('uno', 'beacon')])), true);
  assert.equal(isAvailable('uno', get('uno', 'workshop'), nothing), false);
  assert.equal(isAvailable('uno', get('uno', 'workshop'), new Set([missionKey('uno', 'beacon')])), true);
  assert.equal(isAvailable('esp32', get('esp32', 'touchlamp'), new Set([missionKey('uno', 'beacon')])), false, 'progress on one board does not open the other');
});

for (const { board, m } of all.filter(x => !x.m.sandbox)) {
  test(`${board}/${m.id}: the intended build and sketch pass every check`, async () => {
    const r = await runChecks(board, m.circuit, m.answer, m.checks);
    assert.deepEqual(failures(r), [], `${r.length} results`);
    assert.ok(r.length >= 3, 'a wiring check and at least two others');
  });

  test(`${board}/${m.id}: the starter sketch is not enough`, async () => {
    const r = await runChecks(board, m.circuit, m.starter, m.checks);
    assert.ok(failures(r).length > 0, 'the starter sketch passes everything, so the student has nothing to do');
  });

  test(`${board}/${m.id}: an empty bench fails politely`, async () => {
    if (m.circuit.length === 0) return;   // the tour needs no wiring
    const r = await runChecks(board, [], m.answer, m.checks);
    assert.ok(failures(r).length > 0);
  });

  test(`${board}/${m.id}: the prediction question tells a working build from a broken one`, async () => {
    const p = m.predict!;
    const good = await observe(board, m.circuit, m.answer, p.demo, p.run);
    assert.equal(p.classify(good), p.works, 'the intended build is classified as working');
    const broken = await observe(board, m.circuit, m.starter, p.demo, p.run);
    assert.notEqual(p.classify(broken), p.works, 'the starter sketch is not classified as working');
    assert.ok(p.options.some(o => o.id === p.classify(broken)), 'every outcome has an option the student could have picked');
  });
}

/* --- wrong solutions that look plausible --- */
const mutate = (code: string, from: string, to: string) => {
  assert.ok(code.includes(from), `the answer contains "${from}"`);
  return code.split(from).join(to);
};
const wrong: [BoardId, string, string, string, string][] = [
  ['uno', 'beacon', 'delay(1000)', 'delay(20)', 'blinks too fast'],
  ['uno', 'nightlight', 'light < 300', 'light > 300', 'works backwards'],
  ['uno', 'lamp', 'analogWrite(LAMP_PIN, brightness);', 'digitalWrite(LAMP_PIN, brightness > 127);', 'only on or off'],
  ['uno', 'chime', 'digitalRead(BUTTON_PIN) == LOW', '1 == 1', 'chimes without being pressed'],
  ['uno', 'parking', 'distance < 20', 'distance > 20', 'lights when far'],
  ['uno', 'greenhouse', 'tone(BUZZER_PIN, 440);', '', 'no sound'],
  ['esp32', 'beacon', 'digitalWrite(LED_PIN, LOW);', '', 'never turns off'],
  ['esp32', 'touchlamp', 'value < THRESHOLD', 'value > THRESHOLD', 'works backwards'],
  ['esp32', 'toggle', 'ledOn = !ledOn;', 'ledOn = true;', 'never turns off again'],
  ['esp32', 'siren', 'tone(BUZZER_PIN, f);', 'tone(BUZZER_PIN, 600);', 'one steady note'],
  ['esp32', 'nightlight', 'light < 1200', 'light > 1200', 'works backwards'],
];
for (const [board, id, from, to, why] of wrong) {
  test(`${board}/${id}: a sketch that ${why} does not pass`, async () => {
    const m = get(board, id), r = await runChecks(board, m.circuit, mutate(m.answer, from, to), m.checks);
    assert.ok(failures(r).length > 0, `passed, but the sketch ${why}`);
  });
}

/* --- wrong wiring --- */
const rewire = (items: Item[], f: (it: Item) => Item | null) => items.flatMap(it => f(it) ?? []);
const wrongWiring: [BoardId, string, string, (it: Item) => Item | null][] = [
  ['uno', 'beacon', 'has no resistor', it => (it.t === 'res' ? { t: 'wire', a: it.a, b: it.b, c: 'white' } : it)],
  ['uno', 'beacon', 'has the LED in backwards', it => (it.t === 'led' ? { ...it, a: it.k, k: it.a } : it)],
  ['uno', 'parking', 'has the sensor unpowered', it => (it.t === 'wire' && it.a === 'f18' ? null : it)],
  ['uno', 'chime', 'has the buzzer on the wrong pin', it => (it.t === 'wire' && it.a === 'U:8' ? { ...it, a: 'U:7' } : it)],
  ['esp32', 'touchlamp', 'has the pad unwired', it => (it.t === 'wire' && it.b === 'PAD' ? null : it)],
];
for (const [board, id, why, f] of wrongWiring) {
  test(`${board}/${id}: a bench that ${why} does not pass`, async () => {
    const m = get(board, id), r = await runChecks(board, rewire(m.circuit, f), m.answer, m.checks);
    assert.ok(failures(r).length > 0, `passed, but the bench ${why}`);
  });
}

test('the same sketch passes on a bench built with different pins when the code matches', async () => {
  const m = get('uno', 'beacon');
  const moved = rewire(m.circuit, it => (it.t === 'wire' && it.a === 'U:13' ? { ...it, a: 'U:12' } : it));
  const r = await runChecks('uno', moved, mutate(m.answer, 'LED_PIN = 13', 'LED_PIN = 12'), m.checks);
  assert.deepEqual(failures(r), [], 'any pin will do, as long as the wire and the sketch agree');
  const mismatch = await runChecks('uno', moved, m.answer, m.checks);
  assert.ok(failures(mismatch).length > 0, 'the wire is on pin 12 but the sketch uses pin 13');
});
