import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getCliWalletHome,
  getCliWalletsDir,
  saveManagedWallet,
} from "../../cli/wallet-store";
import type { StoredTokenCoreWallet } from "../../lib/types";

const originalCliHome = process.env.TOKENCORE_CLI_HOME;
const tempHomes: string[] = [];

function privateMode(mode: number) {
  return mode & 0o777;
}

describe("CLI wallet store permissions", () => {
  afterEach(async () => {
    if (originalCliHome === undefined) {
      delete process.env.TOKENCORE_CLI_HOME;
    } else {
      process.env.TOKENCORE_CLI_HOME = originalCliHome;
    }
    await Promise.all(
      tempHomes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("stores managed wallets in 0700 directories and 0600 files", async () => {
    const tempHome = await mkdtemp(path.join(os.tmpdir(), "intentproof-wallets-"));
    tempHomes.push(tempHome);
    process.env.TOKENCORE_CLI_HOME = tempHome;

    const wallet: StoredTokenCoreWallet = {
      id: "wallet-permissions",
      name: "Permission Test Wallet",
      address: "0x7777777777777777777777777777777777777777",
      keystoreJson: "{\"crypto\":\"encrypted-test\"}",
      publicKey: "0xpub",
      derivationPath: "m/44'/60'/0'/0/0",
      chainId: 11155111,
      createdAt: new Date("2026-05-19T00:00:00.000Z").toISOString(),
    };

    const filePath = await saveManagedWallet(wallet);

    expect(privateMode((await stat(getCliWalletHome())).mode)).toBe(0o700);
    expect(privateMode((await stat(getCliWalletsDir())).mode)).toBe(0o700);
    expect(privateMode((await stat(filePath)).mode)).toBe(0o600);
  });
});
