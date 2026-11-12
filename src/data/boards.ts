import type { Board, BoardId, Info, Item } from '../types';

const BASE_CONSTS = { HIGH: 1, LOW: 0, INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2 };
export const ESP_NEAR = ['3V3', 'GND', 'D15', 'D2', 'D4', 'RX2', 'TX2', 'D5', 'D18', 'D19', 'D21', 'RX0', 'TX0', 'D22', 'D23'];
export const ESP_FAR = ['VIN', 'GNDf', 'D13', 'D12', 'D14', 'D27', 'D26', 'D25', 'D33', 'D32', 'D35', 'D34', 'VN', 'VP', 'EN'];
/** The breadboard hole each ESP32 pin sits in. */
export const ESP_HOLES: Record<string, string> = {};
ESP_NEAR.forEach((n, i) => { ESP_HOLES[n] = 'j' + (4 + i); });
ESP_FAR.forEach((n, i) => { ESP_HOLES[n] = 'a' + (4 + i); });

export const ITEM_INFO: Record<string, Info> = {
  led: ['LED', 'Lights up when current flows through it. The long leg is the + side and must face the pin.'],
  res: ['220 Ω resistor', 'Limits the current. Without it the LED would draw too much and burn out.'],
  button: ['Push button', 'Joins its two sides only while it is held down.'],
  pot: ['Potentiometer', 'A knob that outputs any voltage between ground and the supply voltage.'],
  buzzer: ['Piezo buzzer', 'Turns a signal that switches on and off very fast into a sound.'],
  sonar: ['HC-SR04 distance sensor', 'Sends out an ultrasonic ping and times how long the echo takes to come back.'],
  wire: ['Jumper wire', 'Carries current between two points with no resistance. Drag either end to a new hole or pin, or type new places below.'],
  pad: ['Touch pad', 'A bare piece of metal on a wire. A finger near it changes its electrical capacitance.']
};

const LED_CIRCUIT_UNO = (pin: number): Item[] => [
  { t: 'wire', a: 'U:' + pin, b: 'a10', c: 'orange' },
  { t: 'led', id: 'led', a: 'e10', k: 'e11', color: 0xff3b30, pin },
  { t: 'res', a: 'c11', b: 'c15' }
];
const LED_CIRCUIT_ESP: Item[] = [
  { t: 'wire', a: 'E:D5', b: 'j22', c: 'orange' },
  { t: 'led', id: 'led', a: 'g22', k: 'g23', color: 0xff3b30, pin: 5 },
  { t: 'res', a: 'h23', b: 'h27' },
  { t: 'wire', a: 'j27', b: 'B-27', c: 'black' },
  { t: 'wire', a: 'E:GND', b: 'B-5', c: 'black' }
];

