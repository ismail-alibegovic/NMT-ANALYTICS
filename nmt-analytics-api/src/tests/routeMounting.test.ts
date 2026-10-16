import { describe, it, expect } from 'vitest';
import apiRouter from '../routes';

function collectRoutes(stack: any[], out = new Set<string>()): Set<string> {
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        out.add(`${method.toUpperCase()} ${layer.route.path}`);
      }
    } else if (layer.handle?.stack) {
      collectRoutes(layer.handle.stack, out);
    }
  }
  return out;
}

// Guards against routers that exist and pass isolated unit tests but are never mounted.
describe('API router mounting', () => {
  const routes = collectRoutes((apiRouter as any).stack);

  it.each([
    'manifest.pdf',
    'manifest.csv',
    'rooming-list.pdf',
    'rooming-list.csv',
    'bus-seating.pdf',
    'bus-seating.csv',
    'vouchers-batch.pdf',
  ])('mounts departure document route %s', (doc) => {
    expect(routes.has(`GET /departures/:id/${doc}`)).toBe(true);
  });
});
