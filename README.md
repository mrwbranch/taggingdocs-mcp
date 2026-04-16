# GTM MCP Server

Manage Google Tag Manager through AI — powered by [taggingdocs.com](https://taggingdocs.com) best practices.

A hosted [Model Context Protocol](https://modelcontextprotocol.io) server that gives your AI assistant two things:

- **Search the full TaggingDocs library** — every guide on GTM, GA4, server-side tagging, dataLayer design, Consent Mode v2, and integrations. No login required.
- **Drive Google Tag Manager directly** — list, create, update, and publish tags, triggers, variables, folders, and versions across your GTM accounts. Signs in with your Google account.

Already live at **`https://mcp.taggingdocs.com/mcp`** — just add it to your AI client.

Full documentation and screenshots: [taggingdocs.com/mcp](https://taggingdocs.com/mcp/). Per-client setup walkthroughs and troubleshooting: [taggingdocs.com/mcp/connect](https://taggingdocs.com/mcp/connect/).

## Connect in 30 seconds

Paste the URL with the `/mcp` suffix — some clients accept the bare origin and then can't find the MCP endpoint, giving you an `McpEndpointNotFound` error.

### Claude.ai / Claude app
Settings → **Customize** → **Connectors** → **Add custom connector** → paste `https://mcp.taggingdocs.com/mcp`.

### Claude Code
```bash
claude mcp add -t http gtm https://mcp.taggingdocs.com/mcp
```

### ChatGPT
Settings → **Connectors** → **Add custom MCP** → paste `https://mcp.taggingdocs.com/mcp`.

### Claude Desktop / Cursor / anything that speaks MCP over stdio
```bash
npx mcp-remote https://mcp.taggingdocs.com/mcp
```

No sign-in is needed to read docs. When you ask the AI to touch a GTM container, it will prompt you to authorize with Google — once, then tokens refresh automatically.

## What you can ask

- *"What does taggingdocs recommend for ecommerce tracking?"* — no login
- *"Look up the GA4 purchase event spec."* — no login
- *"List all my GTM containers."* — prompts Google sign-in
- *"Audit this container following taggingdocs best practices."*
- *"Set up GA4 ecommerce tracking with all events."*
- *"Set up Consent Mode v2 with Cookiebot."*

## What's in the box

- **4 docs tools** — search, read, browse sections, quick event lookup.
- **~30 GTM tools** — full CRUD over accounts, containers, workspaces, tags, triggers, variables, folders, versions, templates, permissions. Publish support included.
- **6 guided workflows** — prebuilt prompts for container audits, GA4 setup, Consent Mode v2, server-side migration, and more.
- **Automatic pagination** on every list call, so large containers come back complete.
- **OAuth persistence** — sign in once; the server refreshes your Google tokens in the background.

## Auth model

| Surface | Requires login? | Google scopes used |
|---------|-----------------|--------------------|
| Docs search / read | No | — |
| GTM read | Yes | `tagmanager.readonly` |
| GTM edit | Yes | `tagmanager.edit.containers`, `…containerversions` |
| GTM publish | Yes | `tagmanager.publish` |
| Account admin | Yes | `tagmanager.manage.accounts`, `…manage.users` |

Your Google tokens are stored server-side so you don't re-authenticate every session. Revoke access any time at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Self-hosting

You can run your own instance — useful if you want to restrict which Google accounts can sign in, or to control where tokens are stored.

**Prerequisites**

- Docker + Docker Compose
- A Google Cloud OAuth 2.0 client (Web Application). Authorized redirect URIs must include `https://your-domain/oauth/google-callback` plus your AI client's callback (e.g. `https://claude.ai/api/mcp/auth_callback`).
- The [taggingdocs content repo](https://github.com/mrwbranch/taggingdocs) — cloned automatically at build time.

**Run**

```bash
cp .env.example .env
# edit .env — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BASE_URL
docker compose up --build
```

The server listens on port `3000` and persists OAuth state to a named Docker volume (`gtm-mcp-data`), so redeploys don't log users out. Health check at `/health`.

**Local development**

```bash
npm install
git clone --depth 1 https://github.com/mrwbranch/taggingdocs.git content-repo
npm run build
npm run dev          # tsx watch — hot reload on src/ changes
npm run typecheck    # tsc --noEmit
```

Set `LOG_LEVEL=debug` for verbose structured logs (pino).

## Links

- [taggingdocs.com](https://taggingdocs.com) — the docs this server is built on
- [Model Context Protocol](https://modelcontextprotocol.io) — the open protocol spec
- [GitHub Issues](https://github.com/mrwbranch/taggingdocs-mcp/issues) — bug reports and feature requests
- `GET /health` — liveness + index stats
- `GET /.well-known/oauth-authorization-server` — OAuth server metadata (RFC 8414)

## License

MIT — see [LICENSE](./LICENSE).
