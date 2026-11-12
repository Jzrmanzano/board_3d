# Board Lab 3D

An interactive 3D workbench that teaches the Arduino Uno and ESP32: wire a circuit, edit the sketch, press Run, and watch the board respond.

Built with Vite, React, TypeScript, three.js (through React Three Fiber) and Zustand.

## Commands

```
npm install      # once
npm run dev      # start the site at http://localhost:5173
npm test         # run every lesson's sketch on the simulator
npm run build    # type-check, then build the static site into dist/
```

`dist/` is a plain static site. Upload it to any host (Vercel, Netlify, GitHub Pages).

## Where things are

| Folder | What it holds |
|---|---|
| `src/data/boards.ts` | Both boards and all lessons: text, circuit, starter code. Add or edit lessons here. |
| `src/data/wiring.ts` | Turns a circuit into the rows of the Wiring tab. |
| `src/sim/interpreter.ts` | Runs the Arduino-style code (a subset of C++). |
| `src/sim/circuit.ts` | The electrical model: breadboard connectivity, the mistakes a student can make, and a small DC solver for voltages and currents. |
| `src/sim/hardware.ts` | The virtual pins, connected through the student's wiring to the parts. |
| `src/sim/timeline.ts` | The recording of pin states over time that the Timeline draws and replays. |
| `src/state/bench.ts` | The rules for placing parts: which holes exist, which are taken, what each part needs. |
| `src/scene/world.ts` | Builds the 3D board, breadboard and parts for a lesson. |
| `src/scene/Bench.tsx` | The React Three Fiber scene: camera, lights, clicking, labels. |
| `src/state/` | App state (`store.ts`) and everything that changes it (`actions.ts`). |
| `src/components/` | The panels around the 3D view. |
| `tests/sim.test.ts` | Simulator tests. |

## Building circuits

Parts start in the tray above the 3D view. Pick a part, then click (or drag between) holes and pins, or type them (`e10 e11`). The circuit check explains problems in plain words: open circuit, LED backwards, missing resistor, short from power to ground. A short stops the sketch from starting, and an LED with no resistor burns out when the sketch drives it. Undo, redo and Reset bench are in the tray (Ctrl+Z, Ctrl+Y, Esc and Delete also work). Drag either end of a wire (the cursor turns into a hand) to plug it into a different hole or pin: the wire follows the pointer, a taken or impossible spot is refused with a reason, and Undo reverses it. Selecting a wire also shows From and To boxes to type new places. A lesson's own `circuit` is the reference answer, shown in the Wiring tab with a "Build it for me" button.

## Seeing inside the circuit

While a sketch runs, yellow beads travel along each wire from + towards -, faster with more current. Point at any hole or pin to read its voltage (and the current a pin supplies). **Step** runs one line and waits: the current line is highlighted in the editor, delays are skipped but still counted on the sketch clock, and **Continue** returns to full speed. Every step (and every pin change in a free run) is recorded in the **Timeline**; pause with Step or stop the sketch, then drag across the chart (or use the arrows) to see the board, the wires and the voltages as they were at that moment. The recording lives in `src/sim/timeline.ts` and wire currents come from `wireAmps` in `src/sim/circuit.ts`.

## Adding a lesson

Add an object to a board's `lessons` array in `src/data/boards.ts`. A circuit is a list of parts and wires. Connection points are named `U:13` (Uno pin), `E:D5` (ESP32 pin), `a10` (breadboard hole) or `T-15` (power rail). TypeScript flags a part with missing fields, and `npm test` runs the new lesson's starter code.

## Simulator limits

The interpreter covers variables, arrays, functions, `if`, `for`, `while`, the pin functions, `tone`, `pulseIn`, `touchRead`, `map`, `millis` and `Serial`. It has no `switch`, no libraries such as Servo, and no Wi-Fi.
