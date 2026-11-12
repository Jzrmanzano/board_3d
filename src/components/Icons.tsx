import type { ReactNode } from 'react';

/** The icons of the workshop: drawn on a 24 pixel grid with one round stroke, so they take the colour of the text around them. They are always decoration; the button carries the name. */
const PATHS = {
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  brief: <><path d="M9 4h6v3H9z" /><path d="M8 5.5H6.5A1.5 1.5 0 0 0 5 7v13a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7a1.5 1.5 0 0 0-1.5-1.5H16" /><path d="M8.5 12h7M8.5 16h4" /></>,
  code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" />,
  play: <path d="M7 5v14l12-7z" fill="currentColor" />,
  step: <><path d="M5.5 5v14" /><path d="M10 5l9 7-9 7z" fill="currentColor" /></>,
  forward: <path d="m5 5 7 7-7 7M12 5l7 7-7 7" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-4" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h4" /></>,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />,
  zoomIn: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5M11 8.5v5M8.5 11h5" /></>,
  zoomOut: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5M8.5 11h5" /></>,
  move: <path d="M12 3v18M3 12h18M12 3 9 6m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3" />,
  rotate: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  top: <><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /><rect x="9" y="9" width="6" height="6" rx="1" /></>,
  fit: <><path d="M4 12a8 8 0 1 1 2.4 5.7" /><path d="M4 19v-5h5" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1" fill="currentColor" /></>,
  volume: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" /></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="m17 9 5 6M22 9l-5 6" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8M12 17h.01" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  chip: <><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M9.5 3v4M14.5 3v4M9.5 17v4M14.5 17v4M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{PATHS[name]}</svg>;
}
