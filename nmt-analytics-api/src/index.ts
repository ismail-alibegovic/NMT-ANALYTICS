// Sentry must be the very first import in the process — the SDK patches
// http/express at module-load time, so any application module loaded before
// this line runs uninstrumented.
import './instrument';
import 'dotenv/config';
import app from './app';
import { activateSmtpProvider } from './lib/email/activateSmtpProvider';
import { captureHandled } from './middleware/sentry';

activateSmtpProvider();

const PORT = process.env.PORT || 3001;

// Crash-level failures that bypass Express entirely (async callbacks,
// unawaited promises, event emitters). Without these the process dies
// silently and the only trace is a dropped connection.
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  captureHandled(reason, { fatal: 'unhandledRejection' });
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  captureHandled(err, { fatal: 'uncaughtException' });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log('Supabase admin client initialized: ok');
});
