import { useCallback, useEffect, useMemo, useState } from 'react';
import Badge from '../ui/badge/Badge';
import Button from '../ui/button/Button';
import EmptyState from '../ui/EmptyState';
import { Modal } from '../ui/modal';
import { Skeleton } from '../ui/Skeleton';
import { useT } from '../../lib/i18n/context';
import { useToast } from '../../context/ToastContext';
import {
  deleteCampaign,
  getCampaigns,
  type Campaign,
  type CampaignChannel,
} from '../../api/campaigns';
import { ListIcon, PencilIcon, PlusIcon, TrashBinIcon } from '../../icons';
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
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCampaign(deleteTarget.id);
      success(s.deleted);
      setDeleteTarget(null);
      fetchCampaigns();
    } catch (err) {
      showError((err as { message?: string }).message || s.deleteError);
    } finally {
      setDeleting(false);
    }
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
          {filtered.map((campaign) => (
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
                    <Badge variant="light" color="warning" size="sm">
                      {s.statusDraft}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                    {campaign.subject ? `${campaign.subject} · ` : ''}
                    {campaign.body}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{s.recipientCount.replace('{count}', String(campaign.recipient_count || 0))}</span>
                    <span>
                      {s.updatedAt.replace(
                        '{date}',
                        campaign.updated_at
                          ? new Date(campaign.updated_at).toLocaleDateString(locale)
                          : new Date(campaign.created_at).toLocaleDateString(locale),
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    startIcon={<PencilIcon className="size-4" />}
                    onClick={() => {
                      setEditTarget(campaign);
                      setEditorOpen(true);
                    }}
                  >
                    {s.edit}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    startIcon={<TrashBinIcon className="size-4" />}
                    onClick={() => setDeleteTarget(campaign)}
                  >
                    {s.delete}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

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
    </div>
  );
}
