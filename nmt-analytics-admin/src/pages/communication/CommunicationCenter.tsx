import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useSearchParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import Label from "../../components/form/Label";
import Select from "../../components/form/Select";
import EmptyState from "../../components/ui/EmptyState";
import ManualMessageComposer from "../../components/communications/ManualMessageComposer";
import CommunicationHistoryPanel from "../../components/communications/CommunicationHistoryPanel";
import { useT } from "../../lib/i18n/context";
import { getDepartures, type Departure } from "../../api/departures";
import { sendDepartureManualMessage } from "../../api/manualMessaging";
import {
  GridIcon,
  PaperPlaneIcon,
  ListIcon,
  FileIcon,
  TimeIcon,
  BoltIcon,
} from "../../icons";

type TabKey = "overview" | "send" | "campaigns" | "templates" | "history" | "automation";

const TAB_ORDER: TabKey[] = ["overview", "send", "campaigns", "templates", "history", "automation"];

export default function CommunicationCenter() {
  const { t } = useT();
  const c = t.communication;
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as TabKey | null;
  const activeTab: TabKey = tabParam && TAB_ORDER.includes(tabParam) ? tabParam : "overview";

  const [departures, setDepartures] = useState<Departure[]>([]);
  const [departuresError, setDeparturesError] = useState<string | null>(null);
  const [selectedDepartureId, setSelectedDepartureId] = useState("");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await getDepartures({ limit: 100 });
        if (mounted) setDepartures(response.data || []);
      } catch {
        if (mounted) setDeparturesError(c.send.loadError);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [c.send.loadError]);

  const selectedDeparture = useMemo(
    () => departures.find((d) => d.id === selectedDepartureId) || null,
    [departures, selectedDepartureId],
  );

  const departureLabel = (d: Departure) => {
    const name = d.packageName || d.packages?.name || d.destination || d.id.slice(0, 8);
    const date = d.depart_at ? new Date(d.depart_at).toLocaleDateString("bs-BA") : "";
    return date ? `${name} — ${date}` : name;
  };

  const tabIcon: Record<TabKey, ReactElement> = {
    overview: <GridIcon className="size-4" />,
    send: <PaperPlaneIcon className="size-4" />,
    campaigns: <ListIcon className="size-4" />,
    templates: <FileIcon className="size-4" />,
    history: <TimeIcon className="size-4" />,
    automation: <BoltIcon className="size-4" />,
  };

  const setTab = (tab: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const placeholderPanel = (title: string, description: string, comingSoon: string) => (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <h3 className="font-semibold text-gray-950 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      <div className="mt-5">
        <EmptyState title={comingSoon} description="" />
      </div>
    </div>
  );

  return (
    <>
      <PageMeta title={`${c.title} — Travline`} description={c.subtitle} />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">{c.title}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{c.subtitle}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              activeTab === tab
                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {tabIcon[tab]}
            {c.tabs[tab]}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <h3 className="font-semibold text-gray-950 dark:text-white">{c.overview.title}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{c.overview.description}</p>
          <div className="mt-5">
            <EmptyState title={c.overview.comingSoon} description="" />
          </div>
        </div>
      )}

      {activeTab === "send" && (
        <div className="max-w-3xl space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
            <Label>{c.send.contextLabel}</Label>
            <Select
              options={[
                { value: "", label: c.send.contextPlaceholder },
                ...departures.map((d) => ({ value: d.id, label: departureLabel(d) })),
              ]}
              value={selectedDepartureId}
              onChange={(value: string) => setSelectedDepartureId(value || "")}
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{c.send.contextHint}</p>
            {departuresError ? (
              <p className="mt-2 text-sm text-error-600 dark:text-error-400">{departuresError}</p>
            ) : null}
          </div>

          {selectedDeparture ? (
            <ManualMessageComposer
              onSend={(payload) => sendDepartureManualMessage(selectedDeparture.id, payload)}
              onSent={() => setHistoryRefreshKey((value) => value + 1)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-400">
              {c.send.noContext}
            </div>
          )}
        </div>
      )}

      {activeTab === "campaigns" &&
        placeholderPanel(c.campaigns.title, c.campaigns.description, c.campaigns.comingSoon)}

      {activeTab === "templates" &&
        placeholderPanel(c.templates.title, c.templates.description, c.templates.comingSoon)}

      {activeTab === "history" && (
        <CommunicationHistoryPanel refreshKey={historyRefreshKey} />
      )}

      {activeTab === "automation" &&
        placeholderPanel(c.automation.title, c.automation.description, c.automation.comingSoon)}
    </>
  );
}
