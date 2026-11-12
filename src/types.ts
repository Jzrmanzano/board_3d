export type BoardId = 'uno' | 'esp32';
export type WireColor = 'red' | 'black' | 'orange' | 'yellow' | 'green' | 'blue' | 'white' | 'purple';

/** One thing on the bench. Connection points are named like "U:13" (Uno pin), "E:D5" (ESP32 pin), "a10" (breadboard hole) or "T-15" (power rail). */
export type Item =
  | { t: 'wire'; a: string; b: string; c: WireColor }
  | { t: 'led'; id: string; a: string; k: string; color: number; pin: number }
  | { t: 'res'; a: string; b: string }
  | { t: 'button'; id: string; col: number; pin: number; ctl: string }
  | { t: 'pot'; id: string; row: string; col: number; pin: number; ctl: string }
  | { t: 'buzzer'; id: string; a: string; b: string; pin: number }
  | { t: 'sonar'; id: string; row: string; col: number; trig: number; echo: number; ctl: string }
  | { t: 'pad'; id: string; pin: number; ctl: string };

export const itemId = (it: Item, index: number): string => ('id' in it ? it.id : it.t + index);

export type Info = [title: string, text: string];
export type Pin = [name: string, note: string, kind?: 'pwr' | 'gnd' | 'bus'];

export interface Lesson {
  id: string;
  title: string;
  hook: string;
  showParts?: boolean;
  circuit: Item[];
  /** intro, how and tryit are trusted HTML written in src/data. */
  intro: string;
  how: string[];
  tryit: string[];
  code: string;
}

export interface Board {
  id: BoardId;
  name: string;
  adcMax: number;
  builtin: number;
  consts: Record<string, number>;
  parts: Record<string, Info>;
  pinout: { title: string; pins: Pin[] }[];
  facts: [string, string][];
  lessons: Lesson[];
}
