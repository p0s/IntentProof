import type { ReactNode } from "react";

interface TokenTabsProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; description?: string }>;
  onChange: (value: T) => void;
  "aria-label": string;
  renderExtra?: (value: T) => ReactNode;
}

export function TokenTabs<T extends string>({
  value,
  options,
  onChange,
  renderExtra,
  "aria-label": ariaLabel,
}: TokenTabsProps<T>) {
  return (
    <div className="token-ui-tabs" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          <strong>{option.label}</strong>
          {option.description ? <span>{option.description}</span> : null}
          {renderExtra ? renderExtra(option.value) : null}
        </button>
      ))}
    </div>
  );
}
