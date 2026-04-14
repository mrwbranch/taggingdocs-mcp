import { randomUUID, createHash, timingSafeEqual } from "crypto";
import {
  storeUserToken,
  getUserToken,
  storeAuthCode,
  getAuthCode,
  deleteAuthCode,
  registerClient,
  getClient,
  generateSessionId,
} from "./token-store.js";
import { log } from "./logger.js";

// ─── Config from environment ──────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const BASE_URL = process.env.BASE_URL || "https://mcp.taggingdocs.com";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

const GTM_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
  "https://www.googleapis.com/auth/tagmanager.manage.accounts",
  "https://www.googleapis.com/auth/tagmanager.manage.users",
  "openid",
  "email",
];

// ─── In-memory state store for pending auth flows ─────────────────────
const pendingStates = new Map<
  string,
  {
    clientId: string;
    redirectUri: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    expiresAt: number;
  }
>();

// Cleanup expired states every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (val.expiresAt < now) pendingStates.delete(key);
  }
}, 60_000);

// ═══════════════════════════════════════════════════════════════════════
// OAuth Server Metadata (RFC 8414)
// ═══════════════════════════════════════════════════════════════════════

export function getOAuthMetadata() {
  return {
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    registration_endpoint: `${BASE_URL}/oauth/register`,
    revocation_endpoint: `${BASE_URL}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "none",
    ],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["gtm:read", "gtm:write", "gtm:publish"],
    service_documentation: "https://taggingdocs.com",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Dynamic Client Registration (RFC 7591)
// ═══════════════════════════════════════════════════════════════════════

export function handleClientRegistration(body: {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
}) {
  const clientId = `td_${randomUUID().replace(/-/g, "").substring(0, 16)}`;
  const clientSecret = randomUUID();

  registerClient(clientId, clientSecret, body.redirect_uris, body.client_name);

  return {
    client_id: clientId,
    client_secret: clientSecret,
    client_name: body.client_name,
    redirect_uris: body.redirect_uris,
    token_endpoint_auth_method: body.token_endpoint_auth_method || "client_secret_post",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Authorization Endpoint
// ═══════════════════════════════════════════════════════════════════════

export function handleAuthorize(query: {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
}): { redirectUrl: string } | { error: string } {
  // Validate client
  const client = getClient(query.client_id);
  if (!client) {
    return { error: "Unknown client_id" };
  }

  // Validate redirect_uri
  if (!client.redirect_uris.includes(query.redirect_uri)) {
    return { error: "Invalid redirect_uri" };
  }

  // Store the MCP client's state so we can complete the flow after Google auth
  const googleState = randomUUID();
  pendingStates.set(googleState, {
    clientId: query.client_id,
    redirectUri: query.redirect_uri,
    codeChallenge: query.code_challenge,
    codeChallengeMethod: query.code_challenge_method || "S256",
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  // Build Google OAuth URL — redirect user to Google
  const googleAuthUrl = new URL(GOOGLE_AUTH_URL);
  googleAuthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set("redirect_uri", `${BASE_URL}/oauth/google-callback`);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", GTM_SCOPES.join(" "));
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent");
  // Encode both our state and the MCP client's state
  googleAuthUrl.searchParams.set(
    "state",
    JSON.stringify({ gs: googleState, cs: query.state || "" })
  );

  return { redirectUrl: googleAuthUrl.toString() };
}

// ═══════════════════════════════════════════════════════════════════════
// Google OAuth Callback
// ═══════════════════════════════════════════════════════════════════════

export async function handleGoogleCallback(query: {
  code?: string;
  state?: string;
  error?: string;
}): Promise<{ redirectUrl: string } | { error: string }> {
  if (query.error) {
    return { error: `Google auth error: ${query.error}` };
  }

  if (!query.code || !query.state) {
    return { error: "Missing code or state from Google" };
  }

  // Parse state to recover MCP client info
  let stateData: { gs: string; cs: string };
  try {
    stateData = JSON.parse(query.state);
  } catch {
    return { error: "Invalid state parameter" };
  }

  const pending = pendingStates.get(stateData.gs);
  if (!pending) {
    return { error: "Auth flow expired or invalid state" };
  }
  pendingStates.delete(stateData.gs);

  // Exchange Google auth code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: query.code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${BASE_URL}/oauth/google-callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    return { error: `Google token exchange failed: ${err}` };
  }

  const googleTokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    id_token?: string;
  };

  // Get user email for identification
  let email: string | undefined;
  try {
    const userInfo = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${googleTokens.access_token}` },
    });
    if (userInfo.ok) {
      const info = (await userInfo.json()) as { email?: string };
      email = info.email;
    }
  } catch {
    // Non-critical
  }

  // Create a session and store the Google tokens
  const sessionId = generateSessionId();
  storeUserToken(
    sessionId,
    googleTokens.access_token,
    googleTokens.refresh_token,
    googleTokens.expires_in,
    email
  );

  // Generate an authorization code for the MCP client
  const mcpCode = randomUUID();
  storeAuthCode(
    mcpCode,
    sessionId,
    pending.redirectUri,
    pending.clientId,
    pending.codeChallenge,
    pending.codeChallengeMethod
  );

  // Redirect back to the MCP client with the code
  const redirectUrl = new URL(pending.redirectUri);
  redirectUrl.searchParams.set("code", mcpCode);
  if (stateData.cs) {
    redirectUrl.searchParams.set("state", stateData.cs);
  }

  return { redirectUrl: redirectUrl.toString() };
}

