import { ActionLogger } from "./logger.js";
import { PolicyEngine } from "./policy.js";
import { DashboardData, ActionLog } from "./types.js";

// `express` is imported dynamically inside start() so the audit/run paths
// don't pay its load cost — only `guard` ever needs it.
type ExpressApp = import("express").Express;

export class Dashboard {
  private app: ExpressApp | null = null;
  private actionLogger: ActionLogger;
  private policyEngine: PolicyEngine;
  private port: number;

  constructor(
    actionLogger: ActionLogger,
    policyEngine: PolicyEngine,
    port: number = 4242
  ) {
    this.actionLogger = actionLogger;
    this.policyEngine = policyEngine;
    this.port = port;
  }

  private setupRoutes(
    express: typeof import("express"),
    app: ExpressApp
  ) {
    this.app = app;
    this.app.use(express.static("public"));
    this.app.use(express.json());

    this.app.get("/api/status", (req, res) => {
      const data = this.getDashboardData();
      res.json(data);
    });

    this.app.post("/api/approve/:requestId", (req, res) => {
      const { requestId } = req.params;
      const { approver } = req.body;

      try {
        this.actionLogger.approveAction(requestId, approver || "manual");
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.post("/api/reject/:requestId", (req, res) => {
      const { requestId } = req.params;
      const { reason } = req.body;

      try {
        this.actionLogger.rejectAction(requestId, reason || "Manual rejection");
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: String(error) });
      }
    });

    this.app.get("/", (req, res) => {
      res.send(this.renderHTML());
    });
  }

  private getDashboardData(): DashboardData {
    const summary = this.actionLogger.getSummary() as any;
    const recentActions = this.actionLogger.getRecentActions(20);
    const pendingApprovals = this.actionLogger.getPendingApprovals();
    const activePolicies = this.policyEngine.listRules();

    return {
      summary: {
        totalLogs: summary?.total || 0,
        blockedCount: summary?.blocked || 0,
        approvedCount: summary?.approved || 0,
        rejectedCount: summary?.rejected || 0,
      },
      recentActions,
      pendingApprovals,
      activePolicies,
      retentionMinutes: 1440, // 24h default
    };
  }

  private renderHTML(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sentinel Dashboard</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f5f5f5;
            color: #333;
          }
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 20px;
            margin: -20px -20px 30px -20px;
            border-radius: 8px 8px 0 0;
          }
          h1 { font-size: 28px; margin-bottom: 10px; }
          .subtitle { opacity: 0.9; font-size: 14px; }
          
