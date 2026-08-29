import { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "../ui/badge/Badge";
import Button from "../ui/button/Button";
import EmptyState from "../ui/EmptyState";
import { Modal } from "../ui/modal";
import { Skeleton } from "../ui/Skeleton";
import { useT } from "../../lib/i18n/context";
import { useToast } from "../../context/ToastContext";
import {
  deleteAutomationRule,
  getAutomationRules,
  toggleAutomationRule,
  type AutomationChannel,
  type AutomationRule,
} from "../../api/automationRules";
import { PencilIcon, PlusIcon, TrashBinIcon } from "../../icons";
import AutomationEditorModal from "./AutomationEditorModal";

type ChannelFilter = "all" | AutomationChannel;

export default function AutomationTab() {
  const { t: _t } = useT();
  const { success, error: showError } = useToast();
  const a: any = _t.communication.automation;

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AutomationRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getAutomationRules();
      setRules(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rules.filter((rule) => {
      if (channelFilter !== "all" && rule.channel !== channelFilter) return false;
      if (activeFilter === "active" && !rule.is_active) return false;
      if (activeFilter === "inactive" && rule.is_active) return false;
      if (!query) return true;
      return rule.name.toLowerCase().includes(query) || (rule.human_trigger || "").toLowerCase().includes(query);
    });
  }, [rules, channelFilter, activeFilter, search]);

  const openCreate = () => {
    setEditTarget(null);
    setEditorOpen(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditTarget(rule);
    setEditorOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAutomationRule(deleteTarget.id);
      success(a.deleteSuccess);
      setDeleteTarget(null);
      fetchRules();
    } catch (err: any) {
      showError(err?.message || a.deleteError);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (rule: AutomationRule) => {
    const newState = !rule.is_active;
    setTogglingIds((prev) => new Set(prev).add(rule.id));
    try {
      await toggleAutomationRule(rule.id, newState);
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: newState } : r)));
      success(newState ? a.enabled : a.disabled);
    } catch (err: any) {
      showError(err?.message || a.toggleError);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(rule.id);
        return next;
      });
    }
  };

  const onEditorSaved = () => {
    fetchRules();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton.Title className="w-full" />
        <Skeleton.Text className="w-full" />
      </div>
    );
  }

  if (loadError) {
    return <EmptyState title={a.loadError} description="" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={a.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:placeholder:text-gray-500"
          />
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
          >
            <option value="all">{a.allChannels}</option>
            <option value="email">{a.channelEmail}</option>
            <option value="sms">{a.channelSms}</option>
          </select>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as "all" | "active" | "inactive")}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
          >
            <option value="all">{a.filterAll}</option>
            <option value="active">{a.filterActive}</option>
            <option value="inactive">{a.filterInactive}</option>
          </select>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" />
          {a.newRule}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <EmptyState title={search || channelFilter !== "all" || activeFilter !== "all" ? a.noMatches : a.empty} description="" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 transition hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-gray-700"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-950 dark:text-white">{rule.name}</span>
                  <Badge color={rule.is_active ? "success" : "light"} size="sm">
                    {rule.is_active ? a.active : a.inactive}
                  </Badge>
                  <Badge color={rule.channel === "email" ? "info" : "warning"} size="sm">
                    {rule.channel === "email" ? a.channelEmail : a.channelSms}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{rule.human_trigger}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={togglingIds.has(rule.id)}
                  onClick={() => handleToggle(rule)}
                  title={rule.is_active ? a.disable : a.enable}
                >
                  {rule.is_active ? a.disable : a.enable}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(rule)}>
                  <PencilIcon className="size-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeleteTarget(rule)}>
                  <TrashBinIcon className="size-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AutomationEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={onEditorSaved}
        rule={editTarget}
      />

      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)} showCloseButton>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-950 dark:text-white">{a.deleteTitle}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {a.deleteConfirm.replace("{name}", deleteTarget?.name || "")}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {a.cancel}
            </Button>
            <Button color="error" onClick={handleDelete} disabled={deleting}>
              {deleting ? a.deleting : a.delete}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
