import { WIRE_CSS, wiringRows } from '../data/wiring';
import { setTab } from '../state/actions';
import { boardOf, lessonOf, useLab, type Tab } from '../state/store';
import type { Board, Lesson } from '../types';

const TABS: [Tab, string][] = [['guide', 'Guide'], ['wiring', 'Wiring'], ['pinout', 'Board']];

/** Lesson text is trusted HTML from src/data, so inline <code> tags can be used in it. */
const html = (s: string) => ({ dangerouslySetInnerHTML: { __html: s } });

function Guide({ lesson }: { lesson: Lesson }) {
  return (
    <>
      <h2>{lesson.title}</h2>
      <p {...html(lesson.intro)} />
      <h3>How the code works</h3>
      <ul>{lesson.how.map((x, i) => <li key={i} {...html(x)} />)}</ul>
      <h3>Try it yourself</h3>
      <ul className="try">{lesson.tryit.map((x, i) => <li key={i} {...html(x)} />)}</ul>
    </>
  );
}

function Wiring({ lesson }: { lesson: Lesson }) {
  if (!lesson.circuit.length) return <><h2>Wiring</h2><p>This lesson uses only the board itself. Nothing to wire yet.</p></>;
  return (
    <>
      <h2>Wiring</h2>
      <p>Each part and wire, with the holes it uses. Columns are numbered 1 to 30 and rows are lettered a to j.</p>
      <div className="scrollx">
        <table className="wiring">
          <tbody>
            {wiringRows(lesson.circuit).map((r, i) => (
              <tr key={i}>
                <th>{r.wire && <i className="sw" style={{ background: WIRE_CSS[r.wire] }} />}{r.part}</th>
                <td>{r.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const tab = useLab(s => s.tab), board = useLab(boardOf), lesson = useLab(lessonOf);
  return (
    <section className="doc">
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {/* the key makes each tab and lesson open scrolled to the top */}
      <div className="tabbody" key={`${board.id}-${lesson.id}-${tab}`}>
        {tab === 'guide' ? <Guide lesson={lesson} /> : tab === 'wiring' ? <Wiring lesson={lesson} /> : <Reference board={board} />}
      </div>
    </section>
  );
}
