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
  defaultValue?: string;
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
  error = false,
  disabled = false,
  id,
  name,
}) => {
  const [selectedValue, setSelectedValue] = useState<string>(defaultValue);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedValue(value);
    onChange(value);
  };

  useEffect(() => {
    setSelectedValue(defaultValue);
  }, [defaultValue]);

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
