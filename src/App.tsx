import { useEffect } from 'react';
import { CodePanel } from './components/CodePanel';
import { Home } from './components/Home';
import { DocPanel } from './components/DocPanel';
import { Stage } from './components/Stage';
import { BOARDS } from './data/boards';
import { goTo } from './state/actions';
import { boardOf, lessonOf, useLab } from './state/store';

const ALL_BOARDS = Object.values(BOARDS);
const TOTAL_LESSONS = ALL_BOARDS.reduce((n, b) => n + b.lessons.length, 0);

function TopBar() {
  const board = useLab(boardOf), done = useLab(s => s.done.length);
  return (
    <header className="bar">
      <a className="brand" href="#" title="Back to the home page"><h1>Board Lab <span>3D</span></h1><p>Wire it, code it, run it.</p></a>
      <a className="home-link" href="#">← Home</a>
      <div className="seg" role="tablist" aria-label="Choose a board">
        {ALL_BOARDS.map(b => (
          <button key={b.id} type="button" role="tab" aria-selected={b.id === board.id} onClick={() => goTo(b.id, b.lessons[0].id)}>{b.name}</button>
        ))}
      </div>
      <div className="progress">
        <span>{done} of {TOTAL_LESSONS} lessons run</span>
        <div className="meter"><i style={{ width: `${100 * done / TOTAL_LESSONS}%` }} /></div>
      </div>
    </header>
  );
}

function LessonRail() {
  const board = useLab(boardOf), current = useLab(s => s.lesson), done = useLab(s => s.done);
  return (
    <nav className="rail" aria-label="Lessons">
      {board.lessons.map((l, i) => {
        const ran = done.includes(`${board.id}-${l.id}`);
        return (
          <button key={l.id} type="button" className="lesson" aria-current={i === current || undefined} onClick={() => goTo(board.id, l.id)}>
            <span className="n">{String(i + 1).padStart(2, '0')}</span>
            <span className="t"><b>{l.title}</b><small>{l.hook}</small></span>
            <span className="ok" title={ran ? 'You have run this lesson' : undefined}>{ran && '✓'}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function App() {
  const board = useLab(boardOf), lesson = useLab(lessonOf), home = useLab(s => s.home);
  useEffect(() => { document.title = home ? 'Board Lab 3D · Learn Arduino and ESP32' : `${lesson.title} · ${board.name} · Board Lab`; }, [home, board, lesson]);
  if (home) return <Home />;
  return (
    <div className="app">
      <TopBar />
      <LessonRail />
      <Stage />
      <aside className="panel">
        <DocPanel />
        <CodePanel />
      </aside>
    </div>
  );
}
