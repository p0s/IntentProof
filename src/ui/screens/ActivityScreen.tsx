import type { ReactNode } from "react";

interface ActivityScreenProps {
  children: ReactNode;
}

export function ActivityScreen({ children }: ActivityScreenProps) {
  return <section className="product-screen activity-screen">{children}</section>;
}
