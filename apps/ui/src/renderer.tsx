import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';

// Set window title based on dev mode
if (typeof __DEV_MODE__ !== 'undefined' && __DEV_MODE__) {
  document.title = 'DMaker-Dev';
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
