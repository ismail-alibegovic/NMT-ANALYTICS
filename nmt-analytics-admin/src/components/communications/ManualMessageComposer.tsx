import { useEffect, useMemo, useState } from 'react';
import Button from '../ui/button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import Select from '../form/Select';
import { getMessageTemplates, type MessageTemplate } from '../../api/messageTemplates';

type ManualMessagePayload =
  | {
      channel: 'email';
      recipient: string;
      subject: string;
      body: string;
    }
  | {
      channel: 'sms';
      recipient: string;
      body: string;
    };

interface ManualMessageComposerProps {
  initialEmail?: string | null;
  initialPhone?: string | null;
  onSend: (payload: ManualMessagePayload) => Promise<void>;
  onSent?: () => void;
}

export default function ManualMessageComposer({
  initialEmail,
  initialPhone,
  onSend,
  onSent,
}: ManualMessageComposerProps) {
  const [channel, setChannel] = useState<'email' | 'sms'>(initialEmail ? 'email' : 'sms');
  const [recipient, setRecipient] = useState(initialEmail || initialPhone || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const recipientDefaults = useMemo(
    () => ({
      email: initialEmail || '',
      sms: initialPhone || '',
    }),
    [initialEmail, initialPhone],
  );

  useEffect(() => {
    setRecipient(recipientDefaults[channel]);
    setSelectedTemplateId('');
  }, [channel, recipientDefaults]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getMessageTemplates({ channel, activeOnly: true });
        if (mounted) setTemplates(data);
      } catch {
        if (mounted) setTemplates([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [channel]);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    if (channel === 'email') setSubject(template.subject || '');
    setBody(template.body || '');
  };

  const submit = async () => {
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      if (channel === 'email') {
        await onSend({ channel, recipient, subject, body });
      } else {
        await onSend({ channel, recipient, body });
      }
      setSuccess(channel === 'email' ? 'Email sent.' : 'SMS sent.');
      setBody('');
      if (channel === 'email') setSubject('');
      onSent?.();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
        <h3 className="font-semibold text-gray-950 dark:text-white">Pošalji poruku</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Jedna ručna email ili SMS poruka za trenutni kontekst.</p>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Kanal</Label>
            <Select
              options={[
                { value: 'email', label: 'Email' },
                { value: 'sms', label: 'SMS' },
              ]}
              value={channel}
              onChange={(value: string) => setChannel((value as 'email' | 'sms') || 'email')}
            />
          </div>
          <div>
            <Label>Primaoc</Label>
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Template</Label>
          <Select
            options={[
              { value: '', label: 'No template' },
              ...templates.map((template) => ({ value: template.id, label: template.name })),
            ]}
            value={selectedTemplateId}
            onChange={applyTemplate}
          />
        </div>

        {channel === 'email' && (
          <div>
            <Label>Naslov</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        )}

        <div>
          <Label>Poruka</Label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
          />
        </div>

        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        {success ? <p className="text-sm text-success-600 dark:text-success-400">{success}</p> : null}

        <div className="flex justify-end">
          <Button size="sm" onClick={() => void submit()} disabled={sending}>
            {sending ? 'Slanje...' : 'Pošalji'}
          </Button>
        </div>
      </div>
    </section>
  );
}
