import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const excludedDirectories = new Set([".git", ".next", "node_modules", "storage", "coverage", ".cache"]);
const excludedFiles = new Set(["scripts/verify-secrets.js"]);
const sensitiveEnvName = /(?:API_KEY|ACCESS_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)/;
const placeholderWords = /(?:example|replace|change|generated|placeholder|local-development|your[-_ ]|dummy|sample|xxxx|<[^>]+>|\$\{)/i;
const signatures = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ["OpenAI-style secret", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g],
  ["Stripe live secret", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["credential-bearing service URL", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/:@]+:[^\s/@]+@/gi],
  ["private registry URL", /\b(?:internal\.api\.openai\.org|applied-caas)\b/gi],
  ["personal workstation path", /(?:\/Users\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\)/g]
];

function fallbackFiles(directory = root, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...fallbackFiles(absolute, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function repositoryFiles() {
  if (fs.existsSync(path.join(root, ".git")) && Bun.which("git")) {
    const result = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode === 0) return new TextDecoder().decode(result.stdout).split("\0").filter(Boolean);
  }
  return fallbackFiles();
}

function textContent(filename) {
  const stat = fs.statSync(filename);
  if (stat.size > 2 * 1024 * 1024) return null;
  const bytes = fs.readFileSync(filename);
  if (bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0)) return null;
  return bytes.toString("utf8");
}

const failures = [];
for (const relative of repositoryFiles()) {
  const normalized = relative.replaceAll("\\", "/");
  if (excludedFiles.has(normalized)) continue;
  const basename = path.basename(normalized);
  if (basename.startsWith(".env") && !basename.endsWith(".example")) failures.push(`${normalized}: tracked environment file is not allowed`);
  const absolute = path.join(root, normalized);
  if (!fs.existsSync(absolute)) continue;
  const source = textContent(absolute);
  if (source === null) continue;
  for (const [label, expression] of signatures) {
    expression.lastIndex = 0;
    if (expression.test(source)) failures.push(`${normalized}: possible ${label}`);
  }
  for (const match of source.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/gm)) {
    const [, name, rawValue] = match;
    const value = rawValue.replace(/^['"]|['"]$/g, "").trim();
    if (!sensitiveEnvName.test(name) || value.length < 8 || placeholderWords.test(value)) continue;
    failures.push(`${normalized}: possible committed secret in ${name}`);
  }
}

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exit(1);
}
console.log("Tracked files contain no recognized credentials, private keys, personal workstation paths, or private registry references.");
