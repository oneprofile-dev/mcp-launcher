import { createHash, randomBytes } from "crypto";

export interface BrokerConfig {
  registryUrl: string;   // e.g. https://curatedmcp.com
  registryKey: string;   // cmcp_reg_... API key
  registrySlug: string;  // org slug, e.g. "acme-corp"
}

export interface VerifyResult {
  allowed: boolean;
  agentIdentityId?: string;
  jitTokenId?: string;
  scopes?: string[];
  reason?: string;
}

/**
 * CuratedBroker — thin HTTP client that connects Sentinel to the
 * curatedmcp.com identity and audit layer.
 *
 * Configure via env vars:
 *   CURATED_REGISTRY_URL   (default: https://curatedmcp.com)
 *   CURATED_REGISTRY_KEY   required — cmcp_reg_... API key from dashboard
 *   CURATED_REGISTRY_SLUG  required — your org slug
 */
export class CuratedBroker {
  private baseUrl: string;
  private key: string;
  private slug: string;
  private agentIdentityId: string | null = null;
  private jitTokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(config: BrokerConfig) {
    this.baseUrl = config.registryUrl.replace(/\/$/, "");
    this.key = config.registryKey;
    this.slug = config.registrySlug;
  }

  static fromEnv(): CuratedBroker | null {
    const key = process.env.CURATED_REGISTRY_KEY;
    const slug = process.env.CURATED_REGISTRY_SLUG;
    if (!key || !slug) return null;
    return new CuratedBroker({
      registryUrl: process.env.CURATED_REGISTRY_URL ?? "https://curatedmcp.com",
      registryKey: key,
      registrySlug: slug,
    });
  }

  private url(path: string): string {
    return `${this.baseUrl}/api/v1/registry/${this.slug}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
    };
  }

  /** Stable fingerprint derived from machine-level entropy stored in ~/.sentinel */
  static machineFingerprint(): string {
    const machineId = process.env.CURATED_MACHINE_ID ?? `${process.platform}-${process.arch}`;
    return createHash("sha256").update(machineId).digest("hex");
  }

  /**
   * Register this Sentinel instance with the org's registry.
   * Idempotent — safe to call on every startup.
   */
  async register(name = "Sentinel"): Promise<string | null> {
    try {
      const res = await fetch(this.url("/identity"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          fingerprint: CuratedBroker.machineFingerprint(),
          name,
          description: `Sentinel v${process.env.npm_package_version ?? "0.x"} on ${process.platform}`,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { identity?: { id: string } };
      this.agentIdentityId = data.identity?.id ?? null;
      return this.agentIdentityId;
    } catch {
      return null;
    }
  }

  /**
   * Issue a JIT token scoped to a specific MCP server.
   * Tokens are cached in-memory for their lifetime.
   */
  async getJitToken(serverSlug: string): Promise<string | null> {
    const cached = this.jitTokens.get(serverSlug);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    if (!this.agentIdentityId) return null;

    try {
      const res = await fetch(this.url("/jit-token"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          agentIdentityId: this.agentIdentityId,
          serverSlug,
          scopes: [],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string; expiresAt?: string };
      if (!data.token) return null;
      this.jitTokens.set(serverSlug, {
        token: data.token,
        expiresAt: data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 3_600_000,
      });
      return data.token;
    } catch {
      return null;
    }
  }

  /**
   * Verify a JIT token before executing a tool call.
   * Returns { allowed: true } if the call should proceed.
   */
  async verify(token: string, serverSlug: string, toolName: string): Promise<VerifyResult> {
    try {
      const res = await fetch(this.url("/jit-token/verify"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ token, serverSlug, toolName }),
      });
      if (!res.ok) return { allowed: false, reason: "broker_error" };
      return (await res.json()) as VerifyResult;
    } catch {
      // Fail open when broker is unreachable — local policy still applies
      return { allowed: true, reason: "broker_unreachable" };
    }
  }

  /**
   * Log a completed tool invocation. Fire-and-forget: errors are swallowed.
   */
  logInvocation(opts: {
    serverSlug: string;
    toolName: string;
    args: Record<string, unknown>;
    outcome: "ALLOWED" | "BLOCKED" | "RATE_LIMITED" | "ERROR";
    blockReason?: string;
    latencyMs?: number;
    jitTokenId?: string;
  }): void {
    const argsHash = createHash("sha256")
      .update(JSON.stringify(opts.args))
      .digest("hex");

    fetch(this.url("/tool-invocations"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        agentIdentityId: this.agentIdentityId,
        jitTokenId: opts.jitTokenId,
        serverSlug: opts.serverSlug,
        toolName: opts.toolName,
        argsHash,
        outcome: opts.outcome,
        blockReason: opts.blockReason,
        latencyMs: opts.latencyMs,
      }),
    }).catch(() => undefined);
  }
}
