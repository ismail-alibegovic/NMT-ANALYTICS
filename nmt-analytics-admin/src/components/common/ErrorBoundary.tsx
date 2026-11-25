import { Component, ErrorInfo, ReactNode } from 'react';
import { captureError } from '../../lib/sentry';
import { bs } from '../../lib/i18n/bs';
import { en } from '../../lib/i18n/en';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorId?: string;
  copied?: boolean;
}

/**
 * Resolve active UI language without React context because ErrorBoundary
 * wraps I18nProvider at the application root and must stay bootstrap-safe.
 */
function resolveBootstrapLang(): 'bs' | 'en' {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('travline_lang') : null;
    if (stored === 'bs' || stored === 'en') return stored;
  } catch { /* Storage may be blocked in private/restricted environments. */ }
  try {
    const docLang = typeof document !== 'undefined' ? document.documentElement?.lang : '';
    if (docLang?.toLowerCase().startsWith('en')) return 'en';
    if (docLang?.toLowerCase().startsWith('bs')) return 'bs';
  } catch { /* Ignore DOM access issues during early bootstrap. */ }
  try {
    const navLang = typeof navigator !== 'undefined' ? navigator.language : '';
    if (navLang?.toLowerCase().startsWith('en')) return 'en';
    if (navLang?.toLowerCase().startsWith('bs')) return 'bs';
  } catch { /* Ignore navigator access issues. */ }
  return 'bs';
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Generate a unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Log error with context (no PII)
    console.error('React Error Boundary caught an error:', {
      errorId,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      // No user IDs, emails, or personal data
    });

    // A render crash is the highest-signal client failure there is — the user
    // is staring at a dead screen. Always report it, with the component stack
    // so the failing subtree is identifiable without a source-map hunt.
    captureError(error, {
      'error.id': errorId,
      'error.boundary': 'react',
      'route.pathname': window.location.pathname,
      'react.componentStack': (errorInfo.componentStack || '').slice(0, 1500),
    });

    this.setState({ errorId });
  }

  private handleGoToLogin = () => {
    // Clear any auth state and redirect to login
    window.location.href = '/auth/signin';
  };

  private handleCopyErrorDetails = async () => {
    if (!this.state.error) return;

    const errorDetails = {
      message: this.state.error.message,
      stack: this.state.error.stack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
      this.setState({ copied: true });
    } catch (err) {
      console.warn('Failed to copy error details to clipboard:', err);
    }
  };

  public render() {
    if (this.state.hasError) {
      const copy = resolveBootstrapLang() === 'en' ? en.errorBoundary : bs.errorBoundary;
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {copy.title}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {copy.description}
            </p>
            {this.state.errorId && (
              <p className="mb-4 font-mono text-[0.7rem] text-gray-400 dark:text-gray-500">
                {this.state.errorId}
              </p>
            )}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
              >
                {copy.refreshPage}
              </button>
              <button
                type="button"
                onClick={this.handleGoToLogin}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
              >
                {copy.goToLogin}
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: undefined, copied: false })}
                className="w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-medium py-2 px-4 rounded-md transition-colors"
              >
                {copy.tryAgain}
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-4 text-left">
                <button
                  type="button"
                  onClick={this.handleCopyErrorDetails}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-md transition-colors mb-2"
                >
                  {this.state.copied ? copy.copiedDetails : copy.copyDetails}
                </button>
                <details>
                  <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400">
                    {copy.devDetails}
                  </summary>
                  <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-auto">
                    {this.state.error.stack}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
