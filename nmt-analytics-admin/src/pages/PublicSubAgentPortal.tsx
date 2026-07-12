import { useState, useEffect } from "react";
import PageMeta from "../components/common/PageMeta";

interface PortalSale {
  id: string;
  reservationId: string;
  customerName: string | null;
  totalAmount: number;
  commissionAmount: number;
  status: string;
  departureLabel: string | null;
  createdAt: string;
  documents: { type: string; url: string }[];
}

interface PortalData {
  status: "valid" | "expired" | "revoked" | "not_found";
  agentName: string | null;
  orgName: string | null;
  partnerType: string | null;
  commissionRate: number;
  lastSeenAt: string | null;
  expiresAt: string | null;
  sales: PortalSale[];
  totals: { count: number; commission: number; revenue: number };
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString("bs-BA", { dateStyle: "medium", timeStyle: "short" });
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("bs-BA", { style: "currency", currency: "BAM" }).format(n || 0);
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  valid:     { label: "Aktivan",    color: "emerald" },
  expired:   { label: "Istekao",     color: "amber"   },
  revoked:   { label: "Povučen",     color: "rose"    },
  not_found: { label: "Nepoznat",    color: "slate"   },
};

const PARTNER_LABELS: Record<string, string> = {
  bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum",
};

export default function PublicSubAgentPortal() {
  const token = window.location.pathname.split("/").pop() || "";
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const api = (await import("../lib/apiClient")).default;
        const res = await api.get(`/portal/subagent/${token}`);
        setData(res.data);
      } catch (e: any) {
        const msg = e?.response?.data?.message;
        if (msg === "Portal token expired" || e?.response?.status === 410) {
          setData({ status: "expired", agentName: null, orgName: null, partnerType: null, commissionRate: 0, lastSeenAt: null, expiresAt: null, sales: [], totals: { count: 0, commission: 0, revenue: 0 } });
        } else {
          setError(msg || "Nije moguće učitati portal.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-gray-700 dark:border-t-white" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Greška</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">{error || "Nepoznata greška."}</p>
        </div>
      </div>
    );
  }

  const sm = STATUS_META[data.status] || STATUS_META.not_found;

  return (
    <>
      <PageMeta title="Portal subagenta | Travline" description="Pregled vaših prodaja i provizija" />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Travline · Sub-agent portal</p>
                <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{data.agentName || "Sub-agent"}</h1>
                {data.orgName && <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{data.orgName}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`inline-flex items-center rounded-full bg-${sm.color}-50 px-3 py-1 text-xs font-semibold text-${sm.color}-700 dark:bg-${sm.color}-950 dark:text-${sm.color}-300`}>{sm.label}</span>
                {data.partnerType && <span className="text-sm text-gray-600 dark:text-gray-400">Tier: <span className="font-medium">{PARTNER_LABELS[data.partnerType] || data.partnerType}</span></span>}
              </div>
            </div>
          </div>
        </header>

        {data.status !== "valid" && (
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950">
              <p className="text-lg font-semibold text-amber-900 dark:text-amber-100">Portal link je {sm.label.toLowerCase()}</p>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">Kontaktirajte agenciju za novi link.</p>
            </div>
          </div>
        )}

        {data.status === "valid" && (
          <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Ukupno prodaja</p>
                <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{data.totals.count}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Vaša provizija</p>
                <p className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-400">{fmtCurrency(data.totals.commission)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Ostvareni promet</p>
                <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{fmtCurrency(data.totals.revenue)}</p>
              </div>
            </div>

            {/* Commission rate + expiry */}
            <div className="mt-6 flex flex-wrap gap-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-800">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Vaša provizijska stopa</p>
                <p className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-white">{data.commissionRate}%</p>
              </div>
              {data.expiresAt && (
                <div className="ml-auto">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Link ističe</p>
                  <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">{fmtDate(data.expiresAt)}</p>
                </div>
              )}
            </div>

            {/* Sales table */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Prodaje</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800">
                {data.sales.length === 0 ? (
                  <p className="px-5 py-12 text-center text-gray-500 dark:text-gray-400">Nema registrovanih prodaja.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
                        <tr>
                          <th className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Klijent</th>
                          <th className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Polazak</th>
                          <th className="px-5 py-3 text-right font-medium text-gray-500 dark:text-gray-400">Iznos</th>
                          <th className="px-5 py-3 text-right font-medium text-gray-500 dark:text-gray-400">Provizija</th>
                          <th className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Status</th>
                          <th className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Dokumenti</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {data.sales.map((s) => (
                          <tr key={s.id}>
                            <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{s.customerName || "Klijent"}</td>
                            <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{s.departureLabel || "—"}</td>
                            <td className="px-5 py-3 text-right font-mono text-gray-900 dark:text-white">{fmtCurrency(s.totalAmount)}</td>
                            <td className="px-5 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">{fmtCurrency(s.commissionAmount)}</td>
                            <td className="px-5 py-3">
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">{s.status}</span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {s.documents.map((d) => (
                                  <a key={d.type + d.url} href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700">
                                    {d.type === "najava" ? "Najava" : d.type === "ugovor" ? "Ugovor" : d.type === "faktura" ? "Faktura" : d.type}
                                  </a>
                                ))}
                                {s.documents.length === 0 && <span className="text-xs text-gray-400">—</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {data.lastSeenAt && (
              <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">Posljednji pristup: {fmtDate(data.lastSeenAt)}</p>
            )}
          </main>
        )}
      </div>
    </>
  );
}
