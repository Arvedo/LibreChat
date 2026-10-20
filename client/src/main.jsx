import './polyfills/storage';
import './polyfills/crypto';
import './polyfills/regeneratorRuntime';
import { createRoot } from 'react-dom/client';
import { initializeI18n } from './locales/i18n';
import App from './App';
import '@librechat/client/style.css';
import './style.css';
import './mobile.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import { clearTTSCache } from './utils/ttscache';
import 'katex/dist/katex.min.css';
import 'katex/dist/contrib/copy-tex.js';

/** Read-aloud audio lives in memory now; drop what earlier versions persisted to disk. */
void clearTTSCache();

const container = document.getElementById('root');
const root = createRoot(container);

async function bootstrap() {
  await initializeI18n();

  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
}

bootstrap().catch((error) => {
  console.error('[i18n] Failed to initialize before render', error);
  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
});

if (typeof window !== 'undefined') {
  const triggerAssetReload = () => {
    try {
      const now = Date.now();
      const last = Number(sessionStorage.getItem('lc_asset_reload_ts') || '0');
      if (now - last < 15000) return;
      sessionStorage.setItem('lc_asset_reload_ts', String(now));
      if ('caches' in window) {
        caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).finally(() => window.location.reload());
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };
  window.addEventListener('vite:preloadError', () => {
    triggerAssetReload();
  });
  window.addEventListener(
    'error',
    (e) => {
      const t = e?.target;
      if (t && (t.tagName === 'LINK' || t.tagName === 'SCRIPT')) {
        const url = t.href || t.src || '';
        if (url.includes('/assets/')) {
          triggerAssetReload();
        }
      }
    },
    true,
  );
}
