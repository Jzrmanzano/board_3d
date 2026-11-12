/* Which panels are open over the bench. The map and the brief share the left side, the code has the right side, and on a phone only one sheet can be open. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closePanel, closeTop, isOpen, NONE, openPanel, togglePanel } from '../src/state/panels';

test('nothing is open to begin with', () => {
  for (const p of ['map', 'brief', 'code'] as const) assert.equal(isOpen(NONE, p), false);
});

test('the brief and the code can be open together on a wide screen', () => {
  const both = openPanel(openPanel(NONE, 'brief', false), 'code', false);
  assert.equal(isOpen(both, 'brief'), true);
  assert.equal(isOpen(both, 'code'), true);
});

test('the map and the brief share the left side: opening one closes the other', () => {
  const map = openPanel(NONE, 'map', false), brief = openPanel(map, 'brief', false);
  assert.equal(isOpen(brief, 'map'), false);
  assert.equal(isOpen(brief, 'brief'), true);
  assert.equal(isOpen(openPanel(brief, 'map', false), 'brief'), false);
});

test('opening a panel on the right leaves the left alone on a wide screen', () => {
  const s = openPanel(openPanel(NONE, 'map', false), 'code', false);
  assert.equal(isOpen(s, 'map'), true);
});

test('on a phone only one sheet is open at a time', () => {
  const a = openPanel(NONE, 'brief', true), b = openPanel(a, 'code', true), c = openPanel(b, 'map', true);
  assert.deepEqual([isOpen(b, 'brief'), isOpen(b, 'code')], [false, true]);
  assert.deepEqual([isOpen(c, 'code'), isOpen(c, 'map')], [false, true]);
});

test('a toggle opens a closed panel and closes an open one', () => {
  const open = togglePanel(NONE, 'code', false);
  assert.equal(isOpen(open, 'code'), true);
  assert.equal(isOpen(togglePanel(open, 'code', false), 'code'), false);
});

test('closing a panel that is not open changes nothing', () => {
  const s = openPanel(NONE, 'code', false);
  assert.deepEqual(closePanel(s, 'map'), s);
});

test('Escape closes the panel that was opened last, then the one before', () => {
  const s = openPanel(openPanel(NONE, 'brief', false), 'code', false);
  const first = closeTop(s);
  assert.equal(isOpen(first, 'code'), false);
  assert.equal(isOpen(first, 'brief'), true);
  const second = closeTop(first);
  assert.equal(isOpen(second, 'brief'), false);
  assert.deepEqual(closeTop(second), second, 'nothing left to close');
});

test('closing the panel that was last opened hands "last" to whatever is still open', () => {
  const s = closePanel(openPanel(openPanel(NONE, 'brief', false), 'code', false), 'code');
  assert.equal(closeTop(s).left, null, 'Escape now closes the brief');
});
