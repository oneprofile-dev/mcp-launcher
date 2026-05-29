import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getToken } from "./auth.js";

const API_URL = process.env.CURATOR_API_URL || "https://www.curatedmcp.com";
const CONFIG_DIR = join(homedir(), ".curatedmcp");
const CONFIG_FILE = join(CONFIG_DIR, "launcher.json");

interface TelemetryConfig {
  anonId: string;
  version: string;
}

interface Event {
  event: "search" | "install" | "details" | "list-categories";
  slug: string | null;
  client: string | null;
  query: string | null;
}

/** Funnel events tracked across the agent's activation lifecycle. */
export type FunnelEvent =
  | "audit_run"
  | "command_run"
  | "login"
  | "sync"
  | "upgrade_prompt_shown"
  | "feedback_submitted";

function telemetryEnabled(): boolean {
  return (
    process.env.CURATOR_TELEMETRY !== "false" &&
    !process.argv.includes("--no-telemetry")
  );
}

/** Read the persisted anonymous id, creating one (and the config file) if absent. */
export function getAnonId(): string {
  try {
    const config: TelemetryConfig = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    if (config.anonId) return config.anonId;
  } catch {
    // fall through to create
  }
  const anonId = randomUUID();
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(
      CONFIG_FILE,
      JSON.stringify({ anonId, version: "2.0.0" } satisfies TelemetryConfig, null, 2)
    );
  } catch {
    // Non-blocking — telemetry is best-effort.
  }
  return anonId;
}

/**
 * Fire-and-forget activation funnel event. Keyed by the persistent anonId so the
 * funnel (audit_run → command_run → login → sync) stays joinable before and
 * after a user authenticates. When signed in, the auth token is attached so the
 * backend can resolve the event to a user/team.
 */
export async function track(
  event: FunnelEvent,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!telemetryEnabled()) return;
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "curatedmcp/2.0.0",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    await fetch(`${API_URL}/api/launcher/telemetry`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event,
        anonId: getAnonId(),
        metadata: metadata ?? null,
        ts: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => undefined);
  } catch {
    // Non-blocking telemetry failures.
  }
}

export class Telemetry {
  private anonId: string;
  private enabled: boolean;

  constructor() {
    this.enabled = telemetryEnabled();
    this.anonId = getAnonId();
  }

  async logEvent(event: Event): Promise<void> {
    if (!this.enabled) return;

    try {
      const payload = {
        event: event.event,
        anonId: this.anonId,
        slug: event.slug,
        client: event.client,
        query: event.query,
        ts: new Date().toISOString(),
      };

      await fetch(`${API_URL}/api/launcher/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "curatedmcp/2.0.0",
        },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Silently fail on network error
      });
    } catch {
      // Non-blocking telemetry failures
    }
  }
}
