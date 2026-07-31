import type { ReactNode } from "react";

/**
 * Shared card surface. Lifted verbatim out of HomeHub so the hub and every
 * sub-page draw from one definition — radius, border, and dark-mode surface
 * can no longer drift apart.
 */
export const Panel: React.FC<{ children: ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <div
    className={`rounded-2xl border border-gray-200/70 bg-white p-6 shadow-sm shadow-gray-200/40 dark:border-white/[0.07] dark:bg-white/[0.02] dark:shadow-none ${className}`}
  >
    {children}
  </div>
);

/** Small uppercase label that sits above a panel or a group of panels. */
export const SectionLabel: React.FC<{ children: ReactNode }> = ({ children }) => (
  <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
    {children}
  </h2>
);

interface PageShellProps {
  /** Page title. Rendered one step down from the hub's masthead. */
  title: string;
  /** Optional muted line under the title. */
  subtitle?: string;
  /** Right-aligned header slot — primary action buttons. */
  actions?: ReactNode;
  /** Optional summary-card row rendered between the header and the content. */
  stats?: ReactNode;
  children: ReactNode;
}

/**
 * The single outer frame for every admin/ops page.
 *
 * Width, gutters, and header rhythm are identical to HomeHub's masthead by
 * construction, so pages stop each inventing their own density. Filters stay
 * in `PageToolbar`, which renders *inside* this shell — frame and filters are
 * deliberately separate concerns.
 */
export default function PageShell({
  title,
  subtitle,
  actions,
  stats,
  children,
}: PageShellProps) {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-9 md:px-8 md:pt-12">
      <header className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold leading-[1.05] tracking-tight text-gray-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 self-start md:self-auto">
            {actions}
          </div>
        )}
      </header>

      {stats && <div className="mb-8">{stats}</div>}

      {children}
    </div>
  );
}
