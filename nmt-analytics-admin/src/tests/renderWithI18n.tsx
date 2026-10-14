import { render as baseRender } from '@testing-library/react';
import { I18nProvider } from '../lib/i18n/context';
export function render(ui: Parameters<typeof baseRender>[0], options?: Parameters<typeof baseRender>[1]) {
  return baseRender(ui, { ...options, wrapper: I18nProvider });
}
