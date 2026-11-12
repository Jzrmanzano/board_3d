/* Campus Missions. Each mission is a small device to build for somewhere on a school campus, checked by running the student's own sketch on the student's own circuit.
   The reference build in each mission (`circuit` and `answer`) is what the tests run to prove the checks can be passed, and what the last hint offers. */
import { blinks, ledOn, phases, reaction, soundOn, sweeps, type InputStep, type Sample, type Scenario, type Trace } from '../sim/check';
import type { Tool } from '../state/bench';
import type { BoardId, Item } from '../types';

/* --- the parts tray --- */
export type PartId = 'led-red' | 'led-green' | 'res-220' | 'res-1k' | 'res-10k' | 'wire' | 'button' | 'knob' | 'buzzer' | 'sonar' | 'pad';
export const PARTS: Record<PartId, { label: string; tool: Tool; swatch?: string; only?: BoardId }> = {
  'led-red': { label: 'Red LED', tool: { kind: 'led', color: 0xff3b30 }, swatch: '#ff3b30' },
  'led-green': { label: 'Green LED', tool: { kind: 'led', color: 0x2ecc40 }, swatch: '#2ecc40' },
  'res-220': { label: '220 Ω', tool: { kind: 'res', ohms: 220 } },
  'res-1k': { label: '1 kΩ', tool: { kind: 'res', ohms: 1000 } },
  'res-10k': { label: '10 kΩ', tool: { kind: 'res', ohms: 10000 } },
  wire: { label: 'Wire', tool: { kind: 'wire' } },
  button: { label: 'Button', tool: { kind: 'button' } },
  knob: { label: 'Knob', tool: { kind: 'pot' } },
  buzzer: { label: 'Buzzer', tool: { kind: 'buzzer' } },
  sonar: { label: 'Distance sensor', tool: { kind: 'sonar' } },
  pad: { label: 'Touch pad', tool: { kind: 'pad' }, only: 'esp32' },
};
/** What the tray holds before any mission has been passed. */
export const BASE_PARTS: PartId[] = ['led-red', 'res-220', 'wire'];

export function partIdOf(it: Item): PartId {
  switch (it.t) {
    case 'led': return it.color === 0x2ecc40 ? 'led-green' : 'led-red';
    case 'res': return it.ohms === 1000 ? 'res-1k' : it.ohms === 10000 ? 'res-10k' : 'res-220';
    case 'pot': return 'knob';
    case 'wire': case 'button': case 'buzzer': case 'sonar': case 'pad': return it.t;
  }
}

/* --- missions --- */
export interface PredictOption { id: string; label: string }
/** Asked before the first run: what will the build do? The demo run is the student's own sketch on their own circuit, so the answer is checked against the real thing. */
export interface Prediction {
  question: string;
  options: PredictOption[];
  /** The inputs to play during the demo, and how long it lasts. */
  demo: InputStep[];
  run: number;
  /** Which option describes what the sketch did. */
  classify(tr: Trace): string;
  /** The option that means it works. */
  works: string;
  /** What each outcome means, shown when the prediction is compared with the result. */
  explain: Record<string, string>;
}
export interface Mission {
  id: string;
  title: string;
  /** The place on the campus map. */
  place: string;
  hook: string;
  /** Where it sits on the map, in percent from the left and the top. */
  map: [x: number, y: number];
  /** Missions that must be passed first. */
  after: string[];
  /** Free build: no goal and no checks. */
  sandbox?: boolean;
  /** Label the parts of the board, as in a tour. */
  showParts?: boolean;
  /** Trusted HTML. */
  story: string;
  goal: string;
  how: string[];
  /** The on-screen controls, named for the story ("Hallway light level"). */
  controls?: Partial<Record<'button' | 'pot' | 'sonar' | 'pad', string>>;
  starter: string;
  /** The reference build and sketch. */
  circuit: Item[];
  answer: string;
  predict?: Prediction;
  /** A nudge, then the idea, then the answer. */
  hints: [nudge: string, idea: string, answer: string];
  checks: Scenario[];
  /** Parts added to the tray when this mission is passed. */
  unlocks: PartId[];
}

/* --- circuits shared by several missions --- */
const unoLed = (pin: number): Item[] => [
  { t: 'wire', a: 'U:' + pin, b: 'a10', c: 'orange' },
  { t: 'led', id: 'led', a: 'e10', k: 'e11', color: 0xff3b30 },
  { t: 'res', a: 'c11', b: 'c15' },
];
const unoKnob: Item[] = [
  ...unoLed(9),
  { t: 'wire', a: 'a15', b: 'T-15', c: 'black' }, { t: 'wire', a: 'U:GND', b: 'T-2', c: 'black' }, { t: 'wire', a: 'U:5V', b: 'T+1', c: 'red' },
  { t: 'pot', id: 'pot', row: 'd', col: 24, ctl: 'Knob position' },
  { t: 'wire', a: 'a24', b: 'T+24', c: 'red' }, { t: 'wire', a: 'a26', b: 'T-26', c: 'black' }, { t: 'wire', a: 'a25', b: 'U:A0', c: 'green' },
];
const espLed: Item[] = [
  { t: 'wire', a: 'E:D5', b: 'j22', c: 'orange' },
  { t: 'led', id: 'led', a: 'g22', k: 'g23', color: 0xff3b30 },
  { t: 'res', a: 'h23', b: 'h27' },
  { t: 'wire', a: 'j27', b: 'B-27', c: 'black' },
  { t: 'wire', a: 'E:GND', b: 'B-5', c: 'black' },
];

/* --- reading what a run did, for the prediction --- */
type Behaviour = 'off' | 'on' | 'blinks';
const behaviour = (tr: Trace, who: 'led' | 'builtin'): Behaviour => {
  const on = (s: Sample) => (who === 'led' ? ledOn(s) : s.builtin > 0.5);
  let changes = 0;
  for (let i = 1; i < tr.samples.length; i++) if (on(tr.samples[i]) !== on(tr.samples[i - 1])) changes++;
  return changes >= 3 ? 'blinks' : tr.samples.some(on) ? 'on' : 'off';
};
const BLINK_OPTIONS: PredictOption[] = [{ id: 'off', label: 'It stays dark' }, { id: 'on', label: 'It turns on and stays on' }, { id: 'blinks', label: 'It blinks' }];
const BLINK_EXPLAIN = {
  off: 'The light never turned on. Check that the sketch sets the pin HIGH and, if you wired the LED yourself, that the pin in the sketch is the pin the wire is on.',
  on: 'The light turned on but never went off again, so it did not blink. A blink needs a wait, an off and another wait.',
  blinks: 'The light went on and off again and again, which is a blink.',
};
/** "Does it react?": the state in one moment compared with the state in a later one. */
const reacts = (state: (s: Sample) => boolean, earlier: number, later: number, later_id: string, earlier_id: string) => (tr: Trace): string => {
  const r = reaction(tr, state, earlier, later);
  return r === 'later' ? later_id : r === 'earlier' ? earlier_id : r;
};
/** What each outcome means for a mission whose build should react to an input. */
const reactExplain = (laterId: string, laterText: string, earlierId: string, earlierText: string): Record<string, string> => ({
  [laterId]: laterText,
  [earlierId]: earlierText,
  always: 'It was on the whole time, whatever the input did. The sketch is not looking at the input, or the comparison is always true.',
  never: 'It never came on. Check that the sketch reads the input and that the output pin matches the wire.',
});

