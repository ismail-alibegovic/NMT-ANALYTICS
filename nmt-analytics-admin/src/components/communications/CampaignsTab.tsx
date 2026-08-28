import { useCallback, useEffect, useMemo, useState } from 'react';
import Badge from '../ui/badge/Badge';
import Button from '../ui/button/Button';
import EmptyState from '../ui/EmptyState';
import { Modal } from '../ui/modal';
import { Skeleton } from '../ui/Skeleton';
import { useT } from '../../lib/i18n/context';
import { useToast } from '../../context/ToastContext';
import {
  cancelSchedule,
  deleteCampaign,
  getCampaigns,
  launchCampaign,
  scheduleCampaign,
  rescheduleCampaign,
  type Campaign,
  type CampaignChannel,
} from '../../api/campaigns';
import { CalenderIcon, ListIcon, PaperPlaneIcon, PencilIcon, PlusIcon, TrashBinIcon } from '../../icons';
import CampaignEditorModal from './CampaignEditorModal';

type ChannelFilter = 'all' | CampaignChannel;

export default function CampaignsTab() {
  const { t: _t, lang } = useT();
  const s: any = _t.communication.campaigns;
  const { success, error: showError } = useToast();
  const locale = lang === 'bs' ? 'bs-BA' : 'en-US';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Campaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [launchTarget, setLaunchTarget] = useState<Campaign | null>(null);
  const [launchPreview, setLaunchPreview] = useState<{ sendableRecipients: number; skippedCount: number } | null>(null);
  const [launchResult, setLaunchResult] = useState<{
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    status: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<Campaign | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [cancelScheduleTarget, setCancelScheduleTarget] = useState<Campaign | null>(null);
  const [cancellingSchedule, setCancellingSchedule] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getCampaigns();
      setCampaigns(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      if (channelFilter !== 'all' && campaign.channel !== channelFilter) return false;
      if (!query) return true;
      return (
        campaign.name.toLowerCase().includes(query) ||
        (campaign.subject || '').toLowerCase().includes(query) ||
        campaign.body.toLowerCase().includes(query)
      );
    });
  }, [campaigns, channelFilter, search]);

  const openLaunchConfirm = (campaign: Campaign) => {
    setLaunchTarget(campaign);
    setLaunchResult(null);
    setLaunchPreview({
      sendableRecipients: campaign.recipient_count || 0,
      skippedCount: 0,
    });
  };

  const closeLaunchModal = () => {
    if (launching) return;
    setLaunchTarget(null);
    setLaunchPreview(null);
    setLaunchResult(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCampaign(deleteTarget.id);
      success(s.deleted);
      setDeleteTarget(null);
      await fetchCampaigns();
    } catch (err) {
      showError((err as { message?: string }).message || s.deleteError);
    } finally {
      setDeleting(false);
    }
  };

  const handleLaunch = async () => {
    if (!launchTarget) return;
    setLaunching(true);
    try {
      const result = await launchCampaign(launchTarget.id);
      setLaunchPreview({
        sendableRecipients: result.totalRecipients,
        skippedCount: result.skippedCount,
      });
      setLaunchResult({
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        status: result.status,
      });
      success(s.launchSuccess);
      await fetchCampaigns();
    } catch (err) {
      showError((err as { message?: string }).message || s.launchError);
    } finally {
      setLaunching(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleTarget || !scheduleDate) return;
    setScheduling(true);
    try {
      await scheduleCampaign(scheduleTarget.id, new Date(scheduleDate).toISOString());
      success(s.scheduledSuccess);
      setScheduleOpen(false);
      setScheduleTarget(null);
      setScheduleDate('');
      await fetchCampaigns();
    } catch (err) {
      showError((err as { message?: string }).message || s.saveError);
    } finally {
      setScheduling(false);
    }
  };

  const handleReschedule = async () => {
    if (!scheduleTarget || !scheduleDate) return;
    setScheduling(true);
    try {
      await rescheduleCampaign(scheduleTarget.id, new Date(scheduleDate).toISOString());
      success(s.rescheduledSuccess);
      setScheduleOpen(false);
      setScheduleTarget(null);
      setScheduleDate('');
      await fetchCampaigns();
    } catch (err) {
      showError((err as { message?: string }).message || s.saveError);
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelSchedule = async () => {
    if (!cancelScheduleTarget) return;
    setCancellingSchedule(true);
    try {
      await cancelSchedule(cancelScheduleTarget.id);
      success(s.cancelScheduleSuccess);
      setCancelScheduleTarget(null);
      await fetchCampaigns();
    } catch (err) {
      showError((err as { message?: string }).message || s.saveError);
    } finally {
      setCancellingSchedule(false);
    }
  };

  const openScheduleModal = (campaign: Campaign) => {
    setScheduleTarget(campaign);
    setScheduleDate(campaign.scheduled_at
      ? new Date(campaign.scheduled_at).toISOString().slice(0, 16)
      : new Date(Date.now() + 3600000).toISOString().slice(0, 16));
    setScheduleOpen(true);
  };

  const statusBadge = (status: Campaign['status']) => {
    if (status === 'completed') return <Badge variant="light" color="success" size="sm">{s.statusCompleted}</Badge>;
    if (status === 'failed') return <Badge variant="light" color="error" size="sm">{s.statusFailed}</Badge>;
    if (status === 'sending') return <Badge variant="light" color="warning" size="sm">{s.statusSending}</Badge>;
    if (status === 'scheduled') return <Badge variant="light" color="info" size="sm">{s.statusScheduled}</Badge>;
    return <Badge variant="light" color="warning" size="sm">{s.statusDraft}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={s.searchPlaceholder}
          className="h-10 w-full max-w-xs rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-500"
        />

        <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
          {[
            { value: 'all', label: s.filterAll },
            { value: 'email', label: s.filterEmail },
            { value: 'sms', label: s.filterSms },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setChannelFilter(item.value as ChannelFilter)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                channelFilter === item.value
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <Button variant="primary" size="sm" startIcon={<PlusIcon className="size-4" />} onClick={() => setEditorOpen(true)}>
          {s.newCampaign}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
              <Skeleton.Title className="w-48" />
              <Skeleton.Text className="mt-2 w-72" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && loadError ? (
        <div className="rounded-xl border border-error-200 bg-error-50 p-6 text-center dark:border-error-800 dark:bg-error-900/20">
          <p className="mb-3 text-sm text-error-600 dark:text-error-400">{s.loadError}</p>
          <Button variant="outline" size="sm" onClick={fetchCampaigns}>
            {s.retry}
          </Button>
        </div>
      ) : null}

      {!loading && !loadError && filtered.length === 0 ? (
        <EmptyState
          title={search || channelFilter !== 'all' ? s.noResults : s.emptyTitle}
          description={search || channelFilter !== 'all' ? s.noResultsDesc : s.emptyDesc}
          icon={<ListIcon className="size-8" />}
          action={search || channelFilter !== 'all' ? undefined : { label: s.newCampaign, onClick: () => setEditorOpen(true) }}
        />
      ) : null}

      {!loading && !loadError && filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((campaign) => {
            const isDraft = campaign.status === 'draft';
            const isSending = campaign.status === 'sending';
            const canEdit = campaign.status === 'draft';
            const canDelete = campaign.status !== 'sending';
            return (
              <div
                key={campaign.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-gray-950 dark:text-white">{campaign.name}</h4>
                      <Badge variant="light" color={campaign.channel === 'email' ? 'info' : 'dark'} size="sm">
                        {campaign.channel === 'email' ? s.filterEmail : s.filterSms}
                      </Badge>
                      {statusBadge(campaign.status)}
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                      {campaign.subject ? `${campaign.subject} · ` : ''}
                      {campaign.body}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{s.recipientCount.replace('{count}', String(campaign.recipient_count || 0))}</span>
                      {campaign.scheduled_at ? (
                        <span>
                          {s.scheduledAt.replace(
                            '{date}',
                            new Date(campaign.scheduled_at).toLocaleString(locale),
                          )}
                        </span>
                      ) : null}
                      <span>
                        {s.updatedAt.replace(
                          '{date}',
                          new Date(campaign.updated_at || campaign.created_at).toLocaleDateString(locale),
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isDraft ? (
                      <Button
                        size="sm"
                        variant="primary"
                        startIcon={<PaperPlaneIcon className="size-4" />}
                        onClick={() => openLaunchConfirm(campaign)}
                      >
                        {s.launch}
                      </Button>
                    ) : null}
                    {isDraft ? (
                      <Button
                        size="sm"
                        variant="outline"
                        startIcon={<CalenderIcon className="size-4" />}
                        onClick={() => openScheduleModal(campaign)}
                      >
                        {s.schedule}
                      </Button>
                    ) : null}
                    {campaign.status === 'scheduled' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        startIcon={<CalenderIcon className="size-4" />}
                        onClick={() => openScheduleModal(campaign)}
                      >
                        {s.reschedule}
                      </Button>
                    ) : null}
                    {campaign.status === 'scheduled' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        startIcon={<TrashBinIcon className="size-4" />}
                        onClick={() => setCancelScheduleTarget(campaign)}
                      >
                        {s.cancelSchedule}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      startIcon={<PencilIcon className="size-4" />}
                      onClick={() => {
                        setEditTarget(campaign);
                        setEditorOpen(true);
                      }}
                      disabled={!canEdit}
                    >
                      {s.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      startIcon={<TrashBinIcon className="size-4" />}
                      onClick={() => setDeleteTarget(campaign)}
                      disabled={!canDelete || isSending}
                    >
                      {s.delete}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <Modal isOpen={scheduleOpen} onClose={() => { if (!scheduling) { setScheduleOpen(false); setScheduleTarget(null); setScheduleDate(''); } }} showCloseButton>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-950 dark:text-white">
              {scheduleTarget?.status === 'scheduled' ? s.reschedule : s.scheduleTitle}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {scheduleTarget?.status === 'scheduled' ? s.scheduleDesc : s.scheduleDesc}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{s.scheduleDate}</label>
            <input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30"
            />
            {scheduleDate && new Date(scheduleDate).toISOString() <= new Date().toISOString() ? (
              <p className="mt-1 text-xs text-error-500">{s.schedulePast}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => { setScheduleOpen(false); setScheduleTarget(null); setScheduleDate(''); }} disabled={scheduling}>
              {s.cancel}
            </Button>
            <Button
              onClick={scheduleTarget?.status === 'scheduled' ? handleReschedule : handleSchedule}
              disabled={scheduling || !scheduleDate || new Date(scheduleDate).toISOString() <= new Date().toISOString()}
            >
              {scheduling ? s.saving : scheduleTarget?.status === 'scheduled' ? s.reschedule : s.scheduleButton}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={cancelScheduleTarget !== null} onClose={() => setCancelScheduleTarget(null)} showCloseButton>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-950 dark:text-white">{s.cancelScheduleConfirm}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {s.cancelScheduleConfirmDesc.replace('{name}', cancelScheduleTarget?.name || '')}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setCancelScheduleTarget(null)}>
              {s.cancel}
            </Button>
            <Button onClick={handleCancelSchedule} disabled={cancellingSchedule}>
              {cancellingSchedule ? s.saving : s.cancelSchedule}
            </Button>
          </div>
        </div>
      </Modal>

      <CampaignEditorModal
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditTarget(null);
        }}
        onSaved={() => {
          setEditorOpen(false);
          setEditTarget(null);
          fetchCampaigns();
        }}
        campaign={editTarget}
      />

      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)} showCloseButton>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-950 dark:text-white">{s.deleteConfirmTitle}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {s.deleteConfirmDesc.replace('{name}', deleteTarget?.name || '')}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {s.cancel}
            </Button>
            <Button onClick={handleDelete} disabled={deleting}>
              {deleting ? s.deleting : s.deleteConfirm}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={launchTarget !== null} onClose={closeLaunchModal} showCloseButton>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-950 dark:text-white">
              {launchResult ? s.launchSummaryTitle : s.launchConfirmTitle}
            </h3>
            {launchResult ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {s.launchSummaryDesc.replace('{name}', launchTarget?.name || '')}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {s.launchConfirmDesc.replace('{name}', launchTarget?.name || '')}
              </p>
            )}
          </div>

          {launchTarget ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between py-1">
                <span>{s.launchFields.name}</span>
                <strong>{launchTarget.name}</strong>
              </div>
              <div className="flex items-center justify-between py-1">
                <span>{s.launchFields.channel}</span>
                <strong>{launchTarget.channel === 'email' ? s.filterEmail : s.filterSms}</strong>
              </div>
              <div className="flex items-center justify-between py-1">
                <span>{s.launchFields.sendable}</span>
                <strong>{launchPreview?.sendableRecipients ?? launchTarget.recipient_count ?? 0}</strong>
              </div>
              <div className="flex items-center justify-between py-1">
                <span>{s.launchFields.skipped}</span>
                <strong>{launchPreview?.skippedCount ?? 0}</strong>
              </div>
              {launchResult ? (
                <>
                  <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-800" />
                  <div className="flex items-center justify-between py-1">
                    <span>{s.launchFields.sent}</span>
                    <strong>{launchResult.sentCount}</strong>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span>{s.launchFields.failed}</span>
                    <strong>{launchResult.failedCount}</strong>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span>{s.launchFields.finalStatus}</span>
                    <strong>{launchResult.status}</strong>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-xs text-warning-600 dark:text-warning-400">{s.launchWarning}</p>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={closeLaunchModal} disabled={launching}>
              {launchResult ? s.close : s.cancel}
            </Button>
            {!launchResult ? (
              <Button onClick={handleLaunch} disabled={launching}>
                {launching ? s.launching : s.launchConfirm}
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
}
