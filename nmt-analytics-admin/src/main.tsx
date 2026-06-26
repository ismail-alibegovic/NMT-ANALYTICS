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
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { AppProvider } from "./context/AppContext.tsx";
import { ToastProvider } from "./context/ToastContext.tsx";
import ErrorBoundary from "./components/common/ErrorBoundary.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AppProvider>
            <AppWrapper>
              <App />
            </AppWrapper>
          </AppProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
