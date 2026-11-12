# Board Lab 3D

An interactive 3D workbench that teaches the Arduino Uno and ESP32: wire a circuit, edit the sketch, press Run, and watch the board respond.

Built with Vite, React, TypeScript, three.js (through React Three Fiber) and Zustand.

## Commands

```
npm install      # once
npm run dev      # start the site at http://localhost:5173
npm test         # simulator, circuit checker, placement rules, stepping, and every mission's checks
npm run build    # type-check, then build the static site into dist/
```

`dist/` is a plain static site. Upload it to any host (Vercel, Netlify, GitHub Pages).

## Where things are

| Folder | What it holds |
|---|---|
| `src/data/missions.ts` | The campus missions for both boards: story, goal, checks, prediction, hints, starter sketch and the reference build. Add or edit missions here. |
| `src/data/boards.ts` | The two boards: parts, pinouts and facts. |
| `src/sim/check.ts` | The mission check engine: runs the student's own sketch on their own build, with scripted inputs, on a virtual clock. |
| `src/data/wiring.ts` | Turns a circuit into the rows of the Wiring tab. |
| `src/sim/interpreter.ts` | Runs the Arduino-style code (a subset of C++). |
| `src/sim/circuit.ts` | The electrical model: breadboard connectivity, the mistakes a student can make, and a small DC solver for voltages and currents. |
| `src/sim/hardware.ts` | The virtual pins, connected through the student's wiring to the parts. |
| `src/sim/timeline.ts` | The recording of pin states over time that the Timeline draws and replays. |
| `src/state/panels.ts` | Which panels are open over the bench, on a wide screen and on a phone. |
| `src/state/bench.ts` | The rules for placing parts: which holes exist, which are taken, what each part needs. |
| `src/scene/world.ts` | Builds the 3D board, breadboard and parts for a mission. |
| `src/scene/Bench.tsx` | The React Three Fiber scene: camera, lights, clicking, labels. |
| `src/state/` | App state (`store.ts`) and everything that changes it (`actions.ts`). |
| `src/components/` | The panels around the 3D view. |
| `tests/sim.test.ts` | Simulator tests. |

## Building circuits

Parts start in the tray above the 3D view. Pick a part, then click (or drag between) holes and pins, or type them (`e10 e11`). The circuit check explains problems in plain words: open circuit, LED backwards, missing resistor, short from power to ground. A short stops the sketch from starting, and an LED with no resistor burns out when the sketch drives it. Undo, redo and Reset bench are in the tray (Ctrl+Z, Ctrl+Y, Esc and Delete also work). Drag either end of a wire (the cursor turns into a hand) to plug it into a different hole or pin: the wire follows the pointer, a taken or impossible spot is refused with a reason, and Undo reverses it. Selecting a wire also shows From and To boxes to type new places. A lesson's own `circuit` is the reference answer, shown in the Wiring tab with a "Build it for me" button.

## Seeing inside the circuit

While a sketch runs, yellow beads travel along each wire from + towards -, faster with more current. Point at any hole or pin to read its voltage (and the current a pin supplies). **Step** runs one line and waits: the current line is highlighted in the editor, delays are skipped but still counted on the sketch clock, and **Continue** returns to full speed. Every step (and every pin change in a free run) is recorded in the **Timeline**; pause with Step or stop the sketch, then drag across the chart (or use the arrows) to see the board, the wires and the voltages as they were at that moment. The recording lives in `src/sim/timeline.ts` and wire currents come from `wireAmps` in `src/sim/circuit.ts`.

## The bench, the panels and the keyboard

The 3D bench fills the screen. The campus map, the mission brief and the code open over it as panels (Map, Brief and Code in the top bar, or along the bottom on a phone, where a panel is a sheet and only one is open at a time). Run, Step and Stop stay on the bench, so the sketch can run without the code open, and the circuit slides to stay centred in whatever the panels leave free.

Everything works without a mouse. Press **?** for the full list: **M**, **B** and **C** toggle the panels (focus moves into the panel, and Esc returns it to the button), **Ctrl+Enter** runs or stops, the arrow keys slide the view, **+**, **-**, **0** and **T** zoom, reset and look from the top, and **Delete**, **Ctrl+Z** and **Ctrl+Y** edit the bench. A part is placed from the keyboard by choosing it in the tray and typing its holes.

The look lives in `src/styles.css`: colour tokens for a paper-and-pegboard light theme and a chalkboard dark theme (`tests/palette.test.ts` checks that every text and control pair is readable in both), Zilla Slab for headings, Atkinson Hyperlegible for reading, and the icon set in `src/components/Icons.tsx`. Which panels are open is decided in `src/state/panels.ts`.

## Campus missions

Each location on the campus map is a mission: a small device to build for somewhere at a school. A mission is passed only when **Check my build** runs the student's own sketch on their own circuit and every check passes. Before the first run the student predicts what will happen, and the guess is compared with what the simulator does. Hints come in three steps (a nudge, the idea, the answer) and are counted. Passing a mission puts new parts in the tray and opens the missions after it; the first pass also opens the free-build Open Studio.

## Adding a mission

Add an object to a board's list in `src/data/missions.ts`. It needs a story and goal, a starter sketch, a reference `circuit` and `answer`, three hints, a prediction, and its checks. A check is a scenario made with `phases()`, `blinks()` or `sweeps()` from `src/sim/check.ts`: stretches of time with scripted inputs (a wall that moves, a button that is pressed) and what should be true by the end of each. `npm test` then proves that the reference build passes, that the starter sketch and plausible wrong answers do not, and that every part a mission needs was unlocked by the missions before it. Connection points are named `U:13` (Uno pin), `E:D5` (ESP32 pin), `a10` (breadboard hole) or `T-15` (power rail).

## Simulator limits

The interpreter covers variables, arrays, functions, `if`, `for`, `while`, the pin functions, `tone`, `pulseIn`, `touchRead`, `map`, `millis` and `Serial`. It has no `switch`, no libraries such as Servo, and no Wi-Fi.