const dark = 0.1, bright = 0.9;

/* --- the Uno missions --- */
const UNO: Mission[] = [
  {
    id: 'tour', title: 'Workshop tour', place: 'Maker Workshop', hook: 'Meet the board and make its own light blink.', map: [25, 93], after: [], showParts: true,
    story: 'Every maker starts in the workshop. An Arduino Uno is a small computer that runs one program, called a sketch. Click the labels on the board to see what each part does. Then finish the sketch so the tiny light marked <b>L</b> blinks.',
    goal: 'Make the board\'s own L light blink, half a second on and half a second off.',
    how: ['<code>setup()</code> runs once when the board starts. <code>loop()</code> runs again and again, forever.', '<code>LED_BUILTIN</code> is pin 13, the pin wired to the L light.', '<code>Serial.println()</code> sends text to the Serial Monitor under the code.'],
    starter: `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Hello from the Uno!");
}

void loop() {
  // turn the light on, wait half a second, turn it off, wait again
}`,
    circuit: [],
    answer: `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Hello from the Uno!");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);   // light on
  delay(500);                        // wait half a second
  digitalWrite(LED_BUILTIN, LOW);    // light off
  delay(500);
}`,
    predict: {
      question: 'The starter sketch is ready to run. What will the L light on the board do?',
      options: BLINK_OPTIONS, demo: [], run: 6000, classify: tr => behaviour(tr, 'builtin'), works: 'blinks', explain: BLINK_EXPLAIN,
    },
    hints: [
      'Look at the checklist: the sketch says hello already, so the part that is failing is the blinking. What does <code>loop()</code> do right now?',
      'To blink, the light has to go on, stay on for a while, go off, and stay off for a while. <code>digitalWrite(pin, HIGH)</code> turns it on, <code>digitalWrite(pin, LOW)</code> turns it off, and <code>delay(ms)</code> waits.',
      'Inside <code>loop()</code>: digitalWrite(LED_BUILTIN, HIGH); delay(500); digitalWrite(LED_BUILTIN, LOW); delay(500);',
    ],
    checks: [
      phases('The sketch says hello', [{ when: 'the sketch starts', ms: 500, mode: 'during', expect: { serial: /hello/i } }]),
      blinks('The on-board light blinks', 'builtin'),
    ],
    unlocks: [],
  },
  {
    id: 'beacon', title: 'Gate beacon', place: 'Front Gate', hook: 'Build a blinking light so delivery drivers can find the gate.', map: [30, 80], after: [],
    story: 'The front gate has no light and delivery drivers keep missing it after dark. Build a <b>beacon</b>: an LED that blinks about once a second. You will wire it yourself, so remember that current needs a complete loop and that an LED needs a resistor.',
    goal: 'Wire an LED and a resistor to any digital pin, and make the LED blink about once a second.',
    how: ['<code>const int LED_PIN = 13;</code> gives the pin a name, so you change one line if you move the wire.', '<code>pinMode(LED_PIN, OUTPUT)</code> lets the pin supply current.', 'HIGH puts 5 V on the pin and lights the LED. LOW puts 0 V and it goes dark.'],
    starter: `// Gate beacon
// Which pin is your LED's wire plugged into? Put its number here.
const int LED_PIN = 13;

void setup() {
  // get the pin ready to send out power
}

void loop() {
  // turn the LED on, wait, turn it off, wait
}`,
    circuit: [...unoLed(13), { t: 'wire', a: 'a15', b: 'U:GND2', c: 'black' }],
    answer: `const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);
}`,
    predict: {
      question: 'You have wired the LED and written the sketch. What will the LED do when you press Run?',
      options: BLINK_OPTIONS, demo: [], run: 6000, classify: tr => behaviour(tr, 'led'), works: 'blinks', explain: BLINK_EXPLAIN,
    },
    hints: [
      'Press <b>Check my build</b> and read the first line. If the wiring check fails, the circuit check panel over the 3D view says exactly what is wrong.',
      'Current flows in a loop: out of a pin, through the LED, through a resistor, and back to GND. The long leg of the LED must face the pin. In the sketch, the pin has to be an OUTPUT, and blinking means HIGH, wait, LOW, wait.',
      'Wire pin 13 to hole a10, put the LED\'s long leg in e10 and its short leg in e11, put a 220 Ω resistor from c11 to c15, and wire a15 to GND. In the sketch set the pin to OUTPUT in setup(), then in loop() write HIGH, delay(1000), write LOW, delay(1000).',
    ],
    checks: [
      phases('The LED lights up', [{ when: 'the sketch has been running for a few seconds', ms: 3000, mode: 'during', expect: { led: true } }]),
      blinks('The LED blinks about once a second'),
    ],
    unlocks: ['knob', 'res-10k'],
  },
  {
    id: 'nightlight', title: 'Night light', place: 'Main Hallway', hook: 'Turn a light on when the hallway gets dark.', map: [70, 67], after: ['beacon'],
    story: 'The main hallway is pitch dark after the last bell, and the lights are on a timer nobody trusts. Build a <b>night light</b> that comes on by itself when it is dark and goes off when it is bright. The knob stands in for the light sensor: <b>0% is darkness</b>, <b>100% is full daylight</b>.',
    goal: 'The LED comes on when the light level is low and goes off when it is high.',
    controls: { pot: 'Hallway light level' },
    how: ['A knob gives the board a voltage between 0 V and 5 V. <code>analogRead()</code> turns it into a number from 0 to 1023.', '<code>if</code> / <code>else</code> chooses between two things to do. <code>&lt;</code> means "is less than".', 'The sketch keeps checking, because <code>loop()</code> repeats. The short <code>delay()</code> stops it checking thousands of times a second.'],
    starter: `// Hallway night light
const int SENSOR_PIN = A0;   // the light sensor (the knob)
const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  // 1. read the sensor with analogRead(SENSOR_PIN)
  // 2. if the number is low (it is dark) turn the LED on, otherwise turn it off
  delay(50);
}`,
    circuit: unoKnob,
    answer: `const int SENSOR_PIN = A0;
const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int light = analogRead(SENSOR_PIN);   // 0 (dark) to 1023 (bright)

  if (light < 300) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  delay(50);
}`,
    predict: {
      question: 'Your night light is built. The hallway starts bright, then gets dark. What will the LED do?',
      options: [
        { id: 'dark', label: 'It turns on when the hallway gets dark' }, { id: 'bright', label: 'It turns on when the hallway gets bright' },
        { id: 'always', label: 'It stays on whatever happens' }, { id: 'never', label: 'It never lights' },
      ],
      demo: [{ from: 0, set: { pot: bright } }, { from: 2000, set: { pot: dark } }], run: 4000,
      classify: reacts(ledOn, 1800, 3800, 'dark', 'bright'), works: 'dark',
      explain: reactExplain('dark', 'It reacted the way it should: it came on when it got dark.', 'bright', 'It reacted, but backwards: it came on when it got bright. Check which way your comparison points.'),
    },
    hints: [
      'Turn the light level knob while the sketch runs, and watch the number the sensor gives. Which numbers mean dark?',
      'Read the sensor with <code>analogRead(SENSOR_PIN)</code>. Dark is a low number. Use <code>if</code> to compare it with a limit somewhere in the low hundreds, and write HIGH or LOW to the LED pin.',
      'In loop(): int light = analogRead(SENSOR_PIN); then if (light &lt; 300) digitalWrite(LED_PIN, HIGH); else digitalWrite(LED_PIN, LOW); then delay(50).',
    ],
    checks: [
      phases('The light stays off in daylight', [{ when: 'the hallway is bright (light level 90%)', set: { pot: bright }, expect: { led: false } }]),
      phases('The light comes on in the dark', [{ when: 'the hallway is dark (light level 10%)', set: { pot: dark }, expect: { led: true } }]),
      phases('It follows the light as it changes', [
        { when: 'the hallway is bright', set: { pot: bright }, expect: { led: false } },
        { when: 'the lights go out', set: { pot: dark }, expect: { led: true } },
        { when: 'the sun comes back', set: { pot: bright }, expect: { led: false } },
      ]),
    ],
    unlocks: ['button'],
  },
  {
    id: 'lamp', title: 'Reading lamp', place: 'Reading Room', hook: 'Dim a lamp smoothly with a dial.', map: [30, 54], after: ['nightlight'],
    story: 'The reading room lamp is either blinding or off. Build a <b>dimmer</b>: turning the dial up should make the lamp brighter, and all the way down should switch it off. A pin cannot output half a voltage, but it can switch on and off so fast that the LED looks dimmer. That is called PWM.',
    goal: 'The LED\'s brightness follows the dial from off to full.',
    controls: { pot: 'Lamp dial' },
    how: ['<code>analogWrite(pin, value)</code> switches a pin on and off very fast. A value of 0 is always off and 255 is always on. In between, the LED is on for that share of the time.', '<code>map(reading, 0, 1023, 0, 255)</code> turns a reading from 0 to 1023 into a brightness from 0 to 255.', 'Only the pins marked <b>~</b> on the board can do PWM.'],
    starter: `// Reading room lamp
const int KNOB_PIN = A0;
const int LAMP_PIN = 9;   // a pin marked ~ can dim with analogWrite

void setup() {
  pinMode(LAMP_PIN, OUTPUT);
}

void loop() {
  // read the knob (0 to 1023), turn it into a brightness (0 to 255), then use analogWrite
  delay(20);
}`,
    circuit: unoKnob,
    answer: `const int KNOB_PIN = A0;
const int LAMP_PIN = 9;

void setup() {
  pinMode(LAMP_PIN, OUTPUT);
}

void loop() {
  int reading = analogRead(KNOB_PIN);              // 0 to 1023
  int brightness = map(reading, 0, 1023, 0, 255);  // 0 to 255
  analogWrite(LAMP_PIN, brightness);
  delay(20);
}`,
    predict: {
      question: 'The lamp is built and the dial is turned up from a little to a lot. What will the LED do?',
      options: [
        { id: 'brighter', label: 'It gets brighter as the dial goes up' }, { id: 'dimmer', label: 'It gets dimmer as the dial goes up' },
        { id: 'same', label: 'It stays at one brightness' }, { id: 'never', label: 'It never lights' },
      ],
      demo: [{ from: 0, set: { pot: 0.2 } }, { from: 2000, set: { pot: 0.8 } }], run: 4000,
      classify: tr => {
        const low = Math.max(0, ...tr.at(1800).duties), high = Math.max(0, ...tr.at(3800).duties);
        return Math.max(low, high) < 0.02 ? 'never' : high > low + 0.2 ? 'brighter' : low > high + 0.2 ? 'dimmer' : 'same';
      },
      works: 'brighter',
      explain: {
        brighter: 'The LED got brighter as the dial went up, which is what a dimmer does.',
        dimmer: 'The LED got dimmer as the dial went up. The brightness has to grow with the reading.',
        same: 'The LED stayed at one brightness. It is probably only being switched fully on or fully off, not dimmed.',
        never: 'The LED never lit. Check that the sketch reads the knob and writes to the same pin the LED is wired to.',
      },
    },
    hints: [
      'Turn the dial slowly and watch the LED. Does it change smoothly, or only jump between off and on?',
      'Read the dial with <code>analogRead</code> (0 to 1023). Scale that to 0 to 255 with <code>map</code>, and write it with <code>analogWrite</code>, not <code>digitalWrite</code>, so the pin can dim.',
      'In loop(): int reading = analogRead(KNOB_PIN); int brightness = map(reading, 0, 1023, 0, 255); analogWrite(LAMP_PIN, brightness); delay(20);',
    ],
    checks: [
      phases('The lamp is off at zero', [{ when: 'the dial is turned all the way down', set: { pot: 0 }, expect: { led: false } }]),
      phases('The lamp gets brighter as the dial goes up', [
        { when: 'the dial is at 20%', set: { pot: 0.2 }, expect: { duty: [0.1, 0.3] } },
        { when: 'the dial is at 60%', set: { pot: 0.6 }, expect: { duty: [0.5, 0.7] } },
        { when: 'the dial is all the way up', set: { pot: 1 }, expect: { duty: [0.95, 1] } },
      ]),
    ],
    unlocks: ['buzzer'],
  },
  {
    id: 'chime', title: 'Door chime', place: 'Front Office', hook: 'Play a two-note chime when a visitor presses the bell.', map: [70, 41], after: ['lamp'],
    story: 'Visitors to the front office stand at the door and wait because nobody hears them. Build a <b>door chime</b>: when the bell button is pressed it plays two notes, and the rest of the time it stays silent.',
    goal: 'A button press plays a chime of two different notes. No press, no sound.',
    controls: { button: 'Hold to press the bell' },
    how: ['<code>INPUT_PULLUP</code> gives a button pin a gentle pull towards 5 V, so it reads HIGH until the button joins it to GND. Pressed reads <b>LOW</b>.', '<code>tone(pin, hertz)</code> starts a note and <code>noTone(pin)</code> stops it. A higher number is a higher note.', 'A note keeps playing until you stop it or start another, so wait between them with <code>delay()</code>.'],
    starter: `// Door chime
const int BUTTON_PIN = 2;
const int BUZZER_PIN = 8;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
}

void loop() {
  // when the button is pressed (it reads LOW), play two notes, then stop the sound
}`,
    circuit: [
      { t: 'button', id: 'btn', col: 20, ctl: 'Hold to press the button' },
      { t: 'wire', a: 'U:2', b: 'a20', c: 'yellow' }, { t: 'wire', a: 'a22', b: 'T-22', c: 'black' }, { t: 'wire', a: 'U:GND', b: 'T-1', c: 'black' },
      { t: 'buzzer', id: 'buzz', a: 'e26', b: 'e29' }, { t: 'wire', a: 'U:8', b: 'a26', c: 'purple' }, { t: 'wire', a: 'a29', b: 'T-29', c: 'black' },
    ],
    answer: `const int BUTTON_PIN = 2;
const int BUZZER_PIN = 8;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(BUTTON_PIN) == LOW) {   // someone pressed the bell
    tone(BUZZER_PIN, 659);
    delay(250);
    tone(BUZZER_PIN, 523);
    delay(350);
    noTone(BUZZER_PIN);
  }
}`,
    predict: {
      question: 'The bell and the buzzer are wired. A visitor waits, then presses the button. What will you hear?',
      options: [
        { id: 'press', label: 'Silence, then a chime when the button is pressed' }, { id: 'always', label: 'Sound all the time' },
        { id: 'never', label: 'Nothing, even when the button is pressed' },
      ],
      demo: [{ from: 0, set: { button: 0 } }, { from: 1000, set: { button: 1 } }, { from: 1500, set: { button: 0 } }], run: 3000,
      classify: tr => (tr.window(0, 950).some(soundOn) ? 'always' : tr.window(1000, 2000).some(soundOn) ? 'press' : 'never'), works: 'press',
      explain: {
        press: 'It stayed silent until the button was pressed and then played, which is a door chime.',
        always: 'It made sound even before anyone pressed the button. The sketch is not waiting for the button.',
        never: 'It never made a sound. Check that the sketch reads the button and plays a note on the buzzer\'s pin.',
      },
    },
    hints: [
      'Hold the bell button while the sketch runs. Does the Serial Monitor or the buzzer react? Remember that with INPUT_PULLUP a pressed button reads LOW, not HIGH.',
      'Use <code>if (digitalRead(BUTTON_PIN) == LOW)</code> to notice a press. Inside it, <code>tone()</code> one note, <code>delay()</code>, <code>tone()</code> a different note, <code>delay()</code>, then <code>noTone()</code>.',
      'In loop(): if (digitalRead(BUTTON_PIN) == LOW) { tone(BUZZER_PIN, 659); delay(250); tone(BUZZER_PIN, 523); delay(350); noTone(BUZZER_PIN); }',
    ],
    checks: [
      phases('It is silent when nobody is at the door', [{ when: 'nobody has pressed the bell', set: { button: 0 }, ms: 1500, mode: 'during', expect: { sound: false } }]),
      phases('The chime plays when the bell is pressed', [
        { when: 'nobody is at the door', set: { button: 0 }, ms: 800, mode: 'during', expect: { sound: false } },
        { when: 'the bell is pressed', set: { button: 1 }, ms: 900, mode: 'during', expect: { sound: true } },
        { when: 'the visitor lets go and the chime has finished', set: { button: 0 }, ms: 1500, expect: { sound: false } },
      ]),
      {
        label: 'The chime has two different notes',
        plan: [{ from: 0, set: { button: 0 } }, { from: 500, set: { button: 1 } }, { from: 1000, set: { button: 0 } }], run: 2500,
        judge(tr) {
          if (tr.buzzerCount === 0) return 'I could not find a buzzer on your bench.';
          const notes = new Set(tr.window(500, 2500).map(s => Math.round(s.sound)).filter(n => n > 0));
          return notes.size >= 2 ? null : notes.size === 1 ? 'Only one note played. A chime needs two different notes.' : 'No note played when the bell was pressed.';
        },
      },
    ],
    unlocks: ['sonar'],
  },
  {
    id: 'parking', title: 'Parking bay sensor', place: 'Parking Lot', hook: 'Warn the driver when the car is too close to the wall.', map: [30, 28], after: ['chime'],
    story: 'Cars keep bumping the wall at the end of the staff parking bay. Build a <b>proximity warning</b>: a distance sensor measures how far away the wall is, and an LED comes on when the car is closer than <b>20 cm</b>. The slider under the 3D view moves the wall.',
    goal: 'The LED turns on only when the wall is closer than 20 cm.',
    controls: { sonar: 'Distance from the sensor to the wall' },
    how: ['The sensor sends out a ping and <code>pulseIn()</code> times how long the echo takes to come back, in microseconds.', 'Sound travels about 0.0343 cm per microsecond, and the ping goes there and back, so <code>distance = duration * 0.0343 / 2</code>.', 'A <code>float</code> can hold a number with a decimal point.'],
    starter: `// Parking bay sensor
const int TRIG_PIN = 9;
const int ECHO_PIN = 10;
const int LED_PIN = 13;

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  // send a ping
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // time the echo and turn it into a distance in centimetres
  long duration = pulseIn(ECHO_PIN, HIGH);
  float distance = duration * 0.0343 / 2;

  // light the LED when the distance is under 20, otherwise turn it off

  delay(250);
}`,
    circuit: [
      ...unoLed(13),
      { t: 'wire', a: 'a15', b: 'T-15', c: 'black' }, { t: 'wire', a: 'U:GND', b: 'T-2', c: 'black' }, { t: 'wire', a: 'U:5V', b: 'T+1', c: 'red' },
      { t: 'sonar', id: 'sonar', row: 'j', col: 18, ctl: 'Distance to the wall' },
      { t: 'wire', a: 'f18', b: 'T+18', c: 'red' }, { t: 'wire', a: 'f21', b: 'T-21', c: 'black' }, { t: 'wire', a: 'g19', b: 'U:9', c: 'blue' }, { t: 'wire', a: 'g20', b: 'U:10', c: 'green' },
    ],
    answer: `const int TRIG_PIN = 9;
const int ECHO_PIN = 10;
const int LED_PIN = 13;

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  // send a ping
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // time the echo
  long duration = pulseIn(ECHO_PIN, HIGH);
  float distance = duration * 0.0343 / 2;

  Serial.print(distance);
  Serial.println(" cm");

  if (distance < 20) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  delay(250);
}`,
    predict: {
      question: 'The sensor, LED and sketch are ready. The wall starts far away, then moves close. What will the LED do?',
      options: [
        { id: 'near', label: 'It turns on when the wall is close' }, { id: 'far', label: 'It turns on when the wall is far away' },
        { id: 'always', label: 'It stays on whatever the wall does' }, { id: 'never', label: 'It never lights' },
      ],
      demo: [{ from: 0, set: { sonar: 60 } }, { from: 2000, set: { sonar: 10 } }], run: 4000,
      classify: reacts(ledOn, 1800, 3800, 'near', 'far'), works: 'near',
      explain: reactExplain('near', 'It lit when the wall came close, which is what a proximity warning does.', 'far', 'It lit when the wall was far away: the comparison points the wrong way.'),
    },
    hints: [
      'Open the Serial Monitor and slide the wall closer. Do the printed distances change? If the sensor never reads, check its power and its two signal wires.',
      'The sensor\'s pins are VCC, Trig, Echo and GND, from left to right. Power it from 5 V and GND, and wire Trig and Echo to pins the sketch uses. Then compare <code>distance</code> with 20 using <code>if</code> and <code>&lt;</code>.',
      'Wire VCC to the + rail (f18 to T+18), GND to the − rail (f21 to T−21), Trig to pin 9 (g19) and Echo to pin 10 (g20). In the sketch: if (distance < 20) digitalWrite(LED_PIN, HIGH); else digitalWrite(LED_PIN, LOW);',
    ],
    checks: [
      phases('The light is off when the bay is empty', [{ when: 'the wall is far away (60 cm)', set: { sonar: 60 }, expect: { led: false } }]),
      phases('The light comes on when a car is close', [{ when: 'a car is close to the wall (10 cm)', set: { sonar: 10 }, expect: { led: true } }]),
      phases('The limit is about 20 cm', [
        { when: 'the car is just inside the limit (17 cm)', set: { sonar: 17 }, expect: { led: true } },
        { when: 'the car is just outside the limit (24 cm)', set: { sonar: 24 }, expect: { led: false } },
      ]),
      phases('It follows the car as it drives in and out', [
        { when: 'the bay is empty', set: { sonar: 60 }, expect: { led: false } },
        { when: 'a car drives in', set: { sonar: 10 }, expect: { led: true } },
        { when: 'it drives out again', set: { sonar: 60 }, expect: { led: false } },
      ]),
    ],
    unlocks: ['led-green', 'res-1k'],
  },
  {
    id: 'greenhouse', title: 'Plant alert', place: 'Greenhouse', hook: 'Warn the gardeners when the soil gets too dry.', map: [70, 15], after: ['parking'],
    story: 'The school greenhouse dries out over the weekend and the tomato plants suffer. Build a <b>plant-watering alert</b>: when the soil moisture falls below <b>30%</b>, light the alert LED <em>and</em> sound the buzzer. When the soil is moist again, go quiet. The knob stands in for the moisture probe.',
    goal: 'LED on and buzzer sounding when moisture is under 30%. Dark and silent otherwise.',
    controls: { pot: 'Soil moisture' },
    how: ['<code>map(value, 0, 1023, 0, 100)</code> turns a raw reading into a percentage, which is easier to think about.', 'One <code>if</code> can do several things: put them all between the braces.', 'Remember the <code>else</code> side too. An alert that never switches itself off is worse than none.'],
    starter: `// Greenhouse alert
const int MOISTURE_PIN = A0;
const int LED_PIN = 13;
const int BUZZER_PIN = 8;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int moisture = map(analogRead(MOISTURE_PIN), 0, 1023, 0, 100);   // percent

  // if the soil is under 30% turn the LED on and play a note
  // otherwise turn the LED off and stop the sound

  delay(100);
}`,
    circuit: [
      ...unoLed(13),
      { t: 'wire', a: 'a15', b: 'T-15', c: 'black' }, { t: 'wire', a: 'U:GND', b: 'T-2', c: 'black' }, { t: 'wire', a: 'U:5V', b: 'T+1', c: 'red' },
      { t: 'pot', id: 'pot', row: 'd', col: 24, ctl: 'Knob position' },
      { t: 'wire', a: 'a24', b: 'T+24', c: 'red' }, { t: 'wire', a: 'a26', b: 'T-26', c: 'black' }, { t: 'wire', a: 'a25', b: 'U:A0', c: 'green' },
      { t: 'buzzer', id: 'buzz', a: 'e28', b: 'e30' }, { t: 'wire', a: 'U:8', b: 'a28', c: 'purple' }, { t: 'wire', a: 'a30', b: 'T-30', c: 'black' },
    ],
    answer: `const int MOISTURE_PIN = A0;
const int LED_PIN = 13;
const int BUZZER_PIN = 8;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int moisture = map(analogRead(MOISTURE_PIN), 0, 1023, 0, 100);   // percent

  if (moisture < 30) {         // too dry
    digitalWrite(LED_PIN, HIGH);
    tone(BUZZER_PIN, 440);
  } else {
    digitalWrite(LED_PIN, LOW);
    noTone(BUZZER_PIN);
  }
  delay(100);
}`,
    predict: {
      question: 'The alert is built. The soil starts moist and then dries out. What will the alert do?',
      options: [
        { id: 'dry', label: 'LED and buzzer come on when the soil gets dry' }, { id: 'moist', label: 'LED and buzzer come on when the soil gets moist' },
        { id: 'always', label: 'The alert is on the whole time' }, { id: 'never', label: 'The alert never comes on' },
      ],
      demo: [{ from: 0, set: { pot: 0.7 } }, { from: 2000, set: { pot: 0.1 } }], run: 4000,
      classify: reacts(s => ledOn(s) || soundOn(s), 1800, 3800, 'dry', 'moist'), works: 'dry',
      explain: reactExplain('dry', 'The alert came on when the soil dried out, which is what the gardeners need.', 'moist', 'The alert came on when the soil was moist: the comparison points the wrong way.'),
    },
    hints: [
      'Turn the Soil moisture knob down and watch both the LED and the sound. Which one is not reacting?',
      'One <code>if (moisture &lt; 30)</code> can both light the LED and play a note. The <code>else</code> part must turn the LED off and call <code>noTone()</code> to stop the sound.',
      'In loop(): if (moisture < 30) { digitalWrite(LED_PIN, HIGH); tone(BUZZER_PIN, 440); } else { digitalWrite(LED_PIN, LOW); noTone(BUZZER_PIN); } then delay(100).',
    ],
    checks: [
      phases('It is quiet while the soil is moist', [{ when: 'the soil is moist (70%)', set: { pot: 0.7 }, expect: { led: false, sound: false } }]),
      phases('The alert comes on when the soil is dry', [{ when: 'the soil is dry (10%)', set: { pot: 0.1 }, expect: { led: true, sound: true } }]),
      phases('The limit is about 30%', [
        { when: 'the soil is at 25%', set: { pot: 0.25 }, expect: { led: true, sound: true } },
        { when: 'the soil is at 35%', set: { pot: 0.35 }, expect: { led: false, sound: false } },
      ]),
      phases('It follows the soil as it dries and is watered', [
        { when: 'the soil is moist', set: { pot: 0.7 }, expect: { led: false, sound: false } },
        { when: 'it dries out', set: { pot: 0.1 }, expect: { led: true, sound: true } },
        { when: 'the gardener waters it', set: { pot: 0.7 }, expect: { led: false, sound: false } },
      ]),
    ],
    unlocks: [],
  },
  {
    id: 'workshop', title: 'Open studio', place: 'Open Studio', hook: 'Free build with every part you have unlocked.', map: [75, 93], after: ['beacon'], sandbox: true,
    story: 'The studio is yours: no goal and no checks. Everything you have unlocked is in the tray. Build something you would want on the campus, wire it, write the sketch, and run it. Passing more missions puts more parts in the tray.',
    goal: 'Build anything you like.',
    how: ['Use the tray to add parts and wires. Drag a wire end to move it, and use Step to watch your sketch one line at a time.', 'Point at a hole or pin to read its voltage while the sketch runs.'],
    starter: `// Open studio: your own sketch
void setup() {
}

void loop() {
}`,
    circuit: [], answer: '', hints: ['Nothing to check here.', 'Nothing to check here: this is free build.', 'Nothing to check here: build what you like.'], checks: [], unlocks: [],
  },
];

