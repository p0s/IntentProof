import type { HTMLAttributes, ReactNode } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

interface TokenBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

export function TokenBadge({
  tone = "neutral",
  className = "",
  children,
  ...props
}: TokenBadgeProps) {
  return (
    <span {...props} className={`token-ui-badge token-ui-badge-${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}
