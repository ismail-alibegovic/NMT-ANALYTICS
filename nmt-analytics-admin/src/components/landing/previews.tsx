import { useT } from "../../lib/i18n/context";
import { AreaChart, Avatar, Logo, Pill, Surface } from "./primitives";

/* All figures below are illustrative marketing data, never real tenant data. */

const REVENUE = [18, 22, 20, 28, 26, 34, 31, 40, 38, 47, 52, 60];
const PASSENGERS = [12, 14, 13, 19, 22, 21, 27, 30, 29, 36, 41, 46];

function SidebarMock() {
  return (
    <div className="hidden w-11 shrink-0 flex-col items-center gap-3 border-r border-lp-border py-3 sm:flex">
      <Logo className="size-6" />
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`size-5 rounded-md ${i === 0 ? "bg-lp-primary/90" : "bg-gray-100"}`} />
      ))}
    </div>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-xl border border-lp-border bg-white p-2.5 shadow-[0_6px_20px_-12px_rgba(98,88,232,0.35)] lg:p-3.5">
      <div className="text-[9px] font-medium text-lp-muted lg:text-[11px]">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-lp-text lg:text-xl">{value}</div>
      <div className="text-[9px] font-semibold text-emerald-500 lg:text-[11px]">{delta}</div>
    </div>
  );
}

