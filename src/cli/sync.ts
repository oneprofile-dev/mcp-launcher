import { API_URL, getToken, whoami } from "../auth.js";
import { upsertEntry } from "../stack.js";
import { runAudit } from "../audit/index.js";

interface TeamConfig {
  mcpServers: Record<
    string,
    { command?: string; args?: string[]; env?: Record<string, string>; url?: string }
  >;
  _meta?: { team?: string; serverCount?: number };
}

async function fetchTeamConfig(
  slug: string,
  token: string
): Promise<TeamConfig | null> {
  try {
    const res = await fetch(`${API_URL}/api/teams/${slug}/config`, {
      headers: {
        "User-Agent": "@curatedmcp/cli",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as TeamConfig;
  } catch {
    return null;
  }
}

async function pushAudit(token: string): Promise<boolean> {
  try {
    const report = await runAudit({});
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

export async function runSync(args: string[]): Promise<number> {
  const token = getToken();
  if (!token) {
    console.error("Not signed in. Run `curatedmcp login` first.");
    return 1;
  }

  const id = await whoami(token);
  if (!id) {
    console.error("Session expired. Run `curatedmcp login` again.");
    return 1;
  }

  const flagSlug = (() => {
    const i = args.indexOf("--team");
    return i >= 0 ? args[i + 1] : undefined;
  })();
  const slug = flagSlug ?? id.teams[0]?.slug;

  if (!slug) {
    console.error(
      "No team found on your account. Create one at " + `${API_URL}/teams`
    );
    return 1;
  }

  const config = await fetchTeamConfig(slug, token);
  if (!config) {
    console.error(`Could not fetch config for team "${slug}".`);
    return 1;
  }

  let added = 0;
  for (const [name, def] of Object.entries(config.mcpServers)) {
    if (!def.command) continue; // stack requires a spawnable command (skip url/http servers)
    upsertEntry({
      slug: name,
      command: def.command,
      args: def.args ?? [],
      env: def.env,
      note: `team:${slug}`,
    });
    added++;
  }

  console.log(
    `\n✓ Synced ${added} server(s) from team "${config._meta?.team ?? slug}" into your stack.`
  );

  const pushed = await pushAudit(token);
  console.log(
    pushed
      ? "✓ Local security audit reported to the team."
      : "ℹ️  Audit not reported (endpoint unavailable or no permission)."
  );
  console.log("  Restart your AI client to load the synced servers.\n");
  return 0;
}
