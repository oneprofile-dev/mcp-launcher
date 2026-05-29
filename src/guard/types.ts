export type PolicyAction = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
export type SeverityLevel = "INFO" | "WARNING" | "CRITICAL";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CLEARED";

export interface PolicyRule {
  id: string;
  name: string;
  serverName: string; // glob pattern
  toolName: string; // glob pattern
  argumentContains?: string[];
  action: PolicyAction;
  severity: SeverityLevel;
  enabled: boolean;
  createdAt: number;
}

export interface ToolCallRequest {
  id: string;
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

export interface ActionLog {
  id: string;
  requestId: string;
  serverId: string;
  toolName: string;
  arguments: string; // JSON stringified
  action: PolicyAction;
  severity: SeverityLevel;
  ruleId?: string;
  approvalStatus: ApprovalStatus;
  approvedAt?: number;
  approvedBy?: string;
  rejectionReason?: string;
  timestamp: number;
  expiresAt?: number;
}

export interface PendingApproval {
  id: string;
  requestId: string;
  serverId: string;
  toolName: string;
  arguments: string;
  ruleId: string;
  requestedAt: number;
  expiresAt: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

export interface DashboardData {
  summary: {
    totalLogs: number;
    blockedCount: number;
    approvedCount: number;
    rejectedCount: number;
  };
  recentActions: ActionLog[];
  pendingApprovals: PendingApproval[];
  activePolicies: PolicyRule[];
  retentionMinutes: number;
}

export interface SentinelConfig {
  policyFile: string;
  dbPath: string;
  dashboardPort: number;
  retentionMinutes: number;
  licenseKey?: string;
  offlineMode: boolean;
  telemetryEnabled: boolean;
}
