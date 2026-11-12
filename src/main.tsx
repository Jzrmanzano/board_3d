import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { openFromHash } from './state/actions';
import './styles.css';

openFromHash();
window.addEventListener('hashchange', openFromHash);

// The pin labels on the boards are drawn onto canvases in JetBrains Mono, so wait (briefly) for that font before the first render.
const fonts = Promise.all(['500', '700'].map(w => document.fonts.load(`${w} 16px "JetBrains Mono"`)));
Promise.race([fonts, new Promise(r => setTimeout(r, 1500))]).finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
});
