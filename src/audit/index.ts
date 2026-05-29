import { scanConfigs } from "./scanner.js";
import { analyzeServer } from "./risk.js";
import { getCatalog } from "./catalog.js";
import type { AuditReport, AnalyzedServer } from "./types.js";

export type { AuditReport, AnalyzedServer } from "./types.js";

/**
 * Run a full MCP security scan of the local machine.
 * Pure data — no printing — so callers (CLI display, sync forwarding) decide output.
 */
export async function runAudit(
  opts: { offline?: boolean } = {}
): Promise<AuditReport> {
  const catalog = opts.offline
    ? { slugs: new Set<string>(), npm: new Set<string>() }
    : await getCatalog();

  const configFiles = scanConfigs();
  const allServers: AnalyzedServer[] = [];
  const foundFiles: string[] = [];

  for (const { filePath, servers } of configFiles) {
    if (servers.length > 0) foundFiles.push(filePath);
    for (const server of servers) {
      allServers.push(analyzeServer(server, catalog.slugs, catalog.npm));
    }
  }

  return {
    scannedAt: new Date().toLocaleString(),
    configFiles: foundFiles,
    totalServers: allServers.length,
    high: allServers.filter((s) => s.level === "HIGH"),
    medium: allServers.filter((s) => s.level === "MEDIUM"),
    verified: allServers.filter((s) => s.level === "VERIFIED"),
    unverified: allServers.filter((s) => s.level === "LOW"),
  };
}
