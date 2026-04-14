import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { randomUUID } from "crypto";
import { log } from "./logger.js";

const DATA_DIR = process.env.DATA_DIR || "/data";
const DB_FILE = `${DATA_DIR}/gtm-mcp-store.json`;
const TMP_FILE = `${DB_FILE}.tmp`;
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

export interface StoredToken {
  session_id: string;
  google_access_token: string;
  google_refresh_token: string | null;
  google_token_expiry: number | null;
  google_email: string | null;
  created_at: number;
  updated_at: number;
}
interface AuthCode {
  code: string; session_id: string; redirect_uri: string; client_id: string;
  code_challenge: string | null; code_challenge_method: string | null; expires_at: number;
}
interface OAuthClient {
  client_id: string; client_secret: string | null; redirect_uris: string[]; client_name: string | null;
}
interface Store { tokens: Record<string, StoredToken>; codes: Record<string, AuthCode>; clients: Record<string, OAuthClient>; }

let store: Store = { tokens: {}, codes: {}, clients: {} };

function loadStore() {
  if (!existsSync(DB_FILE)) return;
  try {
    store = JSON.parse(readFileSync(DB_FILE, "utf-8"));
  } catch (err) {
    // Corrupted file would silently wipe every session. Keep the bad file around
    // for forensics and start fresh only if recovery truly fails.
    log.error({ err, file: DB_FILE }, "token-store: failed to parse, quarantining file");
    try { renameSync(DB_FILE, `${DB_FILE}.corrupt-${Date.now()}`); } catch {}
    store = { tokens: {}, codes: {}, clients: {} };
  }
}

function saveStore() {
  // Atomic write: tmp + rename avoids leaving a truncated JSON on crash.
  writeFileSync(TMP_FILE, JSON.stringify(store, null, 2));
  renameSync(TMP_FILE, DB_FILE);
}

loadStore();

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { saveStore(); } catch (err) { log.error({ err }, "token-store: save failed"); }
  }, 500);
}

/** Force any pending debounced save to flush synchronously. Call from shutdown handler. */
export function flushStore() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try { saveStore(); } catch (err) { log.error({ err }, "token-store: flush failed"); }
}

export function storeUserToken(sessionId: string, accessToken: string, refreshToken?: string, expiresIn?: number, email?: string) {
  const now = Math.floor(Date.now() / 1000);
  const existing = store.tokens[sessionId];
  store.tokens[sessionId] = {
    session_id: sessionId, google_access_token: accessToken,
    google_refresh_token: refreshToken ?? existing?.google_refresh_token ?? null,
    google_token_expiry: expiresIn ? now + expiresIn : null,
    google_email: email ?? existing?.google_email ?? null,
    created_at: existing?.created_at ?? now, updated_at: now,
  };
  debouncedSave();
}
export function getUserToken(sessionId: string): StoredToken | null { return store.tokens[sessionId] || null; }
export function deleteUserToken(sessionId: string) { delete store.tokens[sessionId]; debouncedSave(); }

export function storeAuthCode(code: string, sessionId: string, redirectUri: string, clientId: string, codeChallenge?: string, codeChallengeMethod?: string) {
  store.codes[code] = { code, session_id: sessionId, redirect_uri: redirectUri, client_id: clientId,
    code_challenge: codeChallenge ?? null, code_challenge_method: codeChallengeMethod ?? null,
    expires_at: Math.floor(Date.now() / 1000) + 600 };
  debouncedSave();
}
export function getAuthCode(code: string) {
  const e = store.codes[code]; if (!e) return null;
  if (e.expires_at < Math.floor(Date.now() / 1000)) { delete store.codes[code]; return null; }
  return e;
}
export function deleteAuthCode(code: string) { delete store.codes[code]; debouncedSave(); }

export function registerClient(clientId: string, clientSecret: string | null, redirectUris: string[], clientName?: string) {
  store.clients[clientId] = { client_id: clientId, client_secret: clientSecret, redirect_uris: redirectUris, client_name: clientName ?? null };
  debouncedSave();
}
export function getClient(clientId: string) { return store.clients[clientId] || null; }
export function generateSessionId() { return randomUUID(); }

setInterval(() => {
  const now = Math.floor(Date.now() / 1000); let changed = false;
  for (const [code, entry] of Object.entries(store.codes)) { if (entry.expires_at < now) { delete store.codes[code]; changed = true; } }
  if (changed) saveStore();
}, 60_000);
