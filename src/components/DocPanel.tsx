import { setTab } from '../state/actions';
import { boardOf, missionOf, useLab, type Tab } from '../state/store';
import type { Board } from '../types';
import { html, MissionPanel } from './MissionPanel';

const TABS: [Tab, string][] = [['mission', 'Mission'], ['notes', 'Code notes'], ['board', 'Board']];

function Notes() {
  const m = useLab(missionOf);
  return (
    <>
      <h2>How the code works</h2>
      <ul>{m.how.map((x, i) => <li key={i} {...html(x)} />)}</ul>
    </>
  );
}

function Reference({ board }: { board: Board }) {
  return (
    <>
      <h2>{board.name} reference</h2>
      <dl className="facts">{board.facts.map(([k, v]) => [<dt key={k}>{k}</dt>, <dd key={k + 'v'}>{v}</dd>])}</dl>
      {board.pinout.map(g => (
        <div key={g.title}>
          <h3>{g.title}</h3>
          <div className="pins">
            {g.pins.map(([name, note, kind], i) => <span key={i} className={`pin ${kind ?? ''}`}><b>{name}</b>{note && <> <i>{note}</i></>}</span>)}
          </div>
        </div>
      ))}
    </>
  );
}

export function DocPanel() {
  const tab = useLab(s => s.tab), board = useLab(boardOf), mission = useLab(missionOf);
  return (
    <section className="doc">
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {/* the key makes each tab and mission open scrolled to the top */}
      <div className="tabbody" key={`${board.id}-${mission.id}-${tab}`}>
        {tab === 'mission' ? <MissionPanel /> : tab === 'notes' ? <Notes /> : <Reference board={board} />}
      </div>
    </section>
  );
}