/* --- the ESP32 missions --- */
const ESP: Mission[] = [
  {
    id: 'tour', title: 'Workshop tour', place: 'Maker Workshop', hook: 'Meet the board and make its own light blink.', map: [25, 93], after: [], showParts: true,
    story: 'The ESP32 is programmed like an Arduino but is much faster and has Wi-Fi and Bluetooth built in. Its pins point downwards, so it plugs into a breadboard. Click the labels to explore. Then finish the sketch so the blue light on the board blinks.',
    goal: 'Make the board\'s own blue light blink, half a second on and half a second off.',
    how: ['The blue light is wired to GPIO 2.', 'The ESP32 usually talks to the computer at 115200 baud, faster than the Uno\'s 9600.', 'Every pin works at 3.3 V. Connecting 5 V to a pin can damage the chip.'],
    starter: `const int LED = 2;   // blue on-board LED

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
  Serial.println("Hello from the ESP32!");
}

void loop() {
  // turn the light on, wait half a second, turn it off, wait again
}`,
    circuit: [],
    answer: `const int LED = 2;   // blue on-board LED

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
  Serial.println("Hello from the ESP32!");
}

void loop() {
  digitalWrite(LED, HIGH);
  delay(500);
  digitalWrite(LED, LOW);
  delay(500);
}`,
    predict: { question: 'The starter sketch is ready to run. What will the blue light on the board do?', options: BLINK_OPTIONS, demo: [], run: 6000, classify: tr => behaviour(tr, 'builtin'), works: 'blinks', explain: BLINK_EXPLAIN },
    hints: [
      'The sketch already says hello, so look at what <code>loop()</code> does. Right now it does nothing.',
      'To blink: <code>digitalWrite(pin, HIGH)</code> turns the light on, <code>digitalWrite(pin, LOW)</code> turns it off, and <code>delay(ms)</code> waits between them.',
      'Inside loop(): digitalWrite(LED, HIGH); delay(500); digitalWrite(LED, LOW); delay(500);',
    ],
    checks: [
      phases('The sketch says hello', [{ when: 'the sketch starts', ms: 500, mode: 'during', expect: { serial: /hello/i } }]),
      blinks('The on-board light blinks', 'builtin'),
    ],
    unlocks: [],
  },
  {
    id: 'beacon', title: 'Gate beacon', place: 'Front Gate', hook: 'Build a blinking light so delivery drivers can find the gate.', map: [30, 80], after: [],
    story: 'The front gate has no light and delivery drivers keep missing it after dark. Build a <b>beacon</b>: an LED that blinks about once a second. On the ESP32 each pin shares a breadboard column with the free hole beside it, so a wire in that hole reaches the pin.',
    goal: 'Wire an LED and a resistor to a pin, and make the LED blink about once a second.',
    how: ['On the ESP32 you use the GPIO number in code. The pin labelled D5 is GPIO 5.', 'HIGH is 3.3 V here, not 5 V. That is still enough to light an LED.', 'The breadboard has the free holes on the right of the board, columns 22 to 30.'],
    starter: `// Gate beacon
const int LED_PIN = 5;   // the pin labelled D5

void setup() {
  // get the pin ready to send out power
}

void loop() {
  // turn the LED on, wait, turn it off, wait
}`,
    circuit: espLed,
    answer: `const int LED_PIN = 5;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);
}`,
    predict: { question: 'You have wired the LED and written the sketch. What will the LED do when you press Run?', options: BLINK_OPTIONS, demo: [], run: 6000, classify: tr => behaviour(tr, 'led'), works: 'blinks', explain: BLINK_EXPLAIN },
    hints: [
      'Press <b>Check my build</b> and read the first line. The circuit check panel over the 3D view says exactly what is wrong with the wiring.',
      'Current flows in a loop: out of a pin, through the LED and a resistor, and back to a GND pin. The ESP32 has GND pins next to the others. In the sketch the pin is an OUTPUT, and blinking is HIGH, wait, LOW, wait.',
      'Wire D5 to hole j22, put the LED\'s long leg in g22 and short leg in g23, a 220 Ω resistor from h23 to h27, a wire from j27 to the near − rail (B−27), and a wire from the GND pin to that rail. Sketch: OUTPUT in setup(), then HIGH, delay(1000), LOW, delay(1000).',
    ],
    checks: [
      phases('The LED lights up', [{ when: 'the sketch has been running for a few seconds', ms: 3000, mode: 'during', expect: { led: true } }]),
      blinks('The LED blinks about once a second'),
    ],
    unlocks: ['pad', 'knob', 'res-10k'],
  },
  {
    id: 'touchlamp', title: 'Study-desk lamp', place: 'Library Desk', hook: 'Switch a lamp on with a touch, no button needed.', map: [70, 67], after: ['beacon'],
    story: 'The library desks have lamps with fiddly switches that students keep breaking. Build a <b>touch lamp</b>: the LED is on while a finger touches the pad and off when it lets go. Ten ESP32 pins can sense touch with nothing more than a wire.',
    goal: 'The LED is on while the pad is touched and off otherwise.',
    controls: { pad: 'Hold to touch the pad' },
    how: ['<code>touchRead()</code> returns a high number normally and a low number when touched.', 'A limit in between decides what counts as a touch.', '<code>value &lt; THRESHOLD</code> is either true or false, which also works as HIGH or LOW.'],
    starter: `// Study-desk touch lamp
const int TOUCH_PIN = 4;     // touch channel T0
const int LED_PIN = 5;
const int THRESHOLD = 30;    // below this means touched

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int value = touchRead(TOUCH_PIN);
  // turn the LED on when the value is under the threshold, otherwise off
  delay(100);
}`,
    circuit: [...espLed, { t: 'pad', id: 'pad', ctl: 'Hold to touch the pad' }, { t: 'wire', a: 'E:D4', b: 'PAD', c: 'white' }],
    answer: `const int TOUCH_PIN = 4;     // touch channel T0
const int LED_PIN = 5;
const int THRESHOLD = 30;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int value = touchRead(TOUCH_PIN);
  Serial.println(value);

  digitalWrite(LED_PIN, value < THRESHOLD);
  delay(100);
}`,
    predict: {
      question: 'The pad is wired to D4 and the lamp is built. A finger is not on the pad, then touches it. What will the LED do?',
      options: [
        { id: 'touch', label: 'It comes on when the pad is touched' }, { id: 'free', label: 'It comes on when nobody is touching' },
        { id: 'always', label: 'It stays on' }, { id: 'never', label: 'It never lights' },
      ],
      demo: [{ from: 0, set: { pad: 0 } }, { from: 2000, set: { pad: 1 } }], run: 4000,
      classify: reacts(ledOn, 1800, 3800, 'touch', 'free'), works: 'touch',
      explain: reactExplain('touch', 'It came on when the pad was touched, which is a touch lamp.', 'free', 'It came on when nobody was touching: the comparison points the wrong way.'),
    },
    hints: [
      'Open the Serial Monitor and touch the pad. Do the numbers change? If they never do, the pad may not be wired to a touch pin.',
      'The pad\'s wire must go to the pin the sketch reads (D4 is touch channel T0). A touch makes the number <em>smaller</em>, so compare with <code>&lt;</code> and a limit between the two readings.',
      'Wire D4 to the pad (white wire to PAD), keep the LED on D5 as before. In loop(): int value = touchRead(TOUCH_PIN); digitalWrite(LED_PIN, value < THRESHOLD); delay(100);',
    ],
    checks: [
      phases('The lamp is off until it is touched', [{ when: 'nobody is touching the pad', set: { pad: 0 }, expect: { led: false } }]),
      phases('The lamp is on while it is touched', [{ when: 'a finger is on the pad', set: { pad: 1 }, expect: { led: true } }]),
      phases('It follows the finger', [
        { when: 'nobody is touching the pad', set: { pad: 0 }, expect: { led: false } },
        { when: 'a finger touches the pad', set: { pad: 1 }, expect: { led: true } },
        { when: 'the finger lifts off', set: { pad: 0 }, expect: { led: false } },
      ]),
    ],
    unlocks: ['button', 'buzzer'],
  },
  {
    id: 'toggle', title: 'Cafeteria lights', place: 'Cafeteria', hook: 'One press switches the lights on, the next press switches them off.', map: [30, 54], after: ['touchlamp'],
    story: 'The cafeteria has one switch that is wired badly: you have to hold it down to keep the lights on. Build a <b>push-on, push-off</b> switch: one press turns the LED on and it stays on, the next press turns it off. The sketch has to remember what the light is doing.',
    goal: 'Each press of the button flips the LED, and the LED keeps its state after the button is let go.',
    controls: { button: 'Hold to press the button' },
    how: ['<code>bool ledOn</code> remembers whether the light should be on. A variable outside the functions keeps its value between loops.', '<code>lastState</code> holds the previous reading, so the sketch can spot the moment the button <em>changes</em> from not pressed to pressed.', '<code>ledOn = !ledOn</code> flips true to false and false to true.'],
    starter: `// Cafeteria lights
const int BUTTON_PIN = 18;
const int LED_PIN = 5;

bool ledOn = false;
int lastState = HIGH;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int state = digitalRead(BUTTON_PIN);   // LOW while pressed

  // when the button has just been pressed (state is LOW and lastState was HIGH), flip ledOn
  // and write it to the LED

  lastState = state;
}`,
    circuit: [...espLed, { t: 'button', id: 'btn', col: 28, ctl: 'Hold to press the button' }, { t: 'wire', a: 'E:D18', b: 'j28', c: 'yellow' }, { t: 'wire', a: 'j30', b: 'B-30', c: 'black' }],
    answer: `const int BUTTON_PIN = 18;
const int LED_PIN = 5;

bool ledOn = false;
int lastState = HIGH;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int state = digitalRead(BUTTON_PIN);

  if (state == LOW && lastState == HIGH) {   // just pressed
    ledOn = !ledOn;
    digitalWrite(LED_PIN, ledOn);
    Serial.println(ledOn ? "LED on" : "LED off");
    delay(50);
  }
  lastState = state;
}`,
    predict: {
      question: 'The button and LED are wired. You press and let go twice. What will the LED do?',
      options: [
        { id: 'toggle', label: 'It flips with each press and stays that way when I let go' }, { id: 'hold', label: 'It is on only while I hold the button' },
        { id: 'stuck', label: 'It comes on and never goes off again' }, { id: 'never', label: 'It never lights' },
      ],
      demo: [{ from: 0, set: { button: 0 } }, { from: 500, set: { button: 1 } }, { from: 900, set: { button: 0 } }, { from: 1500, set: { button: 1 } }, { from: 1900, set: { button: 0 } }], run: 3000,
      classify: tr => {
        const first = ledOn(tr.at(1300)), second = ledOn(tr.at(2500)), held = ledOn(tr.at(800));
        return first && !second ? 'toggle' : first && second ? 'stuck' : held ? 'hold' : 'never';
      },
      works: 'toggle',
      explain: {
        toggle: 'The LED flipped with each press and kept its state, which is a push-on, push-off switch.',
        hold: 'The LED followed the button, so it only stayed on while held. The sketch needs to remember the state, not copy the button.',
        stuck: 'The LED came on and never went off again. The sketch is setting it on but never flipping it back.',
        never: 'The LED never lit. Check that the sketch notices the press and writes to the LED\'s pin.',
      },
    },
    hints: [
      'Press and let go of the button and watch the Serial Monitor in your own sketch. Is the LED changing on the press, or while you hold?',
      'Keep a <code>bool ledOn</code> and a <code>lastState</code>. Act only when <code>state == LOW &amp;&amp; lastState == HIGH</code> (the moment of pressing), then flip with <code>ledOn = !ledOn</code>. Do not forget to save <code>lastState = state</code> every time.',
      'In loop(): if (state == LOW && lastState == HIGH) { ledOn = !ledOn; digitalWrite(LED_PIN, ledOn); delay(50); } then lastState = state; outside the if.',
    ],
    checks: [
      phases('It starts off and one press turns it on and keeps it on', [
        { when: 'nothing has been pressed yet', set: { button: 0 }, ms: 600, expect: { led: false } },
        { when: 'the button is pressed once', set: { button: 1 }, ms: 500, expect: { led: true } },
        { when: 'the button is let go (the LED should stay on)', set: { button: 0 }, ms: 600, expect: { led: true } },
      ]),
      phases('A second press turns it off again', [
        { when: 'nothing has been pressed yet', set: { button: 0 }, ms: 600, expect: { led: false } },
        { when: 'the button is pressed once', set: { button: 1 }, ms: 500, expect: { led: true } },
        { when: 'the button is let go', set: { button: 0 }, ms: 600, expect: { led: true } },
        { when: 'the button is pressed a second time', set: { button: 1 }, ms: 500, expect: { led: false } },
        { when: 'the button is let go again (the LED should stay off)', set: { button: 0 }, ms: 600, expect: { led: false } },
      ]),
    ],
    unlocks: ['led-green'],
  },
  {
    id: 'siren', title: 'Sports-hall siren', place: 'Sports Hall', hook: 'Slide a buzzer up and down like an alarm.', map: [70, 41], after: ['toggle'],
    story: 'The sports hall needs an alarm that cuts through the noise of a basketball game. A steady beep is easy to ignore, but a <b>siren</b> that slides up and down in pitch is not. Build one with a buzzer and two loops that change the note a little at a time.',
    goal: 'The buzzer slides up from a low note to a high note and back down, again and again.',
    how: ['The first <code>for</code> loop raises the frequency from 400 Hz to 1000 Hz in steps of 20.', 'The second loop counts back down. <code>f -= 20</code> means "subtract 20 from f".', 'The short <code>delay()</code> sets how fast the pitch moves.'],
    starter: `// Sports hall siren
const int BUZZER_PIN = 18;

void setup() {
}

void loop() {
  // slide up: a for loop from 400 to 1000 Hz in steps of 20, calling tone() and a short delay()
  // slide down: another for loop that counts back down
}`,
    circuit: [
      { t: 'buzzer', id: 'buzz', a: 'f22', b: 'f25' }, { t: 'wire', a: 'E:D18', b: 'j22', c: 'purple' }, { t: 'wire', a: 'j25', b: 'B-25', c: 'black' }, { t: 'wire', a: 'E:GND', b: 'B-5', c: 'black' },
    ],
    answer: `const int BUZZER_PIN = 18;

void setup() {
}

void loop() {
  for (int f = 400; f <= 1000; f += 20) {   // slide up
    tone(BUZZER_PIN, f);
    delay(15);
  }
  for (int f = 1000; f >= 400; f -= 20) {   // slide down
    tone(BUZZER_PIN, f);
    delay(15);
  }
}`,
    predict: {
      question: 'The buzzer is wired to D18 and the sketch has two loops. What will you hear?',
      options: [{ id: 'sweep', label: 'A note that slides up and down' }, { id: 'steady', label: 'One steady note' }, { id: 'silent', label: 'Nothing' }],
      demo: [], run: 3000,
      classify: tr => {
        const notes = tr.samples.map(s => Math.round(s.sound)).filter(n => n > 0);
        return !notes.length ? 'silent' : new Set(notes).size >= 8 ? 'sweep' : 'steady';
      },
      works: 'sweep',
      explain: { sweep: 'The pitch slid through many notes, which is a siren.', steady: 'Only one or a few notes played. A siren needs the frequency to change a little each time round the loop.', silent: 'There was no sound. Check that the buzzer is wired to the pin the sketch plays on.' },
    },
    hints: [
      'Turn the sound on with the toolbar button and listen. Does the pitch change, or is it one note?',
      'A <code>for</code> loop can count: <code>for (int f = 400; f &lt;= 1000; f += 20)</code>. Play <code>tone(BUZZER_PIN, f)</code> inside it, with a short delay so each pitch can be heard, then write a second loop that counts back down.',
      'In loop(): for (int f = 400; f <= 1000; f += 20) { tone(BUZZER_PIN, f); delay(15); } then for (int f = 1000; f >= 400; f -= 20) { tone(BUZZER_PIN, f); delay(15); }',
    ],
    checks: [
      phases('The siren is sounding', [{ when: 'the sketch has been running a moment', ms: 800, mode: 'during', expect: { sound: true } }]),
      sweeps('The siren slides up and back down'),
    ],
    unlocks: ['res-1k', 'sonar'],
  },
  {
    id: 'nightlight', title: 'Night light', place: 'Main Hallway', hook: 'Turn a light on when the hallway gets dark, with the ESP32\'s finer readings.', map: [30, 28], after: ['siren'],
    story: 'The main hallway is dark after the last bell. Build a <b>night light</b> that comes on by itself when it is dark. The ESP32 measures voltage in 4096 steps instead of 1024, so the numbers are four times bigger. The knob stands in for the light sensor and runs from <b>3.3 V</b>, never 5 V, because the pins cannot take more.',
    goal: 'The LED comes on when the light level is low and goes off when it is high.',
    controls: { pot: 'Hallway light level' },
    how: ['<code>analogRead()</code> gives 0 to 4095 on the ESP32, because its converter has 12 bits.', 'The sensor must be powered from 3V3. A pin cannot take 5 V.', 'Pins D34 to D39 are input-only, which is fine for a sensor.'],
    starter: `// Hallway night light
const int SENSOR_PIN = 34;   // the light sensor (the knob)
const int LED_PIN = 5;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  // 1. read the sensor with analogRead(SENSOR_PIN): 0 to 4095
  // 2. if it is dark (a low number) turn the LED on, otherwise off
  delay(50);
}`,
    circuit: [
      ...espLed, { t: 'wire', a: 'E:3V3', b: 'B+4', c: 'red' },
      { t: 'pot', id: 'pot', row: 'g', col: 28, ctl: 'Knob position' }, { t: 'wire', a: 'j28', b: 'B+28', c: 'red' }, { t: 'wire', a: 'j30', b: 'B-30', c: 'black' }, { t: 'wire', a: 'j29', b: 'E:D34', c: 'green' },
    ],
    answer: `const int SENSOR_PIN = 34;
const int LED_PIN = 5;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int light = analogRead(SENSOR_PIN);   // 0 (dark) to 4095 (bright)

  if (light < 1200) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  delay(50);
}`,
    predict: {
      question: 'Your night light is built. The hallway starts bright, then gets dark. What will the LED do?',
      options: [
        { id: 'dark', label: 'It turns on when the hallway gets dark' }, { id: 'bright', label: 'It turns on when the hallway gets bright' },
        { id: 'always', label: 'It stays on whatever happens' }, { id: 'never', label: 'It never lights' },
      ],
      demo: [{ from: 0, set: { pot: bright } }, { from: 2000, set: { pot: dark } }], run: 4000,
      classify: reacts(ledOn, 1800, 3800, 'dark', 'bright'), works: 'dark',
      explain: reactExplain('dark', 'It reacted the way it should: it came on when it got dark.', 'bright', 'It reacted, but backwards: it came on when it got bright.'),
    },
    hints: [
      'Turn the light level knob and watch the number the sensor gives in the Serial Monitor. How big does it get? Remember the ESP32 counts to 4095.',
      'Read with <code>analogRead(SENSOR_PIN)</code>. Dark is a low number, so use <code>&lt;</code> with a limit well below 4095, and write HIGH or LOW to the LED pin.',
      'In loop(): int light = analogRead(SENSOR_PIN); if (light < 1200) digitalWrite(LED_PIN, HIGH); else digitalWrite(LED_PIN, LOW); then delay(50). Power the knob from 3V3 (E:3V3 to the + rail), not from 5 V.',
    ],
    checks: [
      phases('The light stays off in daylight', [{ when: 'the hallway is bright (light level 90%)', set: { pot: bright }, expect: { led: false } }]),
      phases('The light comes on in the dark', [{ when: 'the hallway is dark (light level 10%)', set: { pot: dark }, expect: { led: true } }]),
      phases('It follows the light as it changes', [
        { when: 'the hallway is bright', set: { pot: bright }, expect: { led: false } },
        { when: 'the lights go out', set: { pot: dark }, expect: { led: true } },
        { when: 'the sun comes back', set: { pot: bright }, expect: { led: false } },
      ]),
    ],
    unlocks: [],
  },
  {
    id: 'workshop', title: 'Open studio', place: 'Open Studio', hook: 'Free build with every part you have unlocked.', map: [75, 93], after: ['beacon'], sandbox: true,
    story: 'The studio is yours: no goal and no checks. Everything you have unlocked is in the tray. Build something you would want on the campus, wire it, write the sketch, and run it.',
    goal: 'Build anything you like.',
    how: ['Use the tray to add parts and wires. The ESP32 plugs into the left of the breadboard, so build in columns 22 to 30.', 'Point at a hole or pin to read its voltage while the sketch runs.'],
    starter: `// Open studio: your own sketch
void setup() {
}

void loop() {
}`,
    circuit: [], answer: '', hints: ['Nothing to check here.', 'Nothing to check here: this is free build.', 'Nothing to check here: build what you like.'], checks: [], unlocks: [],
  },
];

export const MISSIONS: Record<BoardId, Mission[]> = { uno: UNO, esp32: ESP };

/* --- progress: what is open and what is in the tray --- */
export const missionKey = (board: BoardId, id: string) => `${board}-${id}`;

/** Every part in the tray, given the missions passed (as board-id keys). */
export function unlockedParts(passed: Iterable<string>): Set<PartId> {
  const done = new Set(passed), have = new Set<PartId>(BASE_PARTS);
  for (const board of Object.keys(MISSIONS) as BoardId[]) for (const m of MISSIONS[board]) if (done.has(missionKey(board, m.id))) m.unlocks.forEach(p => have.add(p));
  return have;
}

/** A mission is open once every mission it comes after has been passed. */
export const isAvailable = (board: BoardId, m: Mission, passed: Set<string>) => m.after.every(id => passed.has(missionKey(board, id)));

/** The first mission that puts a part in the tray, or null when the tray starts with it. */
export function lockedBy(part: PartId): { board: BoardId; mission: Mission } | null {
  if (BASE_PARTS.includes(part)) return null;
  for (const board of Object.keys(MISSIONS) as BoardId[]) for (const mission of MISSIONS[board]) if (mission.unlocks.includes(part)) return { board, mission };
  return null;
}
