import type { ReactNode } from "react";

interface PreviewRequestsScreenProps {
  children: ReactNode;
}

export function PreviewRequestsScreen({ children }: PreviewRequestsScreenProps) {
  return (
    <section className="product-screen preview-requests-screen">
      {children}
    </section>
  );
}
