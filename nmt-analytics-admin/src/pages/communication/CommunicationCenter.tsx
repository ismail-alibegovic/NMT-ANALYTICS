import { useMemo, useState, type ReactElement } from "react";
import { useSearchParams } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import EmptyState from "../../components/ui/EmptyState";
import SendMessage from "../../components/communications/SendMessage";
import CommunicationHistoryPanel from "../../components/communications/CommunicationHistoryPanel";
import TemplatesTab from "../../components/communications/TemplatesTab";
import CampaignsTab from "../../components/communications/CampaignsTab";
import AutomationTab from "../../components/communications/AutomationTab";
import type { MessageTemplate } from "../../api/messageTemplates";
import { useT } from "../../lib/i18n/context";
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

  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [sendPreset, setSendPreset] = useState<{
    template: MessageTemplate;
    channel: MessageTemplate["channel"];
  } | null>(null);

  const tabIcon: Record<TabKey, ReactElement> = useMemo(
    () => ({
      overview: <GridIcon className="size-4" />,
      send: <PaperPlaneIcon className="size-4" />,
      campaigns: <ListIcon className="size-4" />,
      templates: <FileIcon className="size-4" />,
      history: <TimeIcon className="size-4" />,
      automation: <BoltIcon className="size-4" />,
    }),
    [],
  );

  const setTab = (tab: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const handleUseTemplate = (template: MessageTemplate) => {
    setSendPreset({ template, channel: template.channel });
    setTab("send");
  };

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
        <SendMessage
          onSent={() => setHistoryRefreshKey((value) => value + 1)}
          presetTemplate={sendPreset?.template ?? null}
          presetChannel={sendPreset?.channel ?? null}
        />
      )}

      {activeTab === "campaigns" && <CampaignsTab />}

      {activeTab === "templates" && <TemplatesTab onUseTemplate={handleUseTemplate} />}

      {activeTab === "history" && <CommunicationHistoryPanel refreshKey={historyRefreshKey} />}

      {activeTab === "automation" && <AutomationTab />}
    </>
  );
}
