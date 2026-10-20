import type React from "react";
import type { FC } from "react";

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  success?: boolean;
  error?: boolean;
  hint?: string;
}

const Input: FC<InputProps> = ({
  type = "text",
  id,
  name,
  placeholder,
  value,
  onChange,
  className = "",
  min,
  max,
  step,
  disabled = false,
  required = false,
  success = false,
  error = false,
  hint,
  autoComplete,
  onBlur,
  "aria-describedby": describedBy,
  ...nativeProps
}) => {
  let inputClasses = ` h-11 w-full min-w-0 rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs transition-colors placeholder:text-gray-400 focus:outline-hidden focus:ring-2  dark:bg-gray-900 dark:text-white/90 dark:[color-scheme:dark] dark:placeholder:text-white/30 ${className}`;

  if (disabled) {
    inputClasses += ` text-gray-500 border-gray-300 opacity-40 bg-gray-100 cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 opacity-40`;
  } else if (error) {
    inputClasses += `  border-error-500 focus:border-error-400 focus:ring-error-500/15 dark:text-error-400 dark:border-error-500 dark:focus:border-error-800`;
  } else if (success) {
    inputClasses += `  border-success-500 focus:border-success-400 focus:ring-success-500/15 dark:text-success-400 dark:border-success-500 dark:focus:border-success-800`;
  } else {
    inputClasses += ` bg-transparent text-gray-800 border-gray-300 focus:border-brand-400 focus:ring-brand-500/15 dark:border-gray-700 dark:text-white/90  dark:focus:border-brand-500`;
  }

  return (
    <div className="relative min-w-0">
      <input
        {...nativeProps}
        aria-invalid={error || nativeProps["aria-invalid"]}
        aria-describedby={[describedBy, hint && id ? `${id}-hint` : undefined].filter(Boolean).join(" ") || undefined}
        type={type}
        id={id}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        className={inputClasses}
      />

      {hint && (
        <p
          id={id ? `${id}-hint` : undefined}
          role={error ? "alert" : undefined}
          className={`mt-1.5 text-xs ${error
              ? "text-error-500"
              : success
                ? "text-success-500"
                : "text-gray-500"
            }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;
