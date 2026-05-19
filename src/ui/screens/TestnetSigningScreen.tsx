import type { ReactNode } from "react";

interface TestnetSigningScreenProps {
  children: ReactNode;
}

export function TestnetSigningScreen({ children }: TestnetSigningScreenProps) {
  return (
    <section className="product-screen testnet-signing-screen">
      {children}
    </section>
  );
}
