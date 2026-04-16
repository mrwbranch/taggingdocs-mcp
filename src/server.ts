import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  getOAuthMetadata,
  handleClientRegistration,
  handleAuthorize,
  handleGoogleCallback,
  handleTokenExchange,
  getGoogleTokenForSession,
} from "./google-oauth.js";
import { createGtmApi } from "./gtm-api.js";
import {
  searchDocs,
  getArticle,
  findSimilarSlugs,
  getSections,
  getSectionOverview,
  lookupEvent,
  getArticleCount,
  TAGGINGDOCS_BASE,
} from "./taggingdocs.js";
import { GTM_PROMPTS } from "./prompts.js";
import { authLimiter, mcpLimiter, registrationLimiter } from "./rate-limit.js";
import { flushStore } from "./token-store.js";
import { log } from "./logger.js";
import { privacyPolicyHtml, termsHtml, scopesHtml } from "./pages/legal.js";

// ─── Config ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3000");
const BASE_URL = process.env.BASE_URL || "https://mcp.taggingdocs.com";
const ARTICLE_COUNT = getArticleCount();

// ─── Express App ──────────────────────────────────────────────────────
const app = express();
// Deployed behind Coolify / reverse proxy — trust the first hop so req.ip
// reflects the real client IP. Without this, rate limits bucket by proxy IP
// and X-Forwarded-For can be spoofed by any caller.
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Powered-By", "TaggingDocs");
  next();
});

// CORS — needed for MCP clients making cross-origin requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [
    "https://claude.ai",
    "https://www.claude.ai",
    "https://chatgpt.com",
    "https://platform.openai.com",
  ];
  if (origin && (allowed.includes(origin) || origin.endsWith(".anthropic.com"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// ─── Active MCP session transports ────────────────────────────────────
const transports: Map<string, StreamableHTTPServerTransport> = new Map();

// Session cleanup — cap at 1000 sessions
setInterval(() => {
  if (transports.size > 1000) {
    const entries = [...transports.entries()];
    const toRemove = entries.slice(0, entries.length - 500);
    for (const [id, t] of toRemove) {
      t.close().catch(() => {});
      transports.delete(id);
    }
    log.info({ removed: toRemove.length }, "cleaned stale MCP sessions");
  }
}, 30 * 60_000);

// ═══════════════════════════════════════════════════════════════════════
// Health & Discovery
// ═══════════════════════════════════════════════════════════════════════

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "gtm-mcp-server",
    version: "1.0.0",
    uptime: Math.floor(process.uptime()),
    activeSessions: transports.size,
    docsIndexed: ARTICLE_COUNT,
  });
});

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json(getOAuthMetadata());
});

// The MCP endpoint is the protected resource (not the origin). Serve the
// metadata at both the root and under /mcp so clients find it regardless of
// which discovery path they use.
const protectedResourceMetadata = {
  resource: `${BASE_URL}/mcp`,
  authorization_servers: [BASE_URL],
  scopes_supported: ["gtm:read", "gtm:write", "gtm:publish"],
  bearer_methods_supported: ["header"],
};
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(protectedResourceMetadata);
});
app.get("/mcp/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(protectedResourceMetadata);
});

// ═══════════════════════════════════════════════════════════════════════
// OAuth Endpoints
// ═══════════════════════════════════════════════════════════════════════