// ═══════════════════════════════════════════════════════════════════════
// Token Endpoint
// ═══════════════════════════════════════════════════════════════════════

export async function handleTokenExchange(body: {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
}): Promise<{ tokens: any } | { error: string; status: number }> {
  if (body.grant_type === "authorization_code") {
    return handleAuthCodeExchange(body);
  } else if (body.grant_type === "refresh_token") {
    return handleRefreshToken(body);
  }

  return { error: "unsupported_grant_type", status: 400 };
}

async function handleAuthCodeExchange(body: {
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  code_verifier?: string;
}): Promise<{ tokens: any } | { error: string; status: number }> {
  if (!body.code) {
    return { error: "Missing code", status: 400 };
  }

  const authCode = getAuthCode(body.code);
  if (!authCode) {
    return { error: "invalid_grant", status: 400 };
  }

  // Verify PKCE: if a challenge was registered, the verifier is required.
  if (authCode.code_challenge) {
    if (!body.code_verifier) {
      deleteAuthCode(body.code);
      return { error: "invalid_grant (missing code_verifier)", status: 400 };
    }
    const method = authCode.code_challenge_method || "S256";
    const computed =
      method === "S256"
        ? createHash("sha256").update(body.code_verifier).digest("base64url")
        : body.code_verifier;
    const a = Buffer.from(computed);
    const b = Buffer.from(authCode.code_challenge);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      deleteAuthCode(body.code);
      return { error: "invalid_grant (PKCE mismatch)", status: 400 };
    }
  }

  // Verify redirect_uri matches
  if (body.redirect_uri && body.redirect_uri !== authCode.redirect_uri) {
    deleteAuthCode(body.code);
    return { error: "invalid_grant (redirect_uri mismatch)", status: 400 };
  }

  deleteAuthCode(body.code);

  // Get the stored Google tokens for this session
  const userToken = getUserToken(authCode.session_id);
  if (!userToken) {
    return { error: "Session not found", status: 500 };
  }

  // Issue our own access token (the session_id) and the Google refresh token
  // The session_id is used to look up the Google tokens for API calls
  return {
    tokens: {
      access_token: authCode.session_id,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: userToken.google_refresh_token || authCode.session_id,
      scope: "gtm:read gtm:write gtm:publish",
    },
  };
}

async function handleRefreshToken(body: {
  refresh_token?: string;
  client_id?: string;
}): Promise<{ tokens: any } | { error: string; status: number }> {
  if (!body.refresh_token) {
    return { error: "Missing refresh_token", status: 400 };
  }

  // The refresh_token is either a Google refresh token or a session_id
  // Try to find the session first
  let userToken = getUserToken(body.refresh_token);

  if (!userToken) {
    return { error: "invalid_grant", status: 400 };
  }

  // Refresh the Google access token if we have a refresh token
  if (userToken.google_refresh_token) {
    try {
      const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: userToken.google_refresh_token,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          grant_type: "refresh_token",
        }),
      });

      if (refreshResponse.ok) {
        const newTokens = (await refreshResponse.json()) as {
          access_token: string;
          expires_in: number;
        };

        storeUserToken(
          userToken.session_id,
          newTokens.access_token,
          userToken.google_refresh_token,
          newTokens.expires_in,
          userToken.google_email || undefined
        );

        return {
          tokens: {
            access_token: userToken.session_id,
            token_type: "Bearer",
            expires_in: newTokens.expires_in,
            refresh_token: body.refresh_token,
          },
        };
      }
    } catch (err) {
      log.error({ err }, "Google refresh failed");
    }
  }

  // Fallback: return the existing session
  return {
    tokens: {
      access_token: userToken.session_id,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: body.refresh_token,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Token Verification — used by MCP transport to get user's Google token
// ═══════════════════════════════════════════════════════════════════════

export async function getGoogleTokenForSession(
  sessionId: string
): Promise<string | null> {
  const userToken = getUserToken(sessionId);
  if (!userToken) return null;

  // Check if access token is still valid (with 5 min buffer)
  const now = Math.floor(Date.now() / 1000);
  if (userToken.google_token_expiry && userToken.google_token_expiry > now + 300) {
    return userToken.google_access_token;
  }

  // Try to refresh
  if (userToken.google_refresh_token) {
    try {
      const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: userToken.google_refresh_token,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          grant_type: "refresh_token",
        }),
      });

      if (refreshResponse.ok) {
        const newTokens = (await refreshResponse.json()) as {
          access_token: string;
          expires_in: number;
        };

        storeUserToken(
          sessionId,
          newTokens.access_token,
          userToken.google_refresh_token,
          newTokens.expires_in,
          userToken.google_email || undefined
        );

        return newTokens.access_token;
      }
    } catch (err) {
      log.error({ err }, "Token refresh failed");
    }
  }

  // Return existing token as last resort
  return userToken.google_access_token;
}