/** Layered hero composition: main dashboard + floating KPI cards. */
export function HeroDashboard() {
  const { t } = useT();
  const l = t.landing;
  const deps: [string, string, "purple" | "amber" | "green", string][] = [
    ["Istanbul", "24 / 40", "purple", l.pvOpen],
    ["Dubrovnik", "38 / 40", "amber", l.pvFull],
    ["Rome", "40 / 40", "green", l.pvConfirmed],
  ];
  return (
    <div className="relative mx-auto w-full max-w-[640px] lg:mx-0 lg:max-w-none lg:-mr-[max(2rem,calc((100vw-1200px)/2+2rem))] ">
      {/* Ghost cards behind the main window for depth */}
      <div aria-hidden="true" className="absolute inset-x-6 -bottom-5 top-10 -z-10 rounded-2xl border border-lp-border bg-white/70 shadow-[0_12px_40px_-12px_rgba(98,88,232,0.15)]" />
      <div aria-hidden="true" className="absolute inset-x-12 -bottom-9 top-16 -z-20 rounded-2xl border border-lp-border bg-white/50" />
      <Surface className="relative overflow-hidden">
        <div className="flex">
          <SidebarMock />
          <div className="min-w-0 flex-1">
            {/* Accent header band */}
            <div className="bg-gradient-to-br from-lp-primary to-[#7b72f0] px-3 pb-8 pt-3 text-white sm:px-5 sm:pt-4 lg:px-7 lg:pb-12 lg:pt-5">
              <div className="flex items-center justify-between text-[10px] font-medium text-white/80">
                <span className="font-bold text-white">{l.pvDashboard}</span>
                <span className="size-4 rounded-full bg-white/25" />
              </div>
              <div className="mt-3 text-[10px] text-white/70 lg:mt-5 lg:text-xs">{l.pvRevenue}</div>
              <div className="text-xl font-bold tabular-nums sm:text-2xl lg:text-3xl">€128,450.38</div>
            </div>
            <div className="-mt-5 space-y-3 px-3 pb-3 sm:px-5 sm:pb-5 lg:-mt-8 lg:space-y-3 lg:px-7 lg:pb-6">
              <div className="grid grid-cols-3 gap-2">
                <Kpi label={l.pvRevenue} value="€128,450" delta="+12.4%" />
                <Kpi label={l.pvBookings} value="342" delta="+8.1%" />
                <Kpi label={l.pvPassengers} value="1,286" delta="+15.3%" />
              </div>
              <div className="rounded-xl border border-lp-border bg-white p-3 lg:p-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-lp-text lg:text-xs">{l.pvRevenueOverview}</span>
                  <span className="text-[9px] text-lp-muted lg:text-[11px]">2026</span>
                </div>
                <div className="h-24 sm:h-32 lg:h-36">
                  <AreaChart values={REVENUE} second={PASSENGERS} height={130} id="hero" />
                </div>
              </div>
              <div className="rounded-xl border border-lp-border bg-white p-3">
                <div className="mb-1 text-[10px] font-semibold text-lp-text lg:mb-2 lg:text-xs">{l.pvDepartures}</div>
                {deps.map(([name, seats, tone, label]) => (
                  <div key={name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-lp-border py-1.5 first:border-t-0 lg:py-2">
                    <span className="text-[10px] font-medium text-lp-text lg:text-xs">{name}</span>
                    <span className="text-[10px] tabular-nums text-lp-muted lg:text-xs">{seats}</span>
                    <span className="w-20 text-right"><Pill tone={tone}>{label}</Pill></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Surface>

      {/* Floating cards sit on the edges so they never hide table data */}
      <Surface className="lp-float absolute bottom-24 hidden w-40 p-3 xl:-left-28 xl:block [--lp-delay:0ms]">
        <div className="text-[9px] font-medium text-lp-muted">{l.pvPayments}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-base font-bold tabular-nums text-lp-text">€48,200</span>
          <Pill tone="green">{l.pvPaid}</Pill>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-[72%] rounded-full bg-lp-primary" />
        </div>
      </Surface>
      <Surface className="lp-float absolute -bottom-[84px] right-16 hidden w-44 p-3 xl:block [--lp-delay:2.6s]">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-medium text-lp-muted">{l.pvBookings}</span>
          <Pill tone="green">+18</Pill>
        </div>
        <div className="mt-1 text-base font-bold tabular-nums text-lp-text">342</div>
        <div className="mt-2 flex h-8 items-end gap-1">
          {[40, 55, 35, 70, 60, 85, 100].map((h, i) => (
            <span key={i} className="flex-1 rounded-sm bg-lp-primary" style={{ height: `${h}%`, opacity: 0.35 + i * 0.1 }} />
          ))}
        </div>
      </Surface>
      <Surface className="lp-float absolute -top-6 right-6 hidden w-44 p-3 sm:block lg:right-16 [--lp-delay:1.4s]">
        <div className="text-[9px] font-medium text-lp-muted">{l.pvPassengerGrowth}</div>
        <div className="mt-1 text-base font-bold tabular-nums text-lp-text">+246</div>
        <div className="mt-1 h-10">
          <AreaChart values={PASSENGERS} height={40} id="hero2" />
        </div>
      </Surface>
    </div>
  );
}

const ROWS: [string, string, string, "green" | "amber" | "purple", number][] = [
  ["Amra H.", "TL-1042", "€1,240", "green", 0],
  ["Lejla K.", "TL-1043", "€890", "amber", 1],
  ["Tarik M.", "TL-1044", "€2,150", "green", 2],
  ["Sara D.", "TL-1045", "€640", "purple", 3],
];

export function BookingPreview() {
  const { t } = useT();
  const l = t.landing;
  const label = { green: l.pvConfirmed, amber: l.pvOnHold, purple: l.pvPending } as const;
  return (
    <Surface className="p-4">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-1 pb-2 text-[9px] font-semibold uppercase tracking-wide text-lp-muted">
        <span>{l.pvCustomer}</span>
        <span>{l.pvStatus}</span>
        <span className="text-right">{l.pvAmount}</span>
      </div>
      {ROWS.map(([name, ref, amount, tone, i]) => (
        <div key={ref} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-t border-lp-border px-1 py-2">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={name} tone={i} />
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold text-lp-text">{name}</span>
              <span className="block text-[9px] text-lp-muted">{ref}</span>
            </span>
          </span>
          <Pill tone={tone}>{label[tone]}</Pill>
          <span className="text-right text-[11px] font-semibold tabular-nums text-lp-text">{amount}</span>
        </div>
      ))}
    </Surface>
  );
}

export function PassengerPreview() {
  const { t } = useT();
  const l = t.landing;
  return (
    <Surface className="grid grid-cols-[1fr_1.2fr] gap-3 p-4">
      <div className="space-y-2">
        {["Amra H.", "Lejla K.", "Tarik M.", "Sara D."].map((n, i) => (
          <div key={n} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${i === 0 ? "border-lp-primary/30 bg-lp-soft" : "border-lp-border"}`}>
            <Avatar name={n} tone={i} />
            <span className="truncate text-[10px] font-semibold text-lp-text">{n}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-lp-border p-3">
        <div className="flex items-center gap-2">
          <Avatar name="Amra H." />
          <div>
            <div className="text-[11px] font-bold text-lp-text">Amra H.</div>
            <div className="text-[9px] text-lp-muted">{l.pvGroup} A</div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-[9px] text-lp-muted">
          <div className="flex justify-between"><span>{l.pvDocsReady}</span><Pill tone="green">✓</Pill></div>
          <div className="flex justify-between"><span>{l.pvRoomShared}</span><span className="font-semibold text-lp-text">204</span></div>
          <div className="flex justify-between"><span>{l.pvDeparture}</span><span className="font-semibold text-lp-text">Istanbul</span></div>
        </div>
      </div>
    </Surface>
  );
}

export function DeparturePreview() {
  const { t } = useT();
  const l = t.landing;
  const items: [string, string, number, "purple" | "amber" | "green"][] = [
    ["Istanbul", "12.03.", 60, "purple"],
    ["Dubrovnik", "28.03.", 95, "amber"],
    ["Rome", "04.04.", 100, "green"],
  ];
  const label = { purple: l.pvOpen, amber: l.pvFull, green: l.pvConfirmed };
  return (
    <Surface className="p-4">
      {items.map(([name, date, fill, tone]) => (
        <div key={name} className="border-t border-lp-border py-2.5 first:border-t-0 first:pt-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-lp-text">{name}</div>
              <div className="text-[9px] text-lp-muted">{date}</div>
            </div>
            <Pill tone={tone}>{label[tone]}</Pill>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-lp-primary" style={{ width: `${fill}%` }} />
            </div>
            <span className="text-[9px] tabular-nums text-lp-muted">{Math.round((fill / 100) * 40)}/40 {l.pvSeats}</span>
          </div>
        </div>
      ))}
    </Surface>
  );
}

export function PaymentsPreview() {
  const { t } = useT();
  const l = t.landing;
  return (
    <Surface className="p-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-lp-soft p-2.5">
          <div className="text-[9px] text-lp-muted">{l.pvCollected}</div>
          <div className="text-sm font-bold tabular-nums text-lp-text">€82,400</div>
        </div>
        <div className="rounded-xl bg-gray-50 p-2.5">
          <div className="text-[9px] text-lp-muted">{l.pvOutstanding}</div>
          <div className="text-sm font-bold tabular-nums text-lp-text">€19,150</div>
        </div>
      </div>
      <div className="mt-3 h-16"><AreaChart values={REVENUE} height={64} id="pay" /></div>
      {[
        ["1 / 3", "€420", "green", l.pvPaid],
        ["2 / 3", "€420", "amber", l.pvPending],
        ["3 / 3", "€420", "red", l.pvOverdue],
      ].map(([n, amt, tone, label]) => (
        <div key={n} className="flex items-center justify-between border-t border-lp-border py-1.5 text-[10px]">
          <span className="text-lp-muted">{l.pvInstallment} {n}</span>
          <span className="font-semibold tabular-nums text-lp-text">{amt}</span>
          <Pill tone={tone as "green" | "amber" | "red"}>{label}</Pill>
        </div>
      ))}
    </Surface>
  );
}

export function CommunicationPreview() {
  const { t } = useT();
  const l = t.landing;
  return (
    <Surface className="p-5">
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <Avatar name="Amra H." />
          <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-gray-100 px-3 py-2 text-[11px] text-lp-text">
            {l.pvMessage} · TL-1042
            <div className="mt-1 h-1.5 w-32 rounded bg-gray-200" />
            <div className="mt-1 h-1.5 w-20 rounded bg-gray-200" />
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-lp-primary px-3 py-2 text-[11px] text-white">
            <div className="h-1.5 w-36 rounded bg-white/50" />
            <div className="mt-1 h-1.5 w-24 rounded bg-white/50" />
          </div>
        </div>
        <div className="rounded-xl border border-lp-border p-3">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-lp-muted">{l.pvNotes}</div>
          <div className="mt-2 h-1.5 w-full rounded bg-gray-100" />
          <div className="mt-1.5 h-1.5 w-2/3 rounded bg-gray-100" />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-lp-border px-3 py-2">
          <span className="flex-1 text-[10px] text-lp-muted">{l.pvReplyPlaceholder}</span>
          <span className="rounded-md bg-lp-primary px-2 py-1 text-[9px] font-semibold text-white">↑</span>
        </div>
      </div>
    </Surface>
  );
}

export function RevenuePreview() {
  const { t } = useT();
  const l = t.landing;
  return (
    <Surface className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium text-lp-muted">{l.pvRevenueOverview}</div>
          <div className="text-2xl font-bold tabular-nums text-lp-text">€128,450</div>
        </div>
        <Pill tone="green">+12.4%</Pill>
      </div>
      <div className="mt-3 h-36"><AreaChart values={REVENUE} second={PASSENGERS} height={140} id="rev" /></div>
      <div className="mt-2 flex justify-between text-[9px] text-lp-muted">
        {["01", "03", "05", "07", "09", "11"].map((m) => <span key={m}>{m}</span>)}
      </div>
    </Surface>
  );
}

export function OperationsPreview() {
  const { t } = useT();
  const l = t.landing;
  return (
    <Surface className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-lp-text">Istanbul · 12.03.</div>
        <Pill tone="purple">{l.pvOpen}</Pill>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} className={`h-6 rounded-md ${i % 5 === 3 ? "bg-gray-100" : i % 3 === 0 ? "bg-lp-primary" : "bg-lp-primary/25"}`} />
        ))}
      </div>
      <div className="mt-3">
        {ROWS.slice(0, 3).map(([name, , , , i]) => (
          <div key={name} className="flex items-center justify-between border-t border-lp-border py-1.5">
            <span className="flex items-center gap-2"><Avatar name={name} tone={i} /><span className="text-[10px] font-semibold text-lp-text">{name}</span></span>
            <span className="text-[9px] text-lp-muted">{l.pvGroup} {i % 2 ? "B" : "A"}</span>
          </div>
        ))}
      </div>
    </Surface>
  );
}

/* Minimal benefit illustrations */
export function BenefitArt({ kind }: { kind: 0 | 1 | 2 }) {
  return (
    <div aria-hidden="true" className="flex h-36 items-center justify-center rounded-2xl bg-lp-soft">
      {kind === 0 && (
        <div className="w-40 space-y-2 rounded-xl border border-lp-border bg-white p-3 shadow-sm">
          {[80, 60, 70].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`size-3 rounded-full ${i < 2 ? "bg-lp-primary" : "border border-lp-primary/40"}`} />
              <span className="h-1.5 rounded bg-gray-200" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      )}
      {kind === 1 && (
        <svg viewBox="0 0 160 100" className="w-40" fill="none">
          <path d="M40 30 80 50 120 30M80 50v30" stroke="#6258E8" strokeOpacity=".4" strokeWidth="1.5" />
          {[[40, 30], [120, 30], [80, 80]].map(([x, y]) => (
            <rect key={`${x}${y}`} x={x - 16} y={y - 11} width="32" height="22" rx="6" fill="#fff" stroke="#ECECF2" />
          ))}
          <circle cx="80" cy="50" r="9" fill="#6258E8" />
        </svg>
      )}
      {kind === 2 && (
        <div className="h-20 w-40 rounded-xl border border-lp-border bg-white p-2 shadow-sm">
          <AreaChart values={[10, 14, 13, 20, 24, 33]} height={64} id="ben" />
        </div>
      )}
    </div>
  );
}
