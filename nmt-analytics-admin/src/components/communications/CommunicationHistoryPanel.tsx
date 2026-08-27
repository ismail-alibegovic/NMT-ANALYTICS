import { useEffect, useMemo, useState } from "react";
import { DataTable, Column } from "../ui/DataTable";
import Select from "../form/Select";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import { useT } from "../../lib/i18n/context";
import {
  CommunicationChannel,
  CommunicationHistoryItem,
  CommunicationStatus,
  getCommunicationHistory,
  getCommunicationHistoryItem,
} from "../../api/communicationHistory";

interface CommunicationHistoryPanelProps {
  relatedDepartureId?: string;
  relatedReservationId?: string;
  title?: string;
  refreshKey?: number;
}

const formatDateTime = (value: string | null | undefined, locale: string) => {
  if (!value) return "—";
  return new Date(value).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusTone: Record<CommunicationStatus, string> = {
  sent: "text-success-600 dark:text-success-400",
  failed: "text-error-600 dark:text-error-400",
  skipped: "text-warning-600 dark:text-warning-400",
};

const channelLabel: Record<CommunicationChannel, string> = {
  email: "Email",
  sms: "SMS",
};

export default function CommunicationHistoryPanel({
  relatedDepartureId,
  relatedReservationId,
  title,
  refreshKey = 0,
}: CommunicationHistoryPanelProps) {
  const { t, lang } = useT();
  const dateLocale = lang === "bs" ? "bs-BA" : "en-US";
  const c = t.communication.history;
  const [items, setItems] = useState<CommunicationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<CommunicationChannel | "">("");
  const [status, setStatus] = useState<CommunicationStatus | "">("");
  const [selectedItem, setSelectedItem] = useState<CommunicationHistoryItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const statusLabel: Record<CommunicationStatus, string> = {
    sent: c.statusSent,
    failed: c.statusFailed,
    skipped: c.statusSkipped,
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const response = await getCommunicationHistory({
          limit: 20,
          channel,
          status,
          related_departure_id: relatedDepartureId,
          related_reservation_id: relatedReservationId,
        });
        if (mounted) setItems(response.data || []);
      } catch (error) {
        console.error("Failed to load communication history", error);
        if (mounted) setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [channel, status, relatedDepartureId, relatedReservationId, refreshKey]);

  const selectedId = selectedItem?.id;
  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;

    setDetailLoading(true);
    setDetailError(false);
    void getCommunicationHistoryItem(selectedId)
      .then((item) => {
        if (mounted) setSelectedItem(item);
      })
      .catch((error) => {
        console.error("Failed to load communication history detail", error);
        if (mounted) setDetailError(true);
      })
      .finally(() => {
        if (mounted) setDetailLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedId]);

  const columns: Column<CommunicationHistoryItem>[] = useMemo(() => [
    {
      key: "created_at",
      header: c.colDate,
      render: (_value, item) => (
        <div className="min-w-[140px]">
          <div className="font-medium text-gray-900 dark:text-white">{formatDateTime(item.sent_at || item.created_at, dateLocale)}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{item.sent_at ? "sent_at" : "created_at"}</div>
        </div>
      ),
    },
    {
      key: "channel",
      header: c.colChannel,
      render: (value) => (
        <span className="font-medium text-gray-700 dark:text-gray-200">
          {channelLabel[value as CommunicationChannel] || String(value || "—")}
        </span>
      ),
    },
    {
      key: "recipient",
      header: c.colRecipient,
      render: (value, item) => (
        <div className="min-w-[220px]">
          <button
            type="button"
            onClick={() => setSelectedItem(item)}
            className="text-left font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            {String(value || "—")}
          </button>
          {item.subject ? (
            <div className="text-xs text-gray-500 dark:text-gray-400">{item.subject}</div>
          ) : item.body_preview ? (
            <div className="text-xs text-gray-500 dark:text-gray-400">{item.body_preview}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: c.colStatus,
      render: (value, item) => (
        <div className="min-w-[140px]">
          <div className={`font-medium ${statusTone[value as CommunicationStatus] || "text-gray-600 dark:text-gray-300"}`}>
            {statusLabel[value as CommunicationStatus] || String(value || "—")}
          </div>
          {item.error_message ? (
            <div className="text-xs text-gray-500 dark:text-gray-400">{item.error_message}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "context",
      header: c.colRelated,
      render: (_value, item) => (
        <div className="min-w-[180px] text-xs text-gray-500 dark:text-gray-400">
          {item.departures ? (
            <div>
              {c.departure}: {item.departures.packages?.name || item.departures.id.slice(0, 8)}
            </div>
          ) : null}
          {item.reservations ? (
            <div>
              {c.reservation}: {item.reservations.customer_name || item.reservations.id.slice(0, 8)}
            </div>
          ) : null}
          {!item.departures && !item.reservations ? "—" : null}
        </div>
      ),
    },
  ], [c, dateLocale, statusLabel]);

  return (
    <>
      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-semibold text-gray-950 dark:text-white">{title || c.title}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{c.subtitle}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-[140px]">
                <Select
                  options={[
                    { value: "", label: c.allChannels },
                    { value: "email", label: "Email" },
                    { value: "sms", label: "SMS" },
                  ]}
                  defaultValue={channel}
                  onChange={(value: string) => setChannel((value || "") as CommunicationChannel | "")}
                />
              </div>
              <div className="min-w-[140px]">
                <Select
                  options={[
                    { value: "", label: c.allStatuses },
                    { value: "sent", label: c.statusSent },
                    { value: "failed", label: c.statusFailed },
                    { value: "skipped", label: c.statusSkipped },
                  ]}
                  defaultValue={status}
                  onChange={(value: string) => setStatus((value || "") as CommunicationStatus | "")}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <DataTable
            data={items}
            columns={columns}
            loading={loading}
            emptyMessage={c.empty}
          />
        </div>
      </section>

      <Modal
        isOpen={Boolean(selectedItem)}
        onClose={() => {
          setSelectedItem(null);
          setDetailError(false);
        }}
        className="m-4 max-w-2xl"
        title={c.title}
      >
        {selectedItem ? (
          <div className="max-h-[78vh] overflow-y-auto p-6">
            {detailLoading ? (
              <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t.common.loading}</div>
            ) : null}
            {detailError ? (
              <div className="mb-4 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-900/40 dark:bg-error-950/20 dark:text-error-300">
                {t.common.error}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label={c.colChannel} value={channelLabel[selectedItem.channel]} />
              <DetailField label={c.colStatus} value={statusLabel[selectedItem.status]} tone={statusTone[selectedItem.status]} />
              <div className="sm:col-span-2">
                <DetailField label={c.colRecipient} value={selectedItem.recipient} />
              </div>
              {selectedItem.subject ? (
                <div className="sm:col-span-2">
                  <DetailField label={t.communication.composer.subject} value={selectedItem.subject} />
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {t.communication.composer.message}
                </div>
                <div className="mt-1.5 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100">
                  {selectedItem.body_preview || "—"}
                </div>
              </div>
              <DetailField label={c.colDate} value={formatDateTime(selectedItem.sent_at || selectedItem.created_at, dateLocale)} />
              <DetailField label="ID" value={selectedItem.id} mono />
              {selectedItem.departures ? (
                <DetailField
                  label={c.departure}
                  value={`${selectedItem.departures.packages?.name || selectedItem.departures.id.slice(0, 8)} · ${formatDateTime(selectedItem.departures.depart_at, dateLocale)}`}
                />
              ) : null}
              {selectedItem.reservations ? (
                <DetailField
                  label={c.reservation}
                  value={selectedItem.reservations.customer_name || selectedItem.reservations.id}
                />
              ) : null}
              {selectedItem.error_message ? (
                <div className="sm:col-span-2">
                  <DetailField label={t.common.error} value={selectedItem.error_message} tone="text-error-600 dark:text-error-400" />
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedItem(null);
                  setDetailError(false);
                }}
              >
                {t.common.close}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function DetailField({
  label,
  value,
  tone = "text-gray-900 dark:text-white",
  mono = false,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1.5 break-words text-sm font-medium ${tone} ${mono ? "font-mono text-xs" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}
