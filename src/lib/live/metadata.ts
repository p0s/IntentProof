export function getWalletConnectMetadata() {
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://www.intentproof.xyz";

  return {
    name: "IntentProof Tx Guard",
    description: "WalletConnect transaction firewall for imToken users.",
    url: origin,
    icons: [`${origin}/intentproof-mark.svg`],
  };
}
