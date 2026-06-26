interface SkeletonBaseProps {
  className?: string;
}

function SkeletonText({ className = "" }: SkeletonBaseProps) {
  return (
    <div className={`h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`} />
  );
}

function SkeletonTitle({ className = "" }: SkeletonBaseProps) {
  return (
    <div className={`h-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/3 ${className}`} />
  );
}

function SkeletonCircle({ size = "md" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "h-8 w-8", md: "h-12 w-12", lg: "h-16 w-16" };
  return (
    <div className={`${sizes[size]} bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse`} />
  );
}

function SkeletonCard({ className = "" }: SkeletonBaseProps) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6 ${className}`}>
      <SkeletonTitle />
      <SkeletonText className="mt-4 w-2/3" />
      <SkeletonText className="mt-2 w-1/2" />
    </div>
  );
}

function SkeletonTable({ rows = 5, columns = 5, className = "" }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-100 dark:border-white/[0.05]">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-5 py-3">
                  <SkeletonText className="w-3/4" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {Array.from({ length: rows }).map((_, row) => (
              <tr key={row}>
                {Array.from({ length: columns }).map((_, col) => (
                  <td key={col} className="px-5 py-4">
                    <SkeletonText className={col === 0 ? "w-3/4" : "w-1/2"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkeletonChart({ className = "" }: SkeletonBaseProps) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6 ${className}`}>
      <SkeletonTitle />
      <div className="mt-6 h-64 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
    </div>
  );
}

export const Skeleton = {
  Text: SkeletonText,
  Title: SkeletonTitle,
  Circle: SkeletonCircle,
  Card: SkeletonCard,
  Table: SkeletonTable,
  Chart: SkeletonChart,
};
