import { useState, useEffect, useRef } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import { TrashBinIcon, PlusIcon, CopyIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import {
  getSubAgents, createSubAgent, deleteSubAgent,
  issueSubAgentPortalToken, revokeSubAgentPortalToken,
  SubAgent,
} from "../../api/operations";

export default function SubAgents() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t } = useT();
  const tr = t.operations.subagents;
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saveLock = useRef(false);
  const resetForm = () => { setFormName(''); setFormPhone(''); setFormEmail(''); setFormCommission(5); setFormPartnerType('bronze'); setSaveError(''); };
  const closeForm = () => { if (!saveLock.current) { setIsModalOpen(false); resetForm(); } };

  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCommission, setFormCommission] = useState(5);
  const [formPartnerType, setFormPartnerType] = useState<"bronze" | "silver" | "gold" | "platinum">("bronze");
  const [portalModalAgent, setPortalModalAgent] = useState<SubAgent | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const portalLock = useRef(false);
  const closePortal = () => { if (!portalLock.current) {setPortalModalAgent(null);setPortalUrl(null);} };

  const fetchSubAgents = async () => {
    setLoading(true);
    try {
      const data = await getSubAgents();
      setSubAgents(data);
      setLoading(false);
    } catch (err: any) {
      showError(err.message || "Failed to load sub-agents");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) fetchSubAgents();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading]);

  const handleCreate = async () => {
    if (saveLock.current || !formName.trim()) return;
    saveLock.current = true; setSaving(true); setSaveError('');
    try {
      await createSubAgent({
        name: formName, phone: formPhone, email: formEmail, commissionRate: formCommission, partnerType: formPartnerType,
      });
      showSuccess(tr.created);
      setIsModalOpen(false);
      setFormName(""); setFormPhone(""); setFormEmail(""); setFormCommission(5); setFormPartnerType("bronze");
      fetchSubAgents();
    } catch (err: any) {
      setSaveError(err.message || tr.createError);
    } finally { saveLock.current = false; setSaving(false); }
  };

  const handleIssuePortalToken = async (sa: SubAgent) => {
    if (portalLock.current) return;
    portalLock.current = true; setPortalLoading(true);
    try {
      const res = await issueSubAgentPortalToken(sa.id);
      setPortalUrl(`${window.location.origin}/portal/subagent/${encodeURIComponent(res.token)}`);
      setPortalModalAgent({...sa,portalTokenExpiresAt:res.expiresAt});
    } catch (err: any) {
      showError(err.message || tr.portalError);
    } finally { portalLock.current = false; setPortalLoading(false); }
  };

  const handleRevokePortalToken = async (sa: SubAgent) => {
    if (portalLock.current || !confirm(tr.revokeConfirm.replace('{name}',sa.name))) return;
    portalLock.current = true; setPortalLoading(true);
    try {
      await revokeSubAgentPortalToken(sa.id);
      showSuccess(tr.revoked); setPortalUrl(null);setPortalModalAgent(current=>current?.id===sa.id?{...current,portalTokenExpiresAt:null}:current);
      fetchSubAgents();
    } catch (err: any) {
      showError(err.message || tr.portalError);
    } finally { portalLock.current = false; setPortalLoading(false); }
  };

  const handleDelete = async (sa: SubAgent) => {
    if (!confirm(`Delete sub-agent ${sa.name}?`)) return;
    try {
      await deleteSubAgent(sa.id);
      showSuccess("Sub-agent deleted");
      fetchSubAgents();
    } catch (err: any) {
      showError(err.message || "Failed to delete");
    }
  };

  const columns: Column<SubAgent>[] = [
    { key: "name", header: "Name", render: (v) => <span className="font-medium">{v as string}</span> },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    {
      key: "commissionRate", header: "Commission",
      render: (_v, sa) => <Badge color="info" variant="light">{(sa.commissionRate || 0)}%</Badge>,
    },
    {
      key: "partnerType", header: "Type",
      render: (_v, sa) => {
        const colors: Record<string, string> = { bronze: "neutral", silver: "info", gold: "warning", platinum: "primary" };
        return <Badge color={(colors[sa.partnerType] || "neutral") as any} variant="light">{(sa.partnerType || "bronze").charAt(0).toUpperCase() + (sa.partnerType || "bronze").slice(1)}</Badge>;
      },
    },
    {
      key: "isActive", header: "Status",
      render: (_v, sa) => sa.isActive
        ? <Badge color="success" variant="light">Active</Badge>
        : <Badge color="error" variant="light">Inactive</Badge>,
    },
    {
      key: "actions", header: "Actions",
      render: (_, sa) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleIssuePortalToken(sa as SubAgent)} disabled={portalLoading} title="Issue portal access link" className="p-2">
            <CopyIcon className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleDelete(sa as SubAgent)} title="Delete sub-agent" className="p-2 text-red-600">
            <TrashBinIcon className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (!authLoading && !user) return null;

  return (
    <>
      <PageMeta title={`${tr.title} | Travline`} description={tr.description} />
      <PageToolbar
        title={tr.title}
        description={tr.description}
        hideSearch
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
            <PlusIcon className="w-4 h-4" /> {tr.add}
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : subAgents.length === 0 ? (
        <EmptyState title={tr.noSubAgents} description={tr.description} action={{ label: tr.add, onClick: () => setIsModalOpen(true) }} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{subAgents.length}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Active</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{subAgents.filter(s => s.isActive).length}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Avg commission</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {subAgents.length > 0
                  ? (subAgents.reduce((sum, s) => sum + (s.commissionRate || 0), 0) / subAgents.length).toFixed(1)
                  : 0}%
              </div>
            </div>
          </div>
          <DataTable data={subAgents} columns={columns} />
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={closeForm} className="m-4 max-w-md" title={tr.add}>
        <form aria-label={tr.add} className="max-h-[75vh] overflow-y-auto p-6" onSubmit={event=>{event.preventDefault();void handleCreate();}}>
          <fieldset disabled={saving} className="space-y-4">
            <label className="block text-sm">{tr.name}<input required aria-label={tr.name} value={formName} onChange={e=>setFormName(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-800" /></label>
            <label className="block text-sm">{tr.phone}<input type="tel" value={formPhone} onChange={e=>setFormPhone(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-800" /></label>
            <label className="block text-sm">{tr.email}<input type="email" value={formEmail} onChange={e=>setFormEmail(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-800" /></label>
            <label className="block text-sm">{tr.commission}<input required type="number" min="0" max="100" step="0.01" value={formCommission} onChange={e=>setFormCommission(+e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-800" /></label>
            <label className="block text-sm">{tr.partnerType}<select value={formPartnerType} onChange={e=>setFormPartnerType(e.target.value as typeof formPartnerType)} className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 px-3 dark:border-gray-700 dark:bg-gray-800">
              <option value="bronze">{tr.bronze}</option><option value="silver">{tr.silver}</option><option value="gold">{tr.gold}</option><option value="platinum">{tr.platinum}</option>
            </select></label>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={closeForm}>{t.common.cancel}</Button><Button type="submit">{saving?t.common.saving:t.common.create}</Button></div>
          </fieldset>
          {saveError && <p role="alert" className="mt-3 text-sm text-error-600 dark:text-error-400">{saveError}</p>}
        </form>
      </Modal>

      {portalModalAgent && (
        <Modal isOpen={!!portalModalAgent} onClose={closePortal} className="m-4 max-w-lg">
          <div className="max-h-[75vh] space-y-4 overflow-y-auto p-6">
            <h3 className="font-bold text-lg">{tr.portal.title} — {portalModalAgent.name}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {tr.portalDescription}
            </p>
            {portalUrl ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <input aria-label={tr.portalLink} readOnly value={portalUrl} className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-mono dark:bg-gray-900 dark:border-gray-700" />
                    <Button size="sm" variant="primary" onClick={async () => { try { await navigator.clipboard.writeText(portalUrl); showSuccess(tr.copied); } catch { showError(tr.copyError); } }}>{tr.copy}</Button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">{tr.shareLink.replace('{name}',portalModalAgent.name)}</p>
              </div>
            ) : (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {portalModalAgent.portalTokenExpiresAt
                  ? <>{tr.portal.expires}: {new Date(portalModalAgent.portalTokenExpiresAt).toLocaleDateString()}. {tr.replaceLink}</>
                  : tr.noLink}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closePortal}>{t.common.close}</Button>
              {portalModalAgent.portalTokenExpiresAt && (
                <Button variant="outline" className="!text-red-600" onClick={() => handleRevokePortalToken(portalModalAgent)}>{tr.revoke}</Button>
              )}
              <Button variant="primary" onClick={() => handleIssuePortalToken(portalModalAgent)} disabled={!!portalLoading}>{tr.generateLink}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}