import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { loadSettings } from './utils/storage';
import { applyTypography } from './utils/typography';

// Pre-apply user selected font and size before React tree renders (avoids flicker)
try {
  const initSettings = loadSettings();
  applyTypography(initSettings.fontFamily, initSettings.fontSizeScale || 112);
} catch {
  applyTypography('Cairo', 112);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

