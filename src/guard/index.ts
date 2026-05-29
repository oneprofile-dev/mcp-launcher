import path from "path";
import os from "os";
import fs from "fs";
import { SentinelProxy } from "./proxy.js";
import { PolicyEngine } from "./policy.js";
import { ActionLogger } from "./logger.js";
import { Dashboard } from "./dashboard.js";
import { CuratedBroker } from "./broker.js";

export { PolicyEngine } from "./policy.js";
export { SentinelProxy } from "./proxy.js";
export { ActionLogger } from "./logger.js";

const GUARD_DIR = path.join(os.homedir(), ".curatedmcp", "guard");

export interface GuardOptions {
  command: string[]; // downstream MCP server command + args
  policyPath?: string;
  dbPath?: string;
  port?: number;
  dashboard?: boolean;
  registryKey?: string;
  registrySlug?: string;
  registryUrl?: string;
}

function ensureDir() {
  if (!fs.existsSync(GUARD_DIR)) fs.mkdirSync(GUARD_DIR, { recursive: true });
}

function seedDefaultPolicy(policyPath: string) {
  if (fs.existsSync(policyPath)) return;
  try {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const seed = path.join(here, "default-policy.json");
    if (fs.existsSync(seed)) fs.copyFileSync(seed, policyPath);
  } catch {
    // PolicyEngine seeds sane defaults in-memory if the file is absent.
  }
}

/**
 * Run the MCP action firewall in front of a downstream server.
 * Local policy is always enforced; the cloud broker (team registry) is
 * opt-in via flags or CURATED_REGISTRY_* env vars and fails open.
 */
export async function runGuard(opts: GuardOptions): Promise<void> {
  ensureDir();
  const policyPath = opts.policyPath ?? path.join(GUARD_DIR, "policy.json");
  const dbPath = opts.dbPath ?? path.join(GUARD_DIR, "actions.db");
  seedDefaultPolicy(policyPath);

  const registryKey = opts.registryKey ?? process.env.CURATED_REGISTRY_KEY;
  const registrySlug = opts.registrySlug ?? process.env.CURATED_REGISTRY_SLUG;
  const broker =
    registryKey && registrySlug
      ? new CuratedBroker({
          registryUrl:
            opts.registryUrl ??
            process.env.CURATED_REGISTRY_URL ??
            "https://curatedmcp.com",
          registryKey,
          registrySlug,
        })
      : null;

  if (!broker) {
    console.log(
      "ℹ️  Guard running in local-only mode. Pass --registry-key + --registry-slug (or set CURATED_REGISTRY_*) to enable team identity & audit."
    );
  }

  const proxy = new SentinelProxy(policyPath, dbPath, opts.command.join(" "), broker);
  await proxy.start();

  if (opts.dashboard) {
    const dashboard = new Dashboard(
      new ActionLogger(dbPath),
      new PolicyEngine(policyPath),
      opts.port ?? 4242
    );
    await dashboard.start();
  }
}
