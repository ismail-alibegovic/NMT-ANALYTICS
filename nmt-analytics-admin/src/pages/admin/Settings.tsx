import { useState, useEffect, useRef } from 'react';
import PageMeta from '../../components/common/PageMeta';
import api from '../../lib/apiClient';
import { useT } from '../../lib/i18n/context';

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

export default function Settings() {
  const { t } = useT();
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

  const showSmtpMessage = (text: string, type: 'success' | 'error') => {
    setSmtpMessage({ type, text });
    setTimeout(() => setSmtpMessage(null), 5000);
  };

  useEffect(() => { fetchSettings(); fetchSmtpSettings(); }, []);

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

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;

  return (
    <>
      <PageMeta title={`${t.settings.title} | Travline`} description={t.settings.description} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t.settings.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.settings.description}</p>
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
