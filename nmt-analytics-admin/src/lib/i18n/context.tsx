import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { en, type Translations } from './en';
import { bs } from './bs';

type Lang = 'bs' | 'en';

const STORAGE_KEY = 'travline_lang';

const translations: Record<Lang, Translations> = { bs, en };

interface I18nContextType {
  lang: Lang;
  t: Record<string, any>;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'bs' || stored === 'en') return stored;
    } catch { /* Storage may be unavailable; still respect browser language. */ }
    return navigator.language?.startsWith('bs') ? 'bs' : 'en';
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState(current => current === 'bs' ? 'en' : 'bs');
  }, []);

  const t = translations[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* Selection remains usable without storage. */ }
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, t, setLang, toggleLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within I18nProvider');
  return ctx;
}

export function useTranslation() {
  return useT().t;
}
