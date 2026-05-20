import type { HTMLAttributes, ReactNode } from "react";

interface TokenCardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function TokenCard({ className = "", children, ...props }: TokenCardProps) {
  return (
    <section {...props} className={`token-ui-card ${className}`.trim()}>
      {children}
    </section>
  );
}
