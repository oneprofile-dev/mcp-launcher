import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

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

export class Telemetry {
  private anonId: string;
  private enabled: boolean;

  constructor() {
    this.enabled =
      process.env.CURATOR_TELEMETRY !== "false" &&
      process.argv[process.argv.length - 1] !== "--no-telemetry";

    this.anonId = this.loadOrCreateAnonId();
  }

  private loadOrCreateAnonId(): string {
    try {
      // Try to read existing config
      const data = readFileSync(CONFIG_FILE, "utf-8");
      const config: TelemetryConfig = JSON.parse(data);
      return config.anonId;
    } catch {
      // Create new config with fresh UUID
      const anonId = randomUUID();
      try {
        const config: TelemetryConfig = {
          anonId,
          version: "1.0.0",
        };
        if (!existsSync(CONFIG_DIR)) {
          mkdirSync(CONFIG_DIR, { recursive: true });
        }
        writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      } catch (err) {
        // Silently fail if we can't write config
        console.error(
          "[telemetry] Failed to write config (non-blocking):",
          err
        );
      }
      return anonId;
    }
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
          "User-Agent": "@curatedmcp/launcher/1.0.0",
        },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Silently fail on network error
      });
    } catch (err) {
      // Non-blocking telemetry failures
      // console.error("[telemetry] error:", err);
    }
  }
}
