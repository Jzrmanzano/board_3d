import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clearSerial, editCode, getFrames, resetCode, resumeRun, startRun, stepOnce, stopRun } from '../state/actions';
import { codeOf, useLab } from '../state/store';
import { Timeline } from './Timeline';

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
  const paused = useLab(s => s.paused), heldAt = useLab(s => s.line), cursor = useLab(s => s.cursor), tick = useLab(s => s.frameTick);
  const gutter = useRef<HTMLPreElement>(null), monitor = useRef<HTMLPreElement>(null), area = useRef<HTMLTextAreaElement>(null);
  const [scroll, setScroll] = useState(0), [metrics, setMetrics] = useState({ line: 20, top: 8 });
  const lines = code.split('\n').length;
  void tick;
  // the line the sketch is held at, or the line of the recorded frame being looked at
  const frame = cursor != null ? getFrames()[cursor] : null, current = frame ? frame.line : paused ? heldAt : null;

  useEffect(() => { monitor.current!.scrollTop = monitor.current!.scrollHeight; }, [serial]);
  useLayoutEffect(() => {
    const cs = getComputedStyle(area.current!);
    setMetrics({ line: parseFloat(cs.lineHeight) || 20, top: parseFloat(cs.paddingTop) || 0 });
  }, []);
  useEffect(() => {   // keep the current line on screen
    const ta = area.current!;
    if (!current) return;
    const y = metrics.top + (current - 1) * metrics.line;
    if (y < ta.scrollTop || y + metrics.line > ta.scrollTop + ta.clientHeight) { ta.scrollTop = Math.max(0, y - ta.clientHeight / 2); setScroll(ta.scrollTop); gutter.current!.scrollTop = ta.scrollTop; }
  }, [current, metrics]);

  const status = paused && current ? `Held · line ${current}` : running ? 'Running' : 'Stopped';
  return (
    <section className="ide">
      <div className="ide-head">
        <h2>Code</h2>
        <span className={running ? 'status on' : 'status'}>{status}</span>
        <button type="button" onClick={resetCode}>Reset</button>
        <CopyButton text={code} />
        <button type="button" title="Run one line of the sketch, then wait. While it is running freely this pauses it." onClick={stepOnce}>Step</button>
        {paused && <button type="button" title="Run at full speed again" onClick={resumeRun}>Continue</button>}
        <button type="button" className={running ? 'run on' : 'run'} onClick={running ? stopRun : () => startRun()}>{running ? 'Stop' : 'Run'}</button>
      </div>
      <div className="editor">
        <pre ref={gutter} aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => <Fragment key={i}>{i + 1 === errLine ? <b>{i + 1}</b> : i + 1 === current ? <em>{i + 1}</em> : i + 1}{'\n'}</Fragment>)}
        </pre>
        <div className="ta">
          {current ? <div className="linehl" aria-hidden="true" style={{ top: metrics.top + (current - 1) * metrics.line - scroll, height: metrics.line }} /> : null}
          <textarea
            ref={area} value={code} spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Sketch code"
            onChange={e => editCode(e.target.value)}
            onScroll={e => { setScroll(e.currentTarget.scrollTop); gutter.current!.scrollTop = e.currentTarget.scrollTop; }}
          />
        </div>
      </div>
      <Timeline />
      <div className="serial-head"><span>Serial monitor</span><button type="button" onClick={clearSerial}>Clear</button></div>
      <pre className="serial" ref={monitor} aria-live="off">{serial}</pre>
    </section>
  );
}
