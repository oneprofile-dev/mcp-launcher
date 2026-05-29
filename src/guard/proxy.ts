import { PolicyEngine } from "./policy.js";
import { ActionLogger } from "./logger.js";
import { CuratedBroker } from "./broker.js";
import { ToolCallRequest, ActionLog } from "./types.js";
import { randomUUID } from "crypto";

/**
 * SentinelProxy intercepts MCP tool calls, evaluates them against local policies,
 * and optionally syncs identity + audit to the curatedmcp.com control plane.
 */
export class SentinelProxy {
  private policyEngine: PolicyEngine;
  private actionLogger: ActionLogger;
  private downstreamCommand: string;
  private broker: CuratedBroker | null;

  constructor(
    policyFilePath: string,
    dbPath: string,
    downstreamCommand: string,
    broker?: CuratedBroker | null
  ) {
    this.policyEngine = new PolicyEngine(policyFilePath);
    this.actionLogger = new ActionLogger(dbPath);
    this.downstreamCommand = downstreamCommand;
    this.broker = broker ?? null;
  }

  /**
   * Evaluate a tool call request against local policies and the cloud broker.
   * Local policy always wins: a local BLOCK is never overridden by the broker.
   * Broker verify is fail-open: if unreachable, the local decision stands.
   */
  async evaluateRequest(
    toolName: string,
    serverId: string,
    args: Record<string, unknown>
  ) {
    const requestId = randomUUID();
    const timestamp = Date.now();

    const toolCall: ToolCallRequest = {
      id: requestId,
      serverId,
      toolName,
      arguments: args,
      timestamp,
    };

    // 1. Local policy evaluation (always runs)
    const decision = this.policyEngine.evaluateToolCall(toolCall);

    const log: ActionLog = {
      id: randomUUID(),
      requestId,
      serverId,
      toolName,
      arguments: JSON.stringify(args),
      action: decision.action,
      severity: decision.severity,
      ruleId: decision.ruleId,
      approvalStatus: decision.action === "REQUIRE_APPROVAL" ? "PENDING" : "CLEARED",
      timestamp,
      expiresAt: timestamp + 24 * 60 * 60 * 1000,
    };

    this.actionLogger.logAction(log);

    if (decision.action === "BLOCK") {
      // Log block to broker (fire-and-forget)
      this.broker?.logInvocation({
        serverSlug: serverId,
        toolName,
        args,
        outcome: "BLOCKED",
        blockReason: decision.ruleId ?? "local_policy",
        latencyMs: Date.now() - timestamp,
      });
      throw new Error(`Tool call blocked by policy: ${decision.ruleId ?? "unknown"}`);
    }

    if (decision.action === "REQUIRE_APPROVAL") {
      throw new Error(`Tool call requires approval: ${requestId}`);
    }

    // 2. Cloud broker verify (only when connected; fail-open)
    let jitTokenId: string | undefined;
    if (this.broker) {
      const jitToken = await this.broker.getJitToken(serverId);
      if (jitToken) {
        const verify = await this.broker.verify(jitToken, serverId, toolName);
        if (!verify.allowed) {
          this.broker.logInvocation({
            serverSlug: serverId,
            toolName,
            args,
            outcome: "BLOCKED",
            blockReason: verify.reason ?? "broker_denied",
            latencyMs: Date.now() - timestamp,
          });
          throw new Error(`Tool call denied by registry: ${verify.reason ?? "policy"}`);
        }
        jitTokenId = verify.jitTokenId;
      }
    }

    // 3. Log allowed invocation to broker (fire-and-forget)
    this.broker?.logInvocation({
      serverSlug: serverId,
      toolName,
      args,
      outcome: "ALLOWED",
      latencyMs: Date.now() - timestamp,
      jitTokenId,
    });

    return { success: true, requestId, decision };
  }

  async start() {
    // Register with broker on startup (idempotent)
    if (this.broker) {
      const id = await this.broker.register(`Sentinel — ${this.downstreamCommand.split(" ")[0]}`);
      if (id) {
        console.log(`🔐 Connected to CuratedMCP registry (identity: ${id.slice(0, 8)}…)`);
      } else {
        console.warn("⚠️  CuratedMCP broker configured but registration failed — running in local-only mode");
      }
    }

    console.log(`🔗 Sentinel Proxy initialized for: ${this.downstreamCommand}`);
  }

  shutdown() {
    this.actionLogger.close();
  }
}