app.post("/oauth/register", registrationLimiter, (req, res) => {
  try {
    const result = handleClientRegistration(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get("/oauth/authorize", authLimiter, (req, res) => {
  const result = handleAuthorize(req.query as any);
  if ("redirectUrl" in result) {
    log.info({ clientId: (req.query as any).client_id }, "oauth: authorize → google");
    res.redirect(result.redirectUrl);
  } else {
    log.warn({ err: result.error, query: req.query }, "oauth: authorize failed");
    res.status(400).json(result);
  }
});

app.get("/oauth/google-callback", async (req, res) => {
  log.info({ hasCode: !!(req.query as any).code, hasState: !!(req.query as any).state }, "oauth: google-callback received");
  const result = await handleGoogleCallback(req.query as any);
  if ("redirectUrl" in result) {
    log.info("oauth: google-callback → success page + redirect to mcp client");
    // A plain 302 to the MCP client's redirect_uri triggers a claude:// deep
    // link that the browser tab can't navigate to, leaving the user staring
    // at a spinner on the Google consent page. Return an HTML handoff page
    // instead: shows a clear "success, close this tab" state, then follows
    // through to the MCP client redirect so Claude Desktop / ChatGPT get the
    // auth code, and tries to auto-close the popup on the way out.
    const safeUrl = result.redirectUrl.replace(/"/g, "&quot;");
    res.status(200).send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <title>Authentication successful — TaggingDocs MCP</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { --bg:#0f172a; --fg:#e2e8f0; --muted:#94a3b8; --accent:#60a5fa; --card:#1e293b; --border:#334155; }
    @media (prefers-color-scheme: light) { :root { --bg:#fafafa; --fg:#1a1a2e; --muted:#6b7280; --accent:#2563eb; --card:#fff; --border:#e5e7eb; } }
    * { box-sizing:border-box; margin:0; padding:0; }
    html,body { height:100%; }
    body { display:flex; align-items:center; justify-content:center; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--fg); padding:24px; }
    .card { max-width:420px; background:var(--card); border:1px solid var(--border); border-radius:12px; padding:32px; text-align:center; }
    .check { width:56px; height:56px; margin:0 auto 16px; border-radius:50%; background:rgba(34,197,94,0.15); color:#22c55e; display:flex; align-items:center; justify-content:center; font-size:28px; }
    h1 { font-size:1.25rem; font-weight:600; margin-bottom:8px; }
    p { color:var(--muted); font-size:0.95rem; line-height:1.5; margin-bottom:16px; }
    .hint { color:var(--muted); font-size:0.8rem; margin-top:16px; }
    a { color:var(--accent); text-decoration:none; }
    a:hover { text-decoration:underline; }
  </style>
  <script>
    // Send the auth code to the MCP client (Claude / ChatGPT / etc) as soon
    // as possible. The MCP client will open via deep link; after that the
    // browser tab has nothing left to display so we try to close it.
    (function () {
      var target = "${safeUrl}";
      // Nudge the redirect first so the client gets its code, then try to close.
      // Some browsers refuse window.close() on tabs the script didn't open —
      // falling back to the success message is fine.
      setTimeout(function () { window.location.replace(target); }, 150);
      setTimeout(function () { try { window.close(); } catch (e) {} }, 1500);
    })();
  </script>
</head><body>
  <div class="card">
    <div class="check">&#10003;</div>
    <h1>Signed in to TaggingDocs MCP</h1>
    <p>Authentication complete. Returning you to your AI client…</p>
    <p class="hint">You can close this tab. If nothing happens in a few seconds, <a href="${safeUrl}">click here to continue</a>.</p>
  </div>
</body></html>`);
  } else {
    log.error({ err: result.error }, "oauth: google-callback failed");
    res.status(400).send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <title>Authentication failed — TaggingDocs MCP</title>
  <style>body{font-family:-apple-system,sans-serif;max-width:420px;margin:10vh auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px;}h1{color:#f87171;}p{color:#94a3b8;line-height:1.5;}</style>
</head><body>
  <h1>Authentication failed</h1>
  <p>${result.error}</p>
  <p>Close this tab and try connecting again from your AI client.</p>
</body></html>`);
  }
});

app.post("/oauth/token", authLimiter, async (req, res) => {
  const result = await handleTokenExchange(req.body);
  if ("tokens" in result) {
    log.info({ grantType: req.body?.grant_type }, "oauth: token issued");
    res.json(result.tokens);
  } else {
    log.warn({ err: result.error, grantType: req.body?.grant_type, status: result.status }, "oauth: token exchange failed");
    res.status(result.status).json({ error: result.error });
  }
});

app.post("/oauth/revoke", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// ═══════════════════════════════════════════════════════════════════════
// Legal pages — required for Google OAuth verification
// ═══════════════════════════════════════════════════════════════════════

app.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(privacyPolicyHtml(BASE_URL));
});

app.get("/terms", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(termsHtml(BASE_URL));
});

app.get("/scopes", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(scopesHtml(BASE_URL));
});

// ═══════════════════════════════════════════════════════════════════════
// Landing page
// ═══════════════════════════════════════════════════════════════════════

app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <title>GTM MCP Server — TaggingDocs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Manage Google Tag Manager through AI with best practices from TaggingDocs. Connect in 30 seconds.">
  <style>
    :root { --bg: #fafafa; --fg: #1a1a2e; --muted: #6b7280; --accent: #2563eb; --accent-light: #dbeafe; --border: #e5e7eb; --card: #fff; --code-bg: #f3f4f6; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0f172a; --fg: #e2e8f0; --muted: #94a3b8; --accent: #60a5fa; --accent-light: #1e3a5f; --border: #334155; --card: #1e293b; --code-bg: #1e293b; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--fg); line-height: 1.6; }
    .container { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
    .badge { display: inline-block; background: var(--accent-light); color: var(--accent); font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px; letter-spacing: 0.02em; }
    h1 { font-size: 2rem; font-weight: 700; margin-bottom: 8px; }
    .subtitle { color: var(--muted); font-size: 1.1rem; margin-bottom: 32px; }
    .subtitle a { color: var(--accent); text-decoration: none; }
    .stats { display: flex; gap: 24px; margin-bottom: 40px; flex-wrap: wrap; }
    .stat { text-align: center; }
    .stat-num { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
    .stat-label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    h2 { font-size: 1.15rem; font-weight: 600; margin: 32px 0 16px; }
    .connect-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
    .connect-card strong { font-size: 0.9rem; }
    .connect-card p { margin: 4px 0 0; font-size: 0.88rem; color: var(--muted); }
    code { background: var(--code-bg); padding: 2px 8px; border-radius: 4px; font-size: 0.85em; font-family: 'SF Mono', 'Fira Code', monospace; word-break: break-all; }
    .try-list { list-style: none; padding: 0; margin: 16px 0; }
    .try-list li { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 0.92rem; color: var(--muted); }
    .try-list li:last-child { border-bottom: none; }
    .try-list li em { color: var(--fg); font-style: normal; }
    .note { background: var(--accent-light); border-radius: 8px; padding: 14px 18px; margin: 24px 0; font-size: 0.9rem; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--muted); display: flex; gap: 16px; flex-wrap: wrap; }
    .footer a { color: var(--muted); text-decoration: none; }
    .footer a:hover { color: var(--accent); }
  </style>
</head><body>
  <div class="container">
    <div class="badge">MCP Server</div>
    <h1>GTM MCP Server</h1>
    <p class="subtitle">Manage Google Tag Manager through AI — powered by <a href="https://taggingdocs.com">TaggingDocs</a> best practices.</p>

    <div class="stats">
      <div class="stat"><div class="stat-num">34</div><div class="stat-label">GTM Tools</div></div>
      <div class="stat"><div class="stat-num">6</div><div class="stat-label">Workflows</div></div>
      <div class="stat"><div class="stat-num">${ARTICLE_COUNT}</div><div class="stat-label">Doc Articles</div></div>
    </div>

    <div class="note">
      <strong>No login needed for docs.</strong> Search and read all ${ARTICLE_COUNT} TaggingDocs articles without authentication. Sign in with Google only when you need to manage GTM containers.
    </div>

    <h2>Connect in 30 seconds</h2>

    <div class="connect-card">
      <strong>Claude.ai / Claude App</strong>
      <p>Settings → Integrations → Add → <code>${BASE_URL}</code></p>
    </div>
    <div class="connect-card">
      <strong>Claude Code</strong>
      <p><code>claude mcp add -t http gtm ${BASE_URL}/mcp</code></p>
    </div>
    <div class="connect-card">
      <strong>ChatGPT</strong>
      <p>OpenAI Apps → Add MCP → <code>${BASE_URL}</code></p>
    </div>
    <div class="connect-card">
      <strong>Claude Desktop / Cursor</strong>
      <p><code>npx mcp-remote ${BASE_URL}/mcp</code></p>
    </div>

    <h2>Then try</h2>
    <ul class="try-list">
      <li><em>"What does taggingdocs recommend for ecommerce tracking?"</em> — no login needed</li>
      <li><em>"Look up the purchase event spec"</em> — no login needed</li>
      <li><em>"List all my GTM containers"</em> — requires Google sign-in</li>
      <li><em>"Audit this container following taggingdocs best practices"</em></li>
      <li><em>"Set up GA4 ecommerce tracking with all events"</em></li>
      <li><em>"Set up Consent Mode v2 with Cookiebot"</em></li>
    </ul>

    <div class="footer">
      <a href="https://taggingdocs.com">TaggingDocs</a>
      <a href="https://github.com/mrwbranch/taggingdocs-mcp">GitHub</a>
      <a href="${BASE_URL}/scopes">Scopes</a>
      <a href="${BASE_URL}/privacy">Privacy</a>
      <a href="${BASE_URL}/terms">Terms</a>
      <a href="${BASE_URL}/.well-known/oauth-authorization-server">OAuth Metadata</a>
      <a href="${BASE_URL}/health">Health</a>
    </div>
  </div>
</body></html>`);
});

// ═══════════════════════════════════════════════════════════════════════
// MCP Server Factories
// ═══════════════════════════════════════════════════════════════════════

/** Register TaggingDocs tools (no auth required) on an MCP server. */
function registerDocsTools(server: McpServer): void {
  // ─── search_taggingdocs ─────────────────────────────────────────
  server.tool(
    "search_taggingdocs",
    `Search ${ARTICLE_COUNT} TaggingDocs articles for GTM, GA4, server-side tagging, dataLayer, consent, and tracking best practices. Returns results ranked by relevance.`,
    {
      query: z.string().describe("Search query — e.g. 'ecommerce purchase event', 'consent mode v2', 'cross-domain tracking'"),
      section: z.string().optional().describe("Filter by section — foundations, client-side, server-side, datalayer, ga4, consent, integrations, recipes, etc."),
      max_results: z.number().optional().describe("Max results (default 8)"),
    },
    async ({ query, section, max_results }) => {
      try {
        const results = searchDocs(query, { section, maxResults: max_results || 8 });
        if (!results.length) {
          const overview = getSectionOverview();
          return {
            content: [{
              type: "text" as const,
              text: `No results for "${query}". Available sections: ${overview.map((s) => `${s.name} (${s.count})`).join(", ")}`,
            }],
          };
        }
        const formatted = results
          .map((r, i) => `${i + 1}. **${r.title}** [${r.section}]\n   ${r.description}\n   Slug: ${r.slug}\n   URL: ${r.url}`)
          .join("\n\n");
        return {
          content: [{ type: "text" as const, text: `Found ${results.length} result(s) for "${query}":\n\n${formatted}\n\nUse read_taggingdocs_page with a slug to read the full content.` }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  // ─── read_taggingdocs_page ──────────────────────────────────────
  server.tool(
    "read_taggingdocs_page",
    "Read the full content of a TaggingDocs article by slug. Use after search_taggingdocs to get implementation details, code examples, and configuration guides.",
    {
      slug: z.string().describe("Article slug from search results — e.g. 'datalayer/ecommerce/purchase', 'consent/consent-mode/consent-mode-v2'"),
      max_length: z.number().optional().describe("Max content length in chars (default 12000)"),
    },
    async ({ slug, max_length }) => {
      try {
        // Normalize: strip leading/trailing slashes and base URL
        const normalized = slug
          .replace(/^(https?:\/\/taggingdocs\.com\/?)/, "")
          .replace(/^\/+|\/+$/g, "");

        const article = getArticle(normalized, max_length || 12000);
        if (!article) {
          const similar = findSimilarSlugs(normalized);
          if (similar.length) {
            return {
              content: [{
                type: "text" as const,
                text: `Article not found: "${normalized}". Did you mean:\n${similar.map((a) => `  - ${a.slug} (${a.title})`).join("\n")}`,
              }],
            };
          }
          return { content: [{ type: "text" as const, text: `Article not found: "${normalized}". Use search_taggingdocs to find the correct slug.` }] };
        }

        return {
          content: [{
            type: "text" as const,
            text: `# ${article.title}\nSection: ${article.section} | URL: ${article.url}\n${article.description ? `> ${article.description}\n` : ""}---\n\n${article.content}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  // ─── list_taggingdocs_sections ──────────────────────────────────
  server.tool(
    "list_taggingdocs_sections",
    "Browse all TaggingDocs documentation sections and their articles. Use to discover available topics or browse by category.",
    {
      section: z.string().optional().describe("List articles in a specific section — e.g. 'ga4', 'server-side', 'consent'"),
    },
    async ({ section }) => {
      try {
        if (section) {
          const articles = getSections(section);
          if (Array.isArray(articles) && articles.length === 0) {
            const overview = getSectionOverview();
            return {
              content: [{
                type: "text" as const,
                text: `Section "${section}" not found. Available: ${overview.map((s) => s.name).join(", ")}`,
              }],
            };
          }
          const listing = (articles as any[])
            .map((a: any) => `- **${a.title}**: ${a.description || ""}\n  Slug: ${a.slug}`)
            .join("\n");
          return { content: [{ type: "text" as const, text: `## ${section}\n\n${listing}` }] };
        }

        const overview = getSectionOverview();
        return {
          content: [{
            type: "text" as const,
            text: `## TaggingDocs Sections\n\n${overview.map((s) => `- **${s.name}**: ${s.count} articles`).join("\n")}\n\nTotal: ${ARTICLE_COUNT} articles`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );

  // ─── lookup_event ───────────────────────────────────────────────
  server.tool(
    "lookup_event",
    "Quick lookup for a GA4 event name — finds the dataLayer spec, implementation guide, and related recipes. Shortcut for common events like 'purchase', 'add_to_cart', 'page_view'.",
    {
      event_name: z.string().describe("GA4 event name — e.g. 'purchase', 'add_to_cart', 'view_item', 'generate_lead'"),
    },
    async ({ event_name }) => {
      try {
        const result = lookupEvent(event_name);
        if (!result.bestMatch) {
          return {
            content: [{ type: "text" as const, text: `No docs found for event "${event_name}". Try search_taggingdocs with broader terms.` }],
          };
        }

        const related = result.related.length
          ? `\n\n---\n### Related:\n${result.related.map((r) => `- **${r.title}** [${r.section}] — ${r.url}`).join("\n")}`
          : "";

        return {
          content: [{
            type: "text" as const,
            text: `## ${result.bestMatch.title}\n${result.bestMatch.url}\n\n${result.bestMatch.content}${related}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    }
  );
}

/** Register GTM API tools (requires Google token) on an MCP server. */
function registerGtmTools(server: McpServer, googleToken: string): void {
  const gtm = createGtmApi(googleToken);

  const ok = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  });
  const err = (e: unknown) => ({
    content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
    isError: true,
  });

  const acct = { accountId: z.string().describe("GTM Account ID") };
  const cont = { ...acct, containerId: z.string().describe("GTM Container ID") };
  const ws = { ...cont, workspaceId: z.string().describe("GTM Workspace ID") };

  // Account tools
  server.tool("list_accounts", "List all GTM accounts", {}, async () => {
    try { return ok(await gtm.listAccounts()); } catch (e) { return err(e); }
  });

  // Container tools
  server.tool("list_containers", "List containers in an account", acct, async ({ accountId }) => {
    try { return ok(await gtm.listContainers(accountId)); } catch (e) { return err(e); }
  });
  server.tool("get_container", "Get container details", cont, async ({ accountId, containerId }) => {
    try { return ok(await gtm.getContainer(accountId, containerId)); } catch (e) { return err(e); }
  });
  server.tool("create_container", "Create a new container", {
    ...acct, name: z.string(), usageContext: z.array(z.enum(["web", "android", "ios", "amp", "server"])).default(["web"]),
  }, async ({ accountId, name, usageContext }) => {
    try { return ok(await gtm.createContainer(accountId, name, usageContext)); } catch (e) { return err(e); }
  });

  // Workspace tools
  server.tool("list_workspaces", "List workspaces in a container", cont, async ({ accountId, containerId }) => {
    try { return ok(await gtm.listWorkspaces(accountId, containerId)); } catch (e) { return err(e); }
  });
  server.tool("get_workspace", "Get workspace details", ws, async ({ accountId, containerId, workspaceId }) => {
    try { return ok(await gtm.getWorkspace(accountId, containerId, workspaceId)); } catch (e) { return err(e); }
  });
  server.tool("create_workspace", "Create a workspace", { ...cont, name: z.string(), description: z.string().optional() },
    async ({ accountId, containerId, name, description }) => {
      try { return ok(await gtm.createWorkspace(accountId, containerId, name, description)); } catch (e) { return err(e); }
    }
  );
  server.tool("get_workspace_status", "Get pending workspace changes", ws, async ({ accountId, containerId, workspaceId }) => {
    try { return ok(await gtm.getWorkspaceStatus(accountId, containerId, workspaceId)); } catch (e) { return err(e); }
  });

  // Tag tools
  server.tool("list_tags", "List all tags in a workspace", ws, async ({ accountId, containerId, workspaceId }) => {
    try { return ok(await gtm.listTags(accountId, containerId, workspaceId)); } catch (e) { return err(e); }
  });
  server.tool("get_tag", "Get tag details", { ...ws, tagId: z.string() }, async ({ accountId, containerId, workspaceId, tagId }) => {
    try { return ok(await gtm.getTag(accountId, containerId, workspaceId, tagId)); } catch (e) { return err(e); }
  });
  server.tool("create_tag", "Create a GTM tag from JSON", { ...ws, tagData: z.string().describe("JSON of GTM Tag resource") },
    async ({ accountId, containerId, workspaceId, tagData }) => {
      try { return ok(await gtm.createTag(accountId, containerId, workspaceId, JSON.parse(tagData))); } catch (e) { return err(e); }
    }
  );
  server.tool("update_tag", "Update a GTM tag", { ...ws, tagId: z.string(), tagData: z.string() },
    async ({ accountId, containerId, workspaceId, tagId, tagData }) => {
      try { return ok(await gtm.updateTag(accountId, containerId, workspaceId, tagId, JSON.parse(tagData))); } catch (e) { return err(e); }
    }
  );
  server.tool("delete_tag", "Delete a tag", { ...ws, tagId: z.string() }, async ({ accountId, containerId, workspaceId, tagId }) => {
    try { await gtm.deleteTag(accountId, containerId, workspaceId, tagId); return ok({ success: true, deleted: tagId }); } catch (e) { return err(e); }
  });

  // Trigger tools
  server.tool("list_triggers", "List all triggers", ws, async ({ accountId, containerId, workspaceId }) => {
    try { return ok(await gtm.listTriggers(accountId, containerId, workspaceId)); } catch (e) { return err(e); }
  });
  server.tool("get_trigger", "Get trigger details", { ...ws, triggerId: z.string() }, async ({ accountId, containerId, workspaceId, triggerId }) => {
    try { return ok(await gtm.getTrigger(accountId, containerId, workspaceId, triggerId)); } catch (e) { return err(e); }
  });
  server.tool("create_trigger", "Create a trigger from JSON", { ...ws, triggerData: z.string().describe("JSON of GTM Trigger resource") },
    async ({ accountId, containerId, workspaceId, triggerData }) => {
      try { return ok(await gtm.createTrigger(accountId, containerId, workspaceId, JSON.parse(triggerData))); } catch (e) { return err(e); }
    }
  );
  server.tool("update_trigger", "Update a trigger", { ...ws, triggerId: z.string(), triggerData: z.string() },
    async ({ accountId, containerId, workspaceId, triggerId, triggerData }) => {
      try { return ok(await gtm.updateTrigger(accountId, containerId, workspaceId, triggerId, JSON.parse(triggerData))); } catch (e) { return err(e); }
    }
  );
  server.tool("delete_trigger", "Delete a trigger", { ...ws, triggerId: z.string() }, async ({ accountId, containerId, workspaceId, triggerId }) => {
    try { await gtm.deleteTrigger(accountId, containerId, workspaceId, triggerId); return ok({ success: true, deleted: triggerId }); } catch (e) { return err(e); }
  });

  // Variable tools
  server.tool("list_variables", "List user-defined variables", ws, async ({ accountId, containerId, workspaceId }) => {
    try { return ok(await gtm.listVariables(accountId, containerId, workspaceId)); } catch (e) { return err(e); }
  });
  server.tool("get_variable", "Get variable details", { ...ws, variableId: z.string() }, async ({ accountId, containerId, workspaceId, variableId }) => {
    try { return ok(await gtm.getVariable(accountId, containerId, workspaceId, variableId)); } catch (e) { return err(e); }
  });
  server.tool("create_variable", "Create a variable from JSON", { ...ws, variableData: z.string().describe("JSON of GTM Variable resource") },
    async ({ accountId, containerId, workspaceId, variableData }) => {
      try { return ok(await gtm.createVariable(accountId, containerId, workspaceId, JSON.parse(variableData))); } catch (e) { return err(e); }
    }
  );
  server.tool("update_variable", "Update a variable", { ...ws, variableId: z.string(), variableData: z.string() },
    async ({ accountId, containerId, workspaceId, variableId, variableData }) => {
      try { return ok(await gtm.updateVariable(accountId, containerId, workspaceId, variableId, JSON.parse(variableData))); } catch (e) { return err(e); }
    }
  );
  server.tool("delete_variable", "Delete a variable", { ...ws, variableId: z.string() }, async ({ accountId, containerId, workspaceId, variableId }) => {
    try { await gtm.deleteVariable(accountId, containerId, workspaceId, variableId); return ok({ success: true, deleted: variableId }); } catch (e) { return err(e); }
  });

  // Folder tools
  server.tool("list_folders", "List folders", ws, async ({ accountId, containerId, workspaceId }) => {
    try { return ok(await gtm.listFolders(accountId, containerId, workspaceId)); } catch (e) { return err(e); }
  });
  server.tool("create_folder", "Create a folder", { ...ws, name: z.string() }, async ({ accountId, containerId, workspaceId, name }) => {
    try { return ok(await gtm.createFolder(accountId, containerId, workspaceId, name)); } catch (e) { return err(e); }
  });

  // Version & publish tools
  server.tool("list_versions", "List container versions", cont, async ({ accountId, containerId }) => {
    try { return ok(await gtm.listVersions(accountId, containerId)); } catch (e) { return err(e); }
  });
  server.tool("create_version", "Create a version from workspace", { ...ws, name: z.string(), notes: z.string().optional() },
    async ({ accountId, containerId, workspaceId, name, notes }) => {
      try { return ok(await gtm.createVersion(accountId, containerId, workspaceId, name, notes)); } catch (e) { return err(e); }
    }
  );
  server.tool("publish_version", "Publish a version (go live!)", { ...cont, versionId: z.string() },
    async ({ accountId, containerId, versionId }) => {
      try { return ok(await gtm.publishVersion(accountId, containerId, versionId)); } catch (e) { return err(e); }
    }
  );

  // Utility tools
  server.tool("list_built_in_variables", "List enabled built-in variables", ws, async ({ accountId, containerId, workspaceId }) => {
    try { return ok(await gtm.listBuiltInVariables(accountId, containerId, workspaceId)); } catch (e) { return err(e); }
  });
  server.tool("list_templates", "List custom templates", ws, async ({ accountId, containerId, workspaceId }) => {
    try { return ok(await gtm.listTemplates(accountId, containerId, workspaceId)); } catch (e) { return err(e); }
  });
  server.tool("list_user_permissions", "List account permissions", acct, async ({ accountId }) => {
    try { return ok(await gtm.listPermissions(accountId)); } catch (e) { return err(e); }
  });
}

/** Register prompts on an MCP server. */
function registerPrompts(server: McpServer): void {
  for (const prompt of GTM_PROMPTS) {
    const schema: Record<string, z.ZodTypeAny> = {};
    for (const arg of prompt.arguments || []) {
      schema[arg.name] = arg.required
        ? z.string().describe(arg.description)
        : z.string().optional().describe(arg.description);
    }

    if (Object.keys(schema).length > 0) {
      server.prompt(prompt.name, prompt.description, schema, async (args) => {
        const sa: Record<string, string> = {};
        for (const [k, v] of Object.entries(args)) sa[k] = String(v ?? "");
        return { messages: [{ role: "user" as const, content: { type: "text" as const, text: prompt.template(sa) } }] };
      });
    } else {
      server.prompt(prompt.name, prompt.description, async () => {
        return { messages: [{ role: "user" as const, content: { type: "text" as const, text: prompt.template({}) } }] };
      });
    }
  }
}

/** Create docs-only MCP server (no auth required). */
function createDocsOnlyServer(): McpServer {
  const server = new McpServer({ name: "taggingdocs", version: "1.0.0" });
  registerDocsTools(server);
  registerPrompts(server);
  return server;
}

/** Create full MCP server with docs + GTM tools (auth required). */
function createFullMcpServer(googleToken: string): McpServer {
  const server = new McpServer({ name: "gtm-mcp-server", version: "1.0.0" });
  registerDocsTools(server);
  registerGtmTools(server, googleToken);
  registerPrompts(server);
  return server;
}

// ═══════════════════════════════════════════════════════════════════════
// MCP Streamable HTTP Transport
// ═══════════════════════════════════════════════════════════════════════

function getBearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.substring(7);
}

app.post("/mcp", mcpLimiter, async (req, res) => {
  const sessionToken = getBearerToken(req);
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing session
      transport = transports.get(sessionId)!;
    } else if (sessionId && !transports.has(sessionId)) {
      // Client is holding a stale session ID (e.g. we restarted). Per MCP
      // Streamable HTTP spec, a 404 tells the client to re-initialize. A 400
      // here makes Claude Desktop render the connector as "no tools" forever.
      log.info({ sessionId, method: req.body?.method }, "mcp: unknown session id → 404");
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found — please reinitialize" },
        id: req.body?.id ?? null,
      });
      return;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // ── New session ─────────────────────────────────────────────
      // Resolve auth: if token provided, try to get Google token for full access
      let mcpServer: McpServer;
      let mode: "full" | "docs-only";

      if (sessionToken) {
        const googleToken = await getGoogleTokenForSession(sessionToken);
        if (googleToken) {
          // Authenticated → full server with docs + GTM tools
          mcpServer = createFullMcpServer(googleToken);
          mode = "full";
        } else {
          // A token was presented but we can't resolve it — tell the client to
          // re-auth instead of silently downgrading.
          log.warn(
            { tokenPrefix: sessionToken.slice(0, 8) },
            "mcp: bearer token provided but not resolvable → 401"
          );
          res.set(
            "WWW-Authenticate",
            `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`
          );
          res.status(401).json({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Invalid or expired token — please re-authenticate" },
            id: null,
          });
          return;
        }
      } else {
        // No auth header at all → docs-only mode (anonymous access is a feature).
        mcpServer = createDocsOnlyServer();
        mode = "docs-only";
      }

      // Capture the session ID when the transport generates it during the
      // init request. Reading transport.sessionId immediately after connect()
      // is a race — it's undefined until the transport actually processes the
      // init, which happens inside handleRequest() below.
      const storedMode = mode;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport);
          log.info(
            { sessionId: newSessionId, mode: storedMode, clients: transports.size },
            "mcp: new session"
          );
        },
        onsessionclosed: (closedSessionId) => {
          transports.delete(closedSessionId);
          log.info({ sessionId: closedSessionId, clients: transports.size }, "mcp: session closed");
        },
      });

      await mcpServer.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Bad request: no session ID or not an init request" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    log.error({ err: error }, "MCP request error");
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// SSE endpoint for server-to-client notifications
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.status(404).json({ error: "No active session — reinitialize via POST /mcp" });
    return;
  }
  const transport = transports.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// Session cleanup
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.close();
    transports.delete(sessionId);
  }
  res.status(200).json({ status: "closed" });
});

// ═══════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════

const httpServer = app.listen(PORT, () => {
  log.info(
    { port: PORT, baseUrl: BASE_URL, articles: ARTICLE_COUNT, endpoint: `${BASE_URL}/mcp` },
    "GTM MCP Server started"
  );
});

// ─── Graceful shutdown ────────────────────────────────────────────────
// Coolify/K8s sends SIGTERM during redeploys. Close active MCP sessions and
// flush pending token-store writes so no user loses their OAuth session.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal, sessions: transports.size }, "shutdown: closing HTTP server");

  httpServer.close(() => log.info("shutdown: HTTP server closed"));

  await Promise.allSettled(
    [...transports.values()].map((t) => t.close().catch(() => {}))
  );
  transports.clear();

  flushStore();
  log.info("shutdown: complete");

  // Give the logger a tick to drain before exit.
  setTimeout(() => process.exit(0), 50);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
