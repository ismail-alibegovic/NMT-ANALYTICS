import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import Label from '../form/Label';
import Select from '../form/Select';
import EmptyState from '../ui/EmptyState';
import { useT } from '../../lib/i18n/context';
import { useToast } from '../../context/ToastContext';
import {
  createCampaign,
  previewCampaignAudience,
  updateCampaign,
  type Campaign,
  type CampaignAudiencePayload,
  type CampaignChannel,
  type CampaignPreview,
} from '../../api/campaigns';
import { getMessageTemplates, type MessageTemplate } from '../../api/messageTemplates';
import { getDepartures, type Departure } from '../../api/departures';
import { getReservations, type Reservation } from '../../api/reservations';
import { hasUnsupportedPlaceholder, SMS_MAX_LENGTH } from '../../lib/templateVariables';

interface CampaignEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  campaign: Campaign | null;
}

type AudienceType = CampaignAudiencePayload['audienceType'];

type Option = {
  value: string;
  label: string;
};

function normalizeAudience(audienceType: AudienceType, rawValue: string): CampaignAudiencePayload | null {
  if (audienceType === 'all') return { audienceType: 'all' };
  if (!rawValue) return null;
  if (audienceType === 'departure') return { audienceType, departureId: rawValue };
  if (audienceType === 'reservations') return { audienceType, reservationIds: [rawValue] };
  return { audienceType, customerIds: [rawValue] };
}

