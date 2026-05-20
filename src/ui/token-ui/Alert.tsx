import type { HTMLAttributes, ReactNode } from "react";

type AlertTone = "info" | "warning" | "danger" | "success";

interface TokenAlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
}

export function TokenAlert({
  tone = "info",
  title,
  className = "",
  children,
  ...props
}: TokenAlertProps) {
  return (
    <div {...props} className={`token-ui-alert token-ui-alert-${tone} ${className}`.trim()}>
      {title ? <strong>{title}</strong> : null}
      <span>{children}</span>
    </div>
  );
}
