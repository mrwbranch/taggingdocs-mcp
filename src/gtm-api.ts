const BASE = "https://tagmanager.googleapis.com/tagmanager/v2";

// ─── Generic request helper (takes access token) ─────────────────────
async function gtmRequest<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GTM API ${method} ${path} failed (${response.status}): ${errorText}`);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ─── Factory: creates API functions bound to a user's token ───────────
export function createGtmApi(token: string) {
  const req = <T>(method: string, path: string, body?: unknown) =>
    gtmRequest<T>(token, method, path, body);

  const wp = (a: string, c: string, w: string) =>
    `/accounts/${a}/containers/${c}/workspaces/${w}`;

  // Walk pageToken until exhausted so large containers don't silently truncate.
  async function paged<T>(path: string, key: string): Promise<T[]> {
    const out: T[] = [];
    let pageToken: string | undefined;
    do {
      const sep = path.includes("?") ? "&" : "?";
      const url = pageToken
        ? `${path}${sep}pageToken=${encodeURIComponent(pageToken)}`
        : path;
      const res = await req<Record<string, unknown>>("GET", url);
      const items = res[key];
      if (Array.isArray(items)) out.push(...(items as T[]));
      pageToken = typeof res.nextPageToken === "string" ? res.nextPageToken : undefined;
    } while (pageToken);
    return out;
  }

  return {
    // Accounts
    listAccounts: () => paged<any>("/accounts", "account"),

    // Containers
    listContainers: (accountId: string) =>
      paged<any>(`/accounts/${accountId}/containers`, "container"),
    getContainer: (accountId: string, containerId: string) =>
      req<any>("GET", `/accounts/${accountId}/containers/${containerId}`),
    createContainer: (accountId: string, name: string, usageContext: string[] = ["web"]) =>
      req<any>("POST", `/accounts/${accountId}/containers`, { name, usageContext }),

    // Workspaces
    listWorkspaces: (accountId: string, containerId: string) =>
      paged<any>(`/accounts/${accountId}/containers/${containerId}/workspaces`, "workspace"),
    getWorkspace: (accountId: string, containerId: string, workspaceId: string) =>
      req<any>("GET", wp(accountId, containerId, workspaceId)),
    createWorkspace: (accountId: string, containerId: string, name: string, description?: string) =>
      req<any>("POST", `/accounts/${accountId}/containers/${containerId}/workspaces`, { name, description }),
    getWorkspaceStatus: (accountId: string, containerId: string, workspaceId: string) =>
      req<any>("GET", `${wp(accountId, containerId, workspaceId)}/status`),

    // Tags
    listTags: (a: string, c: string, w: string) =>
      paged<any>(`${wp(a, c, w)}/tags`, "tag"),
    getTag: (a: string, c: string, w: string, tagId: string) =>
      req<any>("GET", `${wp(a, c, w)}/tags/${tagId}`),
    createTag: (a: string, c: string, w: string, data: any) =>
      req<any>("POST", `${wp(a, c, w)}/tags`, data),
    updateTag: (a: string, c: string, w: string, tagId: string, data: any) =>
      req<any>("PUT", `${wp(a, c, w)}/tags/${tagId}`, data),
    deleteTag: (a: string, c: string, w: string, tagId: string) =>
      req<any>("DELETE", `${wp(a, c, w)}/tags/${tagId}`),

    // Triggers
    listTriggers: (a: string, c: string, w: string) =>
      paged<any>(`${wp(a, c, w)}/triggers`, "trigger"),
    getTrigger: (a: string, c: string, w: string, triggerId: string) =>
      req<any>("GET", `${wp(a, c, w)}/triggers/${triggerId}`),
    createTrigger: (a: string, c: string, w: string, data: any) =>
      req<any>("POST", `${wp(a, c, w)}/triggers`, data),
    updateTrigger: (a: string, c: string, w: string, triggerId: string, data: any) =>
      req<any>("PUT", `${wp(a, c, w)}/triggers/${triggerId}`, data),
    deleteTrigger: (a: string, c: string, w: string, triggerId: string) =>
      req<any>("DELETE", `${wp(a, c, w)}/triggers/${triggerId}`),

    // Variables
    listVariables: (a: string, c: string, w: string) =>
      paged<any>(`${wp(a, c, w)}/variables`, "variable"),
    getVariable: (a: string, c: string, w: string, variableId: string) =>
      req<any>("GET", `${wp(a, c, w)}/variables/${variableId}`),
    createVariable: (a: string, c: string, w: string, data: any) =>
      req<any>("POST", `${wp(a, c, w)}/variables`, data),
    updateVariable: (a: string, c: string, w: string, variableId: string, data: any) =>
      req<any>("PUT", `${wp(a, c, w)}/variables/${variableId}`, data),
    deleteVariable: (a: string, c: string, w: string, variableId: string) =>
      req<any>("DELETE", `${wp(a, c, w)}/variables/${variableId}`),

    // Folders
    listFolders: (a: string, c: string, w: string) =>
      paged<any>(`${wp(a, c, w)}/folders`, "folder"),
    createFolder: (a: string, c: string, w: string, name: string) =>
      req<any>("POST", `${wp(a, c, w)}/folders`, { name }),

    // Versions
    listVersions: (accountId: string, containerId: string) =>
      paged<any>(
        `/accounts/${accountId}/containers/${containerId}/version_headers`,
        "containerVersionHeader"
      ),
    createVersion: (a: string, c: string, w: string, name: string, notes?: string) =>
      req<any>("POST", `${wp(a, c, w)}:create_version`, { name, notes }),
    publishVersion: (accountId: string, containerId: string, versionId: string) =>
      req<any>("POST", `/accounts/${accountId}/containers/${containerId}/versions/${versionId}:publish`),

    // Utility
    listBuiltInVariables: (a: string, c: string, w: string) =>
      paged<any>(`${wp(a, c, w)}/built_in_variables`, "builtInVariable"),
    listTemplates: (a: string, c: string, w: string) =>
      paged<any>(`${wp(a, c, w)}/templates`, "template"),
    listPermissions: (accountId: string) =>
      paged<any>(`/accounts/${accountId}/user_permissions`, "userPermission"),
  };
}
