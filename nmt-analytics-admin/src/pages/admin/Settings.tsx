import { useState, useEffect, useRef } from 'react';
import PageMeta from '../../components/common/PageMeta';
import api from '../../lib/apiClient';

interface OrgSettings {
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  email: string;
  phone: string;
  address: string;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<OrgSettings>({
    name: '',
    slug: '',
    currency: 'BAM',
    timezone: 'Europe/Sarajevo',
    email: '',
    phone: '',
    address: ''
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showSmtpForm, setShowSmtpForm] = useState(false);
  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>({
    host: '',
    port: '587',
    user: '',
    pass: '',
    from_email: '',
    from_name: ''
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

  useEffect(() => {
    fetchSettings();
    fetchSmtpSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get<OrgSettings>('/settings');
      setSettings({
        name: data.name || '',
        slug: data.slug || '',
        currency: data.currency || 'BAM',
        timezone: data.timezone || 'Europe/Sarajevo',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || ''
      });
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSmtpSettings = async () => {
    try {
      const { data } = await api.get<SmtpSettings>('/settings/email');
      if (data) {
        setSmtpSettings({
          host: data.host || '',
          port: data.port || '587',
          user: data.user || '',
          pass: '',
          from_email: data.from_email || '',
          from_name: data.from_name || ''
        });
      }
    } catch (error) {
      console.error('Failed to fetch SMTP settings:', error);
    }
  };

  const handleSaveSmtp = async () => {
    setSmtpSaving(true);
    try {
      await api.post('/settings/email', smtpSettings);
      setShowSmtpForm(false);
      showSmtpMessage('SMTP postavke spremljene!', 'success');
    } catch (e: any) {
      showSmtpMessage(e.message || 'Greška', 'error');
    } finally { setSmtpSaving(false); }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      await api.post('/settings/email/test', { to: testEmail });
      showSmtpMessage('Test email poslan!', 'success');
    } catch (e: any) {
      showSmtpMessage(e.message || 'Greška', 'error');
    } finally { setTesting(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.patch('/settings', settings);
      setMessage({ type: 'success', text: 'Postavke su uspješno sačuvane!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Greška pri čuvanju postavki.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <PageMeta title="Postavke | NMT Analytics" description="Postavke organizacije" />
      
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Postavke</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Upravljajte postavkama vaše organizacije
        </p>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Organization Section */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Organizacija</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Naziv organizacije
              </label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Slug (URL identifikator)
              </label>
              <input
                type="text"
                value={settings.slug}
                disabled
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Kontakt informacije</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                placeholder="info@kompanija.ba"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Telefon
              </label>
              <input
                type="tel"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                placeholder="+387 33 123 456"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Adresa
              </label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                placeholder="Ulica i broj, Grad"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Regional Section */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Regionalne postavke</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Valuta
              </label>
              <select
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="BAM">BAM - Konvertibilna marka</option>
                <option value="EUR">EUR - Euro</option>
                <option value="USD">USD - US Dollar</option>
                <option value="HRK">HRK - Hrvatska kuna</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Vremenska zona
              </label>
              <select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              >
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
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Email (SMTP) postavke</h2>
            <button
              onClick={() => setShowSmtpForm(!showSmtpForm)}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              {showSmtpForm ? 'Sakrij' : 'Konfiguriši SMTP'}
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Host</label>
                  <input type="text" value={smtpSettings.host} onChange={(e) => setSmtpSettings({...smtpSettings, host: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="smtp.example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                  <input type="text" value={smtpSettings.port} onChange={(e) => setSmtpSettings({...smtpSettings, port: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="587" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Korisničko ime</label>
                  <input type="text" value={smtpSettings.user} onChange={(e) => setSmtpSettings({...smtpSettings, user: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lozinka</label>
                  <input ref={smtpPasswordRef} type="password" value={smtpSettings.pass} onChange={(e) => setSmtpSettings({...smtpSettings, pass: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email pošiljaoca</label>
                  <input type="email" value={smtpSettings.from_email} onChange={(e) => setSmtpSettings({...smtpSettings, from_email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="noreply@kompanija.ba" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ime pošiljaoca</label>
                  <input type="text" value={smtpSettings.from_name} onChange={(e) => setSmtpSettings({...smtpSettings, from_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="NMT Analytics" />
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <button onClick={handleSaveSmtp} disabled={smtpSaving}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm">
                  {smtpSaving ? 'Spremanje...' : 'Spremi SMTP'}
                </button>
                <div className="flex-1" />
                <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm w-64" placeholder="test@email.com" />
                <button onClick={handleTestEmail} disabled={testing || !testEmail}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:border-gray-600 disabled:opacity-50">
                  {testing ? 'Slanje...' : 'Testiraj'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="p-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Čuvanje...' : 'Sačuvaj promjene'}
          </button>
        </div>
      </div>
    </>
  );
}
