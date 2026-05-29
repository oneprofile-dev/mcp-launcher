import { runAudit, type AuditReport } from "../audit/index.js";
import { printReport, printJson } from "../audit/report.js";
import { API_URL, getToken } from "../auth.js";

async function forwardScan(report: AuditReport, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/cli/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "@curatedmcp/cli",
      },
      body: JSON.stringify({
        scannedAt: report.scannedAt,
        totalServers: report.totalServers,
        configFiles: report.configFiles,
        high: report.high.map((s) => ({
          name: s.name,
          flags: s.flags,
          command: s.command ?? null,
          sourceFile: s.sourceFile,
        })),
        medium: report.medium.map((s) => ({
          name: s.name,
          flags: s.flags,
          command: s.command ?? null,
          sourceFile: s.sourceFile,
        })),
        unverified: report.unverified.map((s) => ({
          name: s.name,
          sourceFile: s.sourceFile,
        })),
        verified: report.verified.map((s) => ({ name: s.name })),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runAuditCommand(args: string[]): Promise<number> {
  const jsonMode = args.includes("--json");
  const offline = args.includes("--offline");

  const report = await runAudit({ offline });

  if (jsonMode) {
    printJson(report);
    return report.high.length > 0 ? 1 : 0;
  }

  const token = !offline ? getToken() : null;
  let synced = false;
  if (token) synced = await forwardScan(report, token);

  await printReport(report, { synced });
  return report.high.length > 0 ? 1 : 0;
}
