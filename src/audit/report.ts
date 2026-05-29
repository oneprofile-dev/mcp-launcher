import type { AuditReport, AnalyzedServer } from "./types.js";

// Chalk is ESM-only in v5, imported dynamically.
let chalk: typeof import("chalk").default;

async function getChalk() {
  if (!chalk) {
    const m = await import("chalk");
    chalk = m.default;
  }
  return chalk;
}

const FLAG_LABELS: Record<string, string> = {
  FILE_SYSTEM_ACCESS: "FILE_SYSTEM_ACCESS",
  KEYCHAIN_ACCESS: "KEYCHAIN_ACCESS",
  CREDENTIAL_IN_ENV: "CREDENTIAL_IN_ENV",
  NETWORK_ACCESS: "NETWORK_ACCESS",
  UNVERIFIED: "UNVERIFIED",
};

export async function printReport(
  report: AuditReport,
  opts: { synced?: boolean } = {}
): Promise<void> {
  const c = await getChalk();

  console.log("\n" + c.bold("MCP Security Audit") + c.dim(` — ${report.scannedAt}`));
  console.log(c.dim("━".repeat(50)));
  console.log();

  if (report.configFiles.length === 0) {
    console.log(c.yellow("No MCP configuration files found on this machine."));
    console.log(c.dim("Install Claude Desktop, Cursor, or Claude Code to get started."));
    console.log();
    return;
  }

  console.log(
    c.dim(
      `Found ${report.configFiles.length} config file${report.configFiles.length !== 1 ? "s" : ""}. ` +
        `${report.totalServers} server${report.totalServers !== 1 ? "s" : ""} detected.`
    )
  );
  for (const f of report.configFiles) {
    console.log(c.dim(`  ✓ ${f}`));
  }
  console.log();

  if (report.high.length > 0) {
    console.log(c.red.bold(`HIGH RISK (${report.high.length})`));
    for (const s of report.high) printServer(c, s, "red");
    console.log();
  }

  if (report.medium.length > 0) {
    console.log(c.yellow.bold(`MEDIUM RISK (${report.medium.length})`));
    for (const s of report.medium) printServer(c, s, "yellow");
    console.log();
  }

  if (report.unverified.length > 0) {
    console.log(c.dim(`UNVERIFIED (${report.unverified.length}) — not in the CuratedMCP catalog`));
    for (const s of report.unverified) {
      console.log(c.dim(`  ? ${s.name}`));
      console.log(c.dim(`    ${s.sourceFile}`));
    }
    console.log();
  }

  if (report.verified.length > 0) {
    console.log(c.green(`VERIFIED (${report.verified.length})`));
    const names = report.verified.map((s) => s.name).join(", ");
    console.log(c.dim(`  ✓ ${names}`));
    console.log();
  }

  console.log(c.dim("─".repeat(50)));
  if (opts.synced) {
    console.log(c.green("  ✓ Scan synced to your CuratedMCP account."));
  } else {
    console.log(
      c.dim("  Sign in to sync scans & get alerts:  ") + c.cyan("curatedmcp login")
    );
  }
  console.log();
}

function printServer(
  c: typeof import("chalk").default,
  s: AnalyzedServer,
  color: "red" | "yellow"
): void {
  const flagStr = s.flags.map((f) => FLAG_LABELS[f]).join(", ");
  console.log(c[color](`  ⚠ ${s.name}`) + c.dim(` — ${flagStr}`));
  console.log(c.dim(`    ${s.sourceFile}`));
  if (s.command) console.log(c.dim(`    ${s.command}`));
}

export function printJson(report: AuditReport): void {
  console.log(JSON.stringify(report, null, 2));
}
