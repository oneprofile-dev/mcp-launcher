import { PolicyRule, PolicyAction, SeverityLevel, ToolCallRequest } from "./types.js";
import { minimatch } from "minimatch";
import fs from "fs";

export class PolicyEngine {
  private rules: Map<string, PolicyRule> = new Map();
  private policyFilePath: string;

  // Dangerous patterns (default blocking rules)
  private readonly dangerousPatterns = {
    shell: ["sh", "bash", "zsh", "cmd", "powershell", "exec", "system"],
    fileDelete: ["unlink", "rmdir", "rm", "del", "DeleteFile"],
    secrets: ["SECRET", "TOKEN", "PASSWORD", "PRIVATE", "API_KEY", "CREDENTIAL"],
  };

  constructor(policyFilePath: string) {
    this.policyFilePath = policyFilePath;
    this.loadPolicies();
    this.addDefaultPolicies();
  }

  private loadPolicies(): void {
    try {
      if (fs.existsSync(this.policyFilePath)) {
        const data = fs.readFileSync(this.policyFilePath, "utf-8");
        const policies = JSON.parse(data) as PolicyRule[];
        policies.forEach((rule) => this.rules.set(rule.id, rule));
      }
    } catch (error) {
      console.warn(`Failed to load policies: ${error}`);
    }
  }

  private addDefaultPolicies(): void {
    // Only add defaults if no policies exist
    if (this.rules.size === 0) {
      const defaults: PolicyRule[] = [
        {
          id: "default-block-shell",
          name: "Block Shell Execution",
          serverName: "*",
          toolName: "*",
          action: "BLOCK",
          severity: "CRITICAL",
          enabled: true,
          createdAt: Date.now(),
        },
        {
          id: "default-block-file-delete",
          name: "Block File Deletion",
          serverName: "*",
          toolName: "*rm*",
          action: "BLOCK",
          severity: "CRITICAL",
          enabled: true,
          createdAt: Date.now(),
        },
      ];

      defaults.forEach((rule) => this.rules.set(rule.id, rule));
    }
  }

  evaluateToolCall(request: ToolCallRequest): {
    action: PolicyAction;
    ruleId?: string;
    severity: SeverityLevel;
  } {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check glob patterns
      if (!minimatch(request.serverId, rule.serverName)) continue;
      if (!minimatch(request.toolName, rule.toolName)) continue;

      // Check argument patterns
      if (rule.argumentContains && rule.argumentContains.length > 0) {
        const argsJson = JSON.stringify(request.arguments);
        const hasMatch = rule.argumentContains.some((pattern) =>
          argsJson.includes(pattern)
        );
        if (!hasMatch) continue;
      }

      // Check dangerous patterns in arguments
      const argsJson = JSON.stringify(request.arguments).toUpperCase();

      if (
        this.dangerousPatterns.shell.some((pattern) =>
          argsJson.includes(pattern.toUpperCase())
        )
      ) {
        return { action: "BLOCK", ruleId: rule.id, severity: "CRITICAL" };
      }

      if (
        this.dangerousPatterns.fileDelete.some((pattern) =>
          argsJson.includes(pattern.toUpperCase())
        )
      ) {
        return { action: "BLOCK", ruleId: rule.id, severity: "CRITICAL" };
      }

      if (
        this.dangerousPatterns.secrets.some((pattern) =>
          argsJson.includes(pattern)
        )
      ) {
        return { action: "BLOCK", ruleId: rule.id, severity: "CRITICAL" };
      }

      return {
        action: rule.action,
        ruleId: rule.id,
        severity: rule.severity,
      };
    }

    // Default: allow if no rules match
    return { action: "ALLOW", severity: "INFO" };
  }

  addRule(rule: PolicyRule): void {
    this.rules.set(rule.id, rule);
    this.savePolicies();
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.savePolicies();
  }

  listRules(): PolicyRule[] {
    return Array.from(this.rules.values());
  }

  private savePolicies(): void {
    const policies = Array.from(this.rules.values());
    fs.writeFileSync(this.policyFilePath, JSON.stringify(policies, null, 2));
  }
}
