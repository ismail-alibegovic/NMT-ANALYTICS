import { useEffect, useMemo, useRef, useState } from 'react';
import PageMeta from '../../components/common/PageMeta';
import Badge from '../../components/ui/badge/Badge';
import Button from '../../components/ui/button/Button';
import Input from '../../components/form/input/InputField';
import Label from '../../components/form/Label';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useT } from '../../lib/i18n/context';
import { get } from '../../api/client';
import {
  getOrgAiEntitlement,
  getOrgAiUsage,
  listPlatformAiProviders,
  createPlatformAiProvider,
  updatePlatformAiProvider,
  deletePlatformAiProvider,
  testPlatformAiProvider,
  discoverPlatformAiModels,
  listPlatformAiModels,
  createManualPlatformModel,
  updatePlatformAiModel,
  runPlatformPlayground,
  streamPlatformPlayground,
  listPlatformAiEntitlements,
  updatePlatformAiEntitlement,
  getPlatformAiUsage,
  type AiModelDto,
  type AiProtocol,
  type AiProviderDto,
  type AiProviderType,
  type AiUsageLogDto,
  type OrgAiEntitlementResponse,
} from '../../api/aiProviders';

type TabKey = 'providers' | 'models' | 'playground' | 'entitlements';
type ConfigMode = 'preset' | 'custom';

interface ProviderPreset {
  slug: string;
  label: string;
  providerType: AiProviderType;
  protocol: AiProtocol;
  authMethod: string;
  baseUrl: string;
  defaultModel: string;
}

