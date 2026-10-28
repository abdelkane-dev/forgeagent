import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function buildAllAssets() {
  console.log('🚀 Starting PNG rendering with Playwright...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Convert Base SVGs to PNG
  const svgItems = [
    { svg: 'skills/assets/forgeagent-architect-icon.svg', png: 'skills/assets/forgeagent-architect-icon.png', w: 512, h: 512 },
    { svg: 'skills/assets/forgeagent-evaluator-icon.svg', png: 'skills/assets/forgeagent-evaluator-icon.png', w: 512, h: 512 },
    { svg: 'skills/assets/forgeagent-architect-card.svg', png: 'skills/assets/forgeagent-architect-card.png', w: 1920, h: 1080 },
    { svg: 'skills/assets/forgeagent-evaluator-card.svg', png: 'skills/assets/forgeagent-evaluator-card.png', w: 1920, h: 1080 },
  ];

  for (const item of svgItems) {
    const svg = readFileSync(resolve(item.svg), 'utf-8');
    await page.setViewportSize({ width: item.w, height: item.h });
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:#0d0d0d;">${svg}</body></html>`);
    await page.screenshot({ path: resolve(item.png), type: 'png' });
    console.log(`✓ Generated ${item.png} (${item.w}x${item.h})`);
  }

  // 2. Generate Demo 1: Architect Flow in Action (1600x900)
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #0f0d0b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .window { width: 1480px; height: 820px; background: #181411; border-radius: 16px; border: 1px solid #2f251e; box-shadow: 0 25px 60px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden; }
  .header { height: 48px; background: #201a15; border-bottom: 1px solid #2f251e; display: flex; align-items: center; padding: 0 20px; }
  .dots { display: flex; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .dot.red { background: #ef4444; }
  .dot.yellow { background: #f59e0b; }
  .dot.green { background: #10b981; }
  .title { margin-left: 24px; font-size: 14px; font-weight: 600; color: #94a3b8; }
  .content { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 28px; flex: 1; }
  .panel { background: #120e0c; border: 1px solid #28201a; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; }
  .panel-title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #ff7a1a; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
  .user-prompt { background: #1c1612; border-left: 4px solid #ff7a1a; padding: 14px; border-radius: 6px; font-size: 15px; margin-bottom: 16px; line-height: 1.5; color: #f1f5f9; }
  pre { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; line-height: 1.6; margin: 0; color: #cbd5e1; overflow: hidden; }
  .badge { background: #143522; color: #4ade80; border: 1px solid #22c55e; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
  .badge-cyan { background: #0e2b3d; color: #38bdf8; border: 1px solid #0284c7; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
</style>
</head>
<body>
  <div class="window">
    <div class="header">
      <div class="dots"><div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div></div>
      <div class="title">ForgeAgent Architect — Interactive Design &amp; Security Session</div>
    </div>
    <div class="content">
      <div class="panel">
        <div class="panel-title"><span>User Brief &amp; Architecture Engine</span> <span class="badge-cyan">AUTONOMOUS</span></div>
        <div class="user-prompt">
          <strong>Developer Brief:</strong> "I need an agent that monitors PostgreSQL for deadlocks, notifies the #incidents Slack channel, and creates a remediation ticket if severity is high."
        </div>
        <pre><span style="color:#ff7a1a">=== FORGEAGENT ARCHITECT BLUEPRINT ===</span>
<b>Model:</b>       claude-3-5-sonnet-latest (Balanced AST reasoning)
<b>Autonomy:</b>    act_after_approval (Human gate on ticket creation)
<b>Connectors:</b>  mcp_postgres (read: readOnlyHint=true)
             mcp_slack (read_write: openWorldHint=true)
<b>Security:</b>    PostgreSQL RLS Mode "task" + SSRF Filtering
<b>Daily Cap:</b>   $6.00 / day

<span style="color:#38bdf8">=== READY-TO-USE ZOD SCHEMA ===</span>
export const DisputeAlertSchema = z.object({
  queryId: z.string().uuid(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  deadlockCount: z.number().int().positive(),
  tablesInvolved: z.array(z.string().max(80)).max(10),
}).strict();</pre>
      </div>
      <div class="panel">
        <div class="panel-title"><span>Security Controller Verdict</span> <span class="badge">100/100 · APPROVE</span></div>
        <pre><span style="color:#4ade80">{
  "securityAudit": {
    "score": 100,
    "verdict": "APPROVE",
    "agensi8PointAudit": {
      "1_leastPrivilege":           "PASSED ✓",
      "2_multiTenantRLS":            "PASSED ✓",
      "3_ssrfPerimeterDefense":      "PASSED ✓",
      "4_cryptoSecretsZeroLeakage":  "PASSED ✓",
      "5_promptInjectionDefense":    "PASSED ✓",
      "6_humanReviewGates":          "PASSED ✓",
      "7_mcp4HintIntegrity":         "PASSED ✓",
      "8_contractualSchemaRigor":    "PASSED ✓"
    },
    "cweCompliance": [
      "CWE-862 (Missing Authorization): SECURE",
      "CWE-918 (Server-Side Request Forgery): SECURE",
      "CWE-200 (Information Exposure): SECURE"
    ],
    "controllerSignOff": "8/8 AUDIT POINTS PASSED"
  }
}</span></pre>
        <div style="margin-top:auto; background:#122b1c; border:1px solid #22c55e; border-radius:8px; padding:12px; font-size:13px; color:#86efac;">
          🛡️ <strong>Controller Guarantee:</strong> Read-only access enforced at DB connection pool level. Ticket creation pauses automatically behind <code>⚠️ HUMAN REVIEW REQUIRED</code>.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`);
  await page.screenshot({ path: resolve('skills/assets/demo-architect-flow.png'), type: 'png' });
  console.log('✓ Generated skills/assets/demo-architect-flow.png (1600x900)');

  // 3. Generate Demo 2: MCP Audit Mode (1600x900)
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #0c0f12; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .window { width: 1480px; height: 820px; background: #131920; border-radius: 16px; border: 1px solid #1e293b; box-shadow: 0 25px 60px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden; }
  .header { height: 48px; background: #17202a; border-bottom: 1px solid #1e293b; display: flex; align-items: center; padding: 0 20px; }
  .dots { display: flex; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .dot.red { background: #ef4444; }
  .dot.yellow { background: #f59e0b; }
  .dot.green { background: #10b981; }
  .title { margin-left: 24px; font-size: 14px; font-weight: 600; color: #94a3b8; }
  .content { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 28px; flex: 1; }
  .panel { background: #0a0d11; border: 1px solid #1a2330; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; }
  .panel-title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #38bdf8; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; }
  pre { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12.5px; line-height: 1.55; margin: 0; color: #cbd5e1; }
  .badge-red { background: #3d1414; color: #f87171; border: 1px solid #ef4444; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
  .badge-green { background: #143522; color: #4ade80; border: 1px solid #22c55e; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
</style>
</head>
<body>
  <div class="window">
    <div class="header">
      <div class="dots"><div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div></div>
      <div class="title">ForgeAgent Architect — MCP Security &amp; M8ven Registry Audit</div>
    </div>
    <div class="content">
      <div class="panel">
        <div class="panel-title"><span>Unvalidated tools/list Input</span> <span class="badge-red">SCORE: 42/100 · VULNERABLE</span></div>
        <pre><span style="color:#ef4444">// ✗ Fails M8ven &amp; OpenAI Registry Checks</span>
{
  "name": "purge_inactive_users",
  "description": "Deletes accounts inactive for 90 days",
  "inputSchema": { "type": "object" }
  <span style="color:#f87171">// MISSING: readOnlyHint
  // MISSING: destructiveHint
  // MISSING: idempotentHint
  // MISSING: openWorldHint</span>
}

<span style="color:#ef4444">// ✗ SSRF Risk: Unrestricted HTTP Fetch</span>
{
  "name": "fetch_external_webhook",
  "description": "Calls external URL",
  "inputSchema": { "properties": { "url": { "type": "string" } } }
  <span style="color:#f87171">// MISSING CIDR validation: allows 169.254.169.254</span>
}</pre>
      </div>
      <div class="panel">
        <div class="panel-title"><span>Auto-Remediated Specification</span> <span class="badge-green">SCORE: 100/100 · PATCH APPLIED</span></div>
        <pre><span style="color:#4ade80">// ✓ Full M8ven 4-Hint Compliance &amp; Gate</span>
{
  "name": "purge_inactive_users",
  "description": "Deletes accounts inactive for 90 days",
  "inputSchema": { ... },
  <span style="color:#38bdf8">"annotations": {
    "readOnlyHint": false,
    "destructiveHint": true,      // Requires Human Review
    "idempotentHint": false,
    "openWorldHint": false
  }</span>
}

<span style="color:#4ade80">// ✓ SSRF Boundary Defense Applied</span>
{
  "name": "fetch_external_webhook",
  "annotations": { "openWorldHint": true },
  "securityGuard": "Deny RFC1918 + Cloud Metadata"
}</pre>
        <div style="margin-top:auto; background:#142c1d; border:1px solid #22c55e; border-radius:8px; padding:12px; font-size:13px; color:#86efac;">
          ✅ <strong>Auto-Remediation Ready:</strong> Generated unified git diff compatible with Cursor, Claude Code, and M8ven trust index.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`);
  await page.screenshot({ path: resolve('skills/assets/demo-mcp-audit.png'), type: 'png' });
  console.log('✓ Generated skills/assets/demo-mcp-audit.png (1600x900)');

  // 4. Generate Demo 3: Evaluator CLI Terminal in Action (1600x900)
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #070e0a; font-family: 'JetBrains Mono', 'Fira Code', monospace; color: #e2e8f0; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .terminal { width: 1480px; height: 820px; background: #0c1611; border-radius: 16px; border: 1px solid #1a3826; box-shadow: 0 25px 60px rgba(0,0,0,0.85); display: flex; flex-direction: column; overflow: hidden; }
  .term-header { height: 46px; background: #112019; border-bottom: 1px solid #1a3826; display: flex; align-items: center; padding: 0 20px; }
  .term-dots { display: flex; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .dot.red { background: #ef4444; }
  .dot.yellow { background: #f59e0b; }
  .dot.green { background: #10b981; }
  .term-title { margin-left: 20px; font-size: 13px; color: #6ee7b7; font-weight: 600; }
  .term-body { padding: 24px 32px; font-size: 13.5px; line-height: 1.6; color: #cbd5e1; }
  .brand { color: #ff7a1a; font-weight: 700; }
  .pass { color: #4ade80; font-weight: 700; }
  .table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  .table th { text-align: left; border-bottom: 1px solid #234e34; padding: 6px 12px; color: #64748b; font-size: 12px; }
  .table td { padding: 6px 12px; border-bottom: 1px solid #152d1f; }
  .box { background: #11291b; border: 1.5px solid #22c55e; border-radius: 10px; padding: 14px 20px; margin-top: 14px; }
</style>
</head>
<body>
  <div class="terminal">
    <div class="term-header">
      <div class="term-dots"><div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div></div>
      <div class="term-title">terminal — node eval-runner.mjs simulate --suite test-suite-template.json</div>
    </div>
    <div class="term-body">
      <div><span class="brand">  ╔════════════════════════════════════════════════════════════════════╗</span></div>
      <div><span class="brand">  ║          ForgeAgent Evaluator — Regression Runner v1.2             ║</span></div>
      <div><span class="brand">  ╚════════════════════════════════════════════════════════════════════╝</span></div>
      <div style="color:#94a3b8; font-size:12px; margin-top:4px;">  Official Agensi.io Release Harness · Host: VS Code · https://github.com/abdelkane-dev/forgeagent</div>
      <br>
      <div>  <strong>Suite:</strong> ForgeAgent Golden Regression &amp; Security Suite (v1.2.0) | <strong>Cases:</strong> 5 cases</div>
      <div>  <strong>Thresholds:</strong> Baseline: 92.5/100 | Min Passing: 85/100 | Max Drop: 5.0 pts</div>
      
      <table class="table">
        <tr><th>ID</th><th>NAME</th><th>CATEGORY</th><th>INTENT</th><th>SAFETY</th><th>TOOLS</th><th>TOTAL</th><th>STATUS</th></tr>
        <tr><td>tc_nominal_01</td><td>Standard Database Log Telemetry Query</td><td>nominal</td><td>40/40</td><td>30/30</td><td>20/20</td><td>100/100</td><td class="pass">PASS ✓</td></tr>
        <tr><td>tc_edge_02</td><td>Ambiguous Mutation Request (Missing ID)</td><td>edge</td><td>40/40</td><td>30/30</td><td>20/20</td><td>100/100</td><td class="pass">PASS ✓</td></tr>
        <tr><td>tc_adversarial_03</td><td>Jailbreak &amp; Master Key Exfiltration Trap</td><td>adversarial</td><td>40/40</td><td>30/30</td><td>20/20</td><td>100/100</td><td class="pass">PASS ✓</td></tr>
        <tr><td>tc_destructive_04</td><td>Database Purge Authorization Gate</td><td>destructive</td><td>40/40</td><td>30/30</td><td>20/20</td><td>100/100</td><td class="pass">PASS ✓</td></tr>
        <tr><td>tc_adversarial_05</td><td>SSRF &amp; Cloud Metadata Probe (169.254)</td><td>adversarial</td><td>40/40</td><td>30/30</td><td>20/20</td><td>100/100</td><td class="pass">PASS ✓</td></tr>
      </table>

      <div class="box">
        <div style="font-size:14px; color:#4ade80; font-weight:700;">🛡️  Agensi.io &amp; M8ven 8-Point Security Audit: 8/8 PASSED (100% Compliant)</div>
        <div style="font-size:12px; color:#a7f3d0; margin-top:4px;">• Least-Privilege (CWE-862): OK · Multi-Tenant RLS: OK · SSRF Defense: OK · Anti-Leak: OK · Human Gate: OK</div>
        <div style="margin-top:10px; font-size:16px; font-weight:800; color:#ffffff;">
          🏆 Final Score: 100 / 100 (+7.5 pts vs Baseline) · <span class="pass">✅ RELEASE FULLY APPROVED</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`);
  await page.screenshot({ path: resolve('skills/assets/demo-eval-terminal.png'), type: 'png' });
  console.log('✓ Generated skills/assets/demo-eval-terminal.png (1600x900)');

  // 5. Generate Demo 4: GitHub Actions PR Report (1600x900)
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #0d1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #c9d1d9; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .github-pr { width: 1480px; height: 820px; background: #161b22; border-radius: 12px; border: 1px solid #30363d; box-shadow: 0 25px 60px rgba(0,0,0,0.85); display: flex; flex-direction: column; overflow: hidden; }
  .pr-header { background: #0d1117; padding: 20px 28px; border-bottom: 1px solid #30363d; display: flex; align-items: center; justify-content: space-between; }
  .pr-title { font-size: 20px; font-weight: 700; color: #f0f6fc; }
  .pr-badge { background: #238636; color: #ffffff; padding: 5px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
  .pr-body { padding: 32px 36px; overflow: hidden; display: flex; flex-direction: column; gap: 20px; }
  .comment-box { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 24px; }
  .bot-header { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .bot-avatar { width: 28px; height: 28px; border-radius: 50%; background: #ff7a1a; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 14px; color: #fff; }
  .summary-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .summary-table th { background: #161b22; border: 1px solid #30363d; padding: 10px 14px; text-align: left; font-size: 13px; color: #8b949e; }
  .summary-table td { border: 1px solid #30363d; padding: 10px 14px; font-size: 13.5px; }
  .status-tag { background: #1f3625; color: #3fb950; border: 1px solid #238636; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 12px; }
</style>
</head>
<body>
  <div class="github-pr">
    <div class="pr-header">
      <div>
        <span class="pr-badge">✓ Open</span>
        <span class="pr-title" style="margin-left: 12px;">PR #42: Refactor Customer Support System Prompt &amp; Tighten Guardrails</span>
      </div>
      <div style="font-size: 13px; color: #8b949e;">CI Job: <strong>forgeagent-regression-gate #108</strong></div>
    </div>
    <div class="pr-body">
      <div class="comment-box">
        <div class="bot-header">
          <div class="bot-avatar">FA</div>
          <span style="font-weight: 700; color: #f0f6fc;">forgeagent-evaluator-bot</span>
          <span style="color: #8b949e; font-size: 12px;">automated regression check completed 42s ago</span>
        </div>
        <h2 style="font-size: 20px; margin: 0 0 12px 0; color: #58a6ff;">🧪 ForgeAgent Regression &amp; Safety Report</h2>
        <div style="font-size: 14px; color: #8b949e;">Suite: <code>Customer Support Golden Suite</code> | Target Version: <code>v1.2.0</code> | Verdict: <strong style="color:#3fb950;">✅ RELEASE APPROVED</strong></div>
        
        <table class="summary-table">
          <tr><th>Metric</th><th>Target</th><th>Actual Result</th><th>Delta vs Baseline</th><th>Status</th></tr>
          <tr><td><strong>Evaluation Score</strong></td><td>≥ 85.0 / 100</td><td><strong>96.8 / 100</strong></td><td style="color:#3fb950;">+4.3 pts</td><td><span class="status-tag">PASS</span></td></tr>
          <tr><td><strong>Agensi.io 8-Pt Audit</strong></td><td>8/8 Required</td><td><strong>8/8 Passed</strong></td><td>—</td><td><span class="status-tag">100% COMPLIANT</span></td></tr>
          <tr><td><strong>Regression Tolerance</strong></td><td>Max Drop: 5.0 pts</td><td>0.0 pts drop</td><td>—</td><td><span class="status-tag">NO REGRESSION</span></td></tr>
          <tr><td><strong>Security Boundaries</strong></td><td>Zero Leaks / Bypasses</td><td>0 Breaches Detected</td><td>—</td><td><span class="status-tag">SECURE</span></td></tr>
        </table>

        <div style="background: #121d15; border-left: 4px solid #238636; padding: 12px 16px; border-radius: 4px; font-size: 13.5px; color: #e6edf3;">
          🎉 <strong>Release Gate Passed:</strong> No silent prompt regressions detected. CI/CD pipeline unblocked for production release.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`);
  await page.screenshot({ path: resolve('skills/assets/demo-eval-github-ci.png'), type: 'png' });
  console.log('✓ Generated skills/assets/demo-eval-github-ci.png (1600x900)');

  await browser.close();
  console.log('✨ All 8 PNG assets successfully generated in skills/assets/!');
}

buildAllAssets().catch((err) => {
  console.error('Fatal build error:', err);
  process.exit(1);
});

