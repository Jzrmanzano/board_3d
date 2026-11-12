/* Builds the 3D bench for one lesson: the board, the breadboard and the wired parts.
   Everything is modelled in millimetres from toon-shaded solids with an ink outline. */
import * as T from 'three';
import { ESP_FAR, ESP_HOLES, ESP_NEAR } from '../data/boards';
import { itemId, type BoardId, type Info, type Item } from '../types';

export interface WorldSpec {
  board: BoardId;
  /** Board parts to label, or null to leave the board unlabelled. */
  parts: Record<string, Info> | null;
  info: Record<string, Info>;
}
export interface Hot { id: string; title: string; pos: T.Vector3 }
export interface World {
  group: T.Group;
  hots: Hot[];
  /** Drives a part: LED brightness, button pressed, knob position, buzzer frequency, wall distance. */
  set(id: string, value: number): void;
  highlight(id: string | null): void;
  animate(timeMs: number): void;
  /** Replaces every placed part and wire. LEDs in `burnt` show as burnt out. */
  setCircuit(items: Item[], burnt: string[]): void;
  /** An LED burns out: it turns black and lets out a puff of smoke. */
  burn(id: string): void;
  puff(at: T.Vector3, kind: 'smoke' | 'spark'): void;
  /** Where a connection point is, or null when the name is not one. */
  anchor(name: string): T.Vector3 | null;
  /** Rings the point under the pointer and the first point of a part being placed, with a line between them. */
  markers(hover: string | null, pending: string | null): void;
  dispose(): void;
}

type Vec = [number, number, number];
type Solid = T.Mesh<T.BufferGeometry, T.MeshToonMaterial>;
interface Opt { nh?: number; glow?: number; gi?: number; rx?: number; rz?: number; ax?: 'x' | 'z'; seg?: number; y?: number }
interface TextOpt { up?: boolean; color?: string; bold?: boolean; align?: CanvasTextAlign }
interface Pen {
  text(s: string, x: number, z: number, size: number, o?: TextOpt): void;
  line(pts: number[][], w: number, color: string): void;
  rect(x: number, z: number, w: number, d: number, color: string, fill?: boolean): void;
  dot(x: number, z: number, r: number, color: string): void;
}
interface BuiltBoard {
  group: T.Group; parts: Record<string, T.Group>; hot: Record<string, Vec>; anchors: Record<string, Vec>;
  W: number; D: number; setLed(v: number): void; usbAt: Vec; plug: Vec;
}
interface Made { g: T.Group; set?: (v: number) => void; top?: T.Vector3; burn?: () => void }

const INK = 0x1b2430, HILITE = 0xe2572b, METAL = 0xc9ced3, GOLD = 0xd9b24a, DARK = 0x23272e;
const WIRE: Record<string, number> = { red: 0xd6453d, black: 0x2f353d, orange: 0xf08a24, yellow: 0xe8c22e, green: 0x3aa655, blue: 0x3577d4, white: 0xe9ecef, purple: 0x8d5bd1 };
const ROWZ: Record<string, number> = { a: -13.97, b: -11.43, c: -8.89, d: -6.35, e: -3.81, f: 3.81, g: 6.35, h: 8.89, i: 11.43, j: 13.97 };
const RAILZ: Record<string, number> = { 'T+': -23.5, 'T-': -20.96, 'B-': 20.96, 'B+': 23.5 };
const BBH = 8.5, HT = 0.32;
const colX = (c: number) => (c - 15.5) * 2.54;

const grad = new T.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, T.RedFormat);
grad.minFilter = grad.magFilter = T.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;

