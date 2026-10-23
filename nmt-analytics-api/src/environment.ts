import dotenv from 'dotenv';
import path from 'path';

// Capture the runtime mode BEFORE reading any file. Files cannot change the
// security boundary, and deployment-provided variables always take precedence.
const runtimeMode = process.env.NODE_ENV || 'development';
if (runtimeMode === 'development') {
  dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });
  // NODE_ENV belongs to the process launcher, never to a development file.
  process.env.NODE_ENV = runtimeMode;
}
