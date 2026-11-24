import { useState, useEffect, useCallback, useRef } from "react";
import PageMeta from "../../components/common/PageMeta";
import { DataTable, Column, Pagination } from "../../components/ui/DataTable";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../utils/business";
import { getAuditLogs, AuditLog } from "../../api/admin";
import { useT } from "../../lib/i18n/context";

const ITEMS_PER_PAGE = 15;
const ENTITY_TYPES = ["", "payments", "reservations", "customers", "packages", "departures", "users", "settings", "documents"];
const ACTION_TYPES = ["", "create", "update", "delete", "void", "refund", "login", "export"];

function csvEscape(val: string) {
  if (!val) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportToCsv(logs: AuditLog[], systemActorLabel: string) {
  const header = "Timestamp,User,Email,Action,Entity,Entity ID,Old Values,New Values";
  const rows = logs.map(l => [
    l.created_at,
    l.profiles?.full_name || systemActorLabel,
    l.profiles?.email || "",
    l.action,
    l.entity,
    l.entity_id,
    l.details?.oldValues ? JSON.stringify(l.details.oldValues) : "",
    l.details?.newValues ? JSON.stringify(l.details.newValues) : "",
  ].map(v => csvEscape(v)).join(","));

  const bom = "\uFEFF";
  const csv = bom + header + "\n" + rows.join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogs() {
  const { t, lang } = useT();
  const locale = lang === 'en' ? 'en-US' : 'bs-BA';
  const { error: showError } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const loadErrorTextRef = useRef(t.auditLogs.loadError);
  loadErrorTextRef.current = t.auditLogs.loadError;
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await getAuditLogs({
        page,
        limit: ITEMS_PER_PAGE,
        entity: entityFilter || undefined,
        action: actionFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      // Client-side search filter over returned logs
      const filtered = search.trim()
        ? response.data.filter(l =>
            (l.profiles?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
            (l.profiles?.email || "").toLowerCase().includes(search.toLowerCase()) ||
            (l.entity_id || "").substring(0, 8).toLowerCase().includes(search.toLowerCase()))
        : response.data;
      setLogs(filtered);
      setTotalItems(search.trim() ? filtered.length : response.total);
      setCurrentPage(page);
    } catch (err: any) {
      console.error('Failed to fetch audit logs:', err);
      setLoadError(true);
      showErrorRef.current(loadErrorTextRef.current);
    } finally {
      setLoading(false);
    }
  }, [entityFilter, actionFilter, dateFrom, dateTo, search]);

  useEffect(() => {
    void fetchLogs(1);
  }, [fetchLogs]);

  const handlePageChange = (page: number) => {
    void fetchLogs(page);
  };

  const getActionColor = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes('create') || act.includes('insert')) return 'success';
    if (act.includes('update') || act.includes('patch')) return 'warning';
    if (act.includes('delete')) return 'error';
    if (act.includes('email') || act.includes('send') || act.includes('export')) return 'info';
    if (act.includes('void') || act.includes('refund')) return 'dark';
    return 'light';
  };

  const translateEntity = (entity: string) => {
    const mapped = (t.auditLogs.entities as Record<string, string> | undefined)?.[entity];
    return mapped || (entity.charAt(0).toUpperCase() + entity.slice(1));
  };

  const translateAction = (action: string) => {
    const mapped = (t.auditLogs.actions as Record<string, string> | undefined)?.[action.toLowerCase()];
    return (mapped || action).toUpperCase();
  };

  const columns: Column<AuditLog>[] = [
    {
      key: 'user',
      header: t.auditLogs.user,
      render: (_, log) => (
        <div className="flex flex-col">
          <span className="text-gray-800 font-medium text-theme-sm dark:text-white/90">
            {log.profiles?.full_name || t.auditLogs.systemActor}
          </span>
          <span className="text-gray-400 text-xs">
            {log.profiles?.email || 'automated-task@internal'}
          </span>
        </div>
      )
    },
    {
      key: 'action',
      header: t.auditLogs.action,
      render: (val) => (
        <Badge size="sm" color={getActionColor(val as string)} variant="light">
          {translateAction(val as string)}
        </Badge>
      )
    },
    {
      key: 'entity',
      header: t.auditLogs.entity,
      render: (_, log) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-700 dark:text-gray-300">{translateEntity(log.entity)}</span>
          <span className="text-xs font-mono text-gray-400">
            {log.entity_id ? `${log.entity_id.substring(0, 8)}...` : '—'}
          </span>
        </div>
      )
    },
    {
      key: 'details',
      header: t.auditLogs.details,
      render: (_, log) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSelectedLog(log)}
          className="text-xs py-1 h-auto"
        >
          {t.auditLogs.viewDetails}
        </Button>
      )
    },
    {
      key: 'created_at',
      header: t.auditLogs.timestamp,
      render: (val) => formatDate(val as string, locale)
    }
  ];

  const labelClass = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1";
  const inputClass = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white";
  const selectClass = inputClass;

  return (
    <>
      <PageMeta title={`${t.auditLogs.title} | Travline`} description={t.auditLogs.description} />

      <div className="p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{t.auditLogs.pageHeading}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t.auditLogs.pageSubtitle}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => exportToCsv(logs, t.auditLogs.systemActor)}
              disabled={loading || loadError || logs.length === 0}
              className="flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t.auditLogs.exportCsv}
            </Button>
            <Button
              variant="outline"
              onClick={() => void fetchLogs(currentPage)}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t.auditLogs.refresh}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          <div className="relative max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.auditLogs.searchPlaceholder}
              aria-label={t.auditLogs.searchPlaceholder}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white"
            />
          </div>
          <div className="bg-white dark:bg-white/[0.03] p-4 rounded-xl border border-gray-200 dark:border-white/[0.05] grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="audit-entity-filter" className={labelClass}>{t.auditLogs.entityType}</label>
              <select id="audit-entity-filter" value={entityFilter} onChange={e => setEntityFilter(e.target.value)} className={selectClass}>
                <option value="">{t.auditLogs.allEntities}</option>
                {ENTITY_TYPES.filter(Boolean).map(item => (
                  <option key={item} value={item}>{translateEntity(item)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audit-action-filter" className={labelClass}>{t.auditLogs.action}</label>
              <select id="audit-action-filter" value={actionFilter} onChange={e => setActionFilter(e.target.value)} className={selectClass}>
                <option value="">{t.auditLogs.allActions}</option>
                {ACTION_TYPES.filter(Boolean).map(item => (
                  <option key={item} value={item}>{translateAction(item)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audit-date-from" className={labelClass}>{t.auditLogs.fromDate}</label>
              <input id="audit-date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="audit-date-to" className={labelClass}>{t.auditLogs.toDate}</label>
              <input id="audit-date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center p-20">
            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300">{t.auditLogs.loadError}</p>
            <Button type="button" variant="outline" onClick={() => void fetchLogs(currentPage)}>
              {t.auditLogs.retry}
            </Button>
          </div>
        ) : (
          <>
            <DataTable data={logs} columns={columns} emptyMessage={t.auditLogs.noLogs} />
            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
      </div>

      <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} className="max-w-3xl" title={t.auditLogs.modalTitle}>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <span className="text-xs text-gray-500 block">{t.auditLogs.action}</span>
              <Badge color={selectedLog ? getActionColor(selectedLog.action) : 'light'}>
                {selectedLog ? translateAction(selectedLog.action) : ''}
              </Badge>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">{t.auditLogs.entity}</span>
              <span className="font-medium dark:text-gray-300">{selectedLog ? translateEntity(selectedLog.entity) : ''}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">{t.auditLogs.entityId}</span>
              <span className="font-mono text-sm dark:text-gray-400">{selectedLog?.entity_id}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">{t.auditLogs.timestamp}</span>
              <span className="dark:text-gray-300">{selectedLog ? formatDate(selectedLog.created_at, locale) : ''}</span>
            </div>
          </div>

          <div className="space-y-4">
            {selectedLog?.details?.oldValues && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-red-500">{t.auditLogs.previousValues}</h3>
                <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-xs overflow-auto max-h-40 font-mono border border-gray-100 dark:border-gray-700">
                  {JSON.stringify(selectedLog.details.oldValues, null, 2)}
                </pre>
              </div>
            )}
            {selectedLog?.details?.newValues && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-green-500">{t.auditLogs.newValues}</h3>
                <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-xs overflow-auto max-h-40 font-mono border border-gray-100 dark:border-gray-700">
                  {JSON.stringify(selectedLog.details.newValues, null, 2)}
                </pre>
              </div>
            )}
            {!selectedLog?.details?.oldValues && !selectedLog?.details?.newValues && (
              <div>
                <h3 className="text-sm font-semibold mb-2 dark:text-gray-300">{t.auditLogs.metadata}</h3>
                <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-xs overflow-auto max-h-40 font-mono border border-gray-100 dark:border-gray-700">
                  {JSON.stringify(selectedLog?.details, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end">
            <Button onClick={() => setSelectedLog(null)}>{t.auditLogs.close}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
