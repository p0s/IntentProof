import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonTone = "primary" | "secondary" | "ghost";

interface TokenButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  children: ReactNode;
}

export function TokenButton({
  tone = "secondary",
  className = "",
  children,
  ...props
}: TokenButtonProps) {
  return (
    <button
      {...props}
      className={`token-ui-button token-ui-button-${tone} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
