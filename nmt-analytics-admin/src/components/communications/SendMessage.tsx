import { useEffect, useMemo, useState } from 'react';
import Button from '../ui/button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import Select from '../form/Select';
import { useT } from '../../lib/i18n/context';
import { getMessageTemplates, type MessageTemplate } from '../../api/messageTemplates';
import { getDepartures, getDeparturePassengers, getPassengerGroups, type Departure, type DeparturePassenger } from '../../api/departures';
import { getReservations, type Reservation } from '../../api/reservations';
import {
  previewRecipients,
  sendCommunication,
  type RecipientChannel,
  type RecipientTargetType,
  type RecipientResolution,
} from '../../api/communicationSend';

interface SendMessageProps {
  onSent?: () => void;
}

type Option = { value: string; label: string };

const TARGET_TYPES: RecipientTargetType[] = ['direct', 'reservation', 'passenger', 'group', 'departure'];
const BULK_TARGETS: RecipientTargetType[] = ['group', 'departure'];

// Server-side contract: SMS body max 320 chars, email body max 5000.
const SMS_MAX_LENGTH = 320;
const EMAIL_MAX_LENGTH = 5000;

export default function SendMessage({ onSent }: SendMessageProps) {
  const { t, lang } = useT();
  const s = t.communication.send;
  const dateLocale = lang === 'bs' ? 'bs-BA' : 'en-US';

  const [channel, setChannel] = useState<RecipientChannel>('email');
  const [targetType, setTargetType] = useState<RecipientTargetType>('direct');

  // Target selection state
  const [directValue, setDirectValue] = useState('');
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [passengers, setPassengers] = useState<{ id: string; label: string }[]>([]);
  const [groups, setGroups] = useState<Option[]>([]);
  const [selectedDepartureId, setSelectedDepartureId] = useState('');
  const [selectedReservationId, setSelectedReservationId] = useState('');
  const [selectedPassengerId, setSelectedPassengerId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(false);

  // Message state
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Preview + send state
  const [resolution, setResolution] = useState<RecipientResolution | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isBulk = BULK_TARGETS.includes(targetType);

  const localizedDate = (value?: string | null) => {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(dateLocale);
  };

  // Reset preview whenever the target definition changes.
  const resetPreview = () => {
    setResolution(null);
    setConfirmed(false);
    setSuccess(null);
    setError(null);
  };

  // Load departures once (needed for departure/passenger/group targets).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getDepartures({ limit: 200 });
        if (mounted) setDepartures(res.data || []);
      } catch {
        if (mounted) setDepartures([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Load reservations when reservation target is chosen.
  useEffect(() => {
    if (targetType !== 'reservation') return;
    let mounted = true;
    setOptionsLoading(true);
    (async () => {
      try {
        const res = await getReservations({ limit: 200 });
        if (mounted) setReservations(res.data || []);
      } catch {
        if (mounted) setReservations([]);
      } finally {
        if (mounted) setOptionsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [targetType]);

  // Load passengers when a departure is picked for the passenger target.
  useEffect(() => {
    if (targetType !== 'passenger' || !selectedDepartureId) {
      setPassengers([]);
      return;
    }
    let mounted = true;
    setOptionsLoading(true);
    (async () => {
      try {
        const manifest = await getDeparturePassengers(selectedDepartureId);
        const rows = (manifest.manifest || [])
          .filter((p: DeparturePassenger) => p.passengerId || p.id)
          .map((p: DeparturePassenger) => {
            const id = (p.passengerId || p.id) as string;
            const contact = channel === 'email' ? p.email : p.phone;
            const label = `${p.fullName}${contact ? ` · ${contact}` : ''}`;
            return { id, label };
          });
        if (mounted) setPassengers(rows);
      } catch {
        if (mounted) setPassengers([]);
      } finally {
        if (mounted) setOptionsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [targetType, selectedDepartureId, channel]);

  // Load groups when a departure is picked for the group target.
  useEffect(() => {
    if (targetType !== 'group' || !selectedDepartureId) {
      setGroups([]);
      return;
    }
    let mounted = true;
    setOptionsLoading(true);
    (async () => {
      try {
        const list = await getPassengerGroups(selectedDepartureId);
        const dep = departures.find((d) => d.id === selectedDepartureId);
        const depLabel = dep ? `${dep.packageName || dep.destination || ''}` : '';
        const rows = list.map((g) => ({
          value: g.id,
          label: `${g.name || 'Grupa'} · ${g.members?.length ?? 0}${depLabel ? ` · ${depLabel}` : ''}`,
        }));
        if (mounted) setGroups(rows);
      } catch {
        if (mounted) setGroups([]);
      } finally {
        if (mounted) setOptionsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [targetType, selectedDepartureId, departures]);

  // Load templates for the active channel.
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

  const departureOptions: Option[] = useMemo(
    () =>
      departures.map((d) => {
        const dest = d.packageName || d.destination || d.packages?.name || '';
        const date = localizedDate(d.depart_at);
        return { value: d.id, label: `${dest}${date ? ` · ${date}` : ''}` };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [departures, dateLocale],
  );

  const reservationOptions: Option[] = useMemo(
    () =>
      reservations.map((r) => {
        const who = r.customerName || r.id.slice(0, 8);
        const dest = r.packageName || r.departureName || '';
        return { value: r.id, label: `${who}${dest ? ` · ${dest}` : ''}` };
      }),
    [reservations],
  );

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    if (channel === 'email') setSubject(template.subject || '');
    setBody(template.body || '');
  };

  // Build the target payload sent to the resolver/send endpoints.
  const buildTargetPayload = () => {
    switch (targetType) {
      case 'direct':
        return channel === 'email'
          ? { email: directValue.trim() }
          : { phone: directValue.trim() };
      case 'reservation':
        return { targetId: selectedReservationId };
      case 'passenger':
        return { targetId: selectedPassengerId };
      case 'group':
        return { targetId: selectedGroupId };
      case 'departure':
        return { targetId: selectedDepartureId };
      default:
        return {};
    }
  };

  const targetReady = (): boolean => {
    switch (targetType) {
      case 'direct':
        return directValue.trim().length > 0;
      case 'reservation':
        return !!selectedReservationId;
      case 'passenger':
        return !!selectedPassengerId;
      case 'group':
        return !!selectedGroupId;
      case 'departure':
        return !!selectedDepartureId;
      default:
        return false;
    }
  };

  const runPreview = async () => {
    setPreviewing(true);
    setError(null);
    setSuccess(null);
    setResolution(null);
    setConfirmed(false);
    try {
      const res = await previewRecipients({ channel, targetType, ...buildTargetPayload() });
      setResolution(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || s.previewError);
    } finally {
      setPreviewing(false);
    }
  };

  const runSend = async () => {
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await sendCommunication({
        channel,
        targetType,
        ...buildTargetPayload(),
        subject: channel === 'email' ? subject : undefined,
        body,
        confirm: isBulk ? confirmed : undefined,
      });
      setSuccess(
        s.sentSummary.replace('{sent}', String(result.sent)).replace('{failed}', String(result.failed)),
      );
      setBody('');
      if (channel === 'email') setSubject('');
      setResolution(null);
      setConfirmed(false);
      onSent?.();
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.code === 'CONFIRMATION_REQUIRED') {
        setResolution(data.details?.resolution ?? resolution);
        setError(s.bulkConfirm);
      } else if (data?.code === 'NO_SENDABLE_RECIPIENTS') {
        setError(s.noSendable);
      } else if (data?.code === 'SUBJECT_REQUIRED') {
        setError(s.subjectRequired);
      } else {
        setError(data?.message || s.sendError);
      }
    } finally {
      setSending(false);
    }
  };

  const smsLen = body.length;
  const smsOverLimit = channel === 'sms' && smsLen > SMS_MAX_LENGTH;

  const canSend =
    !!resolution &&
    resolution.sendableRecipients > 0 &&
    body.trim().length > 0 &&
    !smsOverLimit &&
    (channel !== 'email' || subject.trim().length > 0) &&
    (!isBulk || confirmed);

  const cardClass =
    'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6';

  return (
    <div className="max-w-3xl space-y-5">
      {/* 1. Channel + 2. target type */}
      <div className={cardClass}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{s.channelLabel}</Label>
            <Select
              options={[
                { value: 'email', label: s.email },
                { value: 'sms', label: s.sms },
              ]}
              value={channel}
              onChange={(value: string) => {
                setChannel(value as RecipientChannel);
                setSelectedTemplateId('');
                resetPreview();
              }}
            />
          </div>
          <div>
            <Label>{s.targetType}</Label>
            <Select
              options={TARGET_TYPES.map((tt) => ({ value: tt, label: s.targetTypes[tt] }))}
              value={targetType}
              onChange={(value: string) => {
                setTargetType(value as RecipientTargetType);
                setSelectedReservationId('');
                setSelectedPassengerId('');
                setSelectedGroupId('');
                setDirectValue('');
                resetPreview();
              }}
            />
          </div>
        </div>

        {/* 3. target selector */}
        <div className="mt-4 space-y-4">
          {targetType === 'direct' && (
            <div>
              <Label>{channel === 'email' ? s.directEmail : s.directPhone}</Label>
              <Input
                type={channel === 'email' ? 'email' : 'tel'}
                value={directValue}
                onChange={(e) => {
                  setDirectValue(e.target.value);
                  resetPreview();
                }}
                placeholder={channel === 'email' ? 'ime@primjer.com' : '+38761...'}
              />
            </div>
          )}

          {targetType === 'reservation' && (
            <div>
              <Label>{s.selectReservation}</Label>
              <Select
                options={[
                  { value: '', label: optionsLoading ? s.loadingOptions : s.selectReservation },
                  ...reservationOptions,
                ]}
                value={selectedReservationId}
                onChange={(value: string) => {
                  setSelectedReservationId(value);
                  resetPreview();
                }}
              />
            </div>
          )}

          {(targetType === 'passenger' || targetType === 'group' || targetType === 'departure') && (
            <div>
              <Label>{s.selectDeparture}</Label>
              <Select
                options={[{ value: '', label: s.selectDeparture }, ...departureOptions]}
                value={selectedDepartureId}
                onChange={(value: string) => {
                  setSelectedDepartureId(value);
                  setSelectedPassengerId('');
                  setSelectedGroupId('');
                  resetPreview();
                }}
              />
            </div>
          )}

          {targetType === 'passenger' && selectedDepartureId && (
            <div>
              <Label>{s.selectPassenger}</Label>
              <Select
                options={[
                  { value: '', label: optionsLoading ? s.loadingOptions : s.selectPassenger },
                  ...passengers.map((p) => ({ value: p.id, label: p.label })),
                ]}
                value={selectedPassengerId}
                onChange={(value: string) => {
                  setSelectedPassengerId(value);
                  resetPreview();
                }}
              />
            </div>
          )}

          {targetType === 'group' && selectedDepartureId && (
            <div>
              <Label>{s.selectGroup}</Label>
              <Select
                options={[
                  { value: '', label: optionsLoading ? s.loadingOptions : s.selectGroup },
                  ...groups,
                ]}
                value={selectedGroupId}
                onChange={(value: string) => {
                  setSelectedGroupId(value);
                  resetPreview();
                }}
              />
            </div>
          )}
        </div>

        <div className="mt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={runPreview}
            disabled={!targetReady() || previewing}
          >
            {previewing ? s.previewing : s.previewBtn}
          </Button>
          {!targetReady() && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{s.chooseTarget}</p>
          )}
        </div>
      </div>

      {/* 4. preview */}
      {resolution && (
        <div className={cardClass}>
          <h3 className="font-semibold text-gray-950 dark:text-white">{s.previewTitle}</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={s.totalCandidates} value={resolution.totalCandidates} />
            <Stat label={s.validRecipients} value={resolution.sendableRecipients} tone="success" />
            <Stat label={s.missingContact} value={resolution.skippedEmpty} />
            <Stat label={s.invalidContact} value={resolution.skippedInvalid} />
            <Stat label={s.duplicatesRemoved} value={resolution.skippedDuplicates} />
          </div>

          {resolution.recipients.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {s.sampleRecipients}
              </p>
              <ul className="flex flex-wrap gap-2">
                {resolution.recipients.slice(0, 8).map((r) => (
                  <li
                    key={r.contact}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300"
                  >
                    {r.name ? `${r.name} · ` : ''}
                    {r.contact}
                  </li>
                ))}
                {resolution.recipients.length > 8 && (
                  <li className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400">
                    {s.moreRecipients.replace('{count}', String(resolution.recipients.length - 8))}
                  </li>
                )}
              </ul>
            </div>
          )}

          {isBulk && resolution.sendableRecipients > 0 && (
            <label className="mt-4 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 size-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <span>{s.confirmCheckbox}</span>
            </label>
          )}
        </div>
      )}

      {/* 5-8. compose + send */}
      {resolution && resolution.sendableRecipients > 0 && (
        <div className={cardClass}>
          <div className="space-y-4">
            <div>
              <Label>{s.templateLabel}</Label>
              <Select
                options={[
                  { value: '', label: t.communication.composer.noTemplate },
                  ...templates.map((tpl) => ({ value: tpl.id, label: tpl.name })),
                ]}
                value={selectedTemplateId}
                onChange={applyTemplate}
              />
            </div>

            {channel === 'email' && (
              <div>
                <Label>{t.communication.composer.subject}</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            )}

            <div>
              <Label>{t.communication.composer.message}</Label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                maxLength={channel === 'sms' ? SMS_MAX_LENGTH : EMAIL_MAX_LENGTH}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 shadow-theme-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:text-white"
              />
              {channel === 'sms' && (
                <div className="mt-1 flex items-center justify-between">
                  <span
                    className={`text-xs ${
                      smsOverLimit
                        ? 'text-error-600 dark:text-error-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {s.smsCounter.replace('{count}', String(body.length)).replace('{max}', String(SMS_MAX_LENGTH))}
                  </span>
                  {smsOverLimit && (
                    <span className="text-xs text-error-600 dark:text-error-400">{s.smsTooLong}</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button size="sm" onClick={runSend} disabled={!canSend || sending}>
                {sending ? s.sending : s.sendBtn}
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-error-600 dark:text-error-400">{error}</p>}
      {success && <p className="text-sm text-success-600 dark:text-success-500">{success}</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p
        className={`text-lg font-semibold ${
          tone === 'success'
            ? 'text-success-600 dark:text-success-500'
            : 'text-gray-900 dark:text-white'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
