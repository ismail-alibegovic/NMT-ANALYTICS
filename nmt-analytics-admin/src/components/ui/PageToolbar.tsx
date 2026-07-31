import Input from '../form/input/InputField';

interface FilterOption {
  value: string;
  label: string;
}

interface Filter {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

interface PageToolbarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Hide the search input entirely (for pages that don't filter client-side). */
  hideSearch?: boolean;
  filters?: Filter[];
  className?: string;
}

/**
 * Filter strip only — search box + filter selects.
 *
 * The page masthead (title, subtitle, primary actions) belongs to `PageShell`.
 * Keeping the two apart is what stops every page from re-inventing its own
 * header rhythm; a toolbar rendered without a shell is a bug, not a variant.
 */
export function PageToolbar({
  searchPlaceholder = "Search...",
  searchValue = "",
  onSearchChange,
  hideSearch = false,
  filters = [],
  className = '',
}: PageToolbarProps) {
  const showSearch = !hideSearch && !!onSearchChange;
  if (!showSearch && filters.length === 0) return null;

  return (
    <div className={`mb-6 flex flex-col gap-4 sm:flex-row sm:items-center ${className}`}>
      {showSearch && (
        <div className="max-w-md flex-1">
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange!(e.target.value)}
          />
        </div>
      )}

      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <div key={filter.key} className="min-w-[150px]">
              <select
                value={filter.value}
                onChange={(e) => filter.onChange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-gray-800"
              >
                <option value="">{filter.label}</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PageToolbar;
