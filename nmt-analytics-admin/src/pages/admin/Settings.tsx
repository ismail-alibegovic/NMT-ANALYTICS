import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import { DocsIcon } from "../../icons";
import api from "../../lib/apiClient";
import { useT } from "../../lib/i18n/context";
import { useApp } from "../../context/AppContext";

interface OrgSettings {
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  bank_account: string;
  invoice_footer: string;
}

interface SmtpSettings {
  host: string;
  port: string;
  user: string;
  pass: string;
  from_email: string;
  from_name: string;
}

interface BrandingSettings {
  display_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
}

interface PlanTierInfo {
  key: string;
  label: string;
  modules: string[];
}

interface PlanResponse {
  plan: string;
  planLabel: string;
  entitledModules: string[];
  tiers: PlanTierInfo[];
  migrationPending?: boolean;
  migrationMessage?: string;
}

type AgencyProfileKey = 'retail_agency' | 'group_tours' | 'dmc_incoming' | 'tour_operator';

interface AgencyProfileResponse {
  profiles: AgencyProfileKey[];
  capabilities: string[];
  configured: boolean;
}

export default function Settings() {
  const { t } = useT();
  const { refreshUserContext } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<OrgSettings>({
    name: '', slug: '', currency: 'BAM', timezone: 'Europe/Sarajevo',
    email: '', phone: '', address: '', tax_id: '', bank_account: '', invoice_footer: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showSmtpForm, setShowSmtpForm] = useState(false);
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>({
    host: '', port: '587', user: '', pass: '', from_email: '', from_name: ''
  });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpMessage, setSmtpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const smtpPasswordRef = useRef<HTMLInputElement>(null);

  const [branding, setBranding] = useState<BrandingSettings>({
    display_name: '', logo_url: '', primary_color: '#1D4ED8', accent_color: '#0EA5E9',
  });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [planData, setPlanData] = useState<PlanResponse | null>(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [planMessage, setPlanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [planMigrationPending, setPlanMigrationPending] = useState(false);
  const [agencyProfiles, setAgencyProfiles] = useState<AgencyProfileKey[]>([]);
  const [agencyCapabilities, setAgencyCapabilities] = useState<string[]>([]);
  const [agencyProfileSaving, setAgencyProfileSaving] = useState(false);
  const [agencyProfileMigrationPending, setAgencyProfileMigrationPending] = useState(false);
  const [agencyProfileMessage, setAgencyProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showPlanMessage = (text: string, type: 'success' | 'error') => {
    setPlanMessage({ type, text });
    setTimeout(() => setPlanMessage(null), 5000);
  };

  const showSmtpMessage = (text: string, type: 'success' | 'error') => {
    setSmtpMessage({ type, text });
    setTimeout(() => setSmtpMessage(null), 5000);
  };

  useEffect(() => { fetchSettings(); fetchSmtpSettings(); fetchBranding(); fetchPlan(); fetchAgencyProfile(); }, []);

  const fetchAgencyProfile = async () => {
    try {
      const { data } = await api.get<AgencyProfileResponse>('/settings/agency-profile');
      setAgencyProfiles(data.profiles || []);
      setAgencyCapabilities(data.capabilities || []);
      setAgencyProfileMigrationPending(false);
    } catch (error: any) {
      if (error?.response?.data?.code === 'MIGRATION_PENDING') {
        setAgencyProfileMigrationPending(true);
        return;
      }
      setAgencyProfileMessage({ type: 'error', text: error?.message || t.settings.agencyProfileLoadError });
    }
  };

  const toggleAgencyProfile = (profile: AgencyProfileKey) => {
    setAgencyProfiles((current) => current.includes(profile)
      ? current.filter((item) => item !== profile)
      : [...current, profile]);
  };

  const handleSaveAgencyProfile = async () => {
    if (agencyProfiles.length === 0) {
      setAgencyProfileMessage({ type: 'error', text: t.settings.agencyProfileRequired });
      return;
    }
    setAgencyProfileSaving(true);
    setAgencyProfileMessage(null);
    try {
      const { data } = await api.patch<AgencyProfileResponse>('/settings/agency-profile', {
        profiles: agencyProfiles,
        enabledCapabilities: [],
      });
      setAgencyCapabilities(data.capabilities || []);
      await refreshUserContext();
      setAgencyProfileMessage({ type: 'success', text: t.settings.agencyProfileSaved });
    } catch (error: any) {
      setAgencyProfileMessage({ type: 'error', text: error?.message || t.settings.saveError });
    } finally {
      setAgencyProfileSaving(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await api.get<OrgSettings>('/settings');
      setSettings({
        name: data.name || '', slug: data.slug || '', currency: data.currency || 'BAM',
        timezone: data.timezone || 'Europe/Sarajevo', email: data.email || '', phone: data.phone || '',
        address: '', tax_id: data.tax_id || '', bank_account: data.bank_account || '', invoice_footer: data.invoice_footer || '',
      });
    } catch (error) { console.error('Failed to fetch settings:', error);
    } finally { setLoading(false); }
  };

  const fetchSmtpSettings = async () => {
    try {
      const { data } = await api.get<SmtpSettings>('/settings/email');
      if (data) setSmtpSettings({
        host: data.host || '', port: data.port || '587', user: data.user || '',
        pass: '', from_email: data.from_email || '', from_name: data.from_name || ''
      });
    } catch (error) { console.error('Failed to fetch SMTP settings:', error); }
  };

  const fetchBranding = async () => {
    try {
      const { data } = await api.get<BrandingSettings>('/settings/branding');
      setBranding({
        display_name: data.display_name || '',
        logo_url: data.logo_url || '',
        primary_color: data.primary_color || '#1D4ED8',
        accent_color: data.accent_color || '#0EA5E9',
      });
    } catch (error) { console.error('Failed to fetch branding:', error); }
  };

  const fetchPlan = async () => {
    try {
      const { data } = await api.get<PlanResponse>('/settings/plan');
      setPlanData(data);
      setPlanMigrationPending(!!data.migrationPending);
    } catch (error: any) {
      setPlanMessage({ type: 'error', text: error.message || 'Failed to load plan information' });
    }
  };

  const handleSaveBranding = async () => {
    setBrandingSaving(true); setBrandingMessage(null);
    try {
      await api.patch('/settings/branding', branding);
      setBrandingMessage({ type: 'success', text: t.settings.saved });
    } catch (error: any) {
      setBrandingMessage({ type: 'error', text: error.message || t.settings.saveError });
    } finally { setBrandingSaving(false); }
  };

  const handleSaveSmtp = async () => {
    setSmtpSaving(true);
    try { await api.post('/settings/email', smtpSettings); setShowSmtpForm(false); showSmtpMessage(t.settings.smtpSaved, 'success'); }
    catch (e: any) { showSmtpMessage(e.message || t.errors.generic, 'error'); }
    finally { setSmtpSaving(false); }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try { await api.post('/settings/email/test', { to: testEmail }); showSmtpMessage(t.settings.testEmailSent, 'success'); }
    catch (e: any) { showSmtpMessage(e.message || t.errors.generic, 'error'); }
    finally { setTesting(false); }
  };

  const handleSave = async () => {
    setSaving(true); setMessage(null);
    try { await api.patch('/settings', settings); setMessage({ type: 'success', text: t.settings.saved }); }
    catch (error: any) { setMessage({ type: 'error', text: error.message || t.settings.saveError }); }
    finally { setSaving(false); }
  };

  const handleSavePlan = async (newPlan: string) => {
    if (!confirm(t.settings.planConfirmChange || 'Change plan tier?')) return;
    setPlanSaving(true); setPlanMessage(null);
    try {
      const { data } = await api.patch<PlanResponse>('/settings/plan', { plan: newPlan });
      setPlanData(data);
      showPlanMessage(t.settings.planSaved || 'Plan updated', 'success');
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to change plan';
      showPlanMessage(msg, 'error');
      if (error?.response?.data?.code === 'MIGRATION_PENDING') setPlanMigrationPending(true);
    } finally { setPlanSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <>
      <PageMeta title={`${t.settings.title} | Travline`} description={t.settings.description} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t.settings.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.settings.description}</p>
      </div>

      {/* PDF Template Editor link */}
      <div className="mb-6 flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <DocsIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{t.settings.pdfTemplateEditor}</p>
          <p className="text-xs text-blue-700 dark:text-blue-300">{t.settings.pdfTemplateEditorDesc}</p>
        </div>
        <Link to="/settings/pdf-templates" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
          {t.settings.openEditor}
        </Link>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Organization Section */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t.settings.orgnizationSection}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.orgnizationName}</label>
              <input type="text" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.slug}</label>
              <input type="text" value={settings.slug} disabled
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed" />
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t.settings.contact}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input type="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                placeholder="info@kompanija.ba"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.customers.phone}</label>
              <input type="tel" value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                placeholder="+387 33 123 456"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.address}</label>
              <input type="text" value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                placeholder="Ulica i broj, Grad"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
          </div>
        </div>

        {/* Regional Section */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t.settings.regional}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.currency}</label>
              <select value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent">
                <option value="BAM">BAM - Konvertibilna marka</option>
                <option value="EUR">EUR - Euro</option>
                <option value="USD">USD - US Dollar</option>
                <option value="HRK">HRK - Hrvatska kuna</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.timezone}</label>
              <select value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent">
                <option value="Europe/Sarajevo">Europe/Sarajevo</option>
                <option value="Europe/Zagreb">Europe/Zagreb</option>
                <option value="Europe/Belgrade">Europe/Belgrade</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>

        {/* SMTP Email Settings */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t.settings.smtpSettings}</h2>
            <button onClick={() => setShowSmtpForm(!showSmtpForm)}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              {showSmtpForm ? t.settings.hide : t.settings.configureSmtp}
            </button>
          </div>

          {smtpMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${smtpMessage.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'}`}>
              {smtpMessage.text}
            </div>
          )}

          {showSmtpForm && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.smtpHost}</label>
                  <input type="text" value={smtpSettings.host} onChange={(e) => setSmtpSettings({...smtpSettings, host: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="smtp.example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.smtpPort}</label>
                  <input type="text" value={smtpSettings.port} onChange={(e) => setSmtpSettings({...smtpSettings, port: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="587" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.smtpUser}</label>
                  <input type="text" value={smtpSettings.user} onChange={(e) => setSmtpSettings({...smtpSettings, user: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.smtpPass}</label>
                  <input ref={smtpPasswordRef} type="password" value={smtpSettings.pass} onChange={(e) => setSmtpSettings({...smtpSettings, pass: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.smtpFromEmail}</label>
                  <input type="email" value={smtpSettings.from_email} onChange={(e) => setSmtpSettings({...smtpSettings, from_email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="noreply@kompanija.ba" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.smtpFromName}</label>
                  <input type="text" value={smtpSettings.from_name} onChange={(e) => setSmtpSettings({...smtpSettings, from_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Travline" />
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <button onClick={handleSaveSmtp} disabled={smtpSaving}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm">
                  {smtpSaving ? t.common.saving : t.settings.smtpSave}
                </button>
                <div className="flex-1" />
                <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm w-64" placeholder={t.settings.testEmailPlaceholder} />
                <button onClick={handleTestEmail} disabled={testing || !testEmail}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:border-gray-600 disabled:opacity-50">
                  {testing ? t.settings.sending : t.settings.testEmail}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Invoice Settings */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t.settings.invoice}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t.settings.invoiceDesc}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.taxIdLabel}</label>
              <input type="text" value={settings.tax_id} onChange={(e) => setSettings({ ...settings, tax_id: e.target.value })}
                placeholder="1234567890000"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.bankAccountLabel}</label>
              <input type="text" value={settings.bank_account} onChange={(e) => setSettings({ ...settings, bank_account: e.target.value })}
                placeholder="BA39 1234 5678 9012 3456"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.invoiceFooterLabel}</label>
              <textarea value={settings.invoice_footer} onChange={(e) => setSettings({ ...settings, invoice_footer: e.target.value })}
                rows={3} placeholder="Hvala Vam na povjerenju."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
          </div>
        </div>

        {/* Branding Section */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">{t.settings.brandingTitle}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t.settings.brandingDesc}</p>

          {brandingMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${brandingMessage.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'}`}>
              {brandingMessage.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.brandingDisplayName}</label>
              <input type="text" value={branding.display_name} onChange={(e) => setBranding({ ...branding, display_name: e.target.value })}
                placeholder={settings.name || 'Moja Agencija'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.brandingLogoUrl}</label>
              <input type="url" value={branding.logo_url} onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.brandingPrimaryColor}</label>
              <div className="flex items-center gap-3">
                <input type="color" value={branding.primary_color} onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                  className="h-10 w-14 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer" />
                <input type="text" value={branding.primary_color} onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                  className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
                <div className="h-10 px-4 rounded-lg flex items-center text-white text-sm font-medium" style={{ backgroundColor: branding.primary_color }}>
                  {t.settings.brandingPrimaryPreview}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.settings.brandingAccentColor}</label>
              <div className="flex items-center gap-3">
                <input type="color" value={branding.accent_color} onChange={(e) => setBranding({ ...branding, accent_color: e.target.value })}
                  className="h-10 w-14 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer" />
                <input type="text" value={branding.accent_color} onChange={(e) => setBranding({ ...branding, accent_color: e.target.value })}
                  className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent" />
                <div className="h-10 px-4 rounded-lg flex items-center text-white text-sm font-medium" style={{ backgroundColor: branding.accent_color }}>
                  {t.settings.brandingAccentPreview}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t.settings.brandingPreviewNote}</p>
            <div className="rounded-lg overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: branding.primary_color }}>
                <div>
                  <span className="text-white text-lg font-bold tracking-wide">VOUCHER</span>
                  <p className="text-white/80 text-xs mt-0.5">{branding.display_name || settings.name || 'Travel Agency'}</p>
                </div>
                {branding.logo_url && (
                  <img src={branding.logo_url} alt="Logo" className="h-8 w-auto object-contain bg-white/10 rounded p-1" />
                )}
              </div>
              <div className="px-6 py-3 flex items-center gap-2 bg-white dark:bg-gray-800">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: branding.accent_color }} />
                <span className="text-sm font-medium" style={{ color: branding.primary_color }}>{t.settings.brandingPrimaryPreview}</span>
                <span className="text-sm text-gray-400">·</span>
                <span className="text-sm" style={{ color: branding.accent_color }}>{t.settings.brandingAccentPreview}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={handleSaveBranding} disabled={brandingSaving}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {brandingSaving ? t.common.saving : t.settings.save}
            </button>
          </div>
        </div>

        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-3xl">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t.settings.agencyProfileTitle}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.settings.agencyProfileDesc}</p>
          </div>

          {agencyProfileMigrationPending && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
              {t.settings.agencyProfileMigrationPending}
            </div>
          )}

          {agencyProfileMessage && (
            <div className={`mt-4 rounded-lg p-3 text-sm ${agencyProfileMessage.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'}`}>
              {agencyProfileMessage.text}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {(['retail_agency', 'group_tours', 'dmc_incoming', 'tour_operator'] as AgencyProfileKey[]).map((profile) => {
              const selected = agencyProfiles.includes(profile);
              const profileCopy = t.settings.agencyProfiles[profile];
              return (
                <label
                  key={profile}
                  className={`relative flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleAgencyProfile(profile)}
                    disabled={agencyProfileMigrationPending}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">{profileCopy.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-gray-500 dark:text-gray-400">{profileCopy.description}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {agencyCapabilities.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t.settings.agencyCapabilitiesEnabled}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {agencyCapabilities.map((capability) => (
                  <span key={capability} className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                    {capability.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              onClick={handleSaveAgencyProfile}
              disabled={agencyProfileSaving || agencyProfileMigrationPending || agencyProfiles.length === 0}
              className="whitespace-nowrap rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {agencyProfileSaving ? t.common.saving : t.settings.agencyProfileSave}
            </button>
          </div>
        </div>

        {/* Plan / Tier Section */}
        {planData && (
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">{t.settings.planTitle || 'Plan & Modules'}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t.settings.planDesc || 'Your subscription tier determines which modules are enabled.'}</p>

            {planMigrationPending && (
              <div className="mb-4 p-3 rounded-lg text-sm bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <strong>{t.settings.planMigrationPending || 'Migration pending'}</strong>
                <p className="mt-1">{t.settings.planMigrationPendingDesc || 'Run DB migration 20260715010000_plan_tier_module_gating.sql before changing plans.'}</p>
              </div>
            )}

            {planMessage && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${planMessage.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'}`}>
                {planMessage.text}
              </div>
            )}

            <div className="mb-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{t.settings.planCurrent || 'Current tier'}</span>
                  <p className="text-xl font-semibold text-gray-900 dark:text-white">{planData.planLabel || planData.plan}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{t.settings.planEntitledModules || 'Modules enabled'}</span>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{planData.entitledModules.length} / {(t.common as any).modules || 13}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {planData.entitledModules.map((m) => (
                  <span key={m} className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{m}</span>
                ))}
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t.settings.planAvailableTiers || 'Available tiers'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {(planData.tiers || []).map((tier) => {
                const isActive = tier.key === planData.plan;
                return (
                  <div key={tier.key} className={`p-4 rounded-lg border ${isActive ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">{tier.label}</span>
                      {isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-white">Active</span>}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {(t.settings as any).planTierDescriptions?.[tier.key] || `${tier.modules.length} modules`}
                    </p>
                    <div className="space-y-1 mb-3">
                      {tier.modules.map((m) => (
                        <div key={m} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${planData.entitledModules.includes(m) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                          {m}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleSavePlan(tier.key)}
                      disabled={isActive || planSaving || planMigrationPending}
                      className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isActive ? 'Current' : planSaving ? 'Saving…' : (t.settings.planUpgrade || 'Switch to')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="p-6 flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {saving ? t.common.saving : t.settings.save}
          </button>
        </div>
      </div>
    </>
  );
}
