import fs from "fs";
import path from "path";
import { ActionLog, PendingApproval } from "./types.js";

/**
 * ActionLogger - Simple JSON-based persistent logger
 * Production versions can migrate to proper SQLite
 */
export class ActionLogger {
  private dbPath: string;
  private logsFile: string;
  private approvalsFile: string;
  private logs: ActionLog[] = [];
  private approvals: PendingApproval[] = [];

  constructor(dbPath: string) {
    this.dbPath = path.dirname(dbPath);
    this.logsFile = path.join(this.dbPath, "action_logs.json");
    this.approvalsFile = path.join(this.dbPath, "pending_approvals.json");

    // Ensure directory exists
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }

    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.logsFile)) {
        const data = fs.readFileSync(this.logsFile, "utf-8");
        this.logs = JSON.parse(data);
      }
      if (fs.existsSync(this.approvalsFile)) {
        const data = fs.readFileSync(this.approvalsFile, "utf-8");
        this.approvals = JSON.parse(data);
      }
    } catch (error) {
      console.warn("Failed to load logs from disk:", error);
      this.logs = [];
      this.approvals = [];
    }
  }

  private saveToDisk() {
    try {
      fs.writeFileSync(this.logsFile, JSON.stringify(this.logs, null, 2));
      fs.writeFileSync(this.approvalsFile, JSON.stringify(this.approvals, null, 2));
    } catch (error) {
      console.error("Failed to save logs to disk:", error);
    }
  }

  private initializeSchema() {
    // No-op for JSON-based storage
  }

  logAction(log: ActionLog): void {
    // Prevent duplicates
    if (!this.logs.find((l) => l.requestId === log.requestId)) {
      this.logs.push(log);
      this.saveToDisk();
    }
  }

  getPendingApprovals(): PendingApproval[] {
    const now = Date.now();
    return this.approvals
      .filter((a) => a.status === "PENDING" && a.expiresAt > now)
      .sort((a, b) => b.requestedAt - a.requestedAt)
      .slice(0, 100);
  }

  approveAction(requestId: string, approvedBy: string): void {
    // Update action logs
    const log = this.logs.find((l) => l.requestId === requestId);
    if (log) {
      log.approvalStatus = "APPROVED";
      log.approvedAt = Date.now();
      log.approvedBy = approvedBy;
    }

    // Update pending approvals
    const approval = this.approvals.find((a) => a.requestId === requestId);
    if (approval) {
      approval.status = "APPROVED";
    }

    this.saveToDisk();
  }

  rejectAction(requestId: string, reason: string): void {
    // Update action logs
    const log = this.logs.find((l) => l.requestId === requestId);
    if (log) {
      log.approvalStatus = "REJECTED";
      log.rejectionReason = reason;
    }

    // Update pending approvals
    const approval = this.approvals.find((a) => a.requestId === requestId);
    if (approval) {
      approval.status = "REJECTED";
    }

    this.saveToDisk();
  }

  getRecentActions(limit: number = 50): ActionLog[] {
    return this.logs
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  purgeExpired(retentionMinutes: number): number {
    const expirationTime = Date.now() - retentionMinutes * 60 * 1000;
    const initialLength = this.logs.length;

    this.logs = this.logs.filter(
      (log) => !log.expiresAt || log.expiresAt >= expirationTime
    );

    const purged = initialLength - this.logs.length;
    if (purged > 0) {
      this.saveToDisk();
    }

    return purged;
  }

  getSummary() {
    const total = this.logs.length;
    const blocked = this.logs.filter((l) => l.action === "BLOCK").length;
    const approved = this.logs.filter(
      (l) => l.approvalStatus === "APPROVED"
    ).length;
    const rejected = this.logs.filter(
      (l) => l.approvalStatus === "REJECTED"
    ).length;

    return { total, blocked, approved, rejected };
  }

  close(): void {
    this.saveToDisk();
  }
}
