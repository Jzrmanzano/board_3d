import { useMemo } from 'react';
import { isAvailable, missionKey, MISSIONS } from '../data/missions';
import { goTo, say } from '../state/actions';
import { useLab } from '../state/store';

const Lock = () => (
  <svg className="lock" viewBox="0 0 12 14" width="11" height="13" aria-hidden="true"><rect x="1" y="6" width="10" height="7.5" rx="1.5" /><path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" fill="none" strokeWidth="1.6" /></svg>
);

/** The campus: each place is a mission. Roads join a mission to the ones it opens. A place is closed until the missions before it are passed. */
export function CampusMap() {
  const board = useLab(s => s.board), current = useLab(s => s.mission), passed = useLab(s => s.passed);
  const missions = MISSIONS[board], done = useMemo(() => new Set(Object.keys(passed)), [passed]);
  const at = (id: string) => missions.find(m => m.id === id)!.map;
  const roads = missions.flatMap(m => {
    if (m.sandbox) return [];
    const from = m.after.length ? m.after : m.id === missions[0].id ? [] : [missions[0].id];   // a mission with nothing before it starts at the tour
    return from.map(a => ({ key: `${a}-${m.id}`, a: at(a), b: m.map, open: isAvailable(board, m, done) }));
  });
  return (
    <nav className="map" aria-label="Campus map. Each place is a mission.">
      <svg className="ground" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {roads.map(r => <line key={r.key} x1={r.a[0]} y1={r.a[1]} x2={r.b[0]} y2={r.b[1]} className={r.open ? 'road open' : 'road'} vectorEffect="non-scaling-stroke" />)}
      </svg>
      {missions.map((m, i) => {
        const open = isAvailable(board, m, done), ok = done.has(missionKey(board, m.id));
        const state = ok ? 'passed' : open ? 'open' : 'locked';
        const need = m.after.filter(a => !done.has(missionKey(board, a))).map(a => missions.find(x => x.id === a)!.title);
        return (
          <button
            key={m.id} type="button" className={`spot ${state}${m.sandbox ? ' studio' : ''}`} style={{ left: `clamp(25%, ${m.map[0]}%, 75%)`, top: `${m.map[1]}%` }}
            aria-current={i === current || undefined} aria-disabled={!open || undefined}
            aria-label={`${m.place}: ${m.title}. ${ok ? 'Passed.' : open ? 'Open.' : `Locked. Pass ${need.join(' and ')} first.`}`}
            onClick={() => (open ? goTo(board, m.id) : say('info', `${m.place} is closed. Pass ${need.map(t => `“${t}”`).join(' and ')} first.`, 5000))}
          >
            <span className="badge" aria-hidden="true">{ok ? '✓' : open ? (m.sandbox ? '+' : i + 1) : <Lock />}</span>
            <span className="names"><b>{m.place}</b><small>{m.title}</small></span>
          </button>
        );
      })}
    </nav>
  );
}
