/**
 * Simple logger utility to control console output based on environment variables.
 * Enables logs only when VITE_DEBUG='true' is set in .env or localStorage.
 * Critical errors are always logged.
 */

const isDebug = () => {
    return import.meta.env.VITE_DEBUG === 'true' ||
        (typeof window !== 'undefined' && localStorage.getItem('VITE_DEBUG') === 'true');
};

export const logger = {
    log: (...args: any[]) => {
        if (isDebug()) {
            console.log(...args);
        }
    },
    info: (...args: any[]) => {
        if (isDebug()) {
            console.info(...args);
        }
    },
    warn: (...args: any[]) => {
        // Warnings are often important, but if we want to silence them unless debug is on:
        if (isDebug()) {
            console.warn(...args);
        }
    },
    error: (...args: any[]) => {
        // Errors should generally always represent actual issues. 
        // If there are "noisy" errors that are expected, use debugError.
        console.error(...args);
    },
    debugError: (...args: any[]) => {
        if (isDebug()) {
            console.error('[DEBUG_ERROR]', ...args);
        }
    },
    group: (...args: any[]) => {
        if (isDebug()) {
            console.group(...args);
        }
    },
    groupEnd: () => {
        if (isDebug()) {
            console.groupEnd();
        }
    }
};

export default logger;
