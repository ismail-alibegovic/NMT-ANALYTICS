import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LanguageToggleButton from '../components/common/LanguageToggleButton';
import { I18nProvider, useT } from '../lib/i18n/context';

function Probe() {
  const { lang, t, setLang, toggleLang } = useT();
  return <>
    <output aria-label="Current language">{lang}</output>
    <output aria-label="Save translation">{t.common.save}</output>
    <button onClick={toggleLang}>Toggle test language</button>
    <button onClick={() => { toggleLang(); toggleLang(); }}>Toggle twice</button>
    <button onClick={() => setLang('bs')}>Set Bosnian</button>
    <button onClick={() => setLang('en')}>Set English</button>
  </>;
}
const mount = () => render(<I18nProvider><Probe /></I18nProvider>);
const expectLanguage = (lang: 'bs' | 'en') => {
  expect(screen.getByLabelText('Current language')).toHaveTextContent(lang);
  expect(document.documentElement.lang).toBe(lang);
  expect(screen.getByLabelText('Save translation')).toHaveTextContent(lang === 'bs' ? 'Sačuvaj' : 'Save');
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe('shared BS/EN language selection', () => {
  it('uses supported stored preference before browser preference', () => {
    localStorage.setItem('travline_lang', 'bs'); mount(); expectLanguage('bs');
  });
  it('uses the Bosnian browser preference without a saved choice', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('bs-BA'); mount(); expectLanguage('bs');
  });
  it('ignores an unsupported stored choice and uses the browser preference', () => {
    localStorage.setItem('travline_lang', 'fr');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('bs-BA'); mount(); expectLanguage('bs');
  });
  it('falls back to English for an unsupported browser language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE'); mount(); expectLanguage('en');
  });
  it('retains browser language selection when storage reads are blocked', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('bs-BA');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    mount(); expectLanguage('bs');
  });
  it('allows switching when storage writes are blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Set Bosnian' })); expectLanguage('bs');
    fireEvent.click(screen.getByRole('button', { name: 'Set English' })); expectLanguage('en');
  });
  it('persists explicit selection and restores it on remount', () => {
    const view = mount(); fireEvent.click(screen.getByRole('button', { name: 'Set Bosnian' }));
    expectLanguage('bs'); expect(localStorage.getItem('travline_lang')).toBe('bs');
    view.unmount(); mount(); expectLanguage('bs');
  });
  it('updates translations, document language and persisted choice on each toggle', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Toggle test language' })); expectLanguage('bs');
    expect(localStorage.getItem('travline_lang')).toBe('bs');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle test language' })); expectLanguage('en');
    expect(localStorage.getItem('travline_lang')).toBe('en');
  });
  it('applies both toggles in one event without stale state', () => {
    localStorage.setItem('travline_lang', 'en'); mount();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle twice' })); expectLanguage('en');
    expect(localStorage.getItem('travline_lang')).toBe('en');
  });
});


it('localizes the actual switch accessible name/title and never submits a surrounding form', () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(<I18nProvider><form onSubmit={submit}><LanguageToggleButton /><Probe /></form></I18nProvider>);
  const button = screen.getByRole('button', { name: 'Switch to Bosnian' });
  expect(button).toHaveAttribute('title', 'Switch to Bosnian');
  expect(button).toHaveAttribute('type', 'button');
  fireEvent.click(button); expectLanguage('bs');
  expect(screen.getByRole('button', { name: 'Prebaci na engleski' })).toHaveAttribute('title', 'Prebaci na engleski');
  fireEvent.click(screen.getByRole('button', { name: 'Prebaci na engleski' })); expectLanguage('en');
  expect(submit).not.toHaveBeenCalled();
});
