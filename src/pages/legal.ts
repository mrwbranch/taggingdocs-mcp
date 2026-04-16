// ─── Legal pages: Privacy Policy + Terms of Service + Scopes ─────────
// Served at /privacy, /terms, and /scopes. Required for Google OAuth app
// verification when using sensitive Tag Manager scopes — the Limited Use
// disclosure in the Privacy Policy is what Google specifically looks for,
// and /scopes gives reviewers a same-domain per-tool scope breakdown.

export const LAST_UPDATED = "2026-04-16";

const SUPPORT_EMAIL = "hello@taggingdocs.com";
const GITHUB_ISSUES = "https://github.com/mrwbranch/taggingdocs-mcp/issues";

const SHARED_STYLES = `
  :root { --bg:#fafafa; --fg:#1a1a2e; --muted:#6b7280; --accent:#2563eb; --accent-light:#dbeafe; --border:#e5e7eb; --card:#fff; --code-bg:#f3f4f6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f172a; --fg:#e2e8f0; --muted:#94a3b8; --accent:#60a5fa; --accent-light:#1e3a5f; --border:#334155; --card:#1e293b; --code-bg:#1e293b; } }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--fg); line-height:1.65; }
  .container { max-width:720px; margin:0 auto; padding:48px 24px; }
  .eyebrow { display:inline-block; background:var(--accent-light); color:var(--accent); font-size:0.75rem; font-weight:600; padding:4px 10px; border-radius:999px; margin-bottom:12px; letter-spacing:0.02em; }
  h1 { font-size:2rem; font-weight:700; margin-bottom:6px; }
  h2 { font-size:1.2rem; font-weight:600; margin:32px 0 12px; }
  h3 { font-size:1rem; font-weight:600; margin:20px 0 8px; }
  p { margin-bottom:12px; color:var(--fg); }
  ul, ol { margin:0 0 12px 20px; color:var(--fg); }
  li { margin-bottom:6px; }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  code { background:var(--code-bg); padding:2px 6px; border-radius:4px; font-size:0.9em; font-family:'SF Mono','Fira Code',monospace; }
  .muted { color:var(--muted); font-size:0.9rem; margin-bottom:24px; }
  .callout { background:var(--accent-light); border-radius:8px; padding:14px 18px; margin:20px 0; font-size:0.95rem; }
  .callout strong { display:block; margin-bottom:6px; }
  table { border-collapse:collapse; width:100%; margin:14px 0 24px; font-size:0.9rem; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); vertical-align:top; }
  th { font-weight:600; color:var(--muted); background:var(--code-bg); }
  td code { white-space:nowrap; }
  .footer { margin-top:48px; padding-top:24px; border-top:1px solid var(--border); font-size:0.85rem; color:var(--muted); display:flex; gap:16px; flex-wrap:wrap; }
  .footer a { color:var(--muted); }
  .footer a:hover { color:var(--accent); }
`;

