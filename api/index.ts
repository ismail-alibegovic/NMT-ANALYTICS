// Vercel serverless entrypoint for the existing Travline Express API.
// Business logic remains in nmt-analytics-api/src/app.ts.
import '../nmt-analytics-api/src/instrument';
export { default } from '../nmt-analytics-api/src/app';
