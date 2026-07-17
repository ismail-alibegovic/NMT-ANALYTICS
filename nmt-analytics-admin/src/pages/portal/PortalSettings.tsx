import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n/context';
import { useApp } from '../../context/AppContext';
import { useBranding } from '../../components/portal/BrandingProvider';
import { updateBranding } from '../../api/branding';
import { hasAccess, ROLE_LABELS, type UserRole } from '../../types/roles';
import { useToast } from '../../context/ToastContext';

export default function PortalSettings() {
  const { t } = useT();
  const { userContext } = useApp();
  const { branding, refresh, setBranding } = useBranding();
  const toast = useToast();

  const canEdit = hasAccess('director', userContext?.role as UserRole | undefined);

  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1D4ED8');
  const [accentColor, setAccentColor] = useState('#0EA5E9');
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || !branding) return;
    setDisplayName(branding.display_name || '');
    setLogoUrl(branding.logo_url || '');
    setPrimaryColor(branding.primary_color || '#1D4ED8');
    setAccentColor(branding.accent_color || '#0EA5E9');
    setInitialized(true);
  }, [branding, initialized]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast.error('Only directors may edit branding.');
      return;
    }
    // Basic validation — backend is strict (regex /^#[0-9A-Fa-f]{6}$/)
    const hex = /^#[0-9A-Fa-f]{6}$/;
    if (!hex.test(primaryColor) || !hex.test(accentColor)) {
      toast.error('Colors must be a valid #RRGGBB hex.');
      return;
    }
    if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
      toast.error('Logo URL must start with http(s)://');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateBranding({
        display_name: displayName || null,
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        accent_color: accentColor,
      });
      setBranding(updated);
      toast.success(t.portal.settings.saved);
      // refresh provider cache too
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save branding.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.portal.settings.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.portal.settings.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Branding editor */}
        <form onSubmit={handleSave} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 lg:col-span-2">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">{t.portal.settings.brand}</h2>
            {!canEdit && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Read-only — only directors can update branding.
              </p>
            )}
          </div>

          {/* Live preview banner */}
          <div
            className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
            }}
          >
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg bg-white/20 object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-sm font-bold text-white">
                  {(displayName || 'T').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-white">{displayName || t.portal.layout.appTitle}</p>
                <p className="text-xs text-white/80">Live preview</p>
              </div>
            </div>
          </div>

          {/* Display name */}
          <Field label={t.portal.settings.displayName}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={200}
              disabled={!canEdit || saving}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 disabled:opacity-60"
              placeholder={userContext?.org?.name}
            />
          </Field>

          {/* Logo URL */}
          <Field label={t.portal.settings.logoUrl}>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              disabled={!canEdit || saving}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 disabled:opacity-60"
              placeholder="https://..."
            />
          </Field>

          {/* Colors */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.portal.settings.primaryColor}>
              <ColorInput value={primaryColor} onChange={setPrimaryColor} disabled={!canEdit || saving} />
            </Field>
            <Field label={t.portal.settings.accentColor}>
              <ColorInput value={accentColor} onChange={setAccentColor} disabled={!canEdit || saving} />
            </Field>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={!canEdit || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '...' : t.portal.settings.save}
            </button>
          </div>
        </form>

        {/* Account info */}
        <aside className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">{t.portal.settings.accountTitle}</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t.portal.settings.accountSubtitle}</p>
          </div>
          <dl className="space-y-3 text-sm">
            <Row label={t.portal.settings.email} value={userContext?.user?.email || '—'} />
            <Row
              label={t.portal.settings.role}
              value={ROLE_LABELS[(userContext?.role as UserRole) || 'viewer']}
            />
            <Row label={t.portal.settings.name ?? 'Organization'} value={userContext?.org?.name || '—'} />
          </dl>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function ColorInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200 dark:border-gray-700"
        aria-label="Pick color"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={7}
        className="w-28 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-800 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 disabled:opacity-60"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-2 dark:border-gray-800">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="truncate text-right font-medium text-gray-800 dark:text-gray-200">{value}</dd>
    </div>
  );
}
