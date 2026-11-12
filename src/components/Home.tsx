import { BOARDS } from '../data/boards';
import { MISSIONS } from '../data/missions';
import { Icon } from './Icons';

const ALL_BOARDS = Object.values(BOARDS);
const TAGLINES: Record<string, string> = {
  uno: 'The classic first board. Simple, forgiving and used in classrooms everywhere.',
  esp32: 'A faster board with a 12-bit analog input, touch sensing and Wi-Fi hardware.',
};
const STEPS = [
  ['Pick a place', 'Open the campus map and choose a mission: a small device to build for somewhere at school, like a night light or a door chime.'],
  ['Build and predict', 'Place the parts and wires on the 3D bench yourself, write the sketch, and say what you expect before you run it.'],
  ['Prove it', 'Run the checks on your own build. Every one has to pass, and passing unlocks new parts and the next places on the map.'],
] as const;

/** A flat top-down drawing of a board, used as the hero picture. */
function BoardArt() {
  return (
    <svg className="art" viewBox="0 0 360 230" role="img" aria-label="Drawing of a development board wired to an LED on a breadboard">
      <rect x="6" y="116" width="348" height="108" rx="8" className="a-bread" />
      {Array.from({ length: 24 }, (_, i) => [0, 1, 2, 3, 4].map(j => <circle key={`${i}-${j}`} cx={24 + i * 13.5} cy={134 + j * 12} r="2.2" className="a-hole" />))}
      <rect x="40" y="14" width="190" height="92" rx="6" className="a-pcb" />
      <rect x="22" y="30" width="34" height="34" rx="3" className="a-metal" />
      <rect x="92" y="34" width="84" height="26" rx="3" className="a-chip" />
      <rect x="64" y="22" width="150" height="7" className="a-pins" /><rect x="64" y="91" width="150" height="7" className="a-pins" />
      <circle cx="198" cy="72" r="5" className="a-led-on" />
      <path d="M96 98 C 96 118 70 120 70 140" className="a-wire a-w1" />
      <path d="M150 98 C 150 120 190 112 190 140" className="a-wire a-w2" />
      <g className="a-led"><circle cx="190" cy="168" r="14" /><circle cx="190" cy="168" r="26" className="a-glow" /></g>
      <rect x="62" y="150" width="12" height="40" rx="3" className="a-res" />
      <rect x="260" y="132" width="86" height="64" rx="6" className="a-code" />
      {[50, 62, 38, 56].map((w, i) => <rect key={i} x="270" y={144 + i * 12} width={w} height="4" rx="2" className="a-line" />)}
    </svg>
  );
}

export function Home() {
  const total = ALL_BOARDS.reduce((n, b) => n + MISSIONS[b.id].filter(m => !m.sandbox).length, 0);
  return (
    <div className="home">
      <header className="home-bar">
        <a className="brand" href="#" aria-label="Board Lab 3D home"><Icon name="chip" className="mark" /><h1>Board Lab <span>3D</span></h1></a>
        <nav aria-label="Sections">
          <a href="#boards-section" onClick={e => { e.preventDefault(); document.getElementById('boards-section')?.scrollIntoView({ behavior: 'smooth' }); }}>Boards</a>
          <a className="cta small" href="#uno-tour">Open the lab</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-text">
            <p className="eyebrow">Free · No install · No hardware needed</p>
            <h2>Fix real problems around a school campus with Arduino and ESP32.</h2>
            <p className="lede">Build the device yourself, guess what it will do, then prove it with checks that run your own sketch. {total} missions around a school campus, all in your browser.</p>
            <div className="hero-actions">
              <a className="cta" href="#uno-tour">Start with the Arduino Uno →</a>
              <a className="ghost" href="#esp32-tour">Try the ESP32</a>
            </div>
          </div>
          <BoardArt />
        </section>

        <section className="steps" aria-labelledby="how">
          <h2 id="how" className="sec-title">How it works</h2>
          <ol>
            {STEPS.map(([t, d], i) => (
              <li key={t}><span className="n">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></li>
            ))}
          </ol>
        </section>

        <section id="boards-section" className="boards" aria-labelledby="pick">
          <h2 id="pick" className="sec-title">Pick a board</h2>
          <div className="board-grid">
            {ALL_BOARDS.map(b => (
              <article key={b.id} className="board-card">
                <h3>{b.name}</h3>
                <p>{TAGLINES[b.id]}</p>
                <ol>
                  {MISSIONS[b.id].filter(m => !m.sandbox).map((m, i) => (
                    <li key={m.id}><a href={`#${b.id}-${m.id}`}><span className="n">{String(i + 1).padStart(2, '0')}</span><span><b>{m.place}: {m.title}</b><small>{m.hook}</small></span></a></li>
                  ))}
                </ol>
                <a className="cta" href={`#${b.id}-${MISSIONS[b.id][0].id}`}>Start {b.name} →</a>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="home-foot">
        <span>Board Lab 3D</span>
        <span>The simulator runs a subset of Arduino C++. Progress is saved in this browser.</span>
      </footer>
    </div>
  );
}
