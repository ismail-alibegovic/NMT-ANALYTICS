import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import PageMeta from '../components/common/PageMeta';
import Badge from '../components/ui/badge/Badge';
import Button from '../components/ui/button/Button';
import Input from '../components/form/input/InputField';
import { useT } from '../lib/i18n/context';
import { get } from '../api/client';
import {
  askTravlineAssistant,
  listAiProposals,
  createAiProposal,
  confirmAiProposal,
  rejectAiProposal,
  type AiActionProposalDto,
  type AiActionType,
  type AiAssistantResponse,
} from '../api/aiAssistant';
import {
  getOrgAiEntitlement,
  listPlatformAiProviders,
  listPlatformAiModels,
  type AiProviderDto,
  type AiModelDto,
} from '../api/aiProviders';

interface MessageItem {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  meta?: string;
}

function getErrCode(err: any): string | undefined {
  return err?.code || err?.response?.data?.code;
}

function getErrMsg(err: any, fallback: string): string {
  return err?.message || err?.response?.data?.message || fallback;
}

export default function AiAssistant() {
  const { t, lang } = useT();
  const a = t.aiAssistant as {
    pageTitle: string;
    pageDescription: string;
    readOnlyBadge: string;
    placeholder: string;
    sendButton: string;
    thinking: string;
    newChat: string;
    providerRoutingLabel: string;
    defaultRoutingOption: string;
    quickPromptsLabel: string;
    quickPrompts: string[];
    emptyTitle: string;
    emptyDescription: string;
    noProviderError: string;
    configureProviderLink: string;
    genericError: string;
    proposalsTitle: string;
    proposalsDesc: string;
    actionTypeLabel: string;
    actionTypes: Record<AiActionType, string>;
    proposalPromptPlaceholder: string;
    generateDraftButton: string;
    generatingDraftButton: string;
    confirmExecuteButton: string;
    rejectButton: string;
    executedBadge: string;
    draftBadge: string;
    rejectedBadge: string;
    openCreatedRecord: string;
    invalidJsonError: string;
    missingFieldsWarning: string;
    toggleJsonEditor: string;
    structuredFormLabel: string;
    fieldLabels: Record<string, string>;
  };

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [noProvider, setNoProvider] = useState(false);

  // Platform admin runtime switcher
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [platformProviders, setPlatformProviders] = useState<AiProviderDto[]>([]);
  const [platformModels, setPlatformModels] = useState<AiModelDto[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');

  // Proposals state
  const [actionType, setActionType] = useState<AiActionType>('create_inquiry');
  const [proposalPrompt, setProposalPrompt] = useState('');
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposals, setProposals] = useState<AiActionProposalDto[]>([]);
  const [editedPayloadById, setEditedPayloadById] = useState<Record<string, Record<string, any>>>({});
  const [editedJsonById, setEditedJsonById] = useState<Record<string, string>>({});
  const [rawJsonModeById, setRawJsonModeById] = useState<Record<string, boolean>>({});
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [aiEntitled, setAiEntitled] = useState<boolean | null>(null);

  const loadProposals = async () => {
    try {
      const list = await listAiProposals();
      setProposals(list);
      const nextPayload: Record<string, Record<string, any>> = {};
      const nextJson: Record<string, string> = {};
      for (const p of list) {
        const obj = p.edited_payload || p.proposed_payload || {};
        nextPayload[p.id] = obj;
        nextJson[p.id] = JSON.stringify(obj, null, 2);
      }
      setEditedPayloadById(nextPayload);
      setEditedJsonById(nextJson);
    } catch {
      // Non-blocking initial load
    }
  };

  useEffect(() => {
    getOrgAiEntitlement()
      .then((res) => {
        const enabled = Boolean(res?.entitlement?.is_enabled && !res?.entitlement?.emergency_disabled);
        setAiEntitled(enabled);
        if (enabled) void loadProposals();
      })
      .catch(() => setAiEntitled(false));

    get<{ user?: { isPlatformAdmin?: boolean } }>('/admin/me')
      .then(async (meRes) => {
        if (meRes.data?.user?.isPlatformAdmin) {
          setIsPlatformAdmin(true);
          const [pList, mList] = await Promise.all([
            listPlatformAiProviders().catch(() => []),
            listPlatformAiModels().catch(() => []),
          ]);
          setPlatformProviders(pList);
          setPlatformModels(mList);
        }
      })
      .catch(() => {
        // Ordinary org user
      });
  }, []);

  const availableModelsForSelectedProvider = useMemo(() => {
    if (!selectedProviderId) return [];
    return platformModels.filter(
      (m) => m.provider_id === selectedProviderId && m.is_enabled && m.category !== 'embedding' && m.category !== 'audio_asr' && m.category !== 'audio_tts',
    );
  }, [platformModels, selectedProviderId]);

  const handleProviderSelect = (nextId: string) => {
    setSelectedProviderId(nextId);
    const chosen = platformProviders.find((p) => p.id === nextId);
    setSelectedModelId(chosen ? chosen.defaultModel : '');
  };

  const updateProposalField = (id: string, key: string, rawVal: string, numeric = false) => {
    setEditedPayloadById((prev) => {
      const current = { ...(prev[id] || {}) };
      if (rawVal === '') {
        current[key] = null;
      } else if (numeric) {
        const num = Number(rawVal);
        current[key] = Number.isNaN(num) ? rawVal : num;
      } else {
        current[key] = rawVal;
      }
      setEditedJsonById((jPrev) => ({ ...jPrev, [id]: JSON.stringify(current, null, 2) }));
      return { ...prev, [id]: current };
    });
  };

  const handleGenerateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalPrompt.trim() || proposalBusy) return;
    setProposalBusy(true);
    setProposalError(null);
    try {
      await createAiProposal(
        actionType,
        proposalPrompt.trim(),
        lang === 'en' ? 'en' : 'bs',
        selectedProviderId ? { providerId: selectedProviderId, modelId: selectedModelId || undefined } : undefined,
      );
      setProposalPrompt('');
      await loadProposals();
    } catch (err: any) {
      setProposalError(getErrMsg(err, a.genericError));
    } finally {
      setProposalBusy(false);
    }
  };

  const handleConfirmProposal = async (p: AiActionProposalDto) => {
    setProposalError(null);
    let parsedPayload: Record<string, any> | undefined;
    if (rawJsonModeById[p.id]) {
      try {
        const raw = editedJsonById[p.id];
        if (raw) parsedPayload = JSON.parse(raw);
      } catch {
        setProposalError(a.invalidJsonError);
        return;
      }
    } else {
      parsedPayload = editedPayloadById[p.id] || p.proposed_payload || {};
    }

    setProposalBusy(true);
    try {
      await confirmAiProposal(p.id, `confirm-${p.id}`, parsedPayload);
      await loadProposals();
    } catch (err: any) {
      setProposalError(getErrMsg(err, a.genericError));
    } finally {
      setProposalBusy(false);
    }
  };

  const handleRejectProposal = async (p: AiActionProposalDto) => {
    setProposalBusy(true);
    setProposalError(null);
    try {
      await rejectAiProposal(p.id);
      await loadProposals();
    } catch (err: any) {
      setProposalError(getErrMsg(err, a.genericError));
    } finally {
      setProposalBusy(false);
    }
  };

  const submitQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || loading) return;

    const historyPayload = messages
      .filter((m): m is MessageItem & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.text }));

    setNoProvider(false);
    setQuestion('');
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: trimmed }]);
    setLoading(true);

    try {
      const res: AiAssistantResponse = await askTravlineAssistant(
        trimmed,
        lang === 'en' ? 'en' : 'bs',
        {
          ...(selectedProviderId ? { providerId: selectedProviderId, modelId: selectedModelId || undefined } : {}),
          ...(historyPayload.length ? { history: historyPayload } : {}),
          pageContext: { route: '/ai-assistant' },
        },
      );
      const shownModel = res.routedModel && res.routedModel !== res.model ? `${res.model} -> ${res.routedModel}` : res.model;
      const timing = res.latencyMs ? ` · ${res.latencyMs}ms` : '';
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.answer,
          meta: `${res.provider} · ${shownModel} · ${res.usage.totalTokens} tokens${timing}`,
        },
      ]);
    } catch (err: any) {
      const code = getErrCode(err);
      if (code === 'NO_ACTIVE_AI_PROVIDER') {
        setNoProvider(true);
        setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: 'error', text: a.noProviderError }]);
      } else {
        setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: 'error', text: getErrMsg(err, a.genericError) }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitQuestion(question);
  };

  return (
    <div className="space-y-6">
      <PageMeta title={`${a.pageTitle} | Travline`} description={a.pageDescription} />

      {aiEntitled === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {a.noProviderError}
        </div>
      )}

      <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{a.pageTitle}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{a.pageDescription}</p>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setMessages([])}>
                {a.newChat}
              </Button>
            )}
            <Badge color="info">{a.readOnlyBadge}</Badge>
          </div>
        </div>

        {isPlatformAdmin && platformProviders.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900">
            <span className="font-semibold text-gray-600 dark:text-gray-300">{a.providerRoutingLabel}:</span>
            <select
              value={selectedProviderId}
              onChange={(e) => handleProviderSelect(e.target.value)}
              aria-label="Select AI provider"
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              <option value="">{a.defaultRoutingOption}</option>
              {platformProviders.filter((p) => p.isActive).map((p) => (
                <option key={p.id} value={p.id}>{p.displayName} ({p.defaultModel})</option>
              ))}
            </select>
            {selectedProviderId && (
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                aria-label="Select AI model"
                className="rounded border border-gray-300 bg-white px-2 py-1 font-mono text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {platformProviders.find((p) => p.id === selectedProviderId)?.defaultModel && (
                  <option value={platformProviders.find((p) => p.id === selectedProviderId)!.defaultModel}>
                    {platformProviders.find((p) => p.id === selectedProviderId)!.defaultModel} (default)
                  </option>
                )}
                {availableModelsForSelectedProvider.map((m) => (
                  <option key={m.id} value={m.model_id}>{m.model_id}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </header>

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            {a.quickPromptsLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {a.quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => void submitQuestion(prompt)}
                disabled={loading}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[260px] max-h-[460px] overflow-y-auto space-y-3 rounded-lg border border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
          {messages.length === 0 ? (
            <div className="py-12 text-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{a.emptyTitle}</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{a.emptyDescription}</p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg p-3.5 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto max-w-[85%] bg-brand-600 text-white'
                    : m.role === 'error'
                    ? 'border border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300'
                    : 'mr-auto max-w-[90%] border border-gray-200 bg-white text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.meta && <p className="mt-2 text-[11px] text-gray-400">{m.meta}</p>}
              </div>
            ))
          )}
          {loading && <p className="text-xs text-gray-500">{a.thinking}</p>}
        </div>

        {noProvider && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <span>{a.noProviderError}</span>
            <Link to="/settings/ai" className="font-semibold underline">
              {a.configureProviderLink} →
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={a.placeholder}
              aria-label={a.placeholder}
            />
          </div>
          <Button type="submit" disabled={loading || !question.trim()}>
            {loading ? a.thinking : a.sendButton}
          </Button>
        </form>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{a.proposalsTitle}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{a.proposalsDesc}</p>
        </div>

        <form onSubmit={handleGenerateDraft} className="flex flex-col gap-2 sm:flex-row">
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as AiActionType)}
            aria-label={a.actionTypeLabel}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="create_inquiry">{a.actionTypes.create_inquiry}</option>
            <option value="create_quotation_draft">{a.actionTypes.create_quotation_draft}</option>
            <option value="create_customer_draft">{a.actionTypes.create_customer_draft}</option>
            <option value="create_package_draft">{a.actionTypes.create_package_draft}</option>
            <option value="create_departure_draft">{a.actionTypes.create_departure_draft}</option>
          </select>
          <div className="flex-1">
            <Input
              value={proposalPrompt}
              onChange={(e) => setProposalPrompt(e.target.value)}
              placeholder={a.proposalPromptPlaceholder}
            />
          </div>
          <Button type="submit" disabled={proposalBusy || !proposalPrompt.trim()}>
            {proposalBusy ? a.generatingDraftButton : a.generateDraftButton}
          </Button>
        </form>

        {proposalError && (
          <div className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300">
            {proposalError}
          </div>
        )}

        <div className="space-y-3">
          {proposals.slice(0, 8).map((p) => {
            const payloadObj = editedPayloadById[p.id] || p.edited_payload || p.proposed_payload || {};
            const missingSet = new Set(p.missing_fields || p.missingFields || []);
            const showRaw = Boolean(rawJsonModeById[p.id]) || p.action_type === 'create_quotation_draft';
            const scalarEntries = Object.entries(payloadObj).filter(([, v]) => !Array.isArray(v) && typeof v !== 'object');

            return (
              <div key={p.id} className="rounded-lg border border-gray-200 p-4 space-y-3 dark:border-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {a.actionTypes[p.action_type]}
                    </span>
                    <Badge size="sm" color={p.status === 'executed' ? 'success' : p.status === 'rejected' ? 'error' : 'warning'}>
                      {p.status === 'executed' ? a.executedBadge : p.status === 'rejected' ? a.rejectedBadge : a.draftBadge}
                    </Badge>
                    {p.status === 'draft' && missingSet.size > 0 && (
                      <Badge size="sm" color="warning">
                        {a.missingFieldsWarning}: {Array.from(missingSet).join(', ')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {p.status === 'draft' && p.action_type !== 'create_quotation_draft' && (
                      <button
                        type="button"
                        onClick={() => setRawJsonModeById((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                        className="text-xs text-gray-500 hover:underline dark:text-gray-400"
                      >
                        {rawJsonModeById[p.id] ? a.structuredFormLabel : a.toggleJsonEditor}
                      </button>
                    )}
                    {p.execution_result?.route && (
                      <Link to={p.execution_result.route} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                        {a.openCreatedRecord} →
                      </Link>
                    )}
                  </div>
                </div>

                {showRaw ? (
                  <textarea
                    rows={5}
                    disabled={p.status !== 'draft'}
                    value={editedJsonById[p.id] ?? JSON.stringify(payloadObj, null, 2)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditedJsonById((prev) => ({ ...prev, [p.id]: val }));
                      try {
                        const parsed = JSON.parse(val);
                        setEditedPayloadById((prev) => ({ ...prev, [p.id]: parsed }));
                      } catch {
                        // Ignore intermediate invalid JSON while typing
                      }
                    }}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2.5 font-mono text-xs text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {scalarEntries.map(([fieldKey, fieldVal]) => {
                      const isNumeric = ['durationDays', 'basePrice', 'maxParticipants', 'travelers', 'capacity'].includes(fieldKey);
                      const isMissing = missingSet.has(fieldKey) && (fieldVal === null || fieldVal === undefined || fieldVal === '');
                      return (
                        <div key={fieldKey}>
                          <label className="mb-1 block text-[11px] font-medium text-gray-600 dark:text-gray-400">
                            {a.fieldLabels?.[fieldKey] || fieldKey}
                            {isMissing && <span className="ml-1 text-amber-600">*</span>}
                          </label>
                          <input
                            type={isNumeric ? 'number' : 'text'}
                            disabled={p.status !== 'draft'}
                            value={fieldVal === null || fieldVal === undefined ? '' : String(fieldVal)}
                            onChange={(e) => updateProposalField(p.id, fieldKey, e.target.value, isNumeric)}
                            className={`w-full rounded-lg border px-2.5 py-1.5 text-xs dark:bg-gray-950 dark:text-gray-100 ${
                              isMissing
                                ? 'border-amber-400 bg-amber-50/40 dark:border-amber-500/50'
                                : 'border-gray-200 bg-gray-50 dark:border-gray-800'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {p.status === 'draft' && (
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" color="error" disabled={proposalBusy} onClick={() => void handleRejectProposal(p)}>
                      {a.rejectButton}
                    </Button>
                    <Button size="sm" disabled={proposalBusy} onClick={() => void handleConfirmProposal(p)}>
                      {a.confirmExecuteButton}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
