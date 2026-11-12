import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { CampusMap } from './components/CampusMap';
import { CodePanel } from './components/CodePanel';
import { DocPanel } from './components/DocPanel';
import { HelpDialog } from './components/HelpDialog';
import { Home } from './components/Home';
import { Icon, type IconName } from './components/Icons';
import { PredictDialog } from './components/PredictDialog';
import { Stage } from './components/Stage';
import { BOARDS } from './data/boards';
import { MISSIONS, missionKey } from './data/missions';
import { closePanel, goTo, togglePanel } from './state/actions';
import { isOpen, type Panel } from './state/panels';
import { boardOf, missionOf, useLab } from './state/store';

const ALL_BOARDS = Object.values(BOARDS);
const GRADED = Object.entries(MISSIONS).flatMap(([board, list]) => list.filter(m => !m.sandbox).map(m => `${board}-${m.id}`));

const PANELS: [Panel, string, IconName, string][] = [['map', 'Map', 'map', 'M'], ['brief', 'Brief', 'brief', 'B'], ['code', 'Code', 'code', 'C']];

/** The buttons that open the panels: in the top bar on a wide screen, along the bottom on a phone. */
function PanelToggles({ nav = false }: { nav?: boolean }) {
  const panels = useLab(s => s.panels);
  return (
    <div className={nav ? 'toggles nav' : 'toggles'} role="group" aria-label="Panels">
      {PANELS.map(([name, label, icon, key]) => (
        <button key={name} type="button" className="toggle" data-toggle={name} aria-pressed={isOpen(panels, name)} aria-keyshortcuts={key} title={`${label} (${key})`} onClick={() => togglePanel(name)}>
          <Icon name={icon} /><span>{label}</span>{!nav && <kbd aria-hidden="true">{key}</kbd>}
        </button>
      ))}
    </div>
  );
}

function TopBar() {
  const board = useLab(boardOf), mission = useLab(missionOf), passed = useLab(s => s.passed);
  const count = useMemo(() => GRADED.filter(k => passed[k]).length, [passed]);
  const done = !!passed[missionKey(board.id, mission.id)];
  return (
    <header className="bar">
      <a className="brand" href="#" aria-label="Board Lab 3D. Back to the home page"><Icon name="chip" className="mark" /><h1>Board Lab <span>3D</span></h1></a>
      <div className="crumb"><span>{mission.place}</span><Icon name="chevron" /><b>{mission.title}</b>{done && <><Icon name="check" className="tick" /><span className="sr-only">passed</span></>}</div>
      <div className="seg" role="tablist" aria-label="Choose a board">
        {ALL_BOARDS.map(b => (
          <button key={b.id} type="button" role="tab" aria-selected={b.id === board.id} onClick={() => goTo(b.id, MISSIONS[b.id][0].id)}>{b.name}</button>
        ))}
      </div>
      <div className="progress" title={`${count} of ${GRADED.length} missions passed`}>
        <span>{count} of {GRADED.length} missions passed</span>
        <div className="meter" role="progressbar" aria-label="Missions passed" aria-valuemin={0} aria-valuemax={GRADED.length} aria-valuenow={count}><i style={{ width: `${(100 * count) / GRADED.length}%` }} /></div>
      </div>
      <PanelToggles />
    </header>
  );
}

/** A panel that opens over the bench. Asking for it with a button or a key moves the keyboard focus into it, and closing it puts the focus back on its button. */
function Drawer({ name, title, icon, className = '', children }: { name: Panel; title: string; icon: IconName; className?: string; children: ReactNode }) {
  const open = useLab(s => isOpen(s.panels, name)), asked = useLab(s => s.focusPanel);
  const ref = useRef<HTMLElement>(null), seen = useRef(asked?.n ?? 0);
  useEffect(() => {
    if (open && asked && asked.name === name && asked.n !== seen.current) { seen.current = asked.n; ref.current?.focus(); }
  }, [open, asked, name]);
  if (!open) return null;
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(name); } };
  return (
    <aside ref={ref} className={`drawer ${name === 'code' ? 'right' : 'left'}`} aria-label={title} tabIndex={-1} onKeyDown={key}>
      <div className="drawer-head">
        <h2><Icon name={icon} />{title}</h2>
        <button type="button" aria-label={`Close ${title}`} title="Close (Esc)" onClick={() => closePanel(name)}><Icon name="close" /></button>
      </div>
      <div className={`drawer-body ${className}`}>{children}</div>
    </aside>
  );
}

export function App() {
  const board = useLab(boardOf), mission = useLab(missionOf), home = useLab(s => s.home), panels = useLab(s => s.panels);
  useEffect(() => { document.title = home ? 'Board Lab 3D · Campus missions for Arduino and ESP32' : `${mission.title} · ${mission.place} · Board Lab`; }, [home, board, mission]);
  if (home) return <Home />;
  return (
    <div className="app">
      <a className="skip" href="#bench" onClick={e => { e.preventDefault(); document.getElementById('bench')?.focus(); }}>Skip to the bench</a>
      <TopBar />
      <main id="bench" className="bench" tabIndex={-1} aria-label="The bench" data-left={panels.left ?? undefined} data-right={panels.right ?? undefined}>
        <Stage />
        <Drawer name="map" title="Campus map" icon="map" className="mapbody"><CampusMap /></Drawer>
        <Drawer name="brief" title="Mission brief" icon="brief"><DocPanel /></Drawer>
        <Drawer name="code" title="Code" icon="code"><CodePanel /></Drawer>
      </main>
      <PanelToggles nav />
      <PredictDialog />
      <HelpDialog />
    </div>
  );
}
