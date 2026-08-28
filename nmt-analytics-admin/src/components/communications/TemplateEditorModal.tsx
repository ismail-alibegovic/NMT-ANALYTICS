import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import Label from '../form/Label';
import Select from '../form/Select';
import { useT } from '../../lib/i18n/context';
import { useToast } from '../../context/ToastContext';
import {
  createMessageTemplate,
  updateMessageTemplate,
  type MessageTemplate,
  type MessageTemplateChannel,
} from '../../api/messageTemplates';
import {
  TEMPLATE_VARIABLES,
  SMS_MAX_LENGTH,
  SAMPLE_VALUES,
  renderTemplate,
  hasUnsupportedPlaceholder,
} from '../../lib/templateVariables';

interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  template: MessageTemplate | null;
}

function insertAtCursor(
  target: HTMLInputElement | HTMLTextAreaElement,
  insertText: string,
  currentValue: string,
  setValue: (v: string) => void,
) {
  const start = target.selectionStart ?? currentValue.length;
  const end = target.selectionEnd ?? currentValue.length;
  const next = currentValue.slice(0, start) + insertText + currentValue.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    target.focus();
    const pos = start + insertText.length;
    target.setSelectionRange(pos, pos);
  });
}

export default function TemplateEditorModal({
  isOpen,
  onClose,
  onSaved,
  template,
}: TemplateEditorModalProps) {
  const { t: _t } = useT();
  const s: any = _t.communication.templates;
  const { success, error } = useToast();

  const [name, setName] = useState('');
  const [channel, setChannel] = useState<MessageTemplateChannel>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const focusedField = useRef<'subject' | 'body'>('body');

  const isEditing = template !== null;

  useEffect(() => {
    if (isOpen) {
      setName(template?.name ?? '');
      setChannel(template?.channel ?? 'email');
      setSubject(template?.subject ?? '');
      setBody(template?.body ?? '');
      setErrors({});
      focusedField.current = 'body';
    }
  }, [isOpen, template]);

  const previewBody = useMemo(() => {
    try {
      return renderTemplate(body, SAMPLE_VALUES);
    } catch {
      return body;
    }
  }, [body]);

  const previewSubject = useMemo(() => {
    try {
      return renderTemplate(subject, SAMPLE_VALUES);
    } catch {
      return subject;
    }
  }, [subject]);

  const smsCharCount = previewBody.length;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = s.form.nameRequired;
    if (channel === 'email' && !subject.trim()) next.subject = s.form.subjectRequired;
    if (channel === 'sms' && subject.trim()) next.subject = s.form.subjectNotAllowed;
    if (!body.trim()) next.body = s.form.bodyRequired;
    if (channel === 'sms' && body.length > SMS_MAX_LENGTH) next.body = s.form.bodyTooLong;
    const bodyBad = hasUnsupportedPlaceholder(body);
    const subjectBad = channel === 'email' && hasUnsupportedPlaceholder(subject);
    if (bodyBad) next.body = s.form.unsupportedPlaceholder;
    else if (subjectBad) next.subject = s.form.unsupportedPlaceholder;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const insertVariable = (placeholder: string) => {
    if (focusedField.current === 'subject' && channel === 'email' && subjectRef.current) {
      insertAtCursor(subjectRef.current, placeholder, subject, setSubject);
      return;
    }
    if (bodyRef.current) {
      insertAtCursor(bodyRef.current, placeholder, body, setBody);
    } else {
      setBody(body + placeholder);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        channel,
        subject: channel === 'email' ? subject.trim() : null as unknown as undefined,
        body: body.trim(),
      };
      if (isEditing) {
        await updateMessageTemplate(template!.id, payload);
      } else {
        await createMessageTemplate(payload);
      }
      success(s.saved);
      onSaved();
    } catch (err) {
      error((err as { message?: string })?.message || s.saveError);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs bg-transparent text-gray-800 border-gray-300 focus:border-brand-400 focus:ring-brand-500/15 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-500 focus:outline-none focus:ring-2 placeholder:text-gray-400 dark:placeholder:text-white/30';
  const errorInputClass =
    'h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs bg-transparent border-error-500 focus:border-error-400 focus:ring-error-500/15 dark:text-error-400 dark:border-error-500 dark:focus:border-error-800 focus:outline-none focus:ring-2';

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl" showCloseButton>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <h3 className="text-lg font-semibold text-gray-950 dark:text-white">
          {isEditing ? s.editTitle : s.createTitle}
        </h3>

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <Label htmlFor="tpl-name">{s.form.name}</Label>
              <input
                id="tpl-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={s.form.namePlaceholder}
                className={errors.name ? errorInputClass : inputClass}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-error-500">{errors.name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="tpl-channel">{s.form.channel}</Label>
              <Select
                id="tpl-channel"
                value={channel}
                onChange={(v) => setChannel(v as MessageTemplateChannel)}
                options={[
                  { value: 'email', label: s.form.channelEmail },
                  { value: 'sms', label: s.form.channelSms },
                ]}
              />
            </div>

            {channel === 'email' && (
              <div>
                <Label htmlFor="tpl-subject">{s.form.subject}</Label>
                <input
                  id="tpl-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onFocus={() => { focusedField.current = 'subject'; }}
                  ref={subjectRef}
                  placeholder={s.form.subjectPlaceholder}
                  className={errors.subject ? errorInputClass : inputClass}
                />
                {errors.subject && (
                  <p className="mt-1 text-xs text-error-500">{errors.subject}</p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="tpl-body">{s.form.body}</Label>
              <textarea
                id="tpl-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => { focusedField.current = 'body'; }}
                ref={bodyRef}
                rows={6}
                placeholder={s.form.bodyPlaceholder}
                className={`w-full rounded-lg border px-4 py-2.5 text-sm shadow-theme-xs focus:outline-none focus:ring-2 ${
                  errors.body
                    ? 'border-error-500 focus:border-error-400 focus:ring-error-500/15 dark:border-error-500 dark:text-error-400 dark:focus:border-error-800'
                    : 'border-gray-300 bg-transparent text-gray-800 focus:border-brand-400 focus:ring-brand-500/15 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-500'
                }`}
              />
              {errors.body && (
                <p className="mt-1 text-xs text-error-500">{errors.body}</p>
              )}
              {channel === 'sms' && (
                <p className="mt-1 text-xs text-gray-400">
                  {body.length} / {SMS_MAX_LENGTH}
                </p>
              )}
            </div>
          </div>

          <div className="w-full space-y-4 lg:w-[320px] lg:shrink-0">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {s.form.variablesTitle}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.placeholder)}
                    title={s.variables[v.key]}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-mono text-gray-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:text-brand-400"
                  >
                    {v.placeholder}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {s.form.preview}
              </p>
              {channel === 'email' ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-gray-400">
                      {s.form.subject}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                      {previewSubject || <span className="italic text-gray-400">{s.form.previewEmpty}</span>}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-gray-400">
                      {s.form.body}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                      {previewBody || <span className="italic text-gray-400">{s.form.previewEmpty}</span>}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800">
                  <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                    {previewBody || <span className="italic text-gray-400">{s.form.previewEmpty}</span>}
                  </p>
                  <p className="mt-1.5 text-xs text-gray-400">
                    {smsCharCount} / {s.singlePart} {s.form.characters}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {s.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? s.saving : isEditing ? s.save : s.create}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
