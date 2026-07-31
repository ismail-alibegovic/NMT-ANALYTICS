import { useState, useEffect, useCallback } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageShell from "../../components/common/PageShell";
import api from "../../lib/apiClient";
import { useT } from "../../lib/i18n/context";
import { useToast } from "../../context/ToastContext";

interface WaiverTemplate {
  id: string;
  title: string;
  body_text: string;
  is_active: boolean;
  created_at: string;
}

interface WaiverRecord {
  id: string;
  passenger_id: string | null;
  passenger_name_snapshot: string;
  template_title: string;
  sign_url: string;
  status: "pending" | "signed" | "expired" | "revoked";
  created_at: string;
  signed_at: string | null;
  expires_at: string | null;
}

interface DepartureInfo {
  id: string;
  depart_at: string;
  package_name: string;
  destination: string;
  passenger_count: number;
  passengers: { passengerId: string | null; fullName: string; hasWaiver: boolean }[];
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("bs-BA", { dateStyle: "short", timeStyle: "short" });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Na čekanju", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  signed:  { label: "Potpisano",  cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  expired: { label: "Isteklo",    cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
  revoked: { label: "Povučeno",   cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

export default function WaiversPage() {
  const { } = useT();
  const { error: showError, success: showSuccess } = useToast();

  const [templates, setTemplates] = useState<WaiverTemplate[]>([]);
  const [waivers, setWaivers] = useState<WaiverRecord[]>([]);
  const [departures, setDepartures] = useState<DepartureInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"templates" | "issue" | "status">("templates");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WaiverTemplate | null>(null);

  // Template form state
  const [tplTitle, setTplTitle] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplActive, setTplActive] = useState(true);
  const [tplSaving, setTplSaving] = useState(false);

  // Issue form state
  const [selectedDeparture, setSelectedDeparture] = useState<string>("");
  const [selectedPassenger, setSelectedPassenger] = useState<string>("");
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplsRes, wvRes, depsRes] = await Promise.all([
        api.get("/waivers/templates"),
        api.get("/waivers").catch(() => ({ data: [] })),
        api.get("/departures?limit=50").catch(() => ({ data: { data: [] } })),
      ]);
      setTemplates(tplsRes.data || []);
      setWaivers(wvRes.data || []);
      const depsData = depsRes.data?.data || depsRes.data || [];
      setDepartures(Array.isArray(depsData) ? depsData : []);
    } catch (e: any) {
      showError(e?.message || "Greška pri učitavanju.");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  // Reset passenger selection when departure changes
  useEffect(() => { setSelectedPassenger(""); }, [selectedDeparture]);

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTplTitle("");
    setTplBody("");
    setTplActive(true);
    setShowTemplateModal(true);
  };

  const openEditTemplate = (t: WaiverTemplate) => {
    setEditingTemplate(t);
    setTplTitle(t.title);
    setTplBody(t.body_text);
    setTplActive(t.is_active);
    setShowTemplateModal(true);
  };

  const saveTemplate = async () => {
    if (!tplTitle.trim() || !tplBody.trim()) return;
    setTplSaving(true);
    try {
      if (editingTemplate) {
        await api.patch(`/waivers/templates/${editingTemplate.id}`, {
          title: tplTitle.trim(),
          body_text: tplBody.trim(),
          is_active: tplActive,
        });
        showSuccess("Template ažuriran.");
      } else {
        await api.post("/waivers/templates", {
          title: tplTitle.trim(),
          body_text: tplBody.trim(),
          is_active: tplActive,
        });
        showSuccess("Template kreiran.");
      }
      setShowTemplateModal(false);
      load();
    } catch (e: any) {
      showError(e?.message || "Greška pri snimanju.");
    } finally {
      setTplSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Obrisati template?")) return;
    try {
      await api.delete(`/waivers/templates/${id}`);
      showSuccess("Template obrisan.");
      load();
    } catch (e: any) {
      showError(e?.message || "Greška pri brisanju.");
    }
  };

  const issueWaiver = async () => {
    if (!selectedPassenger) return;
    setIssuing(true);
    setIssuedLink(null);
    try {
      const { data } = await api.post("/waivers/issue", { passenger_id: selectedPassenger });
      const fullUrl = `${window.location.origin}/waiver/${data.sign_url.split("/").pop()}`;
      setIssuedLink(fullUrl);
      showSuccess("Waiver link generisan.");
      load();
    } catch (e: any) {
      showError(e?.message || "Greška pri issuing.");
    } finally {
      setIssuing(false);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    showSuccess("Link kopiran.");
  };

  const revokeWaiver = async (id: string) => {
    if (!confirm("Povući waiver link?")) return;
    try {
      await api.post(`/waivers/${id}/revoke`);
      showSuccess("Waiver povučen.");
      load();
    } catch (e: any) {
      showError(e?.message || "Greška.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const selectedDep = departures.find((d) => d.id === selectedDeparture);

  return (
    <>
      <PageMeta title="Waivers | Travline" description="Digitalni pristanak putnika" />
      <PageShell title="Waivers" subtitle="Digitalni pristanak putnika">

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
          {[
            { key: "templates", label: "Templatei" },
            { key: "issue", label: "Izdaj link" },
            { key: "status", label: `Status (${waivers.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TEMPLATES TAB */}
        {activeTab === "templates" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Template konstrukti — jedan po orgu.</p>
              <button
                onClick={openNewTemplate}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
              >
                + Novi template
              </button>
            </div>
            {templates.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Nema templatea.</div>
            ) : (
              <div className="space-y-3">
                {templates.map((t) => (
                  <div key={t.id} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">{t.title}</h3>
                          {!t.is_active && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                              Neaktivan
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{t.body_text}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => openEditTemplate(t)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">Uredi</button>
                        <button onClick={() => deleteTemplate(t.id)} className="text-xs px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100">Obriši</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ISSUE TAB */}
        {activeTab === "issue" && (
          <div className="max-w-xl">
            <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-6 space-y-4">
              {/* Step 1: Select departure */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">1. Polazak</label>
                <select
                  value={selectedDeparture}
                  onChange={(e) => setSelectedDeparture(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">— Odaberi polazak —</option>
                  {departures.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.package_name} — {d.destination} ({fmtDate(d.depart_at)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Select passenger */}
              {selectedDep && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">2. Putnik</label>
                  <select
                    value={selectedPassenger}
                    onChange={(e) => setSelectedPassenger(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">— Odaberi putnika —</option>
                    {selectedDep.passengers?.map((p) => (
                      <option key={p.passengerId || p.fullName} value={p.passengerId || ""} disabled={!p.passengerId}>
                        {p.fullName} {p.hasWaiver ? "✓" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Step 3: Issue */}
              <button
                onClick={issueWaiver}
                disabled={!selectedPassenger || issuing}
                className="w-full px-4 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {issuing ? "Generišem..." : "Generiši waiver link"}
              </button>

              {/* Issued link */}
              {issuedLink && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">Link za slanje putniku:</div>
                  <div className="flex gap-2 items-center">
                    <input
                      readOnly
                      value={issuedLink}
                      className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded font-mono text-gray-700 dark:text-gray-300"
                    />
                    <button
                      onClick={() => copyLink(issuedLink)}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Kopiraj
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STATUS TAB */}
        {activeTab === "status" && (
          <div>
            {waivers.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Nema izdatih waivera.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      <th className="py-2 pr-4">Putnik</th>
                      <th className="py-2 pr-4">Template</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Izdato</th>
                      <th className="py-2 pr-4">Potpisano</th>
                      <th className="py-2 pr-4">Link</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {waivers.map((w) => {
                      const badge = STATUS_BADGE[w.status] || STATUS_BADGE.pending;
                      return (
                        <tr key={w.id} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white">{w.passenger_name_snapshot}</td>
                          <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">{w.template_title}</td>
                          <td className="py-2 pr-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-xs text-gray-500 dark:text-gray-400">{fmtDate(w.created_at)}</td>
                          <td className="py-2 pr-4 text-xs text-gray-500 dark:text-gray-400">{fmtDate(w.signed_at)}</td>
                          <td className="py-2 pr-4">
                            {w.status === "pending" ? (
                              <button
                                onClick={() => copyLink(`${window.location.origin}/waiver/${w.sign_url.split("/").pop()}`)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Kopiraj
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="py-2">
                            {w.status === "pending" && (
                              <button
                                onClick={() => revokeWaiver(w.id)}
                                className="text-xs text-rose-500 hover:text-rose-600"
                              >
                                Povuci
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </PageShell>

      {/* Template modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {editingTemplate ? "Uredi template" : "Novi template"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Naslov</label>
                <input
                  type="text"
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  placeholder="npr. Pristanak za izlet"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tekst</label>
                <textarea
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  rows={10}
                  placeholder="Unesite tekst waivera koji putnik potpisuje..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Plain tekst — {tplBody.length} znakova.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={tplActive}
                  onChange={(e) => setTplActive(e.target.checked)}
                  className="size-4 rounded border-gray-300 text-primary"
                />
                Aktivan
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Otkaži
              </button>
              <button
                onClick={saveTemplate}
                disabled={tplSaving || !tplTitle.trim() || !tplBody.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40"
              >
                {tplSaving ? "Snimam..." : "Sačuvaj"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
