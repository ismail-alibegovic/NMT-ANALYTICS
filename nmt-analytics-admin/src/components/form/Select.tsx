import { useState, useEffect } from "react";
import { ChevronDownIcon } from "../../icons";

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
  /** Uncontrolled initial value. Use `value` for controlled usage. */
  defaultValue?: string;
  /** Controlled value — when provided, the component reflects it directly. */
  value?: string;
  error?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
}

const Select: React.FC<SelectProps> = ({
  options,
  placeholder = "Select an option",
  onChange,
  className = "",
  defaultValue = "",
  value,
  error = false,
  disabled = false,
  id,
  name,
}) => {
  // `value` (controlled) takes precedence over `defaultValue` (uncontrolled).
  const [internalValue, setInternalValue] = useState<string>(value ?? defaultValue);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setInternalValue(next);
    onChange(next);
  };

  // Controlled mode renders `value` directly; uncontrolled uses internal state.
  const selectedValue = value !== undefined ? value : internalValue;

  useEffect(() => {
    if (value === undefined) {
      setInternalValue(defaultValue);
    }
    // When `value` is provided we render it directly, no internal update needed.
  }, [value, defaultValue]);

  const stateClasses = disabled
    ? "cursor-not-allowed border-gray-300 bg-gray-100 text-gray-400 opacity-60 dark:border-gray-700 dark:bg-gray-800"
    : error
      ? "border-error-500 focus:border-error-400 focus:ring-error-500/15 dark:border-error-500 dark:focus:border-error-800"
      : "border-gray-300 focus:border-brand-400 focus:ring-brand-500/15 dark:border-gray-700 dark:focus:border-brand-500";

  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        data-select-styled
        disabled={disabled}
        className={`h-11 w-full appearance-none rounded-lg border bg-transparent px-4 py-2.5 pr-11 text-sm shadow-theme-xs transition-colors focus:outline-hidden focus:ring-2 dark:bg-gray-900 ${stateClasses} ${
          selectedValue
            ? "text-gray-800 dark:text-white/90"
            : "text-gray-400 dark:text-gray-400"
        } ${className}`}
        value={selectedValue}
        onChange={handleChange}
      >
        <option
          value=""
          disabled
          className="text-gray-400 dark:bg-gray-900 dark:text-gray-500"
        >
          {placeholder}
        </option>
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="text-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        className={`pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 ${
          error ? "text-error-400" : "text-gray-400 dark:text-gray-500"
        }`}
      />
    </div>
  );
};

export default Select;
