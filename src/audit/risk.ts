import type { MCPServerEntry, RiskFlag, RiskLevel, AnalyzedServer } from "./types.js";

const CREDENTIAL_PATTERN = /SECRET|TOKEN|PASSWORD|KEY|APIKEY|API_KEY|PRIVATE|AUTH/i;
const FILESYSTEM_ARGS = /--allow-write|--allow-read|--allow-all|\/Users|\/home|\/var|C:\\/i;
const KEYCHAIN_CMDS = /keychain|security\s+find|secret-tool|kwallet/i;
const NETWORK_CMDS = /curl|wget|fetch|http/i;

function extractNpmPackage(command?: string, args?: string[]): string | undefined {
  if (!command) return undefined;
  // "npx -y @scope/pkg" or "npx pkg"
  if (command === "npx" && args?.length) {
    const pkg = args.find((a) => !a.startsWith("-"));
    return pkg;
  }
  // "node /path/to/script" — not an npm package
  return undefined;
}

export function analyzeServer(
  server: MCPServerEntry,
  verifiedSlugs: Set<string>,
  verifiedNpm: Set<string>
): AnalyzedServer {
  const flags: RiskFlag[] = [];
  const cmdLine = [server.command, ...(server.args ?? [])].join(" ");
  const npmPackage = extractNpmPackage(server.command, server.args);

  // File system access
  if (FILESYSTEM_ARGS.test(cmdLine)) {
    flags.push("FILE_SYSTEM_ACCESS");
  }

  // Keychain access
  if (KEYCHAIN_CMDS.test(cmdLine)) {
    flags.push("KEYCHAIN_ACCESS");
  }

  // Credentials in env block
  if (server.env) {
    const envKeys = Object.keys(server.env).join(" ");
    if (CREDENTIAL_PATTERN.test(envKeys)) {
      flags.push("CREDENTIAL_IN_ENV");
    }
  }

  // Network access (non-npx commands that fetch data)
  if (server.command !== "npx" && server.command !== "node" && NETWORK_CMDS.test(cmdLine)) {
    flags.push("NETWORK_ACCESS");
  }

  // Unverified — not in catalog
  const isVerified =
    verifiedSlugs.has(server.name.toLowerCase()) ||
    (npmPackage != null && verifiedNpm.has(npmPackage));

  if (!isVerified) {
    flags.push("UNVERIFIED");
  }

  // Determine overall level
  let level: RiskLevel;
  if (flags.some((f) => f !== "UNVERIFIED") && flags.includes("UNVERIFIED")) {
    level = "HIGH";
  } else if (flags.some((f) => f !== "UNVERIFIED")) {
    level = "MEDIUM";  // has risk flags but is a verified server
  } else if (flags.includes("UNVERIFIED")) {
    level = "LOW";     // unknown server but no other flags
  } else {
    level = "VERIFIED";
  }

  return {
    name: server.name,
    sourceFile: server.sourceFile,
    command: [server.command, ...(server.args ?? [])].filter(Boolean).join(" ") || undefined,
    flags,
    level,
    ...(npmPackage ? { npmPackage } : {}),
  };
}
