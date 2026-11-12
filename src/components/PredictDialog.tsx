import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { cancelPrediction, submitPrediction } from '../state/actions';
import { missionOf, useLab } from '../state/store';

/** Before the first run of a mission: what do you think will happen? The answer is compared with what the simulator really does. */
export function PredictDialog() {
  const asking = useLab(s => s.asking), mission = useLab(missionOf);
  const [picked, setPicked] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { setPicked(null); }, [asking]);
  const p = mission.predict;
  if (!asking || !p) return null;

  const submit = (e: FormEvent) => { e.preventDefault(); if (picked) submitPrediction(picked); };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); cancelPrediction(); return; }
    if (e.key !== 'Tab') return;   // keep the focus inside the dialog
    const items = [...form.current!.querySelectorAll<HTMLElement>('input, button:not(:disabled)')];
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="scrim" onKeyDown={key}>
      <form ref={form} className="dialog" role="dialog" aria-modal="true" aria-labelledby="predict-title" onSubmit={submit}>
        <p className="eyebrow">Before you run</p>
        <h2 id="predict-title">What do you think will happen?</h2>
        <p>{p.question}</p>
        <div className="choices" role="radiogroup" aria-label="Your prediction">
          {p.options.map((o, i) => (
            <label key={o.id} className={picked === o.id ? 'on' : ''}>
              <input type="radio" name="prediction" value={o.id} checked={picked === o.id} autoFocus={i === 0} onChange={() => setPicked(o.id)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <p className="note">Make your best guess. Your build is about to be tried out on the simulator, and your guess is compared with what it really does.</p>
        <div className="actions">
          <button type="button" onClick={cancelPrediction}>Not yet</button>
          <button type="submit" className="go" disabled={!picked}>Lock in my guess and run</button>
        </div>
      </form>
    </div>
  );
}
