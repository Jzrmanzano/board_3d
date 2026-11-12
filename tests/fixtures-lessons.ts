/* The sketches and circuits of the original lessons, kept as fixtures for the simulator's regression tests.
   The app itself now teaches through missions (src/data/missions.ts). */
import type { Item } from '../src/types';

export interface OldLesson { id: string; circuit: Item[]; code: string }
export const OLD_LESSONS: Record<'uno' | 'esp32', OldLesson[]> = {
  "uno": [
    {
      "id": "meet",
      "circuit": [],
      "code": "void setup() {\n  pinMode(LED_BUILTIN, OUTPUT);\n  Serial.begin(9600);\n  Serial.println(\"Hello from the Uno!\");\n}\n\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);   // LED on\n  delay(500);                        // wait half a second\n  digitalWrite(LED_BUILTIN, LOW);    // LED off\n  delay(500);\n}"
    },
    {
      "id": "blink",
      "circuit": [
        {
          "t": "wire",
          "a": "U:13",
          "b": "a10",
          "c": "orange"
        },
        {
          "t": "led",
          "id": "led",
          "a": "e10",
          "k": "e11",
          "color": 16726832,
          "pin": 13
        },
        {
          "t": "res",
          "a": "c11",
          "b": "c15"
        },
        {
          "t": "wire",
          "a": "a15",
          "b": "U:GND2",
          "c": "black"
        }
      ],
      "code": "const int LED_PIN = 13;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(1000);\n  digitalWrite(LED_PIN, LOW);\n  delay(1000);\n}"
    },
    {
      "id": "button",
      "circuit": [
        {
          "t": "wire",
          "a": "U:13",
          "b": "a10",
          "c": "orange"
        },
        {
          "t": "led",
          "id": "led",
          "a": "e10",
          "k": "e11",
          "color": 16726832,
          "pin": 13
        },
        {
          "t": "res",
          "a": "c11",
          "b": "c15"
        },
        {
          "t": "wire",
          "a": "a15",
          "b": "T-15",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "U:GND2",
          "b": "T-1",
          "c": "black"
        },
        {
          "t": "button",
          "id": "btn",
          "col": 20,
          "pin": 2,
          "ctl": "Hold to press the button"
        },
        {
          "t": "wire",
          "a": "U:2",
          "b": "a20",
          "c": "yellow"
        },
        {
          "t": "wire",
          "a": "a22",
          "b": "T-22",
          "c": "black"
        }
      ],
      "code": "const int BUTTON_PIN = 2;\nconst int LED_PIN = 13;\n\nvoid setup() {\n  pinMode(BUTTON_PIN, INPUT_PULLUP);\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  int state = digitalRead(BUTTON_PIN);   // LOW while pressed\n\n  if (state == LOW) {\n    digitalWrite(LED_PIN, HIGH);\n  } else {\n    digitalWrite(LED_PIN, LOW);\n  }\n}"
    },
    {
      "id": "knob",
      "circuit": [
        {
          "t": "wire",
          "a": "U:9",
          "b": "a10",
          "c": "orange"
        },
        {
          "t": "led",
          "id": "led",
          "a": "e10",
          "k": "e11",
          "color": 16726832,
          "pin": 9
        },
        {
          "t": "res",
          "a": "c11",
          "b": "c15"
        },
        {
          "t": "wire",
          "a": "a15",
          "b": "T-15",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "U:GND",
          "b": "T-2",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "U:5V",
          "b": "T+1",
          "c": "red"
        },
        {
          "t": "pot",
          "id": "pot",
          "row": "d",
          "col": 24,
          "pin": 14,
          "ctl": "Knob position"
        },
        {
          "t": "wire",
          "a": "a24",
          "b": "T+24",
          "c": "red"
        },
        {
          "t": "wire",
          "a": "a26",
          "b": "T-26",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "a25",
          "b": "U:A0",
          "c": "green"
        }
      ],
      "code": "const int KNOB_PIN = A0;\nconst int LED_PIN = 9;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int reading = analogRead(KNOB_PIN);              // 0 to 1023\n  int brightness = map(reading, 0, 1023, 0, 255);  // 0 to 255\n  analogWrite(LED_PIN, brightness);\n\n  Serial.print(\"knob = \");\n  Serial.print(reading);\n  Serial.print(\"   brightness = \");\n  Serial.println(brightness);\n  delay(200);\n}"
    },
    {
      "id": "sound",
      "circuit": [
        {
          "t": "buzzer",
          "id": "buzz",
          "a": "e20",
          "b": "e23",
          "pin": 8
        },
        {
          "t": "wire",
          "a": "U:8",
          "b": "a20",
          "c": "purple"
        },
        {
          "t": "wire",
          "a": "a23",
          "b": "U:GND2",
          "c": "black"
        }
      ],
      "code": "const int BUZZER_PIN = 8;\n\n// C  D  E  F  G  A  B  C\nint notes[] = {262, 294, 330, 349, 392, 440, 494, 523};\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  for (int i = 0; i < 8; i++) {\n    Serial.println(notes[i]);\n    tone(BUZZER_PIN, notes[i]);\n    delay(300);\n    noTone(BUZZER_PIN);\n    delay(50);\n  }\n  delay(1000);\n}"
    },
    {
      "id": "distance",
      "circuit": [
        {
          "t": "wire",
          "a": "U:13",
          "b": "a10",
          "c": "orange"
        },
        {
          "t": "led",
          "id": "led",
          "a": "e10",
          "k": "e11",
          "color": 16726832,
          "pin": 13
        },
        {
          "t": "res",
          "a": "c11",
          "b": "c15"
        },
        {
          "t": "wire",
          "a": "a15",
          "b": "T-15",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "U:GND",
          "b": "T-2",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "U:5V",
          "b": "T+1",
          "c": "red"
        },
        {
          "t": "sonar",
          "id": "sonar",
          "row": "j",
          "col": 18,
          "trig": 9,
          "echo": 10,
          "ctl": "Distance to the wall"
        },
        {
          "t": "wire",
          "a": "f18",
          "b": "T+18",
          "c": "red"
        },
        {
          "t": "wire",
          "a": "f21",
          "b": "T-21",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "g19",
          "b": "U:9",
          "c": "blue"
        },
        {
          "t": "wire",
          "a": "g20",
          "b": "U:10",
          "c": "green"
        }
      ],
      "code": "const int TRIG_PIN = 9;\nconst int ECHO_PIN = 10;\nconst int LED_PIN = 13;\n\nvoid setup() {\n  pinMode(TRIG_PIN, OUTPUT);\n  pinMode(ECHO_PIN, INPUT);\n  pinMode(LED_PIN, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  // send a ping\n  digitalWrite(TRIG_PIN, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG_PIN, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(TRIG_PIN, LOW);\n\n  // time the echo\n  long duration = pulseIn(ECHO_PIN, HIGH);\n  float distance = duration * 0.0343 / 2;\n\n  Serial.print(distance);\n  Serial.println(\" cm\");\n\n  if (distance < 20) {\n    digitalWrite(LED_PIN, HIGH);\n  } else {\n    digitalWrite(LED_PIN, LOW);\n  }\n  delay(250);\n}"
    }
  ],
  "esp32": [
    {
      "id": "meet",
      "circuit": [],
      "code": "const int LED = 2;   // blue on-board LED\n\nvoid setup() {\n  pinMode(LED, OUTPUT);\n  Serial.begin(115200);\n  Serial.println(\"Hello from the ESP32!\");\n}\n\nvoid loop() {\n  digitalWrite(LED, HIGH);\n  delay(500);\n  digitalWrite(LED, LOW);\n  delay(500);\n}"
    },
    {
      "id": "blink",
      "circuit": [
        {
          "t": "wire",
          "a": "E:D5",
          "b": "j22",
          "c": "orange"
        },
        {
          "t": "led",
          "id": "led",
          "a": "g22",
          "k": "g23",
          "color": 16726832,
          "pin": 5
        },
        {
          "t": "res",
          "a": "h23",
          "b": "h27"
        },
        {
          "t": "wire",
          "a": "j27",
          "b": "B-27",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "E:GND",
          "b": "B-5",
          "c": "black"
        }
      ],
      "code": "const int LED_PIN = 5;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(1000);\n  digitalWrite(LED_PIN, LOW);\n  delay(1000);\n}"
    },
    {
      "id": "button",
      "circuit": [
        {
          "t": "wire",
          "a": "E:D5",
          "b": "j22",
          "c": "orange"
        },
        {
          "t": "led",
          "id": "led",
          "a": "g22",
          "k": "g23",
          "color": 16726832,
          "pin": 5
        },
        {
          "t": "res",
          "a": "h23",
          "b": "h27"
        },
        {
          "t": "wire",
          "a": "j27",
          "b": "B-27",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "E:GND",
          "b": "B-5",
          "c": "black"
        },
        {
          "t": "button",
          "id": "btn",
          "col": 28,
          "pin": 18,
          "ctl": "Hold to press the button"
        },
        {
          "t": "wire",
          "a": "E:D18",
          "b": "j28",
          "c": "yellow"
        },
        {
          "t": "wire",
          "a": "j30",
          "b": "B-30",
          "c": "black"
        }
      ],
      "code": "const int BUTTON_PIN = 18;\nconst int LED_PIN = 5;\n\nbool ledOn = false;\nint lastState = HIGH;\n\nvoid setup() {\n  pinMode(BUTTON_PIN, INPUT_PULLUP);\n  pinMode(LED_PIN, OUTPUT);\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  int state = digitalRead(BUTTON_PIN);\n\n  if (state == LOW && lastState == HIGH) {   // just pressed\n    ledOn = !ledOn;\n    digitalWrite(LED_PIN, ledOn);\n    Serial.println(ledOn ? \"LED on\" : \"LED off\");\n    delay(50);\n  }\n  lastState = state;\n}"
    },
    {
      "id": "knob",
      "circuit": [
        {
          "t": "wire",
          "a": "E:D5",
          "b": "j22",
          "c": "orange"
        },
        {
          "t": "led",
          "id": "led",
          "a": "g22",
          "k": "g23",
          "color": 16726832,
          "pin": 5
        },
        {
          "t": "res",
          "a": "h23",
          "b": "h27"
        },
        {
          "t": "wire",
          "a": "j27",
          "b": "B-27",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "E:GND",
          "b": "B-5",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "E:3V3",
          "b": "B+4",
          "c": "red"
        },
        {
          "t": "pot",
          "id": "pot",
          "row": "g",
          "col": 28,
          "pin": 34,
          "ctl": "Knob position"
        },
        {
          "t": "wire",
          "a": "j28",
          "b": "B+28",
          "c": "red"
        },
        {
          "t": "wire",
          "a": "j30",
          "b": "B-30",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "j29",
          "b": "E:D34",
          "c": "green"
        }
      ],
      "code": "const int KNOB_PIN = 34;\nconst int LED_PIN = 5;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  int reading = analogRead(KNOB_PIN);      // 0 to 4095\n  float volts = reading * 3.3 / 4095;\n  analogWrite(LED_PIN, reading / 16);      // 0 to 255\n\n  Serial.print(reading);\n  Serial.print(\"   \");\n  Serial.print(volts);\n  Serial.println(\" V\");\n  delay(200);\n}"
    },
    {
      "id": "touch",
      "circuit": [
        {
          "t": "wire",
          "a": "E:D5",
          "b": "j22",
          "c": "orange"
        },
        {
          "t": "led",
          "id": "led",
          "a": "g22",
          "k": "g23",
          "color": 16726832,
          "pin": 5
        },
        {
          "t": "res",
          "a": "h23",
          "b": "h27"
        },
        {
          "t": "wire",
          "a": "j27",
          "b": "B-27",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "E:GND",
          "b": "B-5",
          "c": "black"
        },
        {
          "t": "pad",
          "id": "pad",
          "pin": 4,
          "ctl": "Hold to touch the pad"
        },
        {
          "t": "wire",
          "a": "E:D4",
          "b": "PAD",
          "c": "white"
        }
      ],
      "code": "const int TOUCH_PIN = 4;     // touch channel T0\nconst int LED_PIN = 5;\nconst int THRESHOLD = 30;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  int value = touchRead(TOUCH_PIN);\n  Serial.println(value);\n\n  digitalWrite(LED_PIN, value < THRESHOLD);\n  delay(100);\n}"
    },
    {
      "id": "sound",
      "circuit": [
        {
          "t": "buzzer",
          "id": "buzz",
          "a": "f22",
          "b": "f25",
          "pin": 18
        },
        {
          "t": "wire",
          "a": "E:D18",
          "b": "j22",
          "c": "purple"
        },
        {
          "t": "wire",
          "a": "j25",
          "b": "B-25",
          "c": "black"
        },
        {
          "t": "wire",
          "a": "E:GND",
          "b": "B-5",
          "c": "black"
        }
      ],
      "code": "const int BUZZER_PIN = 18;\n\nvoid setup() {\n}\n\nvoid loop() {\n  for (int f = 400; f <= 1000; f += 20) {   // slide up\n    tone(BUZZER_PIN, f);\n    delay(15);\n  }\n  for (int f = 1000; f >= 400; f -= 20) {   // slide down\n    tone(BUZZER_PIN, f);\n    delay(15);\n  }\n}"
    }
  ]
};
export const oldLesson = (board: 'uno' | 'esp32', id: string): OldLesson => OLD_LESSONS[board].find(l => l.id === id)!;
