import Button from './button/Button';
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
  title: string;
  description?: string;
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: Filter[];
  createButton?: {
    label: string;
    onClick: () => void;
  };
  actions?: React.ReactNode;
  className?: string;
}

export function PageToolbar({
  title,
  description,
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  filters = [],
  createButton,
  actions,
  className = ''
}: PageToolbarProps) {
  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">{title}</h1>
          {description && (
            <p className="text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {actions}
          {createButton && (
            <Button onClick={createButton.onClick}>
              {createButton.label}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1 max-w-md">
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {filters.length > 0 && (
          <div className="flex gap-2 flex-wrap">
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
    </div>
  );
}

export default PageToolbar;
