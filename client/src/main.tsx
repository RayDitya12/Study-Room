import '@fontsource-variable/jetbrains-mono';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initTheme } from './theme/applyTheme';
import './index.css';

initTheme();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('missing #root element');

createRoot(rootEl).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
