import { useEffect, useState } from 'react';
import PageMeta from '../../components/common/PageMeta';
import Badge from '../../components/ui/badge/Badge';
import Button from '../../components/ui/button/Button';
import Input from '../../components/form/input/InputField';
import Label from '../../components/form/Label';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useT } from '../../lib/i18n/context';
import {
  listOrgAiProviders,
  createOrgAiProvider,
  updateOrgAiProvider,
  deleteOrgAiProvider,
  getOrgAiUsage,
  type AiProviderDto,
  type AiProviderType,
  type AiUsageLogDto,
} from '../../api/aiProviders';

const DEFAULT_MODELS: Record<AiProviderType, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-2.5-flash',
  openai_compatible: 'llama-3.3-70b-versatile',
};

export default function AiSettings() {
  const { t } = useT();
  const s = t.aiSettings as Record<string, any>;
  const { showSuccess, showError } = useToast();

  const [providers, setProviders] = useState<AiProviderDto[]>([]);
  const [hasPlatformFallback, setHasPlatformFallback] = useState(false);
  const [usageSummary, setUsageSummary] = useState<{ count: number; totalTokens: number }>({ count: 0, totalTokens: 0 });
  const [logs, setLogs] = useState<AiUsageLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [providerType, setProviderType] = useState<AiProviderType>('openai');
  const [displayName, setDisplayName] = useState('');
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODELS.openai);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, uRes] = await Promise.all([listOrgAiProviders(), getOrgAiUsage()]);
      setProviders(pRes.providers || []);
      setHasPlatformFallback(Boolean(pRes.hasPlatformFallback));
      setUsageSummary(uRes.summary || { count: 0, totalTokens: 0 });
      setLogs(uRes.logs || []);
    } catch {
      showError(s.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProviderTypeChange = (nextType: AiProviderType) => {
    setProviderType(nextType);
    setDefaultModel(DEFAULT_MODELS[nextType]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !apiKey.trim() || !defaultModel.trim()) {
      showError(s.validationError);
      return;
    }
    setSaving(true);
    try {
      await createOrgAiProvider({
        providerType,
        displayName: displayName.trim(),
        defaultModel: defaultModel.trim(),
        baseUrl: providerType === 'openai_compatible' ? baseUrl.trim() : null,
        apiKey: apiKey.trim(),
      });
      setDisplayName('');
      setApiKey('');
      setBaseUrl('');
      showSuccess(s.createdSuccess);
      await loadAll();
    } catch (err: any) {
      showError(err?.response?.data?.message || s.saveError);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p: AiProviderDto) => {
    try {
      await updateOrgAiProvider(p.id, { isActive: !p.isActive });
      await loadAll();
    } catch {
      showError(s.saveError);
    }
  };

  const handleDelete = async (p: AiProviderDto) => {
    try {
      await deleteOrgAiProvider(p.id);
      showSuccess(s.deletedSuccess);
      await loadAll();
    } catch {
      showError(s.saveError);
    }
  };

  return (
    <div className="space-y-6">
      <PageMeta title={`${s.pageTitle} | Travline`} description={s.pageDescription} />

      <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{s.pageTitle}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.pageDescription}</p>
          </div>
          <Badge color={hasPlatformFallback ? 'success' : 'light'}>
            {hasPlatformFallback ? s.platformFallbackReady : s.platformFallbackNone}
          </Badge>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 dark:border-gray-800 dark:bg-gray-900"
        >
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{s.addProviderTitle}</h2>

          <div>
            <Label>{s.providerTypeLabel}</Label>
            <select
              value={providerType}
              onChange={(e) => handleProviderTypeChange(e.target.value as AiProviderType)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai_compatible">OpenAI-Compatible (HTTPS)</option>
            </select>
          </div>

          <div>
            <Label>{s.displayNameLabel}</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={s.displayNamePlaceholder}
            />
          </div>

          <div>
            <Label>{s.modelLabel}</Label>
            <Input
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              placeholder="gpt-4o-mini"
            />
          </div>

          {providerType === 'openai_compatible' && (
            <div>
              <Label>{s.baseUrlLabel}</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.groq.com/openai/v1"
              />
            </div>
          )}

          <div>
            <Label>{s.apiKeyLabel}</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{s.apiKeyHint}</p>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? s.saving : s.addButton}
          </Button>
        </form>

        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{s.configuredTitle}</h2>
            {loading ? (
              <p className="text-sm text-gray-500">{s.loading}</p>
            ) : providers.length === 0 ? (
              <EmptyState title={s.emptyTitle} description={s.emptyDescription} />
            ) : (
              <div className="space-y-3">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3.5 dark:border-gray-800"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{p.displayName}</span>
                        <Badge size="sm" color={p.isActive ? 'success' : 'light'}>
                          {p.isActive ? s.active : s.inactive}
                        </Badge>
                        <span className="text-xs font-mono text-gray-500">{p.providerType}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {p.defaultModel} · {p.keyHint}
                        {p.baseUrl ? ` · ${p.baseUrl}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => void handleToggle(p)}>
                        {p.isActive ? s.disable : s.enable}
                      </Button>
                      <Button variant="outline" size="sm" color="error" onClick={() => void handleDelete(p)}>
                        {s.delete}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{s.usageTitle}</h2>
              <span className="text-xs text-gray-500">
                {s.usageSummary.replace('{count}', String(usageSummary.count)).replace('{tokens}', usageSummary.totalTokens.toLocaleString())}
              </span>
            </div>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.usageEmpty}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
                    <tr>
                      <th className="py-2 pr-3">{s.colFeature}</th>
                      <th className="py-2 pr-3">{s.colModel}</th>
                      <th className="py-2 pr-3">{s.colTokens}</th>
                      <th className="py-2 pr-3">{s.colStatus}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {logs.slice(0, 10).map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white">{l.feature_key}</td>
                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{l.model}</td>
                        <td className="py-2 pr-3">{l.total_tokens}</td>
                        <td className="py-2 pr-3">{l.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
