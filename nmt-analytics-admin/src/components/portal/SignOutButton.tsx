import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { useT } from '../../lib/i18n/context';

export default function SignOutButton() {
  const { t } = useT();
  const { signOut } = useApp();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    const ok = window.confirm(t.portal.layout.confirmSignOut);
    if (!ok) return;
    await signOut();
    navigate('/auth/signin', { replace: true });
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
      aria-label={t.portal.layout.signOut}
    >
      <svg
        className="h-4 w-4 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 12h9m0 0-3-3m3 3-3 3"
        />
      </svg>
      <span>{t.portal.layout.signOut}</span>
    </button>
  );
}
