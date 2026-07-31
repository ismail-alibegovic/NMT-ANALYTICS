import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../context/ToastContext";
import { useQueryParams } from "../../hooks/useQueryParams";
import { useT } from "../../lib/i18n/context";
import { getCalendarMonth, CalendarDeparture } from "../../api/calendar";

const WEEKDAYS_BS = ["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"];
const MONTHS_BS = ["Januar","Februar","Mart","April","Maj","Juni","Juli","August","Septembar","Oktobar","Novembar","Decembar"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmtMonth(year: number, month: number) { return `${year}-${pad(month + 1)}`; }
function fmtDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("bs-BA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function capacityClass(ev: CalendarDeparture) {
  const ratio = ev.capacity > 0 ? ev.available / ev.capacity : 1;
  if (ratio <= 0.1) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-300 dark:border-red-700";
  if (ratio <= 0.5) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700";
}

export default function Calendar() {
  const { error: showError } = useToast();
  const { getParam, setParams } = useQueryParams();
  const { t } = useT();
  const tr = t.operations.calendar;

  const today = new Date();
  const initial = getParam("m", "") || fmtMonth(today.getFullYear(), today.getMonth());
  const [year, month] = initial.split("-").map((v, i) => (i === 0 ? parseInt(v) : parseInt(v) - 1));

  const [cursor, setCursor] = useState({ year, month });
  const [events, setEvents] = useState<CalendarDeparture[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMonth = (y: number, m: number) => {
    setLoading(true);
    getCalendarMonth(fmtMonth(y, m))
      .then((res) => setEvents(res.events || []))
      .catch((err) => {
        console.error("Calendar fetch failed:", err);
        showError("Greška pri učitavanju kalendara");
        setEvents([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMonth(cursor.year, cursor.month);
    setParams({ m: fmtMonth(cursor.year, cursor.month) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const grid = useMemo(() => {
    const firstDay = new Date(cursor.year, cursor.month, 1);
    const lastDay = new Date(cursor.year, cursor.month + 1, 0);
    // Monday-first offset (JS Sunday=0..Saturday=6, convert to Mon=0..Sun=6)
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push({ date: new Date(cursor.year, cursor.month, d) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarDeparture[]>();
    for (const ev of events) {
      const key = fmtDate(ev.departAt);
      const arr = map.get(key) || [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const move = (delta: number) => {
    let y = cursor.year;
    let m = cursor.month + delta;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setCursor({ year: y, month: m });
  };

  const isToday = (d: Date | null) => {
    if (!d) return false;
    return d.toDateString() === today.toDateString();
  };

  return (
    <>
      <PageMeta title={tr.title} description={tr.description} />
      <PageToolbar
        title={tr.title}
        description={tr.description}
        hideSearch
        actions={
          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
            <Button variant="outline" onClick={() => move(-1)} title={tr.today} className="!px-3 !py-1.5 !rounded-md border-0">‹</Button>
            <Button variant="outline" onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })} className="!px-4 !py-1.5 !rounded-md border-0 text-sm font-medium">{tr.today}</Button>
            <Button variant="outline" onClick={() => move(1)} title={tr.today} className="!px-3 !py-1.5 !rounded-md border-0">›</Button>
          </div>
        }
      />

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-900/50"></span>
          <span>Slobodno</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-amber-200 dark:bg-amber-900/50"></span>
          <span>{"<"}50% slobodno</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-red-200 dark:bg-red-900/50"></span>
          <span>Popunjeno</span>
        </span>
      </div>

      <div className="min-h-[60vh] rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {MONTHS_BS[cursor.month]} {cursor.year}
          </h2>
          {!loading && events.length === 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">{tr.noDepartures}</span>
          )}
        </div>

        <div className="grid grid-cols-7 gap-2 text-center">
          {WEEKDAYS_BS.map((wd) => (
            <div key={wd} className="py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {wd}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {grid.map((cell, idx) => {
            const dateStr = cell.date ? fmtDate(cell.date) : "";
            const dayEvents = cell.date ? eventsByDay.get(dateStr) || [] : [];
            return (
              <div
                key={idx}
                className={`min-h-[120px] rounded-lg border p-2 ${cell.date ? (isToday(cell.date) ? "border-brand-500 bg-brand-50/30 dark:bg-brand-900/20" : "border-gray-200 dark:border-gray-800") : "border-transparent"}`}
              >
                {cell.date && (
                  <>
                    <div className={`mb-1.5 inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${isToday(cell.date) ? "bg-brand-500 text-white" : "text-gray-700 dark:text-gray-300"}`}>
                      {cell.date.getDate()}
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {dayEvents.slice(0, 4).map((ev) => (
                        <Link
                          key={ev.id}
                          to={`/reservations?departure=${ev.id}`}
                          title={`${ev.packageName ?? "—"} · ${tr.booked}: ${ev.booked}/${ev.capacity} · ${tr.clickForDetails}`}
                          className={`block truncate rounded border px-1.5 py-1 text-[11px] font-medium ${capacityClass(ev)}`}
                        >
                          <span className="block truncate">{ev.packageName ?? "—"}</span>
                          <span className="block text-[10px] opacity-80">{ev.booked}/{ev.capacity}</span>
                        </Link>
                      ))}
                      {dayEvents.length > 4 && (
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                          +{dayEvents.length - 4}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {!loading && events.length === 0 && (
          <div className="mt-6">
            <EmptyState title={tr.noDepartures} description="" />
          </div>
        )}
      </div>
    </>
  );
}