const THIRD_PARTY_PRESETS: ProviderPreset[] = [
  { slug: 'openai', label: 'OpenAI', providerType: 'openai', protocol: 'openai_chat_completions', authMethod: 'bearer', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  { slug: 'anthropic', label: 'Anthropic (Claude)', providerType: 'anthropic', protocol: 'anthropic_messages', authMethod: 'x_api_key', baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet-latest' },
  { slug: 'gemini', label: 'Google Gemini', providerType: 'gemini', protocol: 'gemini_generate_content', authMethod: 'x_goog_api_key', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-flash' },
  { slug: 'deepseek', label: 'DeepSeek', providerType: 'openai_compatible', protocol: 'openai_chat_completions', authMethod: 'bearer', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { slug: 'openrouter', label: 'OpenRouter', providerType: 'openai_compatible', protocol: 'openai_chat_completions', authMethod: 'bearer', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini' },
  { slug: 'groq', label: 'Groq', providerType: 'openai_compatible', protocol: 'openai_chat_completions', authMethod: 'bearer', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile' },
  { slug: 'mistral', label: 'Mistral AI', providerType: 'openai_compatible', protocol: 'openai_chat_completions', authMethod: 'bearer', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest' },
  { slug: 'together', label: 'Together AI', providerType: 'openai_compatible', protocol: 'openai_chat_completions', authMethod: 'bearer', baseUrl: 'https://api.together.xyz/v1', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
];

function extractErrorMsg(err: any, fallback: string): string {
  return err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;
}

export default function AiSettings() {
  const { t } = useT();
  const s = t.aiSettings as Record<string, any>;
  const { showSuccess, showError } = useToast();

  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('providers');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Agency view state
  const [orgEnt, setOrgEnt] = useState<OrgAiEntitlementResponse | null>(null);
  const [orgLogs, setOrgLogs] = useState<AiUsageLogDto[]>([]);

  // Platform Owner state
  const [providers, setProviders] = useState<AiProviderDto[]>([]);
  const [models, setModels] = useState<AiModelDto[]>([]);
  const [entitlements, setEntitlements] = useState<Array<{ id: string; name: string; slug: string; plan: string; entitlement: any }>>([]);
  const [platformUsage, setPlatformUsage] = useState<{ logs: AiUsageLogDto[]; summary: { count: number; totalTokens: number; totalKnownCostUsd: number } }>({
    logs: [],
    summary: { count: 0, totalTokens: 0, totalKnownCostUsd: 0 },
  });

  // Provider form state (create + edit)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [configMode, setConfigMode] = useState<ConfigMode>('preset');
  const [selectedPresetSlug, setSelectedPresetSlug] = useState('openai');
  const [providerSlug, setProviderSlug] = useState('openai');
  const [providerType, setProviderType] = useState<AiProviderType>('openai');
  const [protocol, setProtocol] = useState<AiProtocol>('openai_chat_completions');
  const [authMethod, setAuthMethod] = useState('bearer');
  const [displayName, setDisplayName] = useState('OpenAI');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [modelsEndpoint, setModelsEndpoint] = useState('');
  const [defaultModel, setDefaultModel] = useState('gpt-4o-mini');
  const [fallbackModel, setFallbackModel] = useState('');
  const [connectTimeoutMs, setConnectTimeoutMs] = useState(10000);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(30000);
  const [maxOutputTokens, setMaxOutputTokens] = useState(2048);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);
  const [testResultById, setTestResultById] = useState<Record<string, string>>({});

  // Model catalog filters & manual registration
  const [modelSearch, setModelSearch] = useState('');
  const [modelProviderFilter, setModelProviderFilter] = useState('');
  const [modelCategoryFilter, setModelCategoryFilter] = useState('');
  const [manualProviderId, setManualProviderId] = useState('');
  const [manualModelId, setManualModelId] = useState('');
  const [manualDisplayName, setManualDisplayName] = useState('');
  const [manualCategory, setManualCategory] = useState<AiModelDto['category']>('chat');

  // Playground state
  const [pgProviderId, setPgProviderId] = useState('');
  const [pgModelSearch, setPgModelSearch] = useState('');
  const [pgModelId, setPgModelId] = useState('');
  const [pgPrompt, setPgPrompt] = useState('');
  const [pgTemp, setPgTemp] = useState(0.2);
  const [pgMaxTokens, setPgMaxTokens] = useState(1024);
  const [pgStream, setPgStream] = useState(true);
  const [pgJsonMode, setPgJsonMode] = useState(false);
  const [pgToolTest, setPgToolTest] = useState(false);
  const [pgRunning, setPgRunning] = useState(false);
  const [pgHistory, setPgHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string; stats?: any }>>([]);
  const [pgError, setPgError] = useState<string | null>(null);
  const pgAbortRef = useRef<AbortController | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const meRes = await get<{ user?: { isPlatformAdmin?: boolean } }>('/admin/me');
      const platformAdmin = Boolean(meRes.data?.user?.isPlatformAdmin);
      setIsPlatformAdmin(platformAdmin);

      if (platformAdmin) {
        const [pList, mList, eList, uRes] = await Promise.all([
          listPlatformAiProviders(),
          listPlatformAiModels(),
          listPlatformAiEntitlements(),
          getPlatformAiUsage(),
        ]);
        setProviders(pList);
        setModels(mList);
        setEntitlements(eList);
        setPlatformUsage(uRes);
        if (pList.length > 0 && !pgProviderId) {
          const def = pList.find((p) => p.isDefault) || pList[0];
          setPgProviderId(def.id);
          setPgModelId(def.defaultModel);
          setManualProviderId(def.id);
        }
      } else {
        const [entRes, usageRes] = await Promise.all([
          getOrgAiEntitlement(),
          getOrgAiUsage().catch(() => ({ logs: [], summary: { count: 0, totalTokens: 0 } })),
        ]);
        setOrgEnt(entRes);
        setOrgLogs(usageRes.logs || []);
      }
    } catch (err: any) {
      setLoadError(extractErrorMsg(err, s.loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (slug: string) => {
    setSelectedPresetSlug(slug);
    const p = THIRD_PARTY_PRESETS.find((x) => x.slug === slug);
    if (!p) return;
    setProviderSlug(p.slug);
    setProviderType(p.providerType);
    setProtocol(p.protocol);
    setAuthMethod(p.authMethod);
    setDisplayName(p.label);
    setBaseUrl(p.baseUrl);
    setModelsEndpoint('');
    setDefaultModel(p.defaultModel);
  };

  const resetForm = () => {
    setEditingId(null);
    setApiKey('');
    setModelsEndpoint('');
    setFallbackModel('');
    setConnectTimeoutMs(10000);
    setRequestTimeoutMs(30000);
    setMaxOutputTokens(2048);
    applyPreset(selectedPresetSlug);
    setConfigMode('preset');
  };

  const switchMode = (mode: ConfigMode) => {
    setConfigMode(mode);
    if (mode === 'custom') {
      setProviderSlug('');
      setProviderType('openai_compatible');
      setProtocol('openai_chat_completions');
      setAuthMethod('bearer');
      setDisplayName('');
      setBaseUrl('');
      setModelsEndpoint('');
      setDefaultModel('');
    } else {
      applyPreset(selectedPresetSlug);
    }
  };

  const applyHcnsecTemplate = () => {
    setEditingId(null);
    setConfigMode('custom');
    setProviderSlug('hcnsec');
    setProviderType('openai_compatible');
    setProtocol('openai_chat_completions');
    setAuthMethod('bearer');
    setDisplayName('HCNSEC AI Models');
    setBaseUrl('https://api.hcnsec.cn/v1');
    setModelsEndpoint('');
    setDefaultModel('auto');
  };

  const startEditingProvider = (p: AiProviderDto) => {
    setEditingId(p.id);
    setConfigMode('custom');
    setProviderSlug(p.providerSlug || '');
    setProviderType(p.providerType);
    setProtocol(p.protocol);
    setAuthMethod(p.authMethod || 'bearer');
    setDisplayName(p.displayName);
    setBaseUrl(p.baseUrl || '');
    setModelsEndpoint(p.modelsEndpoint || '');
    setDefaultModel(p.defaultModel);
    setFallbackModel(p.fallbackModel || '');
    setConnectTimeoutMs(p.connectTimeoutMs || 10000);
    setRequestTimeoutMs(p.requestTimeoutMs || 30000);
    setMaxOutputTokens(p.maxOutputTokens || 2048);
    setApiKey('');
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !defaultModel.trim() || (!editingId && !apiKey.trim())) {
      showError(s.validationError);
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updatePlatformAiProvider(editingId, {
          providerSlug: providerSlug.trim() || null,
          providerType,
          protocol,
          authMethod,
          displayName: displayName.trim(),
          baseUrl: baseUrl.trim() || null,
          modelsEndpoint: modelsEndpoint.trim() || null,
          defaultModel: defaultModel.trim(),
          fallbackModel: fallbackModel.trim() || null,
          connectTimeoutMs,
          requestTimeoutMs,
          maxOutputTokens,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        });
        showSuccess(s.updatedSuccess);
        resetForm();
      } else {
        await createPlatformAiProvider({
          providerSlug: providerSlug.trim() || null,
          providerType,
          protocol,
          authMethod,
          displayName: displayName.trim(),
          baseUrl: baseUrl.trim() || null,
          modelsEndpoint: modelsEndpoint.trim() || null,
          defaultModel: defaultModel.trim(),
          fallbackModel: fallbackModel.trim() || null,
          connectTimeoutMs,
          requestTimeoutMs,
          maxOutputTokens,
          apiKey: apiKey.trim(),
        });
        setApiKey('');
        showSuccess(s.createdSuccess);
      }
      await loadAll();
    } catch (err: any) {
      showError(extractErrorMsg(err, s.saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (p: AiProviderDto) => {
    setTestingId(p.id);
    try {
      const res = await testPlatformAiProvider(p.id);
      if (res.ok) {
        const modelTag = res.routedModel && res.routedModel !== p.defaultModel ? ` -> ${res.routedModel}` : '';
        setTestResultById((prev) => ({
          ...prev,
          [p.id]: `OK (${res.latencyMs}ms)${modelTag} · ${res.discoveredCount ?? 0} models · "${res.sampleReply || 'OK'}"`,
        }));
        showSuccess(`${p.displayName}: OK (${res.latencyMs}ms)`);
      } else {
        setTestResultById((prev) => ({ ...prev, [p.id]: `FAIL: ${res.error || 'Error'}` }));
        showError(res.error || 'Connection test failed');
      }
      await loadAll();
    } catch (err: any) {
      const msg = extractErrorMsg(err, 'Connection test failed');
      setTestResultById((prev) => ({ ...prev, [p.id]: `FAIL: ${msg}` }));
      showError(msg);
    } finally {
      setTestingId(null);
    }
  };

  const handleDiscover = async (p: AiProviderDto) => {
    setDiscoveringId(p.id);
    try {
      const res = await discoverPlatformAiModels(p.id);
      if (res.supported) {
        showSuccess(`${p.displayName}: ${res.models.length} models discovered`);
        await loadAll();
        setActiveTab('models');
      } else {
        showError(res.error || s.discoveryUnsupported);
      }
    } catch (err: any) {
      showError(extractErrorMsg(err, s.discoveryUnsupported));
    } finally {
      setDiscoveringId(null);
    }
  };

  const handleManualModelAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualProviderId || !manualModelId.trim()) return;
    try {
      await createManualPlatformModel({
        providerId: manualProviderId,
        modelId: manualModelId.trim(),
        displayName: manualDisplayName.trim() || manualModelId.trim(),
        category: manualCategory,
      });
      setManualModelId('');
      setManualDisplayName('');
      showSuccess(s.modelRegistered);
      await loadAll();
    } catch (err: any) {
      showError(extractErrorMsg(err, s.saveError));
    }
  };

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return models.filter((m) => {
      if (modelProviderFilter && m.provider_id !== modelProviderFilter) return false;
      if (modelCategoryFilter && m.category !== modelCategoryFilter) return false;
      if (!q) return true;
      return m.model_id.toLowerCase().includes(q) || m.display_name.toLowerCase().includes(q);
    });
  }, [models, modelSearch, modelProviderFilter, modelCategoryFilter]);

  const pgAvailableModels = useMemo(() => {
    const q = pgModelSearch.trim().toLowerCase();
    return models.filter((m) => {
      if (pgProviderId && m.provider_id !== pgProviderId) return false;
      if (!m.is_enabled || m.category === 'embedding' || m.category === 'audio_asr' || m.category === 'audio_tts') return false;
      if (!q) return true;
      return m.model_id.toLowerCase().includes(q) || m.display_name.toLowerCase().includes(q);
    });
  }, [models, pgProviderId, pgModelSearch]);

  const handlePlaygroundProviderChange = (nextProviderId: string) => {
    setPgProviderId(nextProviderId);
    const chosen = providers.find((p) => p.id === nextProviderId);
    if (chosen) {
      setPgModelId(chosen.defaultModel);
    }
  };

  const handleRunPlayground = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pgProviderId || !pgModelId.trim() || !pgPrompt.trim() || pgRunning) return;
    const promptText = pgPrompt.trim();
    const nextHistory = [...pgHistory, { role: 'user' as const, content: promptText }];
    setPgHistory(nextHistory);
    setPgPrompt('');
    setPgError(null);
    setPgRunning(true);

    const requestPayload = {
      providerId: pgProviderId,
      modelId: pgModelId.trim(),
      messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
      temperature: pgTemp,
      maxTokens: pgMaxTokens,
      responseFormat: (pgJsonMode ? 'json_object' : 'text') as 'text' | 'json_object',
      testTools: pgToolTest,
    };

    try {
      if (pgStream && !pgToolTest) {
        const controller = new AbortController();
        pgAbortRef.current = controller;
        setPgHistory((prev) => [...prev, { role: 'assistant', content: '' }]);
        let streamedText = '';
        const res = await streamPlatformPlayground(
          requestPayload,
          (delta) => {
            streamedText += delta;
            setPgHistory((prev) => {
              const copy = [...prev];
              const lastIdx = copy.length - 1;
              if (lastIdx >= 0 && copy[lastIdx].role === 'assistant') {
                copy[lastIdx] = { ...copy[lastIdx], content: streamedText };
              }
              return copy;
            });
          },
          controller.signal,
        );
        if (res) {
          setPgHistory((prev) => {
            const copy = [...prev];
            const lastIdx = copy.length - 1;
            if (lastIdx >= 0 && copy[lastIdx].role === 'assistant') {
              copy[lastIdx] = {
                role: 'assistant',
                content: res.text || streamedText || '(empty response)',
                stats: {
                  routedModel: res.routedModel || res.model,
                  ttftMs: res.ttftMs,
                  latencyMs: res.latencyMs,
                  tokensPerSec: res.tokensPerSec,
                  usage: res.usage,
                },
              };
            }
            return copy;
          });
        }
      } else {
        const res = await runPlatformPlayground(requestPayload);
        setPgHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: res.text || (res.toolCalls ? JSON.stringify(res.toolCalls, null, 2) : '(empty response)'),
            stats: {
              routedModel: res.routedModel || res.model,
              ttftMs: res.ttftMs,
              latencyMs: res.latencyMs,
              tokensPerSec: res.tokensPerSec,
              usage: res.usage,
            },
          },
        ]);
      }
      await loadAll();
    } catch (err: any) {
      setPgError(extractErrorMsg(err, 'Playground execution failed'));
    } finally {
      pgAbortRef.current = null;
      setPgRunning(false);
    }
  };

  if (loading && isPlatformAdmin === null) {
    return <p className="p-6 text-sm text-gray-500">{s.loading}</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <PageMeta title={`${s.pageTitle} | Travline`} description={s.pageDescription} />
        <div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
          <p className="font-semibold">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadAll()}>
            {s.retry}
          </Button>
        </div>
      </div>
    );
  }

  // Ordinary Agency Director View (no platform keys, base URLs, or Playground)
  if (!isPlatformAdmin) {
    const ent = orgEnt?.entitlement;
    const cons = orgEnt?.consumption;
    return (
      <div className="space-y-6">
        <PageMeta title={`${s.agencyTitle} | Travline`} description={s.agencyDesc} />
        <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{s.agencyTitle}</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.agencyDesc}</p>
            </div>
            <Badge color={ent?.is_enabled && !ent?.emergency_disabled ? 'success' : 'light'}>
              {ent?.is_enabled && !ent?.emergency_disabled ? s.aiActiveBadge : s.aiDisabledBadge}
            </Badge>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500">{s.entitlementStatusLabel}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white uppercase">{ent?.status || 'disabled'}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500">{s.monthlyRequestsLabel}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {cons?.monthRequests ?? 0} / {ent?.monthly_request_limit ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs text-gray-500">{s.monthlyTokensLabel}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {(cons?.monthTokens ?? 0).toLocaleString()} / {(ent?.monthly_token_limit ?? 0).toLocaleString()}
            </p>
          </div>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">{s.usageTitle}</h2>
          {orgLogs.length === 0 ? (
            <p className="text-sm text-gray-500">{s.usageEmpty}</p>
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
                  {orgLogs.slice(0, 15).map((l) => (
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
    );
  }

  return (
    <div className="space-y-6">
      <PageMeta title={`${s.pageTitle} | Travline`} description={s.pageDescription} />

      <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{s.pageTitle}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.pageDescription}</p>
          </div>
          <Badge color="info">{s.platformOwnerBadge}</Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(['providers', 'models', 'playground', 'entitlements'] as TabKey[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === tab
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {s.tabs[tab]}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'providers' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form onSubmit={handleCreateOrUpdate} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3.5 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {editingId ? s.editProvider : s.addProviderTitle}
              </h2>
              <div className="flex items-center gap-2">
                {editingId && (
                  <button type="button" onClick={resetForm} className="text-xs font-medium text-gray-500 hover:underline">
                    {s.cancelEdit}
                  </button>
                )}
                <button type="button" onClick={applyHcnsecTemplate} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  HCNSEC Preset
                </button>
              </div>
            </div>

            {!editingId && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => switchMode('preset')}
                  className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${configMode === 'preset' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  {s.modePreset}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('custom')}
                  className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${configMode === 'custom' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  {s.modeCustom}
                </button>
              </div>
            )}

            {!editingId && configMode === 'preset' && (
              <div>
                <Label>{s.presetLabel}</Label>
                <select
                  value={selectedPresetSlug}
                  onChange={(e) => applyPreset(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {THIRD_PARTY_PRESETS.map((p) => (
                    <option key={p.slug} value={p.slug}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Provider ID</Label>
                <Input value={providerSlug} onChange={(e) => setProviderSlug(e.target.value)} placeholder="hcnsec" />
              </div>
              <div>
                <Label>{s.protocolLabel}</Label>
                <select
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value as AiProtocol)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="openai_chat_completions">OpenAI Chat Completions</option>
                  <option value="openai_responses">OpenAI Responses</option>
                  <option value="anthropic_messages">Anthropic Messages</option>
                  <option value="gemini_generate_content">Google Gemini</option>
                  <option value="ollama_compatible">Ollama-Compatible</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{s.displayNameLabel}</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="HCNSEC AI Models" />
              </div>
              <div>
                <Label>{s.authMethodLabel}</Label>
                <select
                  value={authMethod}
                  onChange={(e) => setAuthMethod(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="bearer">Bearer Token</option>
                  <option value="x_api_key">x-api-key</option>
                  <option value="x_goog_api_key">x-goog-api-key</option>
                  <option value="custom_header">Custom Header</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>

            <div>
              <Label>{s.baseUrlLabel}</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.hcnsec.cn/v1" />
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{s.baseUrlHelp}</p>
            </div>

            {configMode === 'custom' && (
              <div>
                <Label>{s.modelsEndpointLabel}</Label>
                <Input value={modelsEndpoint} onChange={(e) => setModelsEndpoint(e.target.value)} placeholder="https://api.hcnsec.cn/v1/models" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{s.modelLabel}</Label>
                <Input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="auto" />
              </div>
              <div>
                <Label>{s.fallbackModelLabel}</Label>
                <Input value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} placeholder="optional" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Connect (ms)</Label>
                <Input type="number" value={connectTimeoutMs} onChange={(e) => setConnectTimeoutMs(Number(e.target.value) || 10000)} />
              </div>
              <div>
                <Label>Request (ms)</Label>
                <Input type="number" value={requestTimeoutMs} onChange={(e) => setRequestTimeoutMs(Number(e.target.value) || 30000)} />
              </div>
              <div>
                <Label>Max Tokens</Label>
                <Input type="number" value={maxOutputTokens} onChange={(e) => setMaxOutputTokens(Number(e.target.value) || 2048)} />
              </div>
            </div>

            <div>
              <Label>{s.apiKeyLabel}</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={editingId ? s.replaceApiKeyPlaceholder : 'sk-...'}
              />
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{s.apiKeyHint}</p>
            </div>

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? s.saving : editingId ? s.updateButton : s.addButton}
            </Button>
          </form>

          <div className="lg:col-span-2 space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{s.configuredTitle}</h2>
              {providers.length === 0 ? (
                <EmptyState title={s.emptyTitle} description={s.emptyDescription} />
              ) : (
                <div className="space-y-3">
                  {providers.map((p) => (
                    <div key={p.id} className="rounded-lg border border-gray-200 p-4 space-y-2 dark:border-gray-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{p.displayName}</span>
                          {p.isDefault && <Badge size="sm" color="info">Default</Badge>}
                          {p.isFallback && <Badge size="sm" color="warning">{s.fallbackBadge}</Badge>}
                          <Badge size="sm" color={p.isActive ? 'success' : 'light'}>{p.isActive ? s.active : s.inactive}</Badge>
                          <span className="text-xs font-mono text-gray-500">{p.providerSlug || p.providerType} · {p.protocol}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button variant="outline" size="sm" disabled={testingId === p.id} onClick={() => void handleTest(p)}>
                            {testingId === p.id ? '...' : s.testConnection}
                          </Button>
                          <Button variant="outline" size="sm" disabled={discoveringId === p.id} onClick={() => void handleDiscover(p)}>
                            {discoveringId === p.id ? '...' : s.fetchModels}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => startEditingProvider(p)}>
                            {s.editProvider}
                          </Button>
                          {!p.isDefault && (
                            <Button variant="outline" size="sm" onClick={() => void updatePlatformAiProvider(p.id, { isDefault: true }).then(loadAll)}>
                              {s.setDefault}
                            </Button>
                          )}
                          {!p.isFallback && (
                            <Button variant="outline" size="sm" onClick={() => void updatePlatformAiProvider(p.id, { isFallback: true }).then(loadAll)}>
                              {s.setFallback}
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => void updatePlatformAiProvider(p.id, { isActive: !p.isActive }).then(loadAll)}>
                            {p.isActive ? s.disable : s.enable}
                          </Button>
                          <Button variant="outline" size="sm" color="error" onClick={() => void deletePlatformAiProvider(p.id).then(loadAll)}>
                            {s.delete}
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Model: <span className="font-mono">{p.defaultModel}</span>
                        {p.fallbackModel ? ` · Fallback: ${p.fallbackModel}` : ''} · Key: <span className="font-mono">{p.keyHint}</span>
                        {p.baseUrl ? ` · ${p.baseUrl}` : ''}
                      </p>
                      {(testResultById[p.id] || p.lastTestStatus) && (
                        <p className="text-xs font-mono text-gray-600 dark:text-gray-300">
                          {testResultById[p.id] || `Last test: ${p.lastTestStatus} ${p.lastTestError || ''}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {activeTab === 'models' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap gap-3 items-end dark:border-gray-800 dark:bg-gray-900">
            <div className="flex-1 min-w-[200px]">
              <Label>{s.searchModels}</Label>
              <Input value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="DeepSeek, Qwen, gpt-4o..." />
            </div>
            <div>
              <Label>Provider</Label>
              <select value={modelProviderFilter} onChange={(e) => setModelProviderFilter(e.target.value)} className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                <option value="">All</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </div>
            <div>
              <Label>Category</Label>
              <select value={modelCategoryFilter} onChange={(e) => setModelCategoryFilter(e.target.value)} className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                <option value="">All</option>
                <option value="chat">chat</option>
                <option value="reasoning">reasoning</option>
                <option value="embedding">embedding</option>
                <option value="audio_asr">audio_asr</option>
                <option value="audio_tts">audio_tts</option>
                <option value="vision">vision</option>
              </select>
            </div>
          </div>

          <form onSubmit={handleManualModelAdd} className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap gap-3 items-end dark:border-gray-800 dark:bg-gray-900">
            <div>
              <Label>Provider</Label>
              <select value={manualProviderId} onChange={(e) => setManualProviderId(e.target.value)} className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                {providers.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label>Manual Model ID</Label>
              <Input value={manualModelId} onChange={(e) => setManualModelId(e.target.value)} placeholder="DeepSeek-V4.1-Flash" />
            </div>
            <div>
              <Label>Category</Label>
              <select value={manualCategory} onChange={(e) => setManualCategory(e.target.value as any)} className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                <option value="chat">chat</option>
                <option value="reasoning">reasoning</option>
                <option value="embedding">embedding</option>
                <option value="audio_asr">audio_asr</option>
                <option value="audio_tts">audio_tts</option>
              </select>
            </div>
            <Button type="submit" size="sm">{s.registerManualModel}</Button>
          </form>

          <div className="rounded-xl border border-gray-200 bg-white p-4 overflow-x-auto dark:border-gray-800 dark:bg-gray-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
                <tr>
                  <th className="py-2 pr-3">Model ID</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Routing</th>
                  <th className="py-2 pr-3">Pricing</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredModels.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 pr-3 font-mono font-medium text-gray-900 dark:text-white">{m.model_id}</td>
                    <td className="py-2.5 pr-3">{m.ai_providers?.display_name || '—'}</td>
                    <td className="py-2.5 pr-3"><Badge size="sm" color={m.category === 'chat' || m.category === 'reasoning' ? 'info' : 'light'}>{m.category}</Badge></td>
                    <td className="py-2.5 pr-3 space-x-1">
                      {m.is_default_chat && <Badge size="sm" color="success">{s.defaultChatBadge}</Badge>}
                      {m.is_default_tools && <Badge size="sm" color="info">{s.defaultToolsBadge}</Badge>}
                      {!m.is_default_chat && !m.is_default_tools && <span className="text-gray-400">{m.source}</span>}
                    </td>
                    <td className="py-2.5 pr-3">{m.pricing_type}</td>
                    <td className="py-2.5 pr-3"><Badge size="sm" color={m.is_enabled ? 'success' : 'light'}>{m.is_enabled ? s.active : s.inactive}</Badge></td>
                    <td className="py-2.5 pr-3 flex flex-wrap gap-1.5">
                      {(m.category === 'chat' || m.category === 'reasoning') && (
                        <>
                          {!m.is_default_chat && (
                            <Button variant="outline" size="sm" onClick={() => void updatePlatformAiModel(m.id, { isDefaultChat: true }).then(loadAll)}>
                              {s.setDefaultChat}
                            </Button>
                          )}
                          {!m.is_default_tools && (
                            <Button variant="outline" size="sm" onClick={() => void updatePlatformAiModel(m.id, { isDefaultTools: true }).then(loadAll)}>
                              {s.setDefaultTools}
                            </Button>
                          )}
                        </>
                      )}
                      <Button variant="outline" size="sm" onClick={() => void updatePlatformAiModel(m.id, { isEnabled: !m.is_enabled }).then(loadAll)}>
                        {m.is_enabled ? s.disable : s.enable}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setPgProviderId(m.provider_id); setPgModelId(m.model_id); setActiveTab('playground'); }}>
                        Playground
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'playground' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{s.playgroundConfig}</h2>
            <div>
              <Label>Provider</Label>
              <select value={pgProviderId} onChange={(e) => handlePlaygroundProviderChange(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                {providers.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </div>
            <div>
              <Label>Search Catalog Model</Label>
              <Input value={pgModelSearch} onChange={(e) => setPgModelSearch(e.target.value)} placeholder="Filter chat models..." />
              {pgAvailableModels.length > 0 && (
                <select value={pgModelId} onChange={(e) => setPgModelId(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  {pgAvailableModels.map((m) => <option key={m.id} value={m.model_id}>{m.model_id}</option>)}
                </select>
              )}
            </div>
            <div>
              <Label>Active Model ID</Label>
              <Input value={pgModelId} onChange={(e) => setPgModelId(e.target.value)} placeholder="auto" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Temperature</Label>
                <Input type="number" step={0.1} min={0} max={2} value={pgTemp} onChange={(e) => setPgTemp(Number(e.target.value))} />
              </div>
              <div>
                <Label>Max Tokens</Label>
                <Input type="number" value={pgMaxTokens} onChange={(e) => setPgMaxTokens(Number(e.target.value) || 1024)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={pgStream} onChange={(e) => setPgStream(e.target.checked)} />
              {s.streamResponses}
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={pgJsonMode} onChange={(e) => setPgJsonMode(e.target.checked)} />
              Test Structured JSON Output
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={pgToolTest} onChange={(e) => setPgToolTest(e.target.checked)} />
              Test Native Tool Calling (search_departures)
            </label>
            <Button variant="outline" size="sm" className="w-full" onClick={() => { setPgHistory([]); setPgError(null); }}>
              {s.newConversation}
            </Button>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 space-y-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="min-h-[260px] max-h-[420px] overflow-y-auto space-y-3 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
              {pgHistory.map((m, i) => (
                <div key={i} className={`rounded-lg p-3 text-sm ${m.role === 'user' ? 'ml-auto max-w-[85%] bg-brand-600 text-white' : 'mr-auto max-w-[90%] border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200'}`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.stats && (
                    <p className="mt-2 text-[11px] font-mono text-gray-400">
                      Model: {m.stats.routedModel}
                      {m.stats.ttftMs ? ` · TTFT: ${m.stats.ttftMs}ms` : ''}
                      {` · Latency: ${m.stats.latencyMs}ms · Speed: ${m.stats.tokensPerSec ?? '—'} tok/s · Prompt: ${m.stats.usage?.promptTokens} · Completion: ${m.stats.usage?.completionTokens} · Total: ${m.stats.usage?.totalTokens}`}
                      {m.stats.usage?.cachedTokens ? ` · Cached: ${m.stats.usage.cachedTokens}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {pgError && <p className="text-xs text-error-600 dark:text-error-400">{pgError}</p>}
            <form onSubmit={handleRunPlayground} className="flex gap-2">
              <div className="flex-1">
                <Input value={pgPrompt} onChange={(e) => setPgPrompt(e.target.value)} placeholder="Send a synthetic test prompt..." />
              </div>
              {pgRunning && (
                <Button type="button" variant="outline" color="error" onClick={() => pgAbortRef.current?.abort()}>
                  {s.cancelRun}
                </Button>
              )}
              <Button type="submit" disabled={pgRunning || !pgPrompt.trim()}>{pgRunning ? '...' : 'Run'}</Button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'entitlements' && (
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{s.orgEntitlementsTitle}</h2>
            <div className="space-y-3">
              {entitlements.map((org) => {
                const ent = org.entitlement;
                return (
                  <div key={org.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3.5 dark:border-gray-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{org.name}</span>
                        <Badge size="sm" color={ent.is_enabled && !ent.emergency_disabled ? 'success' : 'light'}>
                          {ent.status}
                        </Badge>
                        <span className="text-xs text-gray-500">Plan: {org.plan}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Limits: {ent.monthly_request_limit} req/mo · {Number(ent.monthly_token_limit || 0).toLocaleString()} tok/mo · Ceiling: ${ent.monthly_spend_ceiling_usd}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void updatePlatformAiEntitlement(org.id, {
                          isEnabled: !ent.is_enabled,
                          status: !ent.is_enabled ? 'active' : 'disabled',
                          monthlyRequestLimit: ent.monthly_request_limit || 500,
                          monthlyTokenLimit: ent.monthly_token_limit || 500000,
                          perUserDailyRequestLimit: ent.per_user_daily_request_limit || 100,
                          monthlySpendCeilingUsd: Number(ent.monthly_spend_ceiling_usd ?? 25),
                          emergencyDisabled: false,
                        }).then(loadAll)}
                      >
                        {ent.is_enabled ? s.disable : s.enable}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{s.platformUsageTitle}</h2>
              <span className="text-xs text-gray-500">
                {platformUsage.summary.count} calls · {platformUsage.summary.totalTokens.toLocaleString()} tokens · Known cost: ${platformUsage.summary.totalKnownCostUsd}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
                  <tr>
                    <th className="py-2 pr-3">{s.colFeature}</th>
                    <th className="py-2 pr-3">{s.colModel}</th>
                    <th className="py-2 pr-3">{s.colTokens}</th>
                    <th className="py-2 pr-3">Cost Status</th>
                    <th className="py-2 pr-3">Latency</th>
                    <th className="py-2 pr-3">{s.colStatus}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {platformUsage.logs.slice(0, 20).map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white">{l.feature_key}</td>
                      <td className="py-2 pr-3 font-mono">{l.model}</td>
                      <td className="py-2 pr-3">{l.total_tokens}</td>
                      <td className="py-2 pr-3">{l.cost_status || 'unknown'}</td>
                      <td className="py-2 pr-3">{l.latency_ms}ms</td>
                      <td className="py-2 pr-3">{l.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