export const BOARDS: Record<BoardId, Board> = {
  uno: {
    id: 'uno', name: 'Arduino Uno', adcMax: 1023, builtin: 13,
    consts: Object.assign({ LED_BUILTIN: 13, A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19 }, BASE_CONSTS),
    parts: {
      mcu: ['Microcontroller', 'The ATmega328P is the brain. It stores your sketch and runs it the moment the board has power.'],
      usb: ['USB port', 'Connects to your computer to upload sketches, send Serial messages and power the board.'],
      jack: ['Barrel jack', 'Power input for running without a computer. Use 7 to 12 V.'],
      digital: ['Digital pins 0 to 13', 'Each pin reads or writes HIGH (5 V) or LOW (0 V). Pins marked ~ can also dim and set speeds with PWM.'],
      analog: ['Analog inputs A0 to A5', 'Measure a voltage from 0 to 5 V and report it as a number from 0 to 1023.'],
      power: ['Power pins', '5V and 3.3V feed your circuit. GND is the return path every circuit needs.'],
      leds: ['On-board LEDs', 'ON shows power. TX and RX flicker with USB data. The L LED is wired to pin 13.'],
      reset: ['Reset button', 'Restarts your sketch from the top of setup(). Nothing is erased.'],
      crystal: ['16 MHz crystal', 'The clock. Every instruction and every delay() is timed from its ticks.'],
      usbchip: ['USB chip', 'A second small chip that translates between USB and the main chip.'],
      regulator: ['Voltage regulator', 'Turns the 7 to 12 V from the barrel jack into a steady 5 V.'],
      icsp: ['ICSP header', 'Direct programming pins. Beginners can ignore them.']
    },
    pinout: [
      { title: 'Digital', pins: [['0', 'RX'], ['1', 'TX'], ['2', ''], ['~3', 'PWM'], ['4', ''], ['~5', 'PWM'], ['~6', 'PWM'], ['7', ''], ['8', ''], ['~9', 'PWM'], ['~10', 'PWM'], ['~11', 'PWM'], ['12', ''], ['13', 'LED'], ['GND', '', 'gnd'], ['SDA', 'I2C', 'bus'], ['SCL', 'I2C', 'bus']] },
      { title: 'Analog in', pins: [['A0', ''], ['A1', ''], ['A2', ''], ['A3', ''], ['A4', 'SDA', 'bus'], ['A5', 'SCL', 'bus']] },
      { title: 'Power', pins: [['3.3V', '50 mA max', 'pwr'], ['5V', '', 'pwr'], ['GND', '', 'gnd'], ['GND', '', 'gnd'], ['VIN', '7 to 12 V', 'pwr'], ['RESET', '']] }
    ],
    facts: [['Chip', 'ATmega328P, 8-bit, 16 MHz'], ['Memory', '32 KB flash, 2 KB RAM'], ['Pin voltage', '5 V, about 20 mA per pin'], ['Analog input', '10-bit: 0 to 1023'], ['Wireless', 'None']],
    lessons: [
      { id: 'meet', title: 'Meet the board', hook: 'Tour the parts and run your first sketch.', showParts: true, circuit: [],
        intro: 'An Arduino Uno is a small computer that runs one program, called a sketch. Click the labels on the board to see what each part does, then press Run. The tiny LED marked L starts to blink.',
        how: ['<code>setup()</code> runs once when the board starts. Use it to prepare pins.', '<code>loop()</code> runs again and again, forever.', '<code>LED_BUILTIN</code> is pin 13, which is wired to the L LED.', '<code>Serial.println()</code> sends text to your computer. It appears in the serial monitor below the code.'],
        tryit: ['Change both delays to 100 and run again.', 'Make the LED stay on for 2 seconds and off for only a quarter of a second.'],
        code: String.raw`void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Hello from the Uno!");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);   // LED on
  delay(500);                        // wait half a second
  digitalWrite(LED_BUILTIN, LOW);    // LED off
  delay(500);
}` },
      { id: 'blink', title: 'Blink an LED', hook: 'Build your first circuit on a breadboard.',
        circuit: [...LED_CIRCUIT_UNO(13), { t: 'wire', a: 'a15', b: 'U:GND2', c: 'black' }],
        intro: 'Current flows in a loop: out of pin 13, through the LED, through the resistor, and back to GND. On a breadboard, the five holes in each short column (a to e, or f to j) are joined inside, which is how the parts connect without solder.',
        how: ['<code>const int LED_PIN = 13;</code> gives the pin a name, so you only change one line if you move the wire.', '<code>pinMode(LED_PIN, OUTPUT)</code> lets the pin supply current.', 'HIGH puts 5 V on the pin and the LED lights. LOW puts 0 V and it goes dark.'],
        tryit: ['Change LED_PIN to 12 and run. The LED stays dark because the wire is still on pin 13.', 'Delete the pinMode line and run. The LED only glows faintly. Why?', 'Blink an SOS: three short, three long, three short.'],
        code: String.raw`const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);
}` },
      { id: 'button', title: 'Push a button', hook: 'Read an input and react to it.',
        circuit: [...LED_CIRCUIT_UNO(13), { t: 'wire', a: 'a15', b: 'T-15', c: 'black' }, { t: 'wire', a: 'U:GND2', b: 'T-1', c: 'black' },
          { t: 'button', id: 'btn', col: 20, pin: 2, ctl: 'Hold to press the button' }, { t: 'wire', a: 'U:2', b: 'a20', c: 'yellow' }, { t: 'wire', a: 'a22', b: 'T-22', c: 'black' }],
        intro: 'Several parts now need GND, so one wire takes GND to the long rail marked with a minus sign and everything connects there. The button joins pin 2 to GND while you hold it. Run the sketch, then hold the button under the 3D view.',
        how: ['<code>INPUT_PULLUP</code> switches on a resistor inside the chip that holds the pin HIGH when nothing is connected.', 'Pressing the button connects the pin to GND, so <code>digitalRead()</code> returns LOW. Pressed means LOW.', '<code>if / else</code> chooses what to do based on the reading.'],
        tryit: ['Swap HIGH and LOW so the LED is on until you press.', 'Print "pressed" to the serial monitor when the button goes down.'],
        code: String.raw`const int BUTTON_PIN = 2;
const int LED_PIN = 13;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int state = digitalRead(BUTTON_PIN);   // LOW while pressed

  if (state == LOW) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
}` },
      { id: 'knob', title: 'Turn a knob', hook: 'Read an analog value and dim an LED.',
        circuit: [...LED_CIRCUIT_UNO(9), { t: 'wire', a: 'a15', b: 'T-15', c: 'black' }, { t: 'wire', a: 'U:GND', b: 'T-2', c: 'black' }, { t: 'wire', a: 'U:5V', b: 'T+1', c: 'red' },
          { t: 'pot', id: 'pot', row: 'd', col: 24, pin: 14, ctl: 'Knob position' }, { t: 'wire', a: 'a24', b: 'T+24', c: 'red' }, { t: 'wire', a: 'a26', b: 'T-26', c: 'black' }, { t: 'wire', a: 'a25', b: 'U:A0', c: 'green' }],
        intro: 'A potentiometer has 5 V on one leg and GND on the other. Its middle leg outputs a voltage in between, set by the knob. Pin A0 measures it. The LED has moved to pin 9, one of the pins marked ~ that can dim. Run the sketch and drag the knob slider.',
        how: ['<code>analogRead()</code> turns 0 to 5 V into a number from 0 to 1023.', '<code>map()</code> rescales that to 0 to 255, the range <code>analogWrite()</code> expects.', '<code>analogWrite()</code> dims the LED by switching it on and off very fast (PWM).'],
        tryit: ['Reverse it: make the LED brightest when the knob is at zero.', 'Turn the LED fully on only when the reading is above 512.'],
        code: String.raw`const int KNOB_PIN = A0;
const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(KNOB_PIN);              // 0 to 1023
  int brightness = map(reading, 0, 1023, 0, 255);  // 0 to 255
  analogWrite(LED_PIN, brightness);

  Serial.print("knob = ");
  Serial.print(reading);
  Serial.print("   brightness = ");
  Serial.println(brightness);
  delay(200);
}` },
      { id: 'sound', title: 'Make a sound', hook: 'Play notes on a piezo buzzer.',
        circuit: [{ t: 'buzzer', id: 'buzz', a: 'e20', b: 'e23', pin: 8 }, { t: 'wire', a: 'U:8', b: 'a20', c: 'purple' }, { t: 'wire', a: 'a23', b: 'U:GND2', c: 'black' }],
        intro: 'A buzzer makes sound when its pin switches on and off hundreds of times a second. How often it switches is the frequency, measured in hertz (Hz). A higher frequency is a higher note. Turn the sound on in the toolbar to hear it.',
        how: ['<code>int notes[] = {...}</code> is an array: a numbered list of values. <code>notes[0]</code> is the first.', 'The <code>for</code> loop counts i from 0 to 7 and plays one note each time round.', '<code>tone(pin, frequency)</code> starts a note. <code>noTone(pin)</code> stops it.'],
        tryit: ['Play the scale backwards.', 'Change the delays to give the tune a rhythm.', 'Write your own melody with these notes: C 262, D 294, E 330, G 392.'],
        code: String.raw`const int BUZZER_PIN = 8;

// C  D  E  F  G  A  B  C
int notes[] = {262, 294, 330, 349, 392, 440, 494, 523};

void setup() {
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 8; i++) {
    Serial.println(notes[i]);
    tone(BUZZER_PIN, notes[i]);
    delay(300);
    noTone(BUZZER_PIN);
    delay(50);
  }
  delay(1000);
}` },
      { id: 'distance', title: 'Measure distance', hook: 'Use ultrasound to build a proximity alarm.',
        circuit: [...LED_CIRCUIT_UNO(13), { t: 'wire', a: 'a15', b: 'T-15', c: 'black' }, { t: 'wire', a: 'U:GND', b: 'T-2', c: 'black' }, { t: 'wire', a: 'U:5V', b: 'T+1', c: 'red' },
          { t: 'sonar', id: 'sonar', row: 'j', col: 18, trig: 9, echo: 10, ctl: 'Distance to the wall' },
          { t: 'wire', a: 'f18', b: 'T+18', c: 'red' }, { t: 'wire', a: 'f21', b: 'T-21', c: 'black' }, { t: 'wire', a: 'g19', b: 'U:9', c: 'blue' }, { t: 'wire', a: 'g20', b: 'U:10', c: 'green' }],
        intro: 'The HC-SR04 works like a bat. It sends a burst of ultrasound, and its Echo pin stays HIGH for as long as the sound takes to reach an object and come back. Run the sketch and move the wall with the slider.',
        how: ['A 10 microsecond pulse on Trig tells the sensor to send a ping.', '<code>pulseIn()</code> measures how long Echo stays HIGH, in microseconds.', 'Sound travels 0.0343 cm per microsecond. The ping goes there and back, so divide by 2.', 'The LED turns on when something is closer than 20 cm.'],
        tryit: ['Change the alarm distance to 50 cm.', 'Blink the LED faster as the wall gets closer.'],
        code: String.raw`const int TRIG_PIN = 9;
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
}` }
    ]
  },

  esp32: {
    id: 'esp32', name: 'ESP32', adcMax: 4095, builtin: 2,
    consts: Object.assign({ LED_BUILTIN: 2, T0: 4, T3: 15, T4: 13, T5: 12, T6: 14, T7: 27, T8: 33, T9: 32 }, BASE_CONSTS),
    parts: {
      module: ['ESP32 module', 'Under the metal shield: a dual-core 240 MHz processor, flash memory, and the Wi-Fi and Bluetooth radio.'],
      antenna: ['Antenna', 'The zigzag copper trace sends and receives Wi-Fi and Bluetooth. Keep metal away from it.'],
      usb: ['USB port', 'Uploads your program, carries Serial messages and powers the board.'],
      pinsNear: ['Pins 3V3 to D23', 'General-purpose pins, including the usual I2C pins (D21, D22) and SPI pins (D18, D19, D23).'],
      pinsFar: ['Pins VIN to EN', 'Most analog-capable pins are on this side. D34, D35, VP and VN can only be inputs.'],
      boot: ['BOOT button', 'Hold it if an upload gets stuck at "Connecting...".'],
      en: ['EN button', 'Reset. Restarts your program from the beginning.'],
      leds: ['On-board LEDs', 'Red shows power. The blue LED is wired to GPIO 2.'],
      usbchip: ['USB-to-serial chip', 'Translates USB from your computer into serial signals for the ESP32.'],
      regulator: ['3.3 V regulator', 'Drops 5 V from USB to the 3.3 V the ESP32 runs on. The pins are not 5 V tolerant.']
    },
    pinout: [
      { title: 'Near row', pins: [['3V3', '', 'pwr'], ['GND', '', 'gnd'], ['D15', ''], ['D2', 'LED'], ['D4', 'touch T0'], ['RX2', 'GPIO 16'], ['TX2', 'GPIO 17'], ['D5', ''], ['D18', 'SCK', 'bus'], ['D19', 'MISO', 'bus'], ['D21', 'SDA', 'bus'], ['RX0', 'GPIO 3'], ['TX0', 'GPIO 1'], ['D22', 'SCL', 'bus'], ['D23', 'MOSI', 'bus']] },
      { title: 'Far row', pins: [['VIN', '5 V', 'pwr'], ['GND', '', 'gnd'], ['D13', ''], ['D12', ''], ['D14', ''], ['D27', ''], ['D26', 'DAC'], ['D25', 'DAC'], ['D33', 'analog'], ['D32', 'analog'], ['D35', 'in only'], ['D34', 'in only'], ['VN', 'GPIO 39, in'], ['VP', 'GPIO 36, in'], ['EN', 'reset']] }
    ],
    facts: [['Chip', 'ESP32, dual-core 32-bit, 240 MHz'], ['Memory', '4 MB flash, 520 KB RAM'], ['Pin voltage', '3.3 V only'], ['Analog input', '12-bit: 0 to 4095'], ['Wireless', 'Wi-Fi and Bluetooth']],
    lessons: [
      { id: 'meet', title: 'Meet the board', hook: 'Tour the parts and run your first program.', showParts: true, circuit: [],
        intro: 'The ESP32 is programmed like an Arduino but is much faster and has Wi-Fi and Bluetooth built in. Its pins point downwards, so it plugs into a breadboard. Click the labels to explore, then press Run to blink the blue LED.',
        how: ['The blue on-board LED is wired to GPIO 2.', 'The ESP32 usually talks to the computer at 115200 baud, faster than the Uno\'s 9600.', 'All pins work at 3.3 V. Connecting 5 V to a pin can damage the chip.'],
        tryit: ['Make the LED flash twice quickly, then pause for a second.', 'Print a counter that goes up by one on every blink.'],
        code: String.raw`const int LED = 2;   // blue on-board LED

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
}` },
      { id: 'blink', title: 'Blink an LED', hook: 'Wire an LED next to the board.', circuit: LED_CIRCUIT_ESP,
        intro: 'Each ESP32 pin shares a breadboard column with the free hole beside it, so a wire in that hole connects to the pin. Current flows from D5 through the LED and resistor to the minus rail, and a second wire joins the rail to the board\'s GND pin.',
        how: ['On the ESP32 you use the GPIO number in code. The pin labelled D5 is GPIO 5.', 'HIGH is 3.3 V here, not 5 V. It is still enough to light an LED.'],
        tryit: ['Change LED_PIN to 2. Which LED blinks now?', 'Make the on time and off time different.'],
        code: String.raw`const int LED_PIN = 5;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);
}` },
      { id: 'button', title: 'Toggle with a button', hook: 'Make one press switch the LED on, the next switch it off.',
        circuit: [...LED_CIRCUIT_ESP, { t: 'button', id: 'btn', col: 28, pin: 18, ctl: 'Hold to press the button' }, { t: 'wire', a: 'E:D18', b: 'j28', c: 'yellow' }, { t: 'wire', a: 'j30', b: 'B-30', c: 'black' }],
        intro: 'A light switch remembers its state. To do that in code you watch for the moment the button changes from not pressed to pressed, and flip a variable. Run the sketch and tap the button several times.',
        how: ['<code>ledOn</code> remembers whether the LED should be on.', '<code>lastState</code> holds the previous reading, so the code can spot the change from HIGH to LOW.', '<code>ledOn = !ledOn</code> flips true to false and false to true.', 'The short delay ignores the tiny bounces a real button makes.'],
        tryit: ['Count the presses and print the total.', 'Make the LED change when the button is released instead.'],
        code: String.raw`const int BUTTON_PIN = 18;
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
}` },
      { id: 'knob', title: 'Turn a knob', hook: 'Read a 12-bit analog value.',
        circuit: [...LED_CIRCUIT_ESP, { t: 'wire', a: 'E:3V3', b: 'B+4', c: 'red' },
          { t: 'pot', id: 'pot', row: 'g', col: 28, pin: 34, ctl: 'Knob position' }, { t: 'wire', a: 'j28', b: 'B+28', c: 'red' }, { t: 'wire', a: 'j30', b: 'B-30', c: 'black' }, { t: 'wire', a: 'j29', b: 'E:D34', c: 'green' }],
        intro: 'The ESP32 measures voltage more finely than the Uno: 4096 steps instead of 1024. The knob is powered from 3V3, never from 5 V, because the pins cannot take more than 3.3 V.',
        how: ['<code>analogRead()</code> returns 0 to 4095 on the ESP32.', 'Multiplying by 3.3 / 4095 converts the reading to volts. A <code>float</code> can hold decimals.', 'Dividing by 16 squeezes 0 to 4095 into 0 to 255 for <code>analogWrite()</code>.'],
        tryit: ['Print the knob position as a percentage.', 'Light the LED only when the voltage is between 1 V and 2 V.'],
        code: String.raw`const int KNOB_PIN = 34;
const int LED_PIN = 5;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int reading = analogRead(KNOB_PIN);      // 0 to 4095
  float volts = reading * 3.3 / 4095;
  analogWrite(LED_PIN, reading / 16);      // 0 to 255

  Serial.print(reading);
  Serial.print("   ");
  Serial.print(volts);
  Serial.println(" V");
  delay(200);
}` },
      { id: 'touch', title: 'Sense a touch', hook: 'Use a built-in touch sensor. No button needed.',
        circuit: [...LED_CIRCUIT_ESP, { t: 'pad', id: 'pad', pin: 4, ctl: 'Hold to touch the pad' }, { t: 'wire', a: 'E:D4', b: 'PAD', c: 'white' }],
        intro: 'Ten ESP32 pins can sense touch, something an Uno cannot do without extra parts. A wire or a piece of foil on the pin is enough. The reading drops when a finger is near. Run the sketch, hold the touch control and watch the numbers.',
        how: ['<code>touchRead()</code> returns a high number normally and a low number when touched.', 'A threshold between the two decides what counts as a touch.', '<code>value &lt; THRESHOLD</code> is either true or false, which works directly as HIGH or LOW.'],
        tryit: ['Watch the serial monitor and pick a better threshold.', 'Combine this with the toggle lesson: touch once for on, again for off.'],
        code: String.raw`const int TOUCH_PIN = 4;     // touch channel T0
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
}` },
      { id: 'sound', title: 'Sound a siren', hook: 'Sweep a buzzer up and down in pitch.',
        circuit: [{ t: 'buzzer', id: 'buzz', a: 'f22', b: 'f25', pin: 18 }, { t: 'wire', a: 'E:D18', b: 'j22', c: 'purple' }, { t: 'wire', a: 'j25', b: 'B-25', c: 'black' }, { t: 'wire', a: 'E:GND', b: 'B-5', c: 'black' }],
        intro: 'A siren is a tone that slides smoothly up and then down. Two for loops do the sliding by changing the frequency a little at a time. Turn the sound on in the toolbar to hear it.',
        how: ['The first loop raises the frequency from 400 Hz to 1000 Hz in steps of 20.', 'The second loop counts back down. <code>f -= 20</code> means "subtract 20 from f".', 'The short delay sets how fast the pitch moves.'],
        tryit: ['Make the siren faster, then slower.', 'Add a button so the siren only sounds while it is held.'],
        code: String.raw`const int BUZZER_PIN = 18;

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
}` }
    ]
  }
};
