import { useEffect, useRef, type KeyboardEvent } from 'react';
import { setHelp } from '../state/actions';
import { useLab } from '../state/store';

const KEYS: [string[], string][] = [
  [['M'], 'Open or close the campus map'],
  [['B'], 'Open or close the mission brief'],
  [['C'], 'Open or close the code'],
  [['Ctrl', 'Enter'], 'Run the sketch, or stop it (works inside the editor too)'],
  [['←', '↑', '→', '↓'], 'Slide the view. Hold Shift to go faster'],
  [['+', '−'], 'Zoom in and out'],
  [['0'], 'Reset the view'],
  [['T'], 'Look straight down at the bench'],
  [['Esc'], 'Put the part down, then deselect, then close the last panel opened'],
  [['Delete'], 'Remove the selected part or wire'],
  [['Ctrl', 'Z'], 'Undo. Ctrl+Y redoes'],
  [['?'], 'Open this help'],
];

/** Every shortcut in one place. Parts and wires can be placed without a mouse too: choose a part in the tray, then type its holes. */
export function HelpDialog() {
  const open = useLab(s => s.help), close = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) close.current?.focus(); }, [open]);
  if (!open) return null;
  const done = () => { setHelp(false); requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="Keyboard help"]')?.focus()); };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); done(); }
    else if (e.key === 'Tab') { e.preventDefault(); close.current?.focus(); }   // the close button is the only thing to reach
  };
  return (
    <div className="scrim" onKeyDown={key} onClick={e => { if (e.target === e.currentTarget) done(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <p className="eyebrow">Keyboard</p>
        <h2 id="help-title">Everything works without a mouse</h2>
        <table className="keys"><tbody>
          {KEYS.map(([keys, what]) => (
            <tr key={what}><td>{keys.map((k, i) => <span key={k}>{i > 0 && ' + '}<kbd>{k}</kbd></span>)}</td><td>{what}</td></tr>
          ))}
        </tbody></table>
        <p className="note">To place a part: Tab to a part in the tray and press Enter, then type where it goes in the box that appears, such as <code>e10 e11</code>. To move a wire, select it and edit its From and To boxes. Tab reaches the part labels on the bench, and Enter selects one.</p>
        <div className="actions"><button ref={close} type="button" className="go" onClick={done}>Close</button></div>
      </div>
    </div>
  );
}
