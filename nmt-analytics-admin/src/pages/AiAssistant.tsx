import { useState } from 'react';
import { Link } from 'react-router';
import PageMeta from '../components/common/PageMeta';
import Badge from '../components/ui/badge/Badge';
import Button from '../components/ui/button/Button';
import Input from '../components/form/input/InputField';
import { useT } from '../lib/i18n/context';
import { askTravlineAssistant, type AiAssistantResponse } from '../api/aiAssistant';

interface MessageItem {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  meta?: string;
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
    quickPromptsLabel: string;
    quickPrompts: string[];
    emptyTitle: string;
    emptyDescription: string;
    noProviderError: string;
    configureProviderLink: string;
    genericError: string;
  };

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [noProvider, setNoProvider] = useState(false);

  const submitQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || loading) return;

    setNoProvider(false);
    setQuestion('');
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: trimmed }]);
    setLoading(true);

    try {
      const res: AiAssistantResponse = await askTravlineAssistant(trimmed, lang === 'en' ? 'en' : 'bs');
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.answer,
          meta: `${res.provider} · ${res.model} · ${res.usage.totalTokens} tokens`,
        },
      ]);
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'NO_ACTIVE_AI_PROVIDER') {
        setNoProvider(true);
        setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: 'error', text: a.noProviderError }]);
      } else {
        setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: 'error', text: a.genericError }]);
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

      <header className="border-b border-gray-200 pb-4 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{a.pageTitle}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{a.pageDescription}</p>
          </div>
          <Badge color="info">{a.readOnlyBadge}</Badge>
        </div>
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
    </div>
  );
}
