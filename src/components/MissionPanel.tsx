import { useMemo } from 'react';
import { MISSIONS, missionKey, PARTS } from '../data/missions';
import { WIRE_CSS, wiringRows } from '../data/wiring';
import { checkMission, fillAnswerCode, goTo, revealHint, showAnswer } from '../state/actions';
import { missionOf, useLab } from '../state/store';

/** Mission text is trusted HTML from src/data, so inline <code> tags can be used in it. */
export const html = (s: string) => ({ dangerouslySetInnerHTML: { __html: s } });

const HINT_NAMES = ['Nudge', 'Idea', 'Answer'], HINT_BUTTONS = ['Give me a nudge', 'Show me the idea', 'Show me the answer'];

/** The goal, the checklist, the prediction and the three hints for the open mission. */
export function MissionPanel() {
  const board = useLab(s => s.board), m = useLab(missionOf), key = missionKey(board, m.id);
  const pass = useLab(s => s.passed[key]), hints = useLab(s => s.hintsUsed[key] ?? 0), guess = useLab(s => s.predictions[key]);
  const results = useLab(s => s.results), checking = useLab(s => s.checking), passed = useLab(s => s.passed);
  const rows = useMemo(
    () => results ?? ['The wiring has no mistakes', ...m.checks.map(c => c.label)].map(label => ({ label, pass: null as boolean | null, detail: '' })),
    [results, m],
  );
  const next = useMemo(() => MISSIONS[board].filter(x => !x.sandbox && x.after.includes(m.id) && !passed[missionKey(board, x.id)]), [board, m, passed]);

  return (
    <>
      <p className="place">{m.place}{pass && <span className="done-chip">Passed</span>}</p>
      <h2>{m.title}</h2>
      <p {...html(m.story)} />
      <div className="goal"><b>Goal</b><span>{m.goal}</span></div>

      {m.sandbox ? (
        <p className="free">This is free build, so there is nothing to check. Every part you have unlocked is in the tray.</p>
      ) : (
        <>
          <h3>Checks</h3>
          <ul className="checklist">
            {rows.map(r => (
              <li key={r.label} data-state={r.pass === null ? 'todo' : r.pass ? 'pass' : 'fail'}>
                <span className="mark" role="img" aria-label={r.pass === null ? 'Not checked yet' : r.pass ? 'Passed' : 'Not passing'}>{r.pass === null ? '○' : r.pass ? '✓' : '✗'}</span>
                <span><b>{r.label}</b>{r.detail && <small>{r.detail}</small>}</span>
              </li>
            ))}
          </ul>
          <p className="actions">
            <button type="button" className="check" disabled={checking} onClick={checkMission}>{checking ? 'Checking…' : 'Check my build'}</button>
            <small>{results ? (results.every(r => r.pass) ? 'Every check passes.' : 'Fix what is marked, then check again.') : 'Runs your sketch on your build against every check.'}</small>
          </p>

          <h3>Your prediction</h3>
          {guess && m.predict ? (
            <p className={guess.right ? 'guess right' : 'guess wrong'}>
              You predicted “{m.predict.options.find(o => o.id === guess.picked)?.label}”. It did: “{m.predict.options.find(o => o.id === guess.actual)?.label}”. {guess.right ? 'Right.' : 'Not this time.'}
              {' '}{m.predict.explain[guess.actual]}
            </p>
          ) : <p className="muted">The first time you press Run, you will be asked what you expect to happen. Then you can compare.</p>}

          <h3>Hints <small>{hints} of 3 used</small></h3>
          <ol className="hints">
            {m.hints.slice(0, hints).map((h, i) => (
              <li key={i}>
                <b>{HINT_NAMES[i]}</b>
                <span {...html(h)} />
                {i === 2 && (
                  <div className="answer">
                    <table className="wiring"><tbody>
                      {wiringRows(m.circuit).map((r, n) => (
                        <tr key={n}><th>{r.wire && <i className="sw" style={{ background: WIRE_CSS[r.wire] }} />}{r.part}</th><td>{r.where}</td></tr>
                      ))}
                    </tbody></table>
                    <p className="actions">
                      <button type="button" onClick={showAnswer}>Build the circuit for me</button>
                      <button type="button" onClick={fillAnswerCode}>Put the sketch in the editor</button>
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {hints < 3 && <p className="actions"><button type="button" onClick={revealHint}>{HINT_BUTTONS[hints]}</button><small>Hints are counted. Try first.</small></p>}
        </>
      )}

      {pass && (
        <div className="reward">
          <b>Passed with {pass.hints === 0 ? 'no hints' : pass.hints === 1 ? '1 hint' : `${pass.hints} hints`}.</b>
          {m.unlocks.length > 0 && <span>Unlocked: {m.unlocks.map(p => PARTS[p].label).join(', ')}.</span>}
          {next.length > 0 && <span>Next: {next.map((x, i) => <button key={x.id} type="button" className="link" onClick={() => goTo(board, x.id)}>{x.place}{i < next.length - 1 ? ',' : ''}</button>)}</span>}
        </div>
      )}
    </>
  );
}
