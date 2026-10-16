import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Fade/slide-in on scroll. Falls back to visible when IntersectionObserver is unavailable. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`lp-reveal ${shown ? "lp-in" : ""} ${className}`}
      style={{ "--lp-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** Window-like surface used for every product preview. */
export function Surface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-lp-border bg-white shadow-[0_12px_40px_-12px_rgba(98,88,232,0.18)] ${className}`}
    >
      {children}
    </div>
  );
}

const PILL_TONES = {
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-rose-50 text-rose-600",
  purple: "bg-lp-soft text-lp-primary",
  gray: "bg-gray-100 text-gray-500",
} as const;

export function Pill({
  tone,
  children,
}: {
  tone: keyof typeof PILL_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4 ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, tone = 0 }: { name: string; tone?: number }) {
  const tones = [
    "bg-violet-100 text-violet-600",
    "bg-sky-100 text-sky-600",
    "bg-emerald-100 text-emerald-600",
    "bg-amber-100 text-amber-600",
    "bg-rose-100 text-rose-600",
  ];
  return (
    <span
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${tones[tone % tones.length]}`}
    >
      {name.charAt(0)}
    </span>
  );
}

/** Smooth area/line chart drawn in SVG from a list of values. */
export function AreaChart({
  values,
  height = 90,
  stroke = "#6258E8",
  second,
  id,
}: {
  values: number[];
  height?: number;
  stroke?: string;
  second?: number[];
  id: string;
}) {
  const w = 300;
  const all = second ? [...values, ...second] : values;
  const max = Math.max(...all);
  const min = Math.min(...all);
  const pt = (v: number, i: number, n: number): [number, number] => [
    (i / (n - 1)) * w,
    height - 8 - ((v - min) / (max - min || 1)) * (height - 20),
  ];
  const line = (arr: number[]) => {
    const pts = arr.map((v, i) => pt(v, i, arr.length));
    return pts.reduce((d, [x, y], i) => {
      if (i === 0) return `M${x},${y}`;
      const [px, py] = pts[i - 1];
      const cx = (px + x) / 2;
      return `${d} C${cx},${py} ${cx},${y} ${x},${y}`;
    }, "");
  };
  const main = line(values);
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="block h-full w-full"
      role="presentation"
    >
      <defs>
        <linearGradient id={`g-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((r) => (
        <line
          key={r}
          x1="0"
          x2={w}
          y1={height * r}
          y2={height * r}
          stroke="#ECECF2"
          strokeDasharray="3 4"
        />
      ))}
      <path d={`${main} L${w},${height} L0,${height} Z`} fill={`url(#g-${id})`} />
      {second && (
        <path d={line(second)} fill="none" stroke="#F5B642" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      )}
      <path d={main} fill="none" stroke={stroke} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ArrowRight({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4 10h12m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <img
      src="/images/brand/travline-icon.svg"
      alt=""
      width={28}
      height={28}
      className={`rounded-lg ${className}`}
    />
  );
}
