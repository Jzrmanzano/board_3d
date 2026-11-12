/* The colours of the interface must be readable. This reads the colour tokens from the stylesheet and checks the contrast of every pair that is used for text or for a control. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/** The tokens declared in the first block that starts with the given selector. */
function tokens(selector: string): Record<string, string> {
  const at = css.indexOf(selector + ' {');
  assert.ok(at >= 0, `the stylesheet has a ${selector} block`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}
const light = tokens(':root'), dark = tokens(':root[data-theme="dark"]');
const media = (() => {   // the same dark tokens, applied when the system asks for dark and nothing was chosen
  const at = css.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(at >= 0, 'the stylesheet follows the system dark setting');
  const body = css.slice(css.indexOf('{', css.indexOf(':root:not([data-theme="light"])', at)) + 1, css.indexOf('}', css.indexOf(':root:not([data-theme="light"])', at)));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2].toLowerCase();
  return out;
})();

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Pairs [foreground, background, minimum contrast]. 4.5 is for text, 3 for the edges of controls. */
const PAIRS: [string, string, number][] = [
  ['ink', 'bg', 4.5], ['ink', 'panel', 4.5], ['ink', 'bench', 4.5], ['ink', 'panel-2', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'panel', 4.5], ['muted', 'panel-2', 4.5],
  ['accent-ink', 'accent', 4.5], ['accent', 'panel', 4.5], ['accent', 'bg', 4.5],
  ['blue', 'panel', 4.5], ['ok', 'panel', 4.5], ['ok-ink', 'ok', 4.5], ['warn', 'panel', 4.5], ['pwr', 'panel', 4.5], ['pwr-ink', 'pwr', 4.5],
  ['code-ink', 'code-bg', 4.5], ['code-dim', 'code-bg', 4.5], ['code-accent', 'code-bg', 4.5], ['#1f0d03', 'code-accent', 4.5],
  ['edge', 'panel', 3], ['edge', 'bg', 3], ['accent', 'bench', 3],
];

for (const [name, set] of [['light', light], ['dark', dark]] as const) {
  test(`${name} palette: every text and control pair is readable`, () => {
    const bad: string[] = [];
        const val = (n: string) => (n.startsWith('#') ? n : set[n]);   // a token, or a colour written out
    for (const [fg, bg, min] of PAIRS) {
      assert.ok(val(fg) && val(bg), `${name} defines ${fg} and ${bg}`);
      const c = contrast(val(fg), val(bg));
      if (c < min) bad.push(`${fg} on ${bg} is ${c.toFixed(2)}:1, needs ${min}:1`);
    }
    assert.deepEqual(bad, []);
  });
}

test('the dark tokens applied by the system setting match the ones chosen by hand', () => {
  assert.deepEqual(media, dark);
});

test('both palettes define the same tokens', () => {
  assert.deepEqual(Object.keys(dark).sort(), Object.keys(light).sort());
});