export default function CampaignEditorModal({
  isOpen,
  onClose,
  onSaved,
  campaign,
}: CampaignEditorModalProps) {
  const { t: _t, lang } = useT();
  const s: any = _t.communication.campaigns;
  const templatesText: any = _t.communication.templates;
  const { success, error: showError } = useToast();
  const locale = lang === 'bs' ? 'bs-BA' : 'en-US';

  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CampaignChannel>('email');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audienceType, setAudienceType] = useState<AudienceType>('all');
  const [audienceValue, setAudienceValue] = useState('');
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    setName(campaign?.name ?? '');
    setChannel(campaign?.channel ?? 'email');
    setTemplateId(campaign?.template_id ?? '');
    setSubject(campaign?.subject ?? '');
    setBody(campaign?.body ?? '');
    setAudienceType(campaign?.audience?.audienceType ?? 'all');
    if (campaign?.audience?.audienceType === 'departure') {
      setAudienceValue(campaign.audience.departureId);
    } else if (campaign?.audience?.audienceType === 'reservations') {
      setAudienceValue(campaign.audience.reservationIds[0] ?? '');
    } else if (campaign?.audience?.audienceType === 'customers') {
      setAudienceValue(campaign.audience.customerIds[0] ?? '');
    } else {
      setAudienceValue('');
    }
    setPreview(null);
    setErrors({});
  }, [campaign, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [channel, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    (async () => {
      try {
        const [departureData, reservationData] = await Promise.all([
          getDepartures({ limit: 200 }),
          getReservations({ limit: 200 }),
        ]);
        if (!mounted) return;
        setDepartures(departureData.data || []);
        setReservations(reservationData.data || []);
      } catch {
        if (!mounted) return;
        setDepartures([]);
        setReservations([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (channel === 'sms') {
      setSubject('');
    }
  }, [channel]);

  const audience = useMemo(
    () => normalizeAudience(audienceType, audienceValue),
    [audienceType, audienceValue],
  );

  const templateOptions: Option[] = useMemo(
    () => [
      { value: '', label: s.templateNone },
      ...templates.map((template) => ({ value: template.id, label: template.name })),
    ],
    [s.templateNone, templates],
  );

  const departureOptions: Option[] = useMemo(
    () =>
      departures.map((departure) => ({
        value: departure.id,
        label: `${departure.packageName || departure.destination || departure.packages?.name || s.untitledDeparture}${departure.depart_at ? ` · ${new Date(departure.depart_at).toLocaleDateString(locale)}` : ''}`,
      })),
    [departures, locale, s.untitledDeparture],
  );

  const reservationOptions: Option[] = useMemo(
    () =>
      reservations.map((reservation) => ({
        value: reservation.id,
        label: `${reservation.customerName || reservation.id.slice(0, 8)}${reservation.packageName || reservation.departureName ? ` · ${reservation.packageName || reservation.departureName}` : ''}`,
      })),
    [reservations],
  );

  const customerOptions: Option[] = reservationOptions;

  const audienceOptions: Option[] =
    audienceType === 'departure'
      ? departureOptions
      : audienceType === 'reservations'
        ? reservationOptions
        : customerOptions;

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    if (template.channel === 'email') {
      setSubject(template.subject || '');
    } else {
      setSubject('');
    }
    setBody(template.body || '');
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = s.form.nameRequired;
    if (!body.trim()) next.body = s.form.bodyRequired;
    if (channel === 'email' && !subject.trim()) next.subject = s.form.subjectRequired;
    if (channel === 'sms' && body.length > SMS_MAX_LENGTH) next.body = s.form.bodyTooLong;
    if (hasUnsupportedPlaceholder(body) || (channel === 'email' && hasUnsupportedPlaceholder(subject))) {
      next.body = s.form.unsupportedPlaceholder;
    }
    if (!audience) next.audience = s.form.audienceRequired;
    if (!preview || preview.sendableRecipients < 1) next.preview = s.form.previewRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handlePreview = async () => {
    if (!audience) {
      setErrors((current) => ({ ...current, audience: s.form.audienceRequired }));
      return;
    }

    setPreviewing(true);
    setErrors((current) => {
      const next = { ...current };
      delete next.preview;
      return next;
    });

    try {
      const data = await previewCampaignAudience({
        channel,
        audience,
        template_id: templateId || null,
      });
      setPreview(data);
    } catch (err) {
      setPreview(null);
      showError((err as { message?: string }).message || s.previewError);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !audience || !preview) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        channel,
        template_id: templateId || null,
        subject: channel === 'email' ? subject.trim() : null,
        body: body.trim(),
        audience,
        recipient_count: preview.sendableRecipients,
      };

      if (campaign) {
        await updateCampaign(campaign.id, payload);
      } else {
        await createCampaign(payload);
      }

      success(campaign ? s.updated : s.created);
      onSaved();
    } catch (err) {
      showError((err as { message?: string }).message || s.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl" showCloseButton>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <h3 className="text-lg font-semibold text-gray-950 dark:text-white">
          {campaign ? s.form.editTitle : s.form.createTitle}
        </h3>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div>
              <Label htmlFor="campaign-name">{s.form.name}</Label>
              <input
                id="campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={s.form.namePlaceholder}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:text-white/90"
              />
              {errors.name ? <p className="mt-1 text-xs text-error-500">{errors.name}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="campaign-channel">{s.form.channel}</Label>
                <Select
                  id="campaign-channel"
                  value={channel}
                  onChange={(value) => setChannel(value as CampaignChannel)}
                  options={[
                    { value: 'email', label: templatesText.channelEmail },
                    { value: 'sms', label: templatesText.channelSms },
                  ]}
                />
              </div>
              <div>
                <Label htmlFor="campaign-template">{s.form.template}</Label>
                <Select
                  id="campaign-template"
                  value={templateId}
                  onChange={applyTemplate}
                  options={templateOptions}
                />
              </div>
            </div>

            {channel === 'email' ? (
              <div>
                <Label htmlFor="campaign-subject">{s.form.subject}</Label>
                <input
                  id="campaign-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={s.form.subjectPlaceholder}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:text-white/90"
                />
                {errors.subject ? <p className="mt-1 text-xs text-error-500">{errors.subject}</p> : null}
              </div>
            ) : null}

            <div>
              <Label htmlFor="campaign-body">{s.form.body}</Label>
              <textarea
                id="campaign-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={7}
                placeholder={s.form.bodyPlaceholder}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:text-white/90"
              />
              {channel === 'sms' ? (
                <p className="mt-1 text-xs text-gray-400">{body.length} / {SMS_MAX_LENGTH}</p>
              ) : null}
              {errors.body ? <p className="mt-1 text-xs text-error-500">{errors.body}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="campaign-audience-type">{s.form.audienceType}</Label>
                <Select
                  id="campaign-audience-type"
                  value={audienceType}
                  onChange={(value) => {
                    setAudienceType(value as AudienceType);
                    setAudienceValue('');
                    setPreview(null);
                  }}
                  options={[
                    { value: 'all', label: s.audiences.all },
                    { value: 'departure', label: s.audiences.departure },
                    { value: 'reservations', label: s.audiences.reservations },
                    { value: 'customers', label: s.audiences.customers },
                  ]}
                />
              </div>
              {audienceType !== 'all' ? (
                <div>
                  <Label htmlFor="campaign-audience-value">{s.form.audienceValue}</Label>
                  <Select
                    id="campaign-audience-value"
                    value={audienceValue}
                    onChange={(value) => {
                      setAudienceValue(value);
                      setPreview(null);
                    }}
                    options={audienceOptions}
                  />
                </div>
              ) : null}
            </div>
            {errors.audience ? <p className="text-xs text-error-500">{errors.audience}</p> : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-950 dark:text-white">{s.preview.title}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{s.preview.description}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
                  {previewing ? s.preview.loading : s.preview.action}
                </Button>
              </div>

              {preview ? (
                <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <div className="flex items-center justify-between">
                    <span>{s.preview.recipientCount}</span>
                    <strong>{preview.sendableRecipients}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{s.preview.totalCandidates}</span>
                    <strong>{preview.totalCandidates}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{s.preview.invalidRecipients}</span>
                    <strong>{preview.skippedInvalid + preview.skippedEmpty}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{s.preview.duplicates}</span>
                    <strong>{preview.skippedDuplicates}</strong>
                  </div>
                  {preview.sampleRecipients.length > 0 ? (
                    <div className="pt-2">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {s.preview.sampleRecipients}
                      </p>
                      <div className="space-y-1">
                        {preview.sampleRecipients.map((recipient) => (
                          <p key={recipient} className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {recipient}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState title={s.preview.emptyTitle} description={s.preview.emptyDesc} className="py-6" />
                </div>
              )}
              {errors.preview ? <p className="mt-3 text-xs text-error-500">{errors.preview}</p> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            {s.cancel}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? s.form.saving : campaign ? s.form.save : s.form.create}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
