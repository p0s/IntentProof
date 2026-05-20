import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock("@consenlabs/imtoken-connect", () => ({
  ImTokenWebProvider: class {
    request = requestMock;
  },
}));

import { ImTokenConnectSigner } from "../../lib/live/imtokenConnectSigner";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";

describe("ImTokenConnectSigner", () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockImplementation(({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") {
        return ["0x7777777777777777777777777777777777777777"];
      }
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_sendTransaction") return "0ximtokenhash";
      if (method === "wallet_switchEthereumChain") return null;
      return null;
    });
  });

  it("connects imToken Web through the provider request API", async () => {
    const signer = new ImTokenConnectSigner();

    const result = await signer.connectImToken();

    expect(result.ok).toBe(true);
    expect(result.state.label).toBe("imToken Web connected");
    expect(result.state.account?.address).toBe(
      "0x7777777777777777777777777777777777777777",
    );
  });

  it("forwards allowed methods after switching to the request chain", async () => {
    const signer = new ImTokenConnectSigner();
    await signer.connectImToken();
    const request = normalizeLiveRequest({
      id: "send",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x",
          chainId: "0x1",
        },
      ],
    });

    await expect(signer.forward(request)).resolves.toBe("0ximtokenhash");
    expect(requestMock).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
    });
    expect(requestMock).toHaveBeenCalledWith({
      method: "eth_sendTransaction",
      params: request.request.params,
    });
  });

  it("does not forward unsupported methods", async () => {
    const signer = new ImTokenConnectSigner();
    const request = normalizeLiveRequest({
      id: "raw",
      origin: "legacy.example",
      method: "eth_sendRawTransaction",
      params: ["0xdeadbeef"],
      chainId: "0x1",
    });

    await expect(signer.forward(request)).rejects.toThrow(/not forwarded/i);
    expect(requestMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "eth_sendRawTransaction" }),
    );
  });
});
