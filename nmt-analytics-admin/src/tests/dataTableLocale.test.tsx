import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { I18nProvider } from '../lib/i18n/context';
import LanguageToggleButton from '../components/common/LanguageToggleButton';
import { DataTable } from '../components/ui/DataTable';
const columns = [{ key: 'name', header: 'Synthetic header' }];
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => { localStorage.setItem('travline_lang', 'bs'); consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); consoleError.mockRestore(); localStorage.clear(); });
it('translates default empty feedback and follows a live language change', () => {
  render(<I18nProvider><LanguageToggleButton /><DataTable data={[]} columns={columns} /></I18nProvider>);
  expect(screen.getByText('Nema pronađenih podataka')).toBeInTheDocument();
  expect(screen.getByText('Nema dostupnih podataka.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' }));
  expect(screen.getByText('No data found')).toBeInTheDocument();
  expect(screen.getByText('No data available')).toBeInTheDocument();
});
it.each(['Caller-provided message', ''])('preserves explicit caller feedback: %j', message => {
  const { container } = render(<I18nProvider><DataTable data={[]} columns={columns} emptyMessage={message} /></I18nProvider>);
  expect(container.querySelector('p')).toHaveTextContent(message);
  expect(screen.queryByText('Nema dostupnih podataka.')).not.toBeInTheDocument();
});
it('updates failed feedback without retrying and recovers only after corrected input and explicit retry', () => {
  let attempts = 0;
  function Fixture() {
    const [broken, setBroken] = useState(true);
    return <><button onClick={() => setBroken(false)}>Fix synthetic input</button><DataTable data={[{ name: 'Recovered synthetic row' }]} columns={[{ key: 'name', header: 'Synthetic header', render: value => { attempts++; if (broken) throw new Error('SYNTHETIC_RENDER_FAILURE'); return value; } }]} /></>;
  }
  render(<I18nProvider><LanguageToggleButton /><Fixture /></I18nProvider>);
  expect(screen.getByText('Podatke tabele nije moguće prikazati.')).toBeInTheDocument();
  const failedAttempts = attempts;
  fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' }));
  expect(screen.getByText('Failed to render table data')).toBeInTheDocument();
  expect(attempts).toBe(failedAttempts);
  fireEvent.click(screen.getByRole('button', { name: 'Fix synthetic input' }));
  expect(screen.queryByText('Recovered synthetic row')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(screen.getByText('Recovered synthetic row')).toBeInTheDocument();
  expect(consoleError).toHaveBeenCalled();
});
it('retains the loading skeleton before translated empty feedback', () => {
  const { container, rerender } = render(<I18nProvider><DataTable data={[]} columns={columns} loading /></I18nProvider>);
  expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  expect(screen.queryByText('Nema pronađenih podataka')).not.toBeInTheDocument();
  rerender(<I18nProvider><DataTable data={[]} columns={columns} /></I18nProvider>);
  expect(screen.getByText('Nema pronađenih podataka')).toBeInTheDocument();
});