          .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
          }
          .tab {
            padding: 12px 20px;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            border-bottom: 3px solid transparent;
            color: #666;
            transition: all 0.2s;
          }
          .tab.active {
            color: #667eea;
            border-bottom-color: #667eea;
          }
          .tab:hover {
            color: #667eea;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          .card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .card-title {
            font-size: 12px;
            color: #999;
            text-transform: uppercase;
            margin-bottom: 10px;
          }
          .card-value {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
          }

          .actions-table {
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            background: #f9f9f9;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
            color: #666;
            border-bottom: 1px solid #e0e0e0;
          }
          td {
            padding: 12px;
            border-bottom: 1px solid #e0e0e0;
          }
          tr:last-child td { border-bottom: none; }

          .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .badge.critical { background: #fee; color: #c33; }
          .badge.warning { background: #fef3cd; color: #856404; }
          .badge.info { background: #d1ecf1; color: #0c5460; }
          .badge.block { background: #f8d7da; color: #721c24; }
          .badge.allow { background: #d4edda; color: #155724; }

          .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
          }
          .modal.active { display: flex; align-items: center; justify-content: center; }
          .modal-content {
            background: white;
            padding: 30px;
            border-radius: 8px;
            max-width: 500px;
            width: 90%;
          }
          .modal-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            justify-content: flex-end;
          }
          button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
          }
          .btn-primary {
            background: #667eea;
            color: white;
          }
          .btn-primary:hover { background: #5568d3; }
          .btn-danger {
            background: #e74c3c;
            color: white;
          }
          .btn-danger:hover { background: #c0392b; }
          .btn-secondary {
            background: #e0e0e0;
            color: #333;
          }
          .btn-secondary:hover { background: #d0d0d0; }

          .tab-content { display: none; }
          .tab-content.active { display: block; }
        </style>
      </head>
      <body>
        <div class="container">
          <header>
            <h1>🛡️ Sentinel Dashboard</h1>
            <p class="subtitle">Local-first MCP action firewall</p>
          </header>

          <div class="tabs">
            <button class="tab active" data-tab="overview">Overview</button>
            <button class="tab" data-tab="actions">Recent Actions</button>
            <button class="tab" data-tab="approvals">Pending Approvals</button>
            <button class="tab" data-tab="policies">Policies</button>
          </div>

          <div id="overview" class="tab-content active">
            <div class="grid" id="summary-grid">
              <div class="card">
                <div class="card-title">Total Actions</div>
                <div class="card-value">0</div>
              </div>
              <div class="card">
                <div class="card-title">Blocked</div>
                <div class="card-value">0</div>
              </div>
              <div class="card">
                <div class="card-title">Approved</div>
                <div class="card-value">0</div>
              </div>
              <div class="card">
                <div class="card-title">Rejected</div>
                <div class="card-value">0</div>
              </div>
            </div>
          </div>

          <div id="actions" class="tab-content">
            <div class="actions-table">
              <table>
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Server</th>
                    <th>Action</th>
                    <th>Severity</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody id="actions-body">
                  <tr><td colspan="5" style="text-align:center; color: #999;">No actions yet</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div id="approvals" class="tab-content">
            <div class="actions-table">
              <table>
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Server</th>
                    <th>Arguments</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="approvals-body">
                  <tr><td colspan="4" style="text-align:center; color: #999;">No pending approvals</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div id="policies" class="tab-content">
            <div class="actions-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Tool Pattern</th>
                    <th>Action</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="policies-body">
                  <tr><td colspan="4" style="text-align:center; color: #999;">No policies</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <script>
          // Tab switching
          document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
              document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
              document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
              e.target.classList.add('active');
              const tabId = e.target.getAttribute('data-tab');
              document.getElementById(tabId).classList.add('active');
            });
          });

          // Load dashboard data
          async function loadData() {
            try {
              const response = await fetch('/api/status');
              const data = await response.json();
              updateUI(data);
            } catch (error) {
              console.error('Failed to load dashboard:', error);
            }
          }

          function updateUI(data) {
            // Update summary
            const values = [data.summary.totalLogs, data.summary.blockedCount, data.summary.approvedCount, data.summary.rejectedCount];
            document.querySelectorAll('.card-value').forEach((el, i) => {
              el.textContent = values[i] || 0;
            });

            // Update actions table
            const actionsBody = document.getElementById('actions-body');
            if (data.recentActions.length > 0) {
              actionsBody.innerHTML = data.recentActions.map(action => '
                <tr>
                  <td>' + action.toolName + '</td>
                  <td>' + action.serverId + '</td>
                  <td><span class="badge badge-' + action.action.toLowerCase() + '">' + action.action + '</span></td>
                  <td><span class="badge badge-' + action.severity.toLowerCase() + '">' + action.severity + '</span></td>
                  <td>' + new Date(action.timestamp).toLocaleTimeString() + '</td>
                </tr>
              ').join('');
            }

            // Update pending approvals
            const approvalsBody = document.getElementById('approvals-body');
            if (data.pendingApprovals.length > 0) {
              approvalsBody.innerHTML = data.pendingApprovals.map(approval => '
                <tr>
                  <td>' + approval.toolName + '</td>
                  <td>' + approval.serverId + '</td>
                  <td style="font-size: 12px; color: #666;"><code>' + approval.arguments.substring(0, 50) + '...</code></td>
                  <td>
                    <button class="btn-primary" onclick="approveRequest(\'' + approval.requestId + '\')">Approve</button>
                    <button class="btn-danger" onclick="rejectRequest(\'' + approval.requestId + '\')">Reject</button>
                  </td>
                </tr>
              ').join('');
            }

            // Update policies
            const policiesBody = document.getElementById('policies-body');
            if (data.activePolicies.length > 0) {
              policiesBody.innerHTML = data.activePolicies.map(policy => '
                <tr>
                  <td>' + policy.name + '</td>
                  <td><code>' + policy.toolName + '</code></td>
                  <td><span class="badge badge-' + policy.action.toLowerCase() + '">' + policy.action + '</span></td>
                  <td>' + (policy.enabled ? '✓ Active' : '✗ Disabled') + '</td>
                </tr>
              ').join('');
            }
          }

          async function approveRequest(requestId) {
            try {
              await fetch('/api/approve/' + requestId, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({approver: 'dashboard'}) });
              loadData();
            } catch (error) {
              console.error('Approval failed:', error);
            }
          }

          async function rejectRequest(requestId) {
            try {
              await fetch('/api/reject/' + requestId, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({reason: 'Rejected via dashboard'}) });
              loadData();
            } catch (error) {
              console.error('Rejection failed:', error);
            }
          }

          // Load data on startup and refresh every 5s
          loadData();
          setInterval(loadData, 5000);
        </script>
      </body>
      </html>
    `;
  }

  async start() {
    const mod = await import("express");
    const express = ((mod as { default?: typeof import("express") }).default ??
      mod) as typeof import("express");
    const app = express();
    this.setupRoutes(express, app);
    app.listen(this.port, () => {
      console.log(`📊 Guard dashboard running at http://localhost:${this.port}`);
    });
  }
}
