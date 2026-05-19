// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DemoDappScreen } from "../../ui/screens/DemoDappScreen";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr"),
  },
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr"),
}));

describe("Demo DApp screen", () => {
  it("renders the companion merchant without third-party claims", () => {
    render(<DemoDappScreen projectId="" projectIdPresent={false} />);

    expect(screen.getByRole("heading", { name: "IntentProof Demo Merchant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect protected wallet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay 5 test USDC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request unlimited approval" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wrap 0.01 ETH" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Propose swap route" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Propose bridge route" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign typed data" })).toBeInTheDocument();
    expect(screen.getByText(/not a real third-party DApp/i)).toBeInTheDocument();
    expect(screen.queryByText(/Uniswap|Aave/i)).not.toBeInTheDocument();
  });

  it("exposes the IntentProof custom wallet route", async () => {
    const user = userEvent.setup();
    render(<DemoDappScreen projectId="" projectIdPresent={false} />);

    await user.click(screen.getByRole("button", { name: "Connect protected wallet" }));

    const link = await screen.findByRole("link", { name: "Open in IntentProof" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/wc?uri=wc%3A"));
    expect(screen.getByAltText("WalletConnect QR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy WalletConnect URI" })).toBeInTheDocument();
  });
});
