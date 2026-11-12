/* The rules for placing parts: what a student may put where. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze } from '../src/sim/circuit';
import { allTerminals, makeItem, parseTerminal, placementError } from '../src/state/bench';
import type { Item } from '../src/types';

const led = (items: Item[], a: string, b: string) => makeItem({ kind: 'led' }, items, a, b);

test('a hole holds one leg', () => {
  const items = [led([], 'e10', 'e11')];
  assert.match(placementError('uno', items, led(items, 'e10', 'e12'))!, /already taken/);
  assert.equal(placementError('uno', items, led(items, 'e12', 'e13')), null);
});

test('parts go in the breadboard, wires can reach board pins', () => {
  assert.match(placementError('uno', [], makeItem({ kind: 'res' }, [], 'U:13', 'e10'))!, /breadboard/);
  assert.equal(placementError('uno', [], makeItem({ kind: 'wire' }, [], 'U:13', 'e10')), null);
  assert.match(placementError('uno', [], led([], 'e10', 'e10'))!, /two different/);
});

test('multi-column parts must fit on the board', () => {
  assert.match(placementError('uno', [], makeItem({ kind: 'pot' }, [], 'd29'))!, /three columns/);
  assert.match(placementError('uno', [], makeItem({ kind: 'sonar' }, [], 'j28'))!, /four columns/);
  assert.equal(placementError('uno', [], makeItem({ kind: 'sonar' }, [], 'j27')), null);
});

test('the ESP32 covers the left of the breadboard', () => {
  assert.match(placementError('esp32', [], led([], 'e5', 'e6'))!, /under the ESP32/);
  assert.equal(placementError('esp32', [], led([], 'e25', 'e26')), null);
  assert.ok(allTerminals('esp32', []).includes('E:D5'));
  assert.ok(!allTerminals('esp32', []).includes('j11'));
});

test('typed names become connection points', () => {
  assert.equal(parseTerminal('uno', 'E10'), 'e10');
  assert.equal(parseTerminal('uno', 't+5'), 'T+5');
  assert.equal(parseTerminal('uno', '13'), 'U:13');
  assert.equal(parseTerminal('uno', 'gnd'), 'U:GND');
  assert.equal(parseTerminal('uno', 'a0'), 'U:A0');
  assert.equal(parseTerminal('esp32', '5'), 'E:D5');
  assert.equal(parseTerminal('esp32', 'gnd'), 'E:GND');
  assert.equal(parseTerminal('uno', 'zz'), null);
});

test('wires are coloured by what they carry', () => {
  assert.equal((makeItem({ kind: 'wire' }, [], 'U:5V', 'T+1') as { c: string }).c, 'red');
  assert.equal((makeItem({ kind: 'wire' }, [], 'a15', 'U:GND') as { c: string }).c, 'black');
});

test('a bench built by placing parts one at a time works like the lesson circuit', () => {
  let items: Item[] = [];
  const add = (it: Item) => { assert.equal(placementError('uno', items, it), null, JSON.stringify(it)); items = [...items, it]; };
  add(makeItem({ kind: 'wire' }, items, 'U:13', 'a10'));
  add(led(items, 'e10', 'e11'));
  add(makeItem({ kind: 'res' }, items, 'c11', 'c15'));
  add(makeItem({ kind: 'wire' }, items, 'a15', 'U:GND2'));
  assert.deepEqual(analyze('uno', items).issues, []);
});

/* --- moving the end of a wire --- */
import { movedWire } from '../src/state/bench';
import { makeHW } from '../src/sim/hardware';
import { run } from '../src/sim/interpreter';
import { BOARDS } from '../src/data/boards';

const BLINK: Item[] = [
  { t: 'wire', id: 'feed', a: 'U:13', b: 'a10', c: 'orange' },
  { t: 'led', id: 'led', a: 'e10', k: 'e11', color: 0xff3b30 },
  { t: 'res', id: 'r', a: 'c11', b: 'c15', ohms: 220 },
  { t: 'wire', id: 'gnd', a: 'a15', b: 'U:GND2', c: 'black' },
];
const lit = async (items: Item[], pin: number) => {
  const hw = makeHW(BOARDS.uno, items, () => ({}), () => {});
  await run(`void setup() { pinMode(${pin}, OUTPUT); digitalWrite(${pin}, HIGH); } void loop() {}`, hw, { stop: false, onLoop() { this.stop = true; } });
  return hw.ledGlow('led') > 0.5;
};

test('moving a wire end to another pin changes which pin lights the LED', async () => {
  assert.equal(await lit(BLINK, 13), true);
  const moved = movedWire('uno', BLINK, 'feed', 'a', 'U:12');
  assert.ok('items' in moved);
  const items = (moved as { items: Item[] }).items;
  assert.deepEqual(items.find(i => i.t === 'wire' && i.id === 'feed'), { t: 'wire', id: 'feed', a: 'U:12', b: 'a10', c: 'orange' });
  assert.equal(await lit(items, 13), false);
  assert.equal(await lit(items, 12), true);
});

test('either end can move, and the other end stays put', () => {
  const r = movedWire('uno', BLINK, 'feed', 'b', 'a12') as { items: Item[] };
  const w = r.items[0] as { a: string; b: string };
  assert.equal(w.a, 'U:13'); assert.equal(w.b, 'a12');
});

test('a wire end cannot move onto a taken hole, onto its own other end, or under the ESP32', () => {
  assert.match((movedWire('uno', BLINK, 'feed', 'b', 'e10') as { error: string }).error, /already taken/);
  assert.match((movedWire('uno', BLINK, 'feed', 'b', 'U:13') as { error: string }).error, /two different/);
  const esp: Item[] = [{ t: 'wire', id: 'w', a: 'E:D5', b: 'j22', c: 'orange' }];
  assert.match((movedWire('esp32', esp, 'w', 'b', 'e5') as { error: string }).error, /under the ESP32/);
});

test('a wire end can be put back where it was, and can move onto the hole it just left', () => {
  assert.ok('items' in movedWire('uno', BLINK, 'feed', 'a', 'U:13'));
  const r = movedWire('uno', BLINK, 'feed', 'a', 'U:12') as { items: Item[] };
  assert.ok('items' in movedWire('uno', r.items, 'feed', 'a', 'U:13'), 'U:13 is free again');
});

test('a moved wire takes the colour of what it now carries', () => {
  const r = movedWire('uno', BLINK, 'feed', 'a', 'U:5V') as { items: Item[] };
  assert.equal((r.items[0] as { c: string }).c, 'red');
  const g = movedWire('uno', BLINK, 'gnd', 'b', 'U:12') as { items: Item[] };
  assert.notEqual((g.items[3] as { c: string }).c, 'black', 'no longer a ground wire');
});

test('only wires can be moved', () => {
  assert.match((movedWire('uno', BLINK, 'led', 'a', 'e12') as { error: string }).error, /not a wire/);
});
