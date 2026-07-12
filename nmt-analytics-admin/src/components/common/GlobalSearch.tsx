import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { getCustomers } from "../../api/customers";
import { getReservations } from "../../api/reservations";
import { getPackages } from "../../api/packages";
import { getDepartures } from "../../api/departures";
import { getContracts } from "../../api/contracts";
import { useT } from "../../lib/i18n/context";

type SearchCategory = "customer" | "reservation" | "package" | "departure" | "contract";

type SearchResult = {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  href: string;
};

const CATEGORY_CONFIG: Record<SearchCategory, { icon: string; color: string }> = {
  customer: { icon: "👤", color: "text-blue-600 dark:text-blue-400" },
  reservation: { icon: "🎫", color: "text-emerald-600 dark:text-emerald-400" },
  package: { icon: "📦", color: "text-amber-600 dark:text-amber-400" },
  departure: { icon: "🚌", color: "text-indigo-600 dark:text-indigo-400" },
  contract: { icon: "📄", color: "text-rose-600 dark:text-rose-400" },
};

export default function GlobalSearch({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results[activeIndex]) {
        e.preventDefault();
        navigate(results[activeIndex].href);
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, results, activeIndex, navigate, onClose]);

  const search = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const [customersRes, reservationsRes, packagesRes, departuresRes, contractsRes] =
          await Promise.allSettled([
            getCustomers({ search: q, limit: 5 }),
            getReservations({ search: q, limit: 5 }),
            getPackages({ search: q, limit: 5 }),
            getDepartures({ search: q, limit: 5 }),
            getContracts({ search: q, limit: 5 }),
          ]);

        const allResults: SearchResult[] = [];

        if (customersRes.status === "fulfilled") {
          for (const c of customersRes.value.data) {
            allResults.push({
              id: c.id,
              category: "customer",
              title: c.full_name,
              subtitle: c.email || c.phone || "",
              href: `/customers/${c.id}`,
            });
          }
        }

        if (reservationsRes.status === "fulfilled") {
          for (const r of reservationsRes.value.data) {
            const bal = r.balanceDue > 0 ? ` · ${r.balanceDue} ${r.currency}` : "";
            allResults.push({
              id: r.id,
              category: "reservation",
              title: `${r.customerName} — ${r.packageName}`,
              subtitle: `${r.departureName} · ${r.status}${bal}`,
              href: `/reservations`,
            });
          }
        }

        if (packagesRes.status === "fulfilled") {
          for (const p of packagesRes.value.data) {
            allResults.push({
              id: p.id,
              category: "package",
              title: p.name,
              subtitle: `${p.destination} · ${p.price} ${p.currency}`,
              href: `/packages`,
            });
          }
        }

        if (departuresRes.status === "fulfilled") {
          for (const d of departuresRes.value.data) {
            const date = d.depart_at ? new Date(d.depart_at).toLocaleDateString() : "";
            allResults.push({
              id: d.id,
              category: "departure",
              title: d.packageName || d.destination || "Departure",
              subtitle: `${date} · ${d.booked}/${d.capacity}`,
              href: `/departures/${d.id}`,
            });
          }
        }

        if (contractsRes.status === "fulfilled") {
          for (const c of contractsRes.value.data) {
            allResults.push({
              id: c.id,
              category: "contract",
              title: `${c.contractNumber} — ${c.travelerName}`,
              subtitle: `${c.status} · ${new Date(c.contractDate).toLocaleDateString()}`,
              href: "/operations/contracts",
            });
          }
        }

        setResults(allResults.slice(0, 20));
        setActiveIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(() => search(query), 250);
    } else {
      setResults([]);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-200 dark:border-gray-700">
          <svg className="size-5 text-gray-400 shrink-0" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path fillRule="evenodd" clipRule="evenodd" d="M3.04 9.37C3.04 5.88 5.88 3.04 9.38 3.04C12.87 3.04 15.71 5.88 15.71 9.37C15.71 12.87 12.87 15.71 9.38 15.71C5.88 15.71 3.04 12.87 3.04 9.37ZM9.38 1.54C5.05 1.54 1.54 5.05 1.54 9.37C1.54 13.7 5.05 17.21 9.38 17.21C11.27 17.21 13 16.53 14.36 15.42L17.18 18.24C17.47 18.53 17.95 18.53 18.24 18.24C18.53 17.95 18.53 17.47 18.24 17.18L15.42 14.36C16.54 13 17.21 11.27 17.21 9.37C17.21 5.05 13.7 1.54 9.38 1.54Z" fill="currentColor" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.common?.search || "Search"}
            className="flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-white dark:placeholder:text-gray-500"
          />
          {loading && (
            <div className="size-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300" />
          )}
          <button
            onClick={onClose}
            className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            ESC
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              {t.common?.search || "Search"} — {t.nav?.customers}, {t.nav?.reservations}, {t.nav?.packages}, {t.nav?.departures}, {t.nav?.contracts}
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              No results for "{query}"
            </div>
          ) : results.length === 0 && loading ? null : (
            <ul className="py-2">
              {results.map((item, index) => {
                const cfg = CATEGORY_CONFIG[item.category];
                return (
                  <li key={`${item.category}-${item.id}`}>
                    <button
                      onClick={() => {
                        navigate(item.href);
                        onClose();
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        activeIndex === index
                          ? "bg-gray-100 dark:bg-gray-800"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      }`}
                    >
                      <span className="text-lg shrink-0">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {item.subtitle}
                        </p>
                      </div>
                      <span className={`text-xs font-medium uppercase shrink-0 ${cfg.color}`}>
                        {item.category}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">ESC</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
