#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "src/generated/keystoneAbiRegistry.ts");

const selectedContracts = [
  {
    chainId: 1,
    directory: "ethereum",
    addresses: [
      "0x000000000022d473030f116ddee9f6b43ac78ba3",
      "0x111111125421ca6dc452d289314280a0f8842a65",
      "0x1111111254eeb25477b68fb85ed929f73a960582",
      "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
      "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
      "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
      "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
      "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
      "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      "0xe592427a0aece92de3edee1f18e0157c05861564",
      "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
      "0x253553366da8546fc250f225fe3d25d0c782303b",
    ],
  },
  {
    chainId: 8453,
    directory: "base",
    addresses: [
      "0x6ff5693b99212da76ad316178a184ab56d299b43",
      "0xfdf682f51fe81aa4898f0ae2163d8a55c127fbc7",
    ],
  },
  { chainId: 11155111, directory: "sepolia", addresses: [] },
  { chainId: 84532, directory: "baseSepolia", addresses: [] },
];

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [key, inlineValue] = item.slice(2).split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args.set(key, value);
  }
  return args;
}

function normalizeAddress(address) {
  return typeof address === "string" ? address.toLowerCase() : "";
}

function stripAbiEntry(entry) {
  return {
    type: "function",
    name: entry.name,
    stateMutability: entry.stateMutability,
    inputs: Array.isArray(entry.inputs)
      ? entry.inputs.map(stripAbiParam)
      : [],
    outputs: Array.isArray(entry.outputs)
      ? entry.outputs.map(stripAbiParam)
      : [],
  };
}

function stripAbiParam(param) {
  const clean = {
    name: typeof param.name === "string" ? param.name : "",
    type: param.type,
  };
  if (Array.isArray(param.components) && param.components.length > 0) {
    clean.components = param.components.map(stripAbiParam);
  }
  return clean;
}

function extractDocs(metadata) {
  const output = metadata?.metadata?.output ?? metadata?.metadata;
  const docs = {};
  if (output?.userdoc && Object.keys(output.userdoc).length > 0) {
    docs.userdoc = output.userdoc;
  }
  if (output?.devdoc && Object.keys(output.devdoc).length > 0) {
    docs.devdoc = output.devdoc;
  }
  return Object.keys(docs).length > 0 ? docs : undefined;
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function loadContract(sourceRoot, chain, address) {
  const filePath = path.join(sourceRoot, chain.directory, `${address}.json`);
  const raw = await readFile(filePath, "utf8");
  const metadata = JSON.parse(raw);
  const abi = metadata?.metadata?.output?.abi ?? metadata?.metadata?.abi ?? metadata?.abi;
  if (!Array.isArray(abi)) return undefined;
  const functions = abi
    .filter((entry) => entry?.type === "function" && typeof entry.name === "string")
    .map(stripAbiEntry)
    .sort((left, right) => left.name.localeCompare(right.name));
  if (functions.length === 0) return undefined;
  return {
    contractName: metadata.name ?? "UnknownContract",
    chainId: chain.chainId,
    address: normalizeAddress(metadata.address ?? address),
    abi: functions,
    docs: extractDocs(metadata),
    proxy: {
      isProxy: Boolean(metadata.isProxy),
      principalAddress:
        typeof metadata.principalAddress === "string"
          ? normalizeAddress(metadata.principalAddress)
          : undefined,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(
    args.get("source") ?? process.env.KEYSTONE_METADATA_SOURCE ?? "",
  );
  if (!sourceRoot || !(await pathExists(sourceRoot))) {
    throw new Error(
      "Usage: node scripts/generate-keystone-abi-registry.mjs --source /path/to/expanded-metadata-registry",
    );
  }

  const registry = {};
  const skippedChains = [];
  for (const chain of selectedContracts) {
    const chainDir = path.join(sourceRoot, chain.directory);
    if (!(await pathExists(chainDir))) {
      skippedChains.push({ chainId: chain.chainId, reason: "missing directory" });
      continue;
    }
    if (chain.addresses.length === 0) {
      skippedChains.push({ chainId: chain.chainId, reason: "no selected contracts" });
      continue;
    }

    const files = new Set((await readdir(chainDir)).map((file) => file.toLowerCase()));
    const chainEntries = {};
    for (const configuredAddress of chain.addresses.map(normalizeAddress).sort()) {
      if (!files.has(`${configuredAddress}.json`)) continue;
      const entry = await loadContract(sourceRoot, chain, configuredAddress);
      if (entry) chainEntries[entry.address] = entry;
    }
    if (Object.keys(chainEntries).length > 0) {
      registry[String(chain.chainId)] = chainEntries;
    }
  }

  const contracts = Object.values(registry).flatMap((chain) => Object.values(chain));
  const functionCount = contracts.reduce((total, entry) => total + entry.abi.length, 0);
  const generated = `// Auto-generated by scripts/generate-keystone-abi-registry.mjs.\n// ABI metadata is untrusted descriptive data; policy and verification remain authoritative.\n\nexport const keystoneAbiRegistry = ${JSON.stringify(registry, null, 2)} as const;\n\nexport const keystoneAbiRegistrySummary = ${JSON.stringify(
    {
      contracts: contracts.length,
      functions: functionCount,
      skippedChains,
      generatedAt: new Date(0).toISOString(),
    },
    null,
    2,
  )} as const;\n`;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated);
  console.log(
    `Generated ${path.relative(repoRoot, outputPath)} with ${contracts.length} contracts and ${functionCount} functions.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
