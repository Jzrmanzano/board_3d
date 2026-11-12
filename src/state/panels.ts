/* Which panels are open over the bench. The map and the mission brief take turns on the left, the code editor has the right side,
   and on a narrow screen only one of them is open at a time so the bench is never completely covered. */
export type Panel = 'map' | 'brief' | 'code';
export interface Panels {
  left: 'map' | 'brief' | null;
  right: 'code' | null;
  /** The panel opened most recently, which Escape closes first. */
  last: Panel | null;
}
export const NONE: Panels = { left: null, right: null, last: null };

export const isOpen = (p: Panels, name: Panel) => p.left === name || p.right === name;

export function openPanel(p: Panels, name: Panel, narrow: boolean): Panels {
  const next: Panels = narrow ? { left: null, right: null, last: name } : { ...p, last: name };
  if (name === 'code') next.right = 'code'; else next.left = name;
  return next;
}

export function closePanel(p: Panels, name: Panel): Panels {
  if (!isOpen(p, name)) return p;
  const next: Panels = { left: p.left === name ? null : p.left, right: p.right === name ? null : p.right, last: p.last };
  if (p.last === name) next.last = next.right ?? next.left;
  return next;
}

export const togglePanel = (p: Panels, name: Panel, narrow: boolean): Panels => (isOpen(p, name) ? closePanel(p, name) : openPanel(p, name, narrow));

/** What Escape does: closes the panel opened last, or whichever is open. */
export function closeTop(p: Panels): Panels {
  const top = p.last && isOpen(p, p.last) ? p.last : p.right ?? p.left;
  return top ? closePanel(p, top) : p;
}
