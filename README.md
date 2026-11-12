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
| `src/sim/hardware.ts` | The virtual pins, connected to the circuit's parts. |
| `src/scene/world.ts` | Builds the 3D board, breadboard and parts for a lesson. |
| `src/scene/Bench.tsx` | The React Three Fiber scene: camera, lights, clicking, labels. |
| `src/state/` | App state (`store.ts`) and everything that changes it (`actions.ts`). |
| `src/components/` | The panels around the 3D view. |
| `tests/sim.test.ts` | Simulator tests. |

## Adding a lesson

Add an object to a board's `lessons` array in `src/data/boards.ts`. A circuit is a list of parts and wires. Connection points are named `U:13` (Uno pin), `E:D5` (ESP32 pin), `a10` (breadboard hole) or `T-15` (power rail). TypeScript flags a part with missing fields, and `npm test` runs the new lesson's starter code.

## Simulator limits

The interpreter covers variables, arrays, functions, `if`, `for`, `while`, the pin functions, `tone`, `pulseIn`, `touchRead`, `map`, `millis` and `Serial`. It has no `switch`, no libraries such as Servo, and no Wi-Fi.
