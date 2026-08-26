import { initSentry } from './lib/sentry';
initSentry();

// Build identifier. Lets anyone confirm from the browser console which
// frontend bundle is actually executing, independent of caches.
const TRAVLINE_BUILD_ID =
  typeof __TRAVLINE_BUILD_ID__ === 'string' ? __TRAVLINE_BUILD_ID__ : 'unknown';
(window as unknown as { __TRAVLINE_BUILD__: string }).__TRAVLINE_BUILD__ = TRAVLINE_BUILD_ID;
console.info(`Travline build: ${TRAVLINE_BUILD_ID}`);

// Suppress browser extension errors in development
if (import.meta.env.DEV) {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    // Filter out known browser extension errors
    const message = args[0]?.toString() || '';
    if (
      message.includes('runtime.lastError') ||
      message.includes('FrameDoesNotExistError') ||
      message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist')
    ) {
      return; // Suppress these errors
    }
    originalError.apply(console, args);
  };
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "flatpickr/dist/flatpickr.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { AppProvider } from "./context/AppContext.tsx";
import { ToastProvider } from "./context/ToastContext.tsx";
import ErrorBoundary from "./components/common/ErrorBoundary.tsx";
import { I18nProvider } from './lib/i18n/context';

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AppProvider>
            <AppWrapper>
              <I18nProvider>
                <App />
              </I18nProvider>
            </AppWrapper>
          </AppProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
