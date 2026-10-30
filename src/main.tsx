import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { FullscreenIslandOverlay } from './components/FullscreenIslandOverlay';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

const isOverlay =
  typeof window !== 'undefined' &&
  (window.location.search.includes('window=overlay') || window.location.hash.includes('overlay'));

if (isOverlay) {
  document.documentElement.classList.add('overlay-window-html');
  document.documentElement.style.setProperty('background', 'transparent', 'important');
  document.documentElement.style.setProperty('background-color', 'transparent', 'important');
  document.body.classList.add('overlay-window-body');
  document.body.style.setProperty('background', 'transparent', 'important');
  document.body.style.setProperty('background-color', 'transparent', 'important');
  rootElement.style.setProperty('background', 'transparent', 'important');
  rootElement.style.setProperty('background-color', 'transparent', 'important');
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <FullscreenIslandOverlay />
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