function pageShell(title: string, body: string, baseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <title>${title} — TaggingDocs MCP</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow">
  <meta name="description" content="${title} for the TaggingDocs MCP Server.">
  <style>${SHARED_STYLES}</style>
</head><body>
  <div class="container">
    <a href="${baseUrl}" class="eyebrow">← TaggingDocs MCP</a>
    ${body}
    <div class="footer">
      <a href="${baseUrl}">Home</a>
      <a href="${baseUrl}/scopes">Scopes</a>
      <a href="${baseUrl}/privacy">Privacy</a>
      <a href="${baseUrl}/terms">Terms</a>
      <a href="https://github.com/mrwbranch/taggingdocs-mcp">GitHub</a>
      <a href="https://taggingdocs.com">taggingdocs.com</a>
    </div>
  </div>
</body></html>`;
}

export function privacyPolicyHtml(baseUrl: string): string {
  const body = `
    <h1>Privacy Policy</h1>
    <p class="muted">Last updated: ${LAST_UPDATED}</p>

    <p>TaggingDocs MCP Server ("we", "us", "the Server") is a hosted <a href="https://modelcontextprotocol.io">Model Context Protocol</a> server at <code>mcp.taggingdocs.com</code> that lets AI clients (Claude, ChatGPT, Cursor, and others) search the <a href="https://taggingdocs.com">TaggingDocs</a> library and manage Google Tag Manager containers you have access to. This policy explains what data we handle and how.</p>

    <p>The Server is open source under the MIT License at <a href="https://github.com/mrwbranch/taggingdocs-mcp">github.com/mrwbranch/taggingdocs-mcp</a>. If you self-host your own instance, this policy does not apply to you — you are the operator and should publish your own.</p>

    <h2>What we collect</h2>

    <p><strong>When you authenticate with Google:</strong></p>
    <ul>
      <li>Your Google account email address, used to identify your session across devices.</li>
      <li>A Google OAuth refresh token and short-lived access tokens for the Tag Manager scopes you granted.</li>
      <li>A session identifier (random UUID) we issue to your AI client as a bearer token.</li>
    </ul>

    <p><strong>When you use the Server:</strong></p>
    <ul>
      <li>IP addresses — read transiently by our rate limiter to prevent abuse, not stored persistently.</li>
      <li>Structured server logs — the MCP method called, session metadata, HTTP status, and timestamps, used for operational debugging.</li>
      <li>Tag Manager API responses — forwarded to your AI client as the result of your request and not persisted on our side.</li>
    </ul>

    <p><strong>We do not collect:</strong></p>
    <ul>
      <li>The content of your AI conversations.</li>
      <li>Any analytics, tracking pixels, cookies, or third-party trackers on this domain.</li>
      <li>Payment, billing, or identity-verification information.</li>
    </ul>

    <h2>How we use it</h2>

    <p>Solely to fulfill requests you make through your AI client. Specifically:</p>
    <ul>
      <li>Your Google refresh token is used to mint access tokens that we forward to the Google Tag Manager API on your behalf, only when your AI client invokes a tool.</li>
      <li>Your email identifies your session if you reconnect from a different device.</li>
      <li>Logs are reviewed only for operational monitoring and debugging.</li>
    </ul>

    <p>We do not use your data for advertising, profiling, model training, or any purpose beyond serving your own requests.</p>

    <h2>Google API Services User Data Policy</h2>

    <div class="callout">
      <strong>Limited Use disclosure</strong>
      TaggingDocs MCP Server's use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.
    </div>

    <p>In practical terms:</p>
    <ul>
      <li>We only access Google user data to provide user-facing features within your current request to the Server.</li>
      <li>We do not transfer Google user data to third parties except as necessary to provide or improve those user-facing features, comply with applicable law, or as part of a merger, acquisition, or sale with notice to users.</li>
      <li>We do not use Google user data to serve advertisements, including retargeted, personalized, or interest-based advertising.</li>
      <li>We do not allow humans to read Google user data, except with your explicit consent for specific pieces of data, or as strictly necessary for security purposes, to comply with applicable law, or for internal operations where the data has been aggregated and anonymized.</li>
    </ul>

    <h2>Where we store it</h2>
    <ul>
      <li><strong>OAuth tokens, session IDs, and dynamically-registered client metadata</strong> — persisted server-side in a JSON file on a disk volume at our hosting provider.</li>
      <li><strong>MCP transport sessions</strong> — held in memory only and lost on every server restart.</li>
      <li><strong>Request logs</strong> — written to stdout and retained by the hosting provider on a short rolling window (typically 7 days) before they are discarded.</li>
    </ul>

    <h2>Third parties</h2>
    <ul>
      <li><strong>Google</strong> — the Tag Manager data originates from and returns to Google's API under your consent. See <a href="https://policies.google.com/privacy">Google's Privacy Policy</a>.</li>
      <li><strong>Your AI client</strong> (Claude, ChatGPT, Cursor, etc.) — MCP responses are sent directly back to whichever client you installed the connector in. Review that client's privacy policy for how it handles responses.</li>
      <li><strong>Our hosting provider</strong> — the server runs on infrastructure operated by a reputable European hosting provider that processes requests as part of normal operation.</li>
      <li><strong>Cloudflare</strong> — sits in front of <code>mcp.taggingdocs.com</code> for DDoS protection and TLS termination; may log connection metadata.</li>
    </ul>

    <p>We do not sell, trade, or otherwise share your data with any other third party.</p>

    <h2>How long we retain it</h2>
    <ul>
      <li><strong>Your OAuth tokens and session</strong> — kept until you revoke access at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>, request deletion, or Google expires / revokes the refresh token.</li>
      <li><strong>Logs</strong> — rolling 7-day window at the hosting layer.</li>
      <li><strong>In-memory session state</strong> — cleared on every restart or when your AI client disconnects.</li>
    </ul>

    <h2>Your rights and choices</h2>
    <ul>
      <li><strong>Revoke access at any time</strong> at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> → find "TaggingDocs" → Remove Access. This immediately invalidates your refresh token, after which the Server cannot make any further requests to Google on your behalf.</li>
      <li><strong>Request deletion</strong> of any remaining data tied to your account by opening a GitHub issue at <a href="${GITHUB_ISSUES}">${GITHUB_ISSUES}</a> or emailing <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</li>
      <li><strong>Self-host</strong> if you prefer to control the data yourself — the code is open source.</li>
    </ul>

    <h2>Children</h2>
    <p>The Server is not directed at children under 16 and we do not knowingly collect information from them.</p>

    <h2>International users</h2>
    <p>The Server is operated from the European Union. By connecting to the Server from another jurisdiction, you acknowledge that your data may be processed in the EU.</p>

    <h2>Changes to this policy</h2>
    <p>We may update this policy. Material changes will be reflected here with a new "Last updated" date. Your continued use of the Server after a change constitutes acceptance.</p>

    <h2>Contact</h2>
    <ul>
      <li>GitHub Issues: <a href="${GITHUB_ISSUES}">${GITHUB_ISSUES}</a></li>
      <li>Email: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></li>
    </ul>
  `;
  return pageShell("Privacy Policy", body, baseUrl);
}

export function termsHtml(baseUrl: string): string {
  const body = `
    <h1>Terms of Service</h1>
    <p class="muted">Last updated: ${LAST_UPDATED}</p>

    <p>These terms govern your use of the TaggingDocs MCP Server ("the Server") at <code>mcp.taggingdocs.com</code>. By connecting an AI client to the Server, you agree to these terms. If you do not agree, do not connect.</p>

    <h2>The service</h2>
    <p>The Server is a hosted <a href="https://modelcontextprotocol.io">Model Context Protocol</a> endpoint that lets AI clients search the <a href="https://taggingdocs.com">TaggingDocs</a> documentation library and — after you authenticate with Google — invoke Google Tag Manager API operations on your behalf. The Server is open source under the MIT License; you may run your own instance at any time.</p>

    <h2>Your account, your responsibility</h2>
    <p>You authenticate to Google directly; the Server never sees your Google password. Actions taken by your AI client via the Server are actions taken by <em>you</em> against <em>your</em> Google Tag Manager containers. You are responsible for:</p>
    <ul>
      <li>Only connecting GTM accounts you have legitimate authority to manage.</li>
      <li>Reviewing changes your AI client proposes before publishing a GTM version.</li>
      <li>Any consequences of tags, triggers, variables, or versions created, modified, deleted, or published through the Server.</li>
    </ul>

    <div class="callout">
      <strong>AI clients can make mistakes.</strong> Before connecting the Server to a production GTM container, work in a dedicated workspace and review every change. The Server cannot roll back GTM operations; published versions go live immediately.
    </div>

    <h2>Acceptable use</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Bypass or attempt to bypass rate limits, authentication, or PKCE checks.</li>
      <li>Use the Server to manage GTM containers you do not have legitimate authorization to access.</li>
      <li>Probe, scan, load-test, or otherwise attack the Server's security beyond the behavior of an ordinary MCP client.</li>
      <li>Generate automated traffic designed to exhaust server resources or degrade service for other users.</li>
      <li>Resell or rebrand the hosted Server as your own service (the open-source code is separately available for self-hosting).</li>
    </ul>
    <p>Rate limits apply to all clients. Abusive traffic will be blocked.</p>

    <h2>Service availability</h2>
    <p>We operate the hosted instance at <code>mcp.taggingdocs.com</code> on a best-effort basis. The Server is provided free of charge and without any uptime guarantee. We may pause, restart, or terminate the hosted instance at any time.</p>

    <h2>No warranty</h2>
    <p>THE SERVER IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVER WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF SECURITY VULNERABILITIES.</p>

    <h2>Limitation of liability</h2>
    <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, TAGGINGDOCS AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, REVENUE, PROFITS, OR GOOD WILL, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVER, INCLUDING BUT NOT LIMITED TO DAMAGES TO YOUR GOOGLE TAG MANAGER CONFIGURATION.</p>

    <h2>Third-party services</h2>
    <p>Use of the Server involves interactions with Google, your AI client, and our hosting provider. You are also bound by the terms of each of those providers. We have no control over and accept no responsibility for their actions.</p>

    <h2>Termination</h2>
    <p>We may suspend or terminate your access to the hosted Server at any time, with or without notice, including but not limited to breach of these terms. The open-source code remains available for you to self-host.</p>

    <h2>Changes</h2>
    <p>We may revise these terms. Material changes will be reflected here with a new "Last updated" date. Your continued use constitutes acceptance.</p>

    <h2>Governing law</h2>
    <p>These terms are governed by the laws of Sweden, without regard to conflict-of-law principles. Any dispute arising from these terms or your use of the Server shall be resolved in the competent courts of Sweden.</p>

    <h2>Contact</h2>
    <p>Questions about these terms: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> or <a href="${GITHUB_ISSUES}">open a GitHub issue</a>.</p>
  `;
  return pageShell("Terms of Service", body, baseUrl);
}

export function scopesHtml(baseUrl: string): string {
  const body = `
    <h1>Scopes &amp; tools</h1>
    <p class="muted">How the TaggingDocs MCP Server uses each Google OAuth scope — last updated ${LAST_UPDATED}.</p>

    <p>The Server exposes <strong>35 tools</strong> to a connected AI client (4 documentation tools + 31 Google Tag Manager tools). Each tool is tied to one specific Tag Manager OAuth scope. The table below lists which scope each tool uses, so a user or reviewer can verify the Server never requests broader access than a registered tool actually needs.</p>

    <p>Scopes are requested together during the initial OAuth consent so the user isn't prompted repeatedly; at runtime, each tool only exercises the single scope listed for it.</p>

    <h2>Documentation tools — no Google scope</h2>

    <p>These tools search and read <a href="https://taggingdocs.com">taggingdocs.com</a> content. They do not touch any Google API and are available without authentication.</p>

    <table>
      <thead><tr><th>Tool</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>search_taggingdocs</code></td><td>Full-text search across TaggingDocs articles.</td></tr>
        <tr><td><code>read_taggingdocs_page</code></td><td>Fetch a single article by slug.</td></tr>
        <tr><td><code>list_taggingdocs_sections</code></td><td>Browse the library by section.</td></tr>
        <tr><td><code>lookup_event</code></td><td>Look up a GA4 event spec (e.g. <code>purchase</code>).</td></tr>
      </tbody>
    </table>

    <h2>Google Tag Manager scopes</h2>

    <h3><code>https://www.googleapis.com/auth/tagmanager.readonly</code></h3>
    <p>Read-only access. List and fetch GTM resources without modifying them. Needed for audits, reporting, and any "show me" request from the AI.</p>
    <table>
      <thead><tr><th>Tool</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>list_accounts</code></td><td>List GTM accounts the user has access to.</td></tr>
        <tr><td><code>list_containers</code>, <code>get_container</code></td><td>List / read container metadata.</td></tr>
        <tr><td><code>list_workspaces</code>, <code>get_workspace</code>, <code>get_workspace_status</code></td><td>List / read workspaces and pending changes.</td></tr>
        <tr><td><code>list_tags</code>, <code>get_tag</code></td><td>List / read tag configurations.</td></tr>
        <tr><td><code>list_triggers</code>, <code>get_trigger</code></td><td>List / read trigger configurations.</td></tr>
        <tr><td><code>list_variables</code>, <code>get_variable</code></td><td>List / read user-defined variables.</td></tr>
        <tr><td><code>list_folders</code></td><td>List folders in a workspace.</td></tr>
        <tr><td><code>list_versions</code></td><td>List container versions.</td></tr>
        <tr><td><code>list_built_in_variables</code></td><td>List enabled built-in variables.</td></tr>
        <tr><td><code>list_templates</code></td><td>List custom tag and variable templates.</td></tr>
      </tbody>
    </table>

    <h3><code>https://www.googleapis.com/auth/tagmanager.edit.containers</code></h3>
    <p>Create, update, and delete GTM resources within a container. Needed whenever the user asks the AI to make changes to a workspace.</p>
    <table>
      <thead><tr><th>Tool</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>create_container</code></td><td>Create a new container in an account.</td></tr>
        <tr><td><code>create_workspace</code></td><td>Create a workspace to stage changes in.</td></tr>
        <tr><td><code>create_tag</code>, <code>update_tag</code>, <code>delete_tag</code></td><td>Create / update / delete a tag.</td></tr>
        <tr><td><code>create_trigger</code>, <code>update_trigger</code>, <code>delete_trigger</code></td><td>Create / update / delete a trigger.</td></tr>
        <tr><td><code>create_variable</code>, <code>update_variable</code>, <code>delete_variable</code></td><td>Create / update / delete a variable.</td></tr>
        <tr><td><code>create_folder</code></td><td>Create a folder for organization.</td></tr>
      </tbody>
    </table>

    <h3><code>https://www.googleapis.com/auth/tagmanager.edit.containerversions</code></h3>
    <p>Freeze a workspace's staged changes into a numbered container version that can be reviewed before publishing.</p>
    <table>
      <thead><tr><th>Tool</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>create_version</code></td><td>Freeze the current workspace into a version.</td></tr>
      </tbody>
    </table>

    <h3><code>https://www.googleapis.com/auth/tagmanager.publish</code></h3>
    <p>Publish a container version (go live). Only invoked when the user explicitly asks the AI to publish.</p>
    <table>
      <thead><tr><th>Tool</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>publish_version</code></td><td>Publish the specified version so it goes live for site visitors.</td></tr>
      </tbody>
    </table>

    <h3><code>https://www.googleapis.com/auth/tagmanager.manage.users</code></h3>
    <p>Read account-level user permissions. Used by the container audit prompt to surface access / governance issues.</p>
    <table>
      <thead><tr><th>Tool</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><code>list_user_permissions</code></td><td>List users with access to the account and their permission level.</td></tr>
      </tbody>
    </table>

    <h3><code>https://www.googleapis.com/auth/tagmanager.manage.accounts</code></h3>
    <p>Read account-level settings. Requested alongside <code>manage.users</code> so audit prompts can see the full account context in a single grant. Not used to create or modify accounts.</p>

    <h3><code>openid</code> and <code>email</code></h3>
    <p>Used only to identify the user's session via their Google email address after the initial OAuth flow. No profile data beyond the email is fetched or stored. Details in the <a href="${baseUrl}/privacy">Privacy Policy</a>.</p>

    <h2>Why these scopes and not narrower ones</h2>
    <ul>
      <li><strong>Read-only alone is insufficient</strong> — the Server's core feature is letting the user's AI make requested changes (create / update / delete tags, triggers, variables, folders), which requires <code>tagmanager.edit.containers</code>.</li>
      <li><strong>Edit alone is insufficient</strong> — the audit workflow reviews changes before they go live, which requires versioning (<code>tagmanager.edit.containerversions</code>) and, when the user explicitly approves, publishing (<code>tagmanager.publish</code>).</li>
      <li><strong>Account-level scopes</strong> are requested only for the audit prompt's governance checks. Users who never run audits do not cause the Server to exercise them.</li>
    </ul>

    <div class="callout">
      <strong>Limited Use</strong>
      The Server's use and transfer to any other app of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. Full disclosure in the <a href="${baseUrl}/privacy">Privacy Policy</a>.
    </div>
  `;
  return pageShell("Scopes &amp; tools", body, baseUrl);
}
