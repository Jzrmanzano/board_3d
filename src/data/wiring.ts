import type { Item, WireColor } from '../types';
import { ESP_HOLES } from './boards';

export const WIRE_CSS: Record<WireColor, string> = { red: '#d6453d', black: '#2f353d', orange: '#f08a24', yellow: '#e8c22e', green: '#3aa655', blue: '#3577d4', white: '#e9ecef', purple: '#8d5bd1' };

/** A connection point in words, such as "Uno pin 13" or "minus rail, far side". */
function pointName(a: string): string {
  let m;
  if ((m = /^U:(.+)$/.exec(a))) { const n = m[1].replace(/^GND.*$/, 'GND').replace('3V3', '3.3V'); return /^\d+$/.test(n) ? 'Uno pin ' + n : 'Uno ' + n; }
  if ((m = /^E:(.+)$/.exec(a))) return `ESP32 ${m[1].replace('GNDf', 'GND')} (hole ${ESP_HOLES[m[1]]})`;
  if (a === 'PAD') return 'the touch pad';
  if ((m = /^([TB])([+-])(\d+)$/.exec(a))) return `${m[2] === '+' ? 'plus' : 'minus'} rail, ${m[1] === 'T' ? 'far' : 'near'} side`;
  return 'hole ' + a;
}

export interface WiringRow { part: string; where: string; wire?: WireColor }

/** One row of the wiring table per part and wire. */
export function wiringRows(circuit: Item[]): WiringRow[] {
  return circuit.map((it): WiringRow => {
    switch (it.t) {
      case 'led': return { part: 'LED', where: `long leg in ${it.a}, short leg in ${it.k}` };
      case 'res': return { part: '220 Ω resistor', where: `${it.a} to ${it.b}` };
      case 'button': return { part: 'Push button', where: `across the centre gap: e${it.col}, e${it.col + 2}, f${it.col}, f${it.col + 2}` };
      case 'pot': return { part: 'Potentiometer', where: `${it.row}${it.col}, ${it.row}${it.col + 1}, ${it.row}${it.col + 2}` };
      case 'buzzer': return { part: 'Buzzer', where: `one leg in ${it.a}, the other in ${it.b}` };
      case 'sonar': return { part: 'HC-SR04', where: `VCC ${it.row}${it.col}, Trig ${it.row}${it.col + 1}, Echo ${it.row}${it.col + 2}, GND ${it.row}${it.col + 3}` };
      case 'pad': return { part: 'Touch pad', where: 'on the table, on the end of the white wire' };
      case 'wire': return { part: `${it.c[0].toUpperCase() + it.c.slice(1)} wire`, where: `${pointName(it.a)} to ${pointName(it.b)}`, wire: it.c };
    }
  });
}
