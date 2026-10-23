import { useT } from '../../lib/i18n/context';

export default function LanguageToggleButton() {
  const { lang, t, toggleLang } = useT();
  const label = lang === 'en' ? t.common.switchToBosnian : t.common.switchToEnglish;
  return <button
    type="button"
    onClick={toggleLang}
    className="relative flex items-center justify-center h-11 w-11 rounded-full border border-gray-200 bg-white text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
    title={label}
    aria-label={label}
  >
    {lang === 'en' ? 'BS' : 'EN'}
  </button>;
}
