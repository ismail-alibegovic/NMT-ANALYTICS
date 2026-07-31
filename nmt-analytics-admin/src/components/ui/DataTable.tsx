import { ReactNode, Component, ErrorInfo, useMemo, useState } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from './table';
import Button from './button/Button';
import EmptyState from './EmptyState';
import { ChevronDownIcon } from '../../icons';

class TableErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Table error:', error.message, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-gray-500 dark:text-gray-400">Failed to render table data</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 text-sm text-brand-500 hover:underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface Column<T> {
  key: keyof T | string;
  header: ReactNode;
  render?: (value: any, item: T) => ReactNode;
  /** Marks the column head as a sort control. */
  sortable?: boolean;
  /**
   * Value used for comparison when this column sorts client-side. Defaults to
   * `item[key]`, which is wrong for computed/rendered columns — supply this for
   * those.
   */
  sortValue?: (item: T) => string | number | null | undefined;
  className?: string;
}

export type SortDir = 'asc' | 'desc';

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  /**
   * Controlled sort. Pass together with `onSortChange` when the server owns
   * ordering; omit both to let the table sort its own page of rows.
   */
  sortKey?: string | null;
  sortDir?: SortDir;
  onSortChange?: (key: string, dir: SortDir) => void;
  /**
   * Makes rows clickable. Row-level buttons stay clickable — the handler is
   * skipped when the click originates inside a button/link/input.
   */
  onRowClick?: (item: T) => void;
  /** Stable row identity. Falls back to the array index. */
  rowKey?: (item: T, index: number) => string;
}

const SORT_CHEVRON = 'ml-1 inline-block size-3 shrink-0 transition-transform';

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  loading = false,
  emptyMessage = 'No data available',
  className = '',
  sortKey,
  sortDir,
  onSortChange,
  onRowClick,
  rowKey,
}: DataTableProps<T>) {
  // Uncontrolled fallback: when the caller does not pass onSortChange, the
  // table sorts the rows it was handed.
  const [localSort, setLocalSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const controlled = typeof onSortChange === 'function';
  const activeKey = controlled ? sortKey ?? null : localSort?.key ?? null;
  const activeDir: SortDir = controlled ? sortDir ?? 'asc' : localSort?.dir ?? 'asc';

  const handleSort = (key: string) => {
    const nextDir: SortDir = activeKey === key && activeDir === 'asc' ? 'desc' : 'asc';
    if (controlled) {
      onSortChange!(key, nextDir);
    } else {
      setLocalSort({ key, dir: nextDir });
    }
  };

  const rows = useMemo(() => {
    if (controlled || !localSort) return data;
    const col = columns.find((c) => String(c.key) === localSort.key);
    if (!col) return data;
    const read = col.sortValue ?? ((item: T) => item[col.key as keyof T] as any);
    const sorted = [...data].sort((a, b) => compareValues(read(a), read(b)));
    return localSort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [data, columns, controlled, localSort]);

  const renderHead = (column: Column<T>) => {
    if (!column.sortable) return column.header;
    const key = String(column.key);
    const active = activeKey === key;
    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        aria-sort={active ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`group inline-flex items-center font-medium transition-colors ${
          active ? 'text-brand-500' : 'hover:text-gray-700 dark:hover:text-gray-200'
        }`}
      >
        {column.header}
        <ChevronDownIcon
          className={`${SORT_CHEVRON} ${
            active
              ? activeDir === 'asc'
                ? 'rotate-180 opacity-100'
                : 'opacity-100'
              : 'opacity-0 group-hover:opacity-40'
          }`}
        />
      </button>
    );
  };

  if (loading) {
    return (
      <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={String(column.key)}
                    isHeader
                    className={`px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 ${column.className || ''}`}
                  >
                    {column.header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  {columns.map((column) => (
                    <TableCell
                      key={String(column.key)}
                      className={`px-5 py-4 ${column.className || ''}`}
                    >
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
        <EmptyState
          title="No data found"
          description={emptyMessage}
        />
      </div>
    );
  }

  return (
    <TableErrorBoundary>
      <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={String(column.key)}
                    isHeader
                    className={`px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 ${column.className || ''}`}
                  >
                    {renderHead(column)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {rows.map((item, index) => (
                <TableRow
                  key={rowKey ? rowKey(item, index) : index}
                  onClick={onRowClick ? (event) => {
                    // Let row-level controls win — only bare cell clicks open the row.
                    const target = event.target as HTMLElement;
                    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
                    onRowClick(item);
                  } : undefined}
                  className={onRowClick
                    ? 'cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]'
                    : undefined}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={String(column.key)}
                      className={`px-5 py-4 text-gray-800 text-theme-sm dark:text-white/90 ${column.className || ''}`}
                    >
                      {column.render
                        ? column.render(item[column.key as keyof T], item)
                        : String(item[column.key as keyof T] || '')
                      }
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </TableErrorBoundary>
  );
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: PaginationProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Showing {startItem}-{endItem} of {totalItems} results
      </div>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          variant="outline"
          size="sm"
        >
          Previous
        </Button>

        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((page) => {
              // Show first page, last page, current page, and pages around current
              return (
                page === 1 ||
                page === totalPages ||
                (page >= currentPage - 1 && page <= currentPage + 1)
              );
            })
            .map((page, index, array) => {
              // Add ellipsis where there are gaps
              const prevPage = array[index - 1];
              const showEllipsis = prevPage && page - prevPage > 1;

              return (
                <div key={page} className="flex items-center">
                  {showEllipsis && (
                    <span className="px-2 text-gray-400">...</span>
                  )}
                  <Button
                    onClick={() => onPageChange(page)}
                    variant={page === currentPage ? 'primary' : 'outline'}
                    size="sm"
                    className="min-w-[40px]"
                  >
                    {page}
                  </Button>
                </div>
              );
            })}
        </div>

        <Button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          variant="outline"
          size="sm"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
