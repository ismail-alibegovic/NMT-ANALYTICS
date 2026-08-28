import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../ui/button/Button';
import Badge from '../ui/badge/Badge';
import EmptyState from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { Modal } from '../ui/modal';
import TemplateEditorModal from './TemplateEditorModal';
import { useT } from '../../lib/i18n/context';
import { useToast } from '../../context/ToastContext';
import {
  getMessageTemplates,
  duplicateMessageTemplate,
  deleteMessageTemplate,
  type MessageTemplate,
  type MessageTemplateChannel,
} from '../../api/messageTemplates';
import {
  CopyIcon,
  PencilIcon,
  PlusIcon,
  TrashBinIcon,
  MailIcon,
} from '../../icons';

type ChannelFilter = 'all' | MessageTemplateChannel;

export default function TemplatesTab() {
  const { t: _t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = _t.communication.templates;
  const { success, error: showError } = useToast();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MessageTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getMessageTemplates({});
      setTemplates(data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filtered = useMemo(() => {
    let result = templates;
    if (channelFilter !== 'all') {
      result = result.filter((t) => t.channel === channelFilter);
    }
    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          (t.subject ?? '').toLowerCase().includes(query),
      );
    }
    return result;
  }, [templates, search, channelFilter]);

  const handleDuplicate = async (tpl: MessageTemplate) => {
    try {
      await duplicateMessageTemplate(tpl.id);
      success(s.duplicated);
      fetchTemplates();
    } catch (err) {
      showError((err as { message?: string })?.message || s.saveError);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMessageTemplate(deleteTarget.id);
      success(s.deleted);
      setDeleteTarget(null);
      fetchTemplates();
    } catch (err) {
      showError((err as { message?: string })?.message || s.saveError);
    } finally {
      setDeleting(false);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setEditorOpen(true);
  };

  const openEdit = (tpl: MessageTemplate) => {
    setEditTarget(tpl);
    setEditorOpen(true);
  };

  const handleEditorSaved = () => {
    setEditorOpen(false);
    setEditTarget(null);
    fetchTemplates();
  };

  const handleEditorClose = () => {
    setEditorOpen(false);
    setEditTarget(null);
  };

  const filterTabs: { value: ChannelFilter; label: string }[] = [
    { value: 'all', label: s.filterAll },
    { value: 'email', label: s.filterEmail },
    { value: 'sms', label: s.filterSms },
  ];

  const searchInputClasses =
    'h-10 w-full max-w-xs rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-500';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={s.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={searchInputClasses}
        />

        <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
          {filterTabs.map((ft) => (
            <button
              key={ft.value}
              onClick={() => setChannelFilter(ft.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                channelFilter === ft.value
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {ft.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <Button
          variant="primary"
          size="sm"
          startIcon={<PlusIcon className="size-4" />}
          onClick={openCreate}
        >
          {s.newTemplate}
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex-1 space-y-2">
                <Skeleton.Title className="w-40" />
                <Skeleton.Text className="w-72" />
              </div>
              <div className="flex gap-2">
                <Skeleton.Text className="w-16" />
                <Skeleton.Text className="w-16" />
                <Skeleton.Text className="w-16" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && loadError && (
        <div className="rounded-xl border border-error-200 bg-error-50 p-6 text-center dark:border-error-800 dark:bg-error-900/20">
          <p className="mb-3 text-sm text-error-600 dark:text-error-400">{s.loadError}</p>
          <Button variant="outline" size="sm" onClick={fetchTemplates}>
            {s.retry}
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !loadError && filtered.length === 0 && (
        <EmptyState
          title={search || channelFilter !== 'all' ? s.noResults : s.emptyTitle}
          description={search || channelFilter !== 'all' ? s.noResultsDesc : s.emptyDesc}
          action={
            search || channelFilter !== 'all'
              ? undefined
              : { label: s.newTemplate, onClick: openCreate }
          }
        />
      )}

      {/* List */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((tpl) => (
            <div
              key={tpl.id}
              className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 transition hover:border-gray-300 sm:flex-row sm:items-center dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="truncate text-sm font-semibold text-gray-950 dark:text-white">
                    {tpl.name}
                  </h4>
                  <Badge
                    variant="light"
                    color={tpl.channel === 'email' ? 'info' : 'dark'}
                    size="sm"
                  >
                    {tpl.channel === 'email' ? s.filterEmail : s.filterSms}
                  </Badge>
                  <Badge
                    variant="light"
                    color={tpl.is_active ? 'success' : 'light'}
                    size="sm"
                  >
                    {tpl.is_active ? s.active : s.inactive}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                  {tpl.subject && (
                    <span>
                      <MailIcon className="mr-1 inline size-3 align-[-1px]" />
                      {tpl.subject}
                      {' · '}
                    </span>
                  )}
                  {tpl.body.slice(0, 120)}
                  {tpl.body.length > 120 && '…'}
                </p>
              </div>

              <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 sm:shrink-0">
                <button
                  title={s.edit}
                  onClick={() => openEdit(tpl)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <PencilIcon className="size-4" />
                </button>
                <button
                  title={s.duplicate}
                  onClick={() => handleDuplicate(tpl)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <CopyIcon className="size-4" />
                </button>
                <button
                  title={s.delete}
                  onClick={() => setDeleteTarget(tpl)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-error-100 hover:text-error-600 dark:hover:bg-error-900/30 dark:hover:text-error-400"
                >
                  <TrashBinIcon className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <TemplateEditorModal
        isOpen={editorOpen}
        onClose={handleEditorClose}
        onSaved={handleEditorSaved}
        template={editTarget}
      />

      {/* Delete Confirm Modal */}
      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)} showCloseButton>
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-gray-950 dark:text-white">
            {s.deleteConfirmTitle}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {s.deleteConfirmDesc.replace('{name}', deleteTarget?.name ?? '')}
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {s.cancel}
            </Button>
            <Button variant="primary" onClick={handleDelete} disabled={deleting}>
              {deleting ? s.deleting : s.delete}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