export function buildWorld(spec: WorldSpec, anisotropy: number): World {
  const world = new T.Group();
  const devs: Record<string, (v: number) => void> = {}, groups: Record<string, T.Group> = {};
  const hots: Hot[] = [], itemAnim: ((t: number) => void)[] = [];
  let uno: BuiltBoard | null = null, bb: T.Group | null = null, padPos: T.Vector3 | null = null, lit: T.MeshBasicMaterial[] = [];

  /* --- primitives: toon-shaded solids with an ink outline (a slightly larger back-face shell) --- */
  const toon = (color: number, o: Opt = {}) => { const m = new T.MeshToonMaterial({ color, gradientMap: grad }); if (o.glow) { m.emissive.setHex(o.glow); m.emissiveIntensity = o.gi == null ? 1 : o.gi; } return m; };
  const shell = (g: T.Object3D): T.MeshBasicMaterial => g.userData.hm || (g.userData.hm = new T.MeshBasicMaterial({ color: INK, side: T.BackSide }));
  function put(g: T.Object3D, geo: T.BufferGeometry, hullGeo: T.BufferGeometry | null, color: number, o: Opt, x: number, y: number, z: number): Solid {
    const m = new T.Mesh(geo, toon(color, o));
    m.position.set(x, y, z); if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz;
    g.add(m);
    if (hullGeo) { const h = new T.Mesh(hullGeo, shell(g)); h.position.copy(m.position); h.rotation.copy(m.rotation); g.add(h); m.userData.hull = h; }
    return m;
  }
  const box = (g: T.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: number, o: Opt = {}) =>
    put(g, new T.BoxGeometry(w, h, d), o.nh ? null : new T.BoxGeometry(w + 2 * HT, h + 2 * HT, d + 2 * HT), color, o, x, y + h / 2, z);
  function cyl(g: T.Object3D, x: number, y: number, z: number, r: number, h: number, color: number, o: Opt = {}) {   // with o.ax ('x' or 'z') the cylinder lies on its side and y is its centre
    const seg = o.seg || 22, rot: Opt = o.ax === 'x' ? { rz: Math.PI / 2 } : o.ax === 'z' ? { rx: Math.PI / 2 } : {};
    return put(g, new T.CylinderGeometry(r, r, h, seg), o.nh ? null : new T.CylinderGeometry(r + HT, r + HT, h + 2 * HT, seg), color, { ...o, ...rot }, x, o.ax ? y : y + h / 2, z);
  }
  const ball = (g: T.Object3D, x: number, y: number, z: number, r: number, color: number, o: Opt = {}) =>
    put(g, new T.SphereGeometry(r, 20, 14), o.nh ? null : new T.SphereGeometry(r + HT, 20, 14), color, o, x, y, z);
  function shadow(g: T.Object3D, x: number, z: number, w: number, d: number) {
    const m = new T.Mesh(new T.PlaneGeometry(w + 5, d + 5), new T.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.13, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x + 3, 0.05, z + 3); m.raycast = () => {}; g.add(m);
  }
  function printed(g: T.Object3D, W: number, D: number, S: number, y: number, draw: (k: Pen) => void, cx = 0, cz = 0) {   // a canvas drawn in millimetres, laid flat on a surface
    const c = document.createElement('canvas'); c.width = Math.round(W * S); c.height = Math.round(D * S);
    const ctx = c.getContext('2d')!;
    draw({
      text(s, x, z, size, o = {}) {
        ctx.save(); ctx.translate(x * S, z * S); if (o.up) ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = o.color || '#f1f5f4'; ctx.font = `${o.bold ? 700 : 500} ${size * S}px "JetBrains Mono", monospace`; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s, 0, 0); ctx.restore();
      },
      line(pts, w, color) { ctx.strokeStyle = color; ctx.lineWidth = w * S; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p[0] * S, p[1] * S)); ctx.stroke(); },
      rect(x, z, w, d, color, fill) { ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 0.18 * S; ctx[fill ? 'fillRect' : 'strokeRect']((x - w / 2) * S, (z - d / 2) * S, w * S, d * S); },
      dot(x, z, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x * S, z * S, r * S, 0, 7); ctx.fill(); },
    });
    const tex = new T.CanvasTexture(c); tex.anisotropy = anisotropy;
    const m = new T.Mesh(new T.PlaneGeometry(W, D), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(cx, y, cz); m.raycast = () => {}; g.add(m);
  }
  function kit(W: number, D: number) {   // helpers for building a board in its own millimetre grid: x left to right, z far to near, y up from the PCB top
    const root = new T.Group(), parts: Record<string, T.Group> = {}, hot: Record<string, Vec> = {}, X = (x: number) => x - W / 2, Z = (z: number) => z - D / 2;
    return {
      root, parts, hot, X, Z,
      P(id: string | null) { const g = new T.Group(); if (id) { g.userData.pick = id; parts[id] = g; } root.add(g); return g; },
      bx: (g: T.Object3D, x: number, z: number, w: number, d: number, h: number, c: number, o: Opt = {}) => box(g, X(x), o.y || 0, Z(z), w, h, d, c, o),
      cy: (g: T.Object3D, x: number, z: number, r: number, h: number, c: number, o: Opt = {}) => cyl(g, X(x), o.y || 0, Z(z), r, h, c, o),
      H(id: string, x: number, z: number, y: number) { hot[id] = [X(x), y, Z(z)]; },
    };
  }

  /* --- Arduino Uno --- */
  function buildUno(): BuiltBoard {
    const W = 68.6, D = 53.4, K = kit(W, D), { P, bx, cy, H } = K, anchors: Record<string, Vec> = {};
    let g = P(null);
    bx(g, W / 2, D / 2, W, D, 1.6, 0x0f7f8c, { y: -1.6 });
    [[14, 2.5], [15.2, 50.8], [66, 7.6], [66, 35.5]].forEach(([x, z]) => { cy(g, x, z, 2.4, 0.06, 0xd8dee2, { nh: 1, y: 0.02 }); cy(g, x, z, 1.6, 0.08, 0x16242c, { nh: 1, y: 0.03 }); });
    const dA = ['SCL', 'SDA', 'AREF', 'GND', '13', '12', '~11', '~10', '~9', '8'], dB = ['7', '~6', '~5', '4', '~3', '2', 'TX1', 'RX0'];
    const pw = ['', 'IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'VIN'], an = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
    printed(K.root, W, D, 16, 0.05, k => {
      const tr = '#3aa7b3';
      for (let i = 0; i < 12; i++) k.line([[33 + i * 2.54, 33], [33 + i * 2.54, 25 - (i % 4) * 1.6], [20.5 + i * 3.7, 9.5 + (i % 3)], [20.5 + i * 3.7, 6.5]], 0.3, tr);
      for (let i = 0; i < 9; i++) k.line([[36 + i * 2.54, 43], [36 + i * 2.54, 45.2], [29.5 + i * 4.1, 47.2], [29.5 + i * 4.1, 48.6]], 0.3, tr);
      k.line([[12, 14], [18, 14], [18, 17]], 0.3, tr); k.line([[12, 16], [16, 16], [16, 27]], 0.3, tr); k.line([[11.5, 45], [16, 45], [16, 39]], 0.45, tr);
      dA.forEach((s, i) => k.text(s, 18.8 + i * 2.54, 4.7, 1.45, { up: true, align: 'right' }));
      dB.forEach((s, i) => k.text(s, 45.2 + i * 2.54, 4.7, 1.45, { up: true, align: 'right' }));
      pw.forEach((s, i) => k.text(s, 27.9 + i * 2.54, D - 4.7, 1.45, { up: true, align: 'left' }));
      an.forEach((s, i) => k.text(s, 50.8 + i * 2.54, D - 4.7, 1.45, { up: true, align: 'left' }));
      k.text('DIGITAL (PWM~)', 42, 12.2, 1.8, { bold: true });
      k.text('POWER', 36.8, D - 12.4, 1.6, { bold: true }); k.text('ANALOG IN', 57.2, D - 12.4, 1.6, { bold: true });
      k.text('UNO', 46.5, 23.5, 6.2, { bold: true });
      k.text('L', 30.2, 13, 1.4); k.text('TX', 30.8, 17, 1.4); k.text('RX', 30.8, 20.5, 1.4); k.text('ON', 60, 14.6, 1.4);
      k.text('RESET', 6.5, 8.8, 1.3); k.text('ICSP', 59.6, 26, 1.3, { up: true });
      k.rect(47.5, 38, 38.2, 11.6, '#f1f5f4');
    });
    const header = (id: string, x0: number, z: number, names: string[]) => {
      const hg = K.parts[id] || P(id), n = names.length;
      bx(hg, x0 + (n - 1) * 1.27, z, n * 2.54, 2.54, 8.5, DARK);
      names.forEach((nm, i) => { bx(hg, x0 + i * 2.54, z, 1.15, 1.15, 0.06, 0x05070a, { y: 8.5, nh: 1 }); if (nm) anchors[nm] = [K.X(x0 + i * 2.54), 8.5, K.Z(z)]; });
    };
    header('digital', 18.8, 2.5, ['SCL', 'SDA', 'AREF', 'GND2', '13', '12', '11', '10', '9', '8']);
    header('digital', 45.2, 2.5, ['7', '6', '5', '4', '3', '2', '1', '0']);
    header('power', 27.9, D - 2.5, ['', 'IOREF', 'RESET', '3V3', '5V', 'GND', 'GNDb', 'VIN']);
    header('analog', 50.8, D - 2.5, an);
    g = P('usb'); bx(g, 4, 14, 16, 12, 10.8, METAL); bx(g, -4.06, 14, 0.2, 8.6, 7.4, 0x1a1f26, { y: 1.7, nh: 1 }); bx(g, -3.9, 14, 0.6, 5.6, 2.8, 0xf2f2f2, { y: 4, nh: 1 });
    g = P('jack'); bx(g, 4.5, 45.5, 14, 9, 10.8, DARK); cy(g, -2.6, 45.5, 3.2, 0.3, 0x05070a, { ax: 'x', y: 5.6, nh: 1 }); cy(g, -2.3, 45.5, 0.9, 0.5, METAL, { ax: 'x', y: 5.6, nh: 1 });
    g = P('mcu'); bx(g, 47.5, 38, 37, 9.8, 2.4, 0x343a42); bx(g, 47.5, 38, 35.6, 7.2, 3.1, 0x1b1e23, { y: 2.4 }); cy(g, 31.2, 38, 1, 0.06, 0x4a515a, { y: 5.5, nh: 1 });
    for (let i = 0; i < 14; i++) { bx(g, 31 + i * 2.54, 33.6, 0.9, 0.5, 2.6, METAL, { y: 1.4, nh: 1 }); bx(g, 31 + i * 2.54, 42.4, 0.9, 0.5, 2.6, METAL, { y: 1.4, nh: 1 }); }
    g = P('usbchip'); bx(g, 21, 17, 6, 6, 1.1, 0x1b1e23);
    g = P('crystal'); { const m = cy(g, 15, 27, 1.9, 3.4, 0xd5d9dd); m.scale.x = m.userData.hull.scale.x = 2.8; }
    g = P('reset'); bx(g, 6.5, 3.8, 6, 6, 2.2, METAL); cy(g, 6.5, 3.8, 1.7, 1.5, 0xe2572b, { y: 2.2 });
    g = P('regulator'); bx(g, 13.5, 36, 6.5, 6.5, 1.8, 0x1b1e23); bx(g, 9.4, 36, 2.6, 5, 0.9, METAL);
    g = P('leds');
    const L = bx(g, 27.4, 13, 1.8, 1, 0.8, 0x7a5a1c, { nh: 1 });
    bx(g, 27.4, 17, 1.8, 1, 0.8, 0x8a7a2a, { nh: 1 }); bx(g, 27.4, 20.5, 1.8, 1, 0.8, 0x8a7a2a, { nh: 1 }); bx(g, 60, 17, 1.8, 1, 0.8, 0x52e07a, { nh: 1, glow: 0x18b040 });
    g = P('icsp'); bx(g, 64, 26, 5.1, 7.7, 2.5, DARK);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) bx(g, 62.73 + j * 2.54, 23.46 + i * 2.54, 0.64, 0.64, 5.8, GOLD, { y: 2.5, nh: 1 });
    g = P(null);
    [[20.5, 44], [20.5, 35.2]].forEach(([x, z]) => { cy(g, x, z, 3.2, 7, 0xcdd2d7); bx(g, x, z - 1.6, 5.2, 2, 0.06, DARK, { y: 7, nh: 1 }); });
    [[24, 9, 2, 1.2, 0xb08a52], [33, 16, 1.2, 2, 0x1b1e23], [37, 18, 2, 1.2, 0xb08a52], [40, 14.5, 3, 3, 0x1b1e23], [27, 27, 2, 1.2, 0xb08a52], [24, 30, 1.2, 2, 0x1b1e23], [54, 18, 2, 1.2, 0xb08a52], [26, 23.5, 3.4, 2.6, 0x1b1e23], [11, 21.5, 1.2, 2, 0xb08a52]].forEach(([x, z, w, d, c]) => bx(g, x, z, w, d, 0.9, c, { nh: 1 }));
    H('usb', 4, 14, 12); H('jack', 4.5, 45.5, 12); H('mcu', 47.5, 38, 6.5); H('digital', 36, 2.5, 9.5); H('analog', 57.2, D - 2.5, 9.5); H('power', 36.8, D - 2.5, 9.5);
    H('leds', 27.4, 16.5, 1.5); H('reset', 6.5, 3.8, 4.5); H('crystal', 15, 27, 4); H('usbchip', 21, 17, 1.6); H('regulator', 13.5, 36, 2.4); H('icsp', 64, 26, 9);
    const setL = (v: number) => { L.material.emissive.setHex(0xffa51a); L.material.emissiveIntensity = v * 1.4; };
    return { group: K.root, parts: K.parts, hot: K.hot, anchors, W, D, setLed: setL, usbAt: [K.X(-4), 5.5, K.Z(14)], plug: [12, 7.5, 10.5] };
  }

  /* --- ESP32 DevKit (30 pins, USB on the left) --- */
  function buildEsp(): BuiltBoard {
    const W = 52, D = 28, K = kit(W, D), { P, bx, cy, H } = K, x0 = 8.24, zF = 14 - 11.43, zN = 14 + 11.43;
    let g = P(null);
    bx(g, W / 2, D / 2, W, D, 1.6, 0x1c2026, { y: -1.6 });
    [[2.6, 2.6], [2.6, D - 2.6], [W - 2.6, 2.6], [W - 2.6, D - 2.6]].forEach(([x, z]) => { cy(g, x, z, 1.9, 0.06, 0xb9a26a, { nh: 1, y: 0.02 }); cy(g, x, z, 1.3, 0.08, 0x0a0c0f, { nh: 1, y: 0.03 }); });
    printed(K.root, W, D, 22, 0.05, k => {
      ESP_FAR.forEach((s, i) => k.text(s.replace('GNDf', 'GND'), x0 + i * 2.54, zF + 1.2, 1.1, { up: true, align: 'right', bold: true }));
      ESP_NEAR.forEach((s, i) => k.text(s, x0 + i * 2.54, zN - 1.2, 1.1, { up: true, align: 'left', bold: true }));
      k.text('BOOT', 4.3, 8.3, 1.1, { bold: true }); k.text('EN', 4.3, D - 8.3, 1.1, { bold: true });
      for (let i = 0; i < 6; i++) k.line([[26.6, 9 + i * 2], [23.5 - i * 0.8, 9 + i * 2], [20 - i * 0.8, 11 + i * 1.2]], 0.22, '#3d4650');
    });
    g = P('module'); bx(g, 36.2, 14, 19.5, 16, 0.8, 0x101317); bx(g, 35.5, 14, 16.5, 14.4, 2.4, METAL, { y: 0.8 });
    printed(g, 16.5, 14.4, 26, 3.26, k => { k.text('ESP32', 8.25, 5.6, 2.6, { bold: true, color: '#39424c' }); k.text('WROOM-32', 8.25, 9, 1.5, { color: '#39424c' }); k.rect(8.25, 7.2, 15.2, 13, '#8f989f'); }, K.X(35.5), K.Z(14));
    g = P('antenna'); bx(g, 49, 14, 6, 16, 0.8, 0x101317);
    for (let i = 0; i < 5; i++) bx(g, 49, 8 + i * 3, 4.4, 0.7, 0.14, GOLD, { y: 0.8, nh: 1 });
    for (let i = 0; i < 4; i++) bx(g, i % 2 ? 50.85 : 47.15, 9.5 + i * 3, 0.7, 3.7, 0.14, GOLD, { y: 0.8, nh: 1 });
    g = P('usb'); bx(g, 2.4, 14, 6, 7.8, 2.8, METAL); bx(g, -0.66, 14, 0.2, 6.2, 1.4, 0x1a1f26, { y: 0.7, nh: 1 });
    g = P('boot'); bx(g, 4.4, 4.6, 4, 3.2, 1.5, METAL); cy(g, 4.4, 4.6, 0.95, 0.7, DARK, { y: 1.5, nh: 1 });
    g = P('en'); bx(g, 4.4, D - 4.6, 4, 3.2, 1.5, METAL); cy(g, 4.4, D - 4.6, 0.95, 0.7, DARK, { y: 1.5, nh: 1 });
    g = P('usbchip'); bx(g, 13.5, 13.5, 4.4, 4.4, 0.9, 0x2b3038);
    g = P('regulator'); bx(g, 21, 7.6, 6.3, 3.5, 1.6, 0x2b3038); bx(g, 21, 5.2, 3.2, 1.6, 0.6, METAL, { nh: 1 });
    g = P('leds'); bx(g, 22.5, 20.5, 1.6, 0.9, 0.7, 0xff6a5c, { nh: 1, glow: 0xd8261a });
    const L = bx(g, 17.5, 20.5, 1.6, 0.9, 0.7, 0x2c4f7a, { nh: 1 });
    ([['pinsFar', zF], ['pinsNear', zN]] as [string, number][]).forEach(([id, z]) => {
      g = P(id);
      for (let i = 0; i < 15; i++) { cy(g, x0 + i * 2.54, z, 0.8, 0.45, 0xd9dde0, { nh: 1 }); bx(g, x0 + i * 2.54, z, 0.64, 0.64, 6, GOLD, { y: -10.1, nh: 1 }); }
      bx(g, x0 + 7 * 2.54, z, 38.1, 2.5, 2.5, DARK, { y: -4.1 });
    });
    g = P(null);
    [[9.5, 9, 2, 1.1, 0xb08a52], [9.5, 19, 2, 1.1, 0xb08a52], [17, 8, 1.1, 2, 0x2b3038], [25.5, 20.5, 2.6, 1.4, 0x2b3038], [14, 20, 2, 1.1, 0xb08a52], [26, 12, 1.1, 2, 0xb08a52]].forEach(([x, z, w, d, c]) => bx(g, x, z, w, d, 0.9, c, { nh: 1 }));
    H('module', 35.5, 14, 3.6); H('antenna', 49.5, 14, 1.2); H('usb', 2.4, 14, 3.2); H('pinsFar', 26, zF, 0.6); H('pinsNear', 26, zN, 0.6);
    H('boot', 4.4, 4.6, 2.4); H('en', 4.4, D - 4.6, 2.4); H('leds', 20, 20.5, 1); H('usbchip', 13.5, 13.5, 1.2); H('regulator', 21, 7.6, 1.9);
    const setL = (v: number) => { L.material.emissive.setHex(0x2a8cff); L.material.emissiveIntensity = v * 1.6; };
    return { group: K.root, parts: K.parts, hot: K.hot, anchors: {}, W, D, setLed: setL, usbAt: [K.X(-0.6), 1.4, K.Z(14)], plug: [9, 4.2, 8.5] };
  }

  /* --- breadboard: 30 columns, rows a to j, a power rail pair on each long side --- */
  function buildBB() {
    const L = 30 * 2.54 + 6, Wd = 53.4, g = new T.Group();
    box(g, 0, 0, 0, L, BBH, Wd, 0xf4f1e8);
    printed(g, L, Wd, 14, BBH + 0.05, k => {
      const cx = L / 2, cz = Wd / 2;
      k.rect(cx, cz, L, 2.6, '#d9d4c6', true); k.rect(cx, cz, L, 0.5, '#bdb7a6', true);
      k.line([[2, cz + RAILZ['T+'] - 1.5], [L - 2, cz + RAILZ['T+'] - 1.5]], 0.35, '#d6453d'); k.line([[2, cz + RAILZ['T-'] + 1.5], [L - 2, cz + RAILZ['T-'] + 1.5]], 0.35, '#3577d4');
      k.line([[2, cz + RAILZ['B-'] - 1.5], [L - 2, cz + RAILZ['B-'] - 1.5]], 0.35, '#3577d4'); k.line([[2, cz + RAILZ['B+'] + 1.5], [L - 2, cz + RAILZ['B+'] + 1.5]], 0.35, '#d6453d');
      for (let c = 1; c <= 30; c++) {
        const x = cx + colX(c);
        Object.values(ROWZ).forEach(z => k.rect(x, cz + z, 1.15, 1.15, '#3b3f45', true));
        Object.values(RAILZ).forEach(z => k.rect(x, cz + z, 1.15, 1.15, '#3b3f45', true));
        if (c === 1 || c % 5 === 0) { k.text(String(c), x, cz - 17.2, 1.5, { color: '#6d737b' }); k.text(String(c), x, cz + 17.2, 1.5, { color: '#6d737b' }); }
      }
      Object.entries(ROWZ).forEach(([r, z]) => { k.text(r, 1.6, cz + z, 1.5, { color: '#6d737b' }); k.text(r, L - 1.6, cz + z, 1.5, { color: '#6d737b' }); });
      [['+', 'T+', '#d6453d'], ['−', 'T-', '#3577d4'], ['−', 'B-', '#3577d4'], ['+', 'B+', '#d6453d']].forEach(([s, r, col]) => { k.text(s, 1.6, cz + RAILZ[r], 2, { color: col, bold: true }); k.text(s, L - 1.6, cz + RAILZ[r], 2, { color: col, bold: true }); });
    });
    shadow(g, 0, 0, L, Wd);
    return g;
  }

  function anchor(name: string): T.Vector3 {   // top-surface position of a named connection point, in world space
    let m;
    if ((m = /^U:(.+)$/.exec(name))) { const p = uno?.anchors[m[1]]; if (!p) throw new Error('Unknown Uno pin ' + name); return new T.Vector3(...p).add(uno!.group.position); }
    if ((m = /^E:(.+)$/.exec(name))) { if (!ESP_HOLES[m[1]]) throw new Error('Unknown ESP32 pin ' + name); return anchor(ESP_HOLES[m[1]]); }
    if (name === 'PAD') return padPos!.clone();
    if ((m = /^([TB][+-])(\d+)$/.exec(name))) return new T.Vector3(colX(+m[2]), BBH, RAILZ[m[1]]).add(bb!.position);
    if ((m = /^([a-j])(\d+)$/.exec(name))) return new T.Vector3(colX(+m[2]), BBH, ROWZ[m[1]]).add(bb!.position);
    throw new Error('Unknown connection point ' + name);
  }

  /* --- components --- */
  type Of<K extends Item['t']> = Extract<Item, { t: K }>;
  const leg = (g: T.Group, p: T.Vector3, h: number, c = 0xaab2ba) => box(g, p.x, p.y, p.z, 0.55, h, 0.55, c, { nh: 1 });
  /** A thin horizontal lead from p to q at height y. */
  function lead(g: T.Group, p: T.Vector3, q: T.Vector3, y: number) {
    const dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz);
    if (len < 0.1) return;
    const m = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, len, 8), toon(0xaab2ba));
    m.position.set((p.x + q.x) / 2, y, (p.z + q.z) / 2); m.rotation.set(0, -Math.atan2(dz, dx), Math.PI / 2, 'YXZ'); g.add(m);
  }
  function mkWire(it: Of<'wire'>, k: number): Made {
    const g = new T.Group(), up = 5.4, a = anchor(it.a), b = anchor(it.b);
    const p0 = a.clone(), p3 = b.clone();
    if (it.a !== 'PAD') { box(g, a.x, a.y, a.z, 2.3, up + 0.4, 2.3, DARK); p0.y += up; }
    if (it.b !== 'PAD') { box(g, b.x, b.y, b.z, 2.3, up + 0.4, 2.3, DARK); p3.y += up; }
    const h = 9 + p0.distanceTo(p3) * 0.17 + (k % 5) * 2.4;
    const curve = new T.CubicBezierCurve3(p0, p0.clone().setY(p0.y + h), p3.clone().setY(p3.y + h), p3);
    g.add(new T.Mesh(new T.TubeGeometry(curve, 32, 0.85, 8), toon(WIRE[it.c])));
    g.add(new T.Mesh(new T.TubeGeometry(curve, 32, 0.85 + HT, 8), shell(g)));
    /* beads that carry the current: conventional current, so they run from + towards -, faster when there is more of it */
    const count = Math.max(3, Math.min(14, Math.round(curve.getLength() / 9))), beads: T.Group[] = [], at = new T.Vector3();
    const coreGeo = new T.SphereGeometry(1.5, 10, 8), rimGeo = new T.SphereGeometry(1.5 + HT, 10, 8), coreMat = new T.MeshBasicMaterial({ color: 0xffd21f });
    for (let i = 0; i < count; i++) {
      const bead = new T.Group();
      bead.add(new T.Mesh(coreGeo, coreMat), new T.Mesh(rimGeo, shell(g)));
      bead.children.forEach(c => { c.raycast = () => {}; });
      bead.visible = false; g.add(bead); beads.push(bead);
    }
    let amps = 0;
    itemAnim.push(t => {
      const a = Math.abs(amps);
      if (a < 0.0002) { for (const b of beads) b.visible = false; return; }
      const speed = 0.00022 * (0.35 + Math.min(1, a / 0.02)) * Math.sign(amps);   // fractions of the wire per millisecond
      beads.forEach((b, i) => {
        curve.getPoint((((t * speed + i / count) % 1) + 1) % 1, at);
        b.position.copy(at); b.visible = true;
      });
    });
    return { g, set: v => { amps = v; } };
  }
  function mkLed(it: Of<'led'>): Made {
    const g = new T.Group(), a = anchor(it.a), k = anchor(it.k), mx = (a.x + k.x) / 2, mz = (a.z + k.z) / 2, y = a.y;
    const dim = new T.Color(it.color).multiplyScalar(0.5).getHex();
    leg(g, a, 7); leg(g, k, 7); lead(g, a.clone().setY(y + 7), k.clone().setY(y + 7), y + 7);
    const ms = [cyl(g, mx, y + 6.5, mz, 3, 1, dim), cyl(g, mx, y + 7.5, mz, 2.5, 4.6, dim), ball(g, mx, y + 12.1, mz, 2.5, dim)];
    const halo = new T.Mesh(new T.SphereGeometry(8, 20, 14), new T.MeshBasicMaterial({ color: it.color, transparent: true, opacity: 0, depthWrite: false }));
    halo.position.set(mx, y + 11, mz); halo.raycast = () => {}; g.add(halo);
    let burnt = false;
    const set = (v: number) => { if (burnt) v = 0; ms.forEach(m => { m.material.emissive.setHex(it.color); m.material.emissiveIntensity = v * 0.9; }); halo.material.opacity = v * 0.3; };
    const burn = () => { burnt = true; set(0); ms.forEach(m => m.material.color.setHex(0x2a2522)); };
    return { g, set, burn, top: new T.Vector3(mx, y + 15, mz) };
  }
  const BAND = [0x1b1e23, 0x7a4a21, 0xc0392b, 0xe8821e, 0xe8c22e, 0x3aa655, 0x3577d4, 0x8d5bd1, 0x888f96, 0xeeeeee];
  function mkRes(it: Of<'res'>): Made {
    const g = new T.Group(), a = anchor(it.a), b = anchor(it.b), y = a.y + 3.2, dx = b.x - a.x, dz = b.z - a.z;
    const ohms = it.ohms ?? 220, exp = Math.max(0, Math.floor(Math.log10(ohms)) - 1), mant = Math.round(ohms / 10 ** exp);
    leg(g, a, 3.4); leg(g, b, 3.4); lead(g, a, b, y);
    const body = new T.Group(); body.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2); body.rotation.y = -Math.atan2(dz, dx); g.add(body);
    cyl(body, 0, y, 0, 1.25, 6.4, 0xdcbd8e, { ax: 'x' });
    [[-2.1, BAND[Math.floor(mant / 10) % 10]], [-1, BAND[mant % 10]], [0.1, BAND[Math.min(9, exp)]], [2, 0xc9a227]].forEach(([dxb, c]) => cyl(body, dxb, y, 0, 1.32, 0.65, c, { ax: 'x', nh: 1 }));
    return { g, top: new T.Vector3((a.x + b.x) / 2, y + 2, (a.z + b.z) / 2) };
  }
  function mkButton(it: Of<'button'>): Made {
    const g = new T.Group(), p = anchor('e' + it.col), q = anchor('f' + (it.col + 2)), cx = (p.x + q.x) / 2, cz = (p.z + q.z) / 2, y = p.y;
    [[p.x, p.z], [q.x, p.z], [p.x, q.z], [q.x, q.z]].forEach(([x, z]) => box(g, x, y, z, 0.7, 1.6, 0.5, 0xaab2ba, { nh: 1 }));
    box(g, cx, y + 0.5, cz, 6.2, 3.3, 6.2, 0x2b3038); box(g, cx, y + 3.8, cz, 6.2, 0.35, 6.2, METAL, { nh: 1 });
    const cap = cyl(g, cx, y + 4.1, cz, 1.9, 1.9, 0xe2572b), capY = cap.position.y;
    const set = (on: number) => { cap.position.y = cap.userData.hull.position.y = capY - (on ? 1.1 : 0); };
    return { g, set, top: new T.Vector3(cx, y + 6.5, cz) };
  }
  function mkPot(it: Of<'pot'>): Made {
    const g = new T.Group(), p = anchor(it.row + (it.col + 1)), y = p.y;
    box(g, p.x, y + 0.8, p.z, 9.6, 6.4, 9.6, 0x2f6db5);
    for (let i = -1; i <= 1; i++) box(g, p.x + i * 2.54, y, p.z, 0.7, 0.9, 0.5, 0xaab2ba, { nh: 1 });
    const knob = new T.Group(); knob.userData.hm = shell(g); knob.position.set(p.x, y + 7.2, p.z); g.add(knob);
    cyl(knob, 0, 0, 0, 3.3, 6, 0xe6e9ec); box(knob, 0, 6, -1.9, 0.9, 0.12, 2.6, DARK, { nh: 1 });
    const set = (v: number) => { knob.rotation.y = (0.5 - v) * 4.7; };
    return { g, set, top: new T.Vector3(p.x, y + 14.5, p.z) };
  }
  function mkBuzzer(it: Of<'buzzer'>): Made {
    const g = new T.Group(), a = anchor(it.a), b = anchor(it.b), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, y = a.y;
    let freq = 0;
    leg(g, a, 0.8); leg(g, b, 0.8); lead(g, a.clone().setY(y + 0.8), b.clone().setY(y + 0.8), y + 0.8);
    const body = cyl(g, cx, y + 0.7, cz, 6, 8.6, 0x2b3038); cyl(g, cx, y + 9.3, cz, 1.2, 0.08, 0x8d97a1, { nh: 1 });
    itemAnim.push(t => { const s = freq ? 1 + 0.04 * Math.sin(t / 16) : 1; body.scale.set(s, 1, s); body.userData.hull.scale.set(s, 1, s); });
    return { g, set: f => { freq = f; }, top: new T.Vector3(cx, y + 11, cz) };
  }
  function mkSonar(it: Of<'sonar'>): Made {
    const g = new T.Group(), p = anchor(it.row + it.col), cx = p.x + 3.81, z = p.z, y = p.y;
    for (let i = 0; i < 4; i++) box(g, p.x + i * 2.54, y, z, 0.6, 3.4, 0.6, GOLD, { nh: 1 });
    box(g, cx, y + 3, z, 45, 20, 1.5, 0x2a62b8);
    [-1, 1].forEach(s => { cyl(g, cx + s * 13, y + 13, z + 6.75, 8, 12, 0xcfd4d9, { ax: 'z' }); cyl(g, cx + s * 13, y + 13, z + 12.85, 6.4, 0.3, 0x3a4048, { ax: 'z', nh: 1 }); });
    box(g, cx, y + 19.5, z + 0.75, 7, 2.6, 1.6, 0xd5d9dd, { nh: 1 });
    const wall = new T.Group(); box(wall, cx, 0, 0, 48, 30, 5, 0xe2572b); shadow(wall, cx, 0, 48, 5); g.add(wall);
    const set = (cm: number) => { wall.position.z = z + 17 + cm * 0.6; };
    set(30);
    return { g, set, top: new T.Vector3(cx, y + 25, z) };
  }
  function mkPad(): Made {
    const at = padPos!, g = new T.Group(), m = box(g, at.x, 0, at.z, 18, 0.8, 18, 0xc98a4b);
    const set = (on: number) => { m.material.emissive.setHex(0xffc27a); m.material.emissiveIntensity = on ? 0.7 : 0; };
    return { g, set, top: new T.Vector3(at.x, 3, at.z) };
  }
  function make(it: Item, k: number): Made {
    switch (it.t) {
      case 'wire': return mkWire(it, k);
      case 'led': return mkLed(it);
      case 'res': return mkRes(it);
      case 'button': return mkButton(it);
      case 'pot': return mkPot(it);
      case 'buzzer': return mkBuzzer(it);
      case 'sonar': return mkSonar(it);
      case 'pad': return mkPad();
    }
  }

  function cable(b: BuiltBoard) {   // a USB cable leaving the board to the left
    const g = new T.Group(), p = new T.Vector3(...b.usbAt).add(b.group.position), [w, h, d] = b.plug;
    g.userData.nofit = true;
    box(g, p.x - w / 2 - 0.5, p.y - h / 2, p.z, w, h, d, 0x3a4048);
    const s = new T.Vector3(p.x - w - 0.5, p.y, p.z);
    const curve = new T.CubicBezierCurve3(s, s.clone().setX(s.x - 14), new T.Vector3(s.x - 20, 2, s.z + 8), new T.Vector3(s.x - 70, 2, s.z + 22));
    g.add(new T.Mesh(new T.TubeGeometry(curve, 24, 1.7, 8), toon(0x3a4048))); g.add(new T.Mesh(new T.TubeGeometry(curve, 24, 1.7 + HT, 8), shell(g)));
    world.add(g);
  }

  /* --- smoke and sparks --- */
  const fx: { m: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>; v: T.Vector3; born: number; life: number }[] = [];
  function puff(at: T.Vector3, kind: 'smoke' | 'spark') {
    const now = performance.now(), n = kind === 'smoke' ? 9 : 14;
    for (let i = 0; i < n; i++) {
      const r = kind === 'smoke' ? 1.6 + Math.random() * 1.6 : 0.5 + Math.random() * 0.5;
      const m = new T.Mesh(new T.SphereGeometry(r, 10, 8), new T.MeshBasicMaterial({ color: kind === 'smoke' ? (i % 2 ? 0x8d949b : 0x5b6168) : (i % 2 ? 0xffc23a : 0xff7a2a), transparent: true, opacity: 0.85, depthWrite: false }));
      m.position.copy(at); m.raycast = () => {}; world.add(m);
      const sp = kind === 'smoke' ? 0.006 : 0.03;
      fx.push({ m, born: now, life: kind === 'smoke' ? 1700 : 650, v: new T.Vector3((Math.random() - 0.5) * sp * 2, (kind === 'smoke' ? 0.012 : 0.02) + Math.random() * sp, (Math.random() - 0.5) * sp * 2) });
    }
  }
  function stepFx(t: number) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], p = (t - f.born) / f.life;
      if (p >= 1) { world.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); fx.splice(i, 1); continue; }
      f.m.position.addScaledVector(f.v, 16); f.m.scale.setScalar(1 + p * 1.8); f.m.material.opacity = 0.85 * (1 - p);
    }
  }

  /* --- assembly --- */
  const addHot = (id: string, title: string, pos: T.Vector3) => hots.push({ id, title, pos });
  const isUno = spec.board === 'uno';
  bb = buildBB(); bb.position.set(isUno ? 50 : 0, 0, 0); world.add(bb);
  const b = isUno ? (uno = buildUno()) : buildEsp();
  if (isUno) { b.group.position.set(-50, 1.6, 0); shadow(world, b.group.position.x, 0, b.W, b.D); }
  else b.group.position.set(colX(4) + b.W / 2 - 8.24, BBH + 4.1, 0);
  world.add(b.group); cable(b);
  Object.assign(groups, b.parts); devs.builtin = b.setLed;
  if (spec.parts) for (const id of Object.keys(spec.parts)) { const h = b.hot[id]; if (h) addHot(id, spec.parts[id][0], new T.Vector3(...h).add(b.group.position)); }
  padPos = new T.Vector3(bb.position.x + colX(8), 0.8, 46);
  const boardHots = hots.length;

  /* --- the parts the student placed --- */
  let placed: T.Group[] = [], placedIds: string[] = [], burntSet = new Set<string>();
  const burners: Record<string, () => void> = {}, tops: Record<string, T.Vector3> = {};
  const free = (o: T.Object3D) => o.traverse(c => { if (c instanceof T.Mesh) { c.geometry.dispose(); c.material.map?.dispose(); c.material.dispose(); } });
  function setCircuit(items: Item[], burnt: string[]) {
    placed.forEach(g => { world.remove(g); free(g); });
    placedIds.forEach(id => { delete devs[id]; delete groups[id]; delete burners[id]; delete tops[id]; });
    placed = []; placedIds = []; itemAnim.length = 0; hots.length = boardHots; burntSet = new Set(burnt); lit = [];
    items.forEach((it, k) => {
      let made: Made;
      try { made = make(it, k); } catch { return; }   // a point that is not on this bench is skipped
      const id = itemId(it, k);
      made.g.userData.pick = id;
      world.add(made.g); groups[id] = made.g; placed.push(made.g); placedIds.push(id);
      if (made.set) devs[id] = made.set;
      if (made.top) tops[id] = made.top;
      if (made.burn) { burners[id] = made.burn; if (burntSet.has(id)) made.burn(); }
      if (made.top && spec.info[it.t]) addHot(id, spec.info[it.t][0], made.top);
    });
  }
  const safeAnchor = (name: string): T.Vector3 | null => { try { return anchor(name); } catch { return null; } };

  /* --- rings that show where a part is about to go --- */
  const ring = (color: number) => {
    const m = new T.Mesh(new T.RingGeometry(1.5, 2.7, 24), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, side: T.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 999; m.visible = false; m.raycast = () => {}; m.userData.nofit = true; world.add(m); return m;
  };
  const hoverRing = ring(0x14b8c4), pendRing = ring(0xe2572b);
  const preview = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: 0xe2572b, depthTest: false }));
  preview.renderOrder = 998; preview.visible = false; preview.raycast = () => {}; preview.userData.nofit = true; world.add(preview);

  return {
    group: world, hots,
    set(id, value) { devs[id]?.(value); },
    highlight(id) {
      lit.forEach(m => m.color.setHex(INK));
      lit = [];
      const g = id ? groups[id] : null; if (!g) return;
      g.traverse(o => { const hm: T.MeshBasicMaterial | undefined = o.userData.hm; if (hm && !lit.includes(hm)) lit.push(hm); });
      lit.forEach(m => m.color.setHex(HILITE));
    },
    animate(t) { itemAnim.forEach(f => f(t)); stepFx(t); },
    setCircuit,
    burn(id) {
      if (burntSet.has(id)) return;
      burntSet.add(id); burners[id]?.();
      const at = tops[id]; if (at) puff(at.clone().setY(at.y - 4), 'smoke');
    },
    puff,
    anchor: safeAnchor,
    markers(hover, pending) {
      const place = (r: T.Mesh, name: string | null) => { const p = name ? safeAnchor(name) : null; r.visible = !!p; if (p) r.position.set(p.x, p.y + 0.4, p.z); return p; };
      const h = place(hoverRing, hover), q = place(pendRing, pending);
      preview.visible = !!(h && q && hover !== pending);
      if (preview.visible) preview.geometry.setFromPoints([q!.clone().setY(q!.y + 2), h!.clone().setY(h!.y + 2)]);
    },
    dispose() {
      world.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose();
      });
    },
  };
}
