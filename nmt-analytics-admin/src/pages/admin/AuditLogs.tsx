import { useState, useEffect, useCallback } from "react";
import PageMeta from "../../components/common/PageMeta";
import { DataTable, Column, Pagination } from "../../components/ui/DataTable";
import Badge from "../../components/ui/badge/Badge";
import Button from "../../components/ui/button/Button";
import { Modal } from "../../components/ui/modal";
import { useToast } from "../../context/ToastContext";
import { formatDate } from "../../utils/business";
import { getAuditLogs, AuditLog } from "../../api/admin";

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

function exportToCsv(logs: AuditLog[]) {
  const header = "Timestamp,User,Email,Action,Entity,Entity ID,Old Values,New Values";
  const rows = logs.map(l => [
    l.created_at,
    l.profiles?.full_name || "System",
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
  const { error: showError } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const response = await getAuditLogs({
        page,
        limit: ITEMS_PER_PAGE,
        entity: entityFilter || undefined,
        action: actionFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setLogs(response.data);
      setTotalItems(response.total);
      setCurrentPage(page);
    } catch (err: any) {
      console.error('Failed to fetch audit logs:', err);
      showError('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [entityFilter, actionFilter, dateFrom, dateTo, showError]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const handlePageChange = (page: number) => {
    fetchLogs(page);
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

  const columns: Column<AuditLog>[] = [
    {
      key: 'user',
      header: 'User',
      render: (_, log) => (
        <div className="flex flex-col">
          <span className="text-gray-800 font-medium text-theme-sm dark:text-white/90">
            {log.profiles?.full_name || 'System'}
          </span>
          <span className="text-gray-400 text-xs">
            {log.profiles?.email || 'automated-task@internal'}
          </span>
        </div>
      )
    },
    {
      key: 'action',
      header: 'Action',
      render: (val) => (
        <Badge size="sm" color={getActionColor(val as string)} variant="light">
          {(val as string).toUpperCase()}
        </Badge>
      )
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (_, log) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{log.entity}</span>
          <span className="text-xs font-mono text-gray-400">{log.entity_id.substring(0, 8)}...</span>
        </div>
      )
    },
    {
      key: 'details',
      header: 'Details',
      render: (_, log) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSelectedLog(log)}
          className="text-xs py-1 h-auto"
        >
          View Details
        </Button>
      )
    },
    {
      key: 'created_at',
      header: 'Time',
      render: (val) => formatDate(val as string)
    }
  ];

  const labelClass = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1";
  const inputClass = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/[0.1] dark:bg-gray-900 dark:text-white";
  const selectClass = inputClass;

  return (
    <>
      <PageMeta title="Audit Logs | NMT Analytics" description="System activity logs" />

      <div className="p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">System Activity</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Track all significant changes and actions in the system
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => exportToCsv(logs)}
              disabled={loading || logs.length === 0}
              className="flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => fetchLogs(currentPage)}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-white/[0.03] p-4 rounded-xl border border-gray-200 dark:border-white/[0.05]">
          <div>
            <label className={labelClass}>Entity Type</label>
            <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} className={selectClass}>
              <option value="">All Entities</option>
              {ENTITY_TYPES.filter(Boolean).map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Action</label>
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className={selectClass}>
              <option value="">All Actions</option>
              {ACTION_TYPES.filter(Boolean).map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputClass} />
          </div>
        </div>

        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center p-20">
            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <DataTable data={logs} columns={columns} />
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

      <Modal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} className="max-w-3xl" title="Audit Log Details">
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <span className="text-xs text-gray-500 block">Action</span>
              <Badge color={selectedLog ? getActionColor(selectedLog.action) : 'light'}>
                {selectedLog?.action.toUpperCase()}
              </Badge>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Entity</span>
              <span className="font-medium capitalize dark:text-gray-300">{selectedLog?.entity}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Entity ID</span>
              <span className="font-mono text-sm dark:text-gray-400">{selectedLog?.entity_id}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Timestamp</span>
              <span className="dark:text-gray-300">{selectedLog ? formatDate(selectedLog.created_at) : ''}</span>
            </div>
          </div>

          <div className="space-y-4">
            {selectedLog?.details?.oldValues && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-red-500">Previous Values</h3>
                <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-xs overflow-auto max-h-40 font-mono border border-gray-100 dark:border-gray-700">
                  {JSON.stringify(selectedLog.details.oldValues, null, 2)}
                </pre>
              </div>
            )}
            {selectedLog?.details?.newValues && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-green-500">New Values</h3>
                <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-xs overflow-auto max-h-40 font-mono border border-gray-100 dark:border-gray-700">
                  {JSON.stringify(selectedLog.details.newValues, null, 2)}
                </pre>
              </div>
            )}
            {!selectedLog?.details?.oldValues && !selectedLog?.details?.newValues && (
              <div>
                <h3 className="text-sm font-semibold mb-2 dark:text-gray-300">Metadata</h3>
                <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-xs overflow-auto max-h-40 font-mono border border-gray-100 dark:border-gray-700">
                  {JSON.stringify(selectedLog?.details, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end">
            <Button onClick={() => setSelectedLog(null)}>Close</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
