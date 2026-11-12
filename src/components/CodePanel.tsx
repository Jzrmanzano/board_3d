import { Fragment, useEffect, useRef, useState } from 'react';
import { clearSerial, editCode, resetCode, startRun, stopRun } from '../state/actions';
import { codeOf, useLab } from '../state/store';

function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState('Copy');
  const copy = () => {
    const done = (ok: boolean) => { setLabel(ok ? 'Copied' : 'Copy failed'); setTimeout(() => setLabel('Copy'), 1500); };
    navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  };
  return <button type="button" onClick={copy}>{label}</button>;
}

/** The sketch editor with its line-number gutter, and the serial monitor under it. */
export function CodePanel() {
  const code = useLab(codeOf), running = useLab(s => s.running), errLine = useLab(s => s.errLine), serial = useLab(s => s.serial);
  const gutter = useRef<HTMLPreElement>(null), monitor = useRef<HTMLPreElement>(null);
  const lines = code.split('\n').length;

  useEffect(() => { monitor.current!.scrollTop = monitor.current!.scrollHeight; }, [serial]);

  return (
    <section className="ide">
      <div className="ide-head">
        <h2>Code</h2>
        <span className={running ? 'status on' : 'status'}>{running ? 'Running' : 'Stopped'}</span>
        <button type="button" onClick={resetCode}>Reset</button>
        <CopyButton text={code} />
        <button type="button" className={running ? 'run on' : 'run'} onClick={running ? stopRun : startRun}>{running ? 'Stop' : 'Run'}</button>
      </div>
      <div className="editor">
        <pre ref={gutter} aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => <Fragment key={i}>{i + 1 === errLine ? <b>{i + 1}</b> : i + 1}{'\n'}</Fragment>)}
        </pre>
        <textarea
          value={code} spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Sketch code"
          onChange={e => editCode(e.target.value)}
          onScroll={e => { gutter.current!.scrollTop = e.currentTarget.scrollTop; }}
        />
      </div>
      <div className="serial-head"><span>Serial monitor</span><button type="button" onClick={clearSerial}>Clear</button></div>
      <pre className="serial" ref={monitor} aria-live="off">{serial}</pre>
    </section>
  );
}
