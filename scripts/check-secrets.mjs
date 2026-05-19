import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

const patterns = [
  {
    name: "private key block",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    name: "non-empty TOKENCORE_CLI_PASSWORD",
    regex: /^TOKENCORE_CLI_PASSWORD=.+/m,
  },
  {
    name: "wallet mnemonic text",
    regex: /\b(mnemonic|seed phrase|private key)\b\s*[:=]\s*\S+/i,
  },
  {
    name: "populated VITE secret-like value",
    regex:
      /^VITE_(?:ALCHEMY|ETHERSCAN|TENDERLY|GEMINI|GROQ)[A-Z_]*=\S{12,}/m,
  },
  {
    name: "populated server-only secret-like value",
    regex:
      /^(?:TENDERLY_ACCESS_TOKEN|TOKENCORE_CLI_PASSWORD|GEMINI_API_KEY|GROQ_API_KEY)=\S{8,}/m,
  },
];

const appOwnedRoots = [
  ".codex/",
  ".github/",
  "config/",
  "docs/",
  "public/",
  "scripts/",
  "src/",
];

const appOwnedFiles = new Set([
  ".env.example",
  ".gitignore",
  ".npmrc",
  "AGENTS.md",
  "DEMO_SCRIPT.md",
  "README.md",
  "SPEC.md",
  "STATUS.md",
  "SUBMISSION.md",
  "SUBMISSION_FORM_DRAFT.md",
  "eslint.config.js",
  "index.html",
  "package-lock.json",
  "package.json",
  "setup-and-start.md",
  "tsconfig.app.json",
  "tsconfig.cli.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "vercel.json",
]);

const ignoredPathPrefixes = [
  ".git/",
  ".tokencore-cli/",
  "dist/",
  "node_modules/",
  "token-core/",
];

const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp4",
  ".pdf",
  ".png",
  ".webm",
  ".zip",
]);

function isAppOwned(file) {
  return (
    appOwnedFiles.has(file) ||
    appOwnedRoots.some((prefix) => file.startsWith(prefix))
  );
}

function isIgnored(file) {
  return ignoredPathPrefixes.some((prefix) => file.startsWith(prefix));
}

function isBinary(file) {
  const dot = file.lastIndexOf(".");
  return dot >= 0 && binaryExtensions.has(file.slice(dot).toLowerCase());
}

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}

function listFilesFromGit() {
  const fileList = execFileSync("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ], {
    stdio: ["ignore", "pipe", "ignore"],
  }).toString("utf8");

  return fileList.split(/\r?\n/).filter(Boolean);
}

function walkDirectory(root) {
  const files = [];
  if (!existsSync(root)) return files;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = normalizePath(`${root}${entry.name}`);
    if (entry.isDirectory()) {
      files.push(...walkDirectory(`${file}/`));
    } else if (entry.isFile()) {
      files.push(file);
    }
  }

  return files;
}

function listFilesFromFilesystem() {
  const rootFiles = [...appOwnedFiles].filter((file) => existsSync(file));
  const rootedFiles = appOwnedRoots.flatMap((root) => walkDirectory(root));
  return [...rootFiles, ...rootedFiles];
}

function listCandidateFiles() {
  try {
    return { source: "git", files: listFilesFromGit() };
  } catch {
    return { source: "filesystem", files: listFilesFromFilesystem() };
  }
}

const { source, files: candidateFiles } = listCandidateFiles();

const files = [...new Set(candidateFiles.map(normalizePath))]
  .filter(Boolean)
  .filter(isAppOwned)
  .filter((file) => !isIgnored(file))
  .filter((file) => !isBinary(file))
  .filter((file) => existsSync(file) && statSync(file).isFile());

const findings = [];

for (const file of files) {
  let contents = "";
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const pattern of patterns) {
    if (pattern.regex.test(contents)) {
      findings.push(`${file}: ${pattern.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secret material found:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`No obvious secret material found in app-owned files (${source}).`);
}
