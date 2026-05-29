import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { track } from "./telemetry.js";

const CONFIG_DIR = join(homedir(), ".curatedmcp");
const CONFIG_FILE = join(CONFIG_DIR, "launcher.json");

const UPGRADE_INTERVAL_MS = 24 * 60 * 60 * 1000; // at most once/day
const FEEDBACK_EVERY_N_RUNS = 15; // hint roughly every 15 commands

interface NudgeState {
  anonId?: string;
  version?: string;
  runCount?: number;
  lastUpgradePromptAt?: string;
  lastFeedbackPromptAt?: string;
}

function readState(): NudgeState {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as NudgeState;
  } catch {
    return {};
  }
}

function writeState(state: NudgeState): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(state, null, 2));
  } catch {
    // best-effort
  }
}

/** Compare two semver strings. Returns 1 if a > b, -1 if a < b, 0 if equal. */
function semverCompare(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch("https://registry.npmjs.org/curatedmcp/latest", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return body.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Post-command nudge: shows an upgrade prompt when a newer version is published
 * (throttled to once/day) and an occasional feedback hint. Fully non-blocking
 * and silent on any failure — telemetry/network problems never affect the
 * command the user actually ran.
 */
export async function maybeNudge(currentVersion: string): Promise<void> {
  if (process.env.CURATOR_TELEMETRY === "false" || process.argv.includes("--no-telemetry")) {
    return;
  }
  if (!process.stdout.isTTY) return; // don't nag inside scripts/CI/pipes

  const state = readState();
  state.runCount = (state.runCount ?? 0) + 1;

  // ── Upgrade prompt (throttled) ──────────────────────────────────────────
  const lastUpgrade = state.lastUpgradePromptAt
    ? Date.parse(state.lastUpgradePromptAt)
    : 0;
  if (Date.now() - lastUpgrade > UPGRADE_INTERVAL_MS) {
    const latest = await fetchLatestVersion();
    if (latest && semverCompare(latest, currentVersion) > 0) {
      console.error(
        `\n  ↑ A new version of curatedmcp is available (${currentVersion} → ${latest}).` +
          `\n    Upgrade:  npm i -g curatedmcp@latest   (or just rerun via npx)\n`
      );
      state.lastUpgradePromptAt = new Date().toISOString();
      void track("upgrade_prompt_shown", { from: currentVersion, to: latest });
    } else {
      // Record the check so we don't hammer the registry on every command.
      state.lastUpgradePromptAt = new Date().toISOString();
    }
  }

  // ── Feedback hint (every N runs) ────────────────────────────────────────
  if (state.runCount % FEEDBACK_EVERY_N_RUNS === 0) {
    console.error(
      `\n  💬 Enjoying CuratedMCP? Tell us what's working (or not):` +
        `\n     npx curatedmcp feedback\n`
    );
    state.lastFeedbackPromptAt = new Date().toISOString();
  }

  writeState(state);
}
