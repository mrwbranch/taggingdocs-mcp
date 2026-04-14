// ─── Pre-built MCP Prompts for GTM workflows ─────────────────────────
// These embed taggingdocs.com best practices directly into the prompt context.

export interface GtmPrompt {
  name: string;
  description: string;
  arguments?: {
    name: string;
    description: string;
    required: boolean;
  }[];
  template: (args: Record<string, string>) => string;
}

export const GTM_PROMPTS: GtmPrompt[] = [
  {
    name: "audit_container",
    description:
      "Comprehensive GTM container audit following taggingdocs.com best practices. Checks naming conventions, orphaned triggers, duplicate tags, folder organization, consent setup, and more.",
    arguments: [
      { name: "accountId", description: "GTM Account ID", required: true },
      { name: "containerId", description: "GTM Container ID", required: true },
      { name: "workspaceId", description: "GTM Workspace ID", required: true },
    ],
    template: ({ accountId, containerId, workspaceId }) => `
Perform a comprehensive audit of GTM container.
Account: ${accountId}, Container: ${containerId}, Workspace: ${workspaceId}

Use these tools in order:
1. list_tags — get all tags
2. list_triggers — get all triggers
3. list_variables — get all variables
4. list_folders — get folder structure
5. get_workspace_status — check pending changes

Then evaluate against these taggingdocs.com best practices:

## Naming Conventions (ref: taggingdocs.com/client-side/management/naming-conventions/)
- Tags: "[Type] - [Platform] - [Action]" (e.g., "GA4 - Event - form_submit")
- Triggers: "[Type] - [Description]" (e.g., "CE - form_submit" for Custom Event)
- Variables: "[Type] - [Name]" (e.g., "DLV - ecommerce.items")
- Flag any items not following a consistent convention

## Orphaned Entities
- Triggers not attached to any tag
- Variables not referenced by any tag or trigger
- Tags with no firing triggers

## Duplicate Detection
- Tags with identical type + parameters
- Triggers with identical conditions
- Multiple GA4 config tags (should usually be one)

## Folder Organization (ref: taggingdocs.com/client-side/management/folder-organization/)
- Items should be organized into folders by project/vendor/function
- Flag containers with 20+ unfoldered items

## Consent & Privacy (ref: taggingdocs.com/consent/consent-mode/consent-mode-v2/)
- Check for Consent Mode initialization
- Verify marketing/analytics tags respect consent
- Flag Custom HTML tags that may fire before consent

## Security Concerns (ref: taggingdocs.com/security/tag-auditing/)
- Custom HTML tags loading external scripts
- Tags firing on All Pages that shouldn't
- Overly broad trigger conditions

## Performance (ref: taggingdocs.com/resources/performance-optimization/)
- Total number of tags (flag >50)
- Tags with tag sequencing creating long chains
- Custom HTML tags with heavy DOM manipulation

Output a structured report with: ✅ Passing checks, ⚠️ Warnings, ❌ Issues, and recommendations.
`,
  },

  {
    name: "setup_ga4_ecommerce",
    description:
      "Create a complete GA4 ecommerce tracking setup with all standard events, triggers, and variables following taggingdocs.com specifications.",
    arguments: [
      { name: "accountId", description: "GTM Account ID", required: true },
      { name: "containerId", description: "GTM Container ID", required: true },
      { name: "workspaceId", description: "GTM Workspace ID", required: true },
      { name: "measurementId", description: "GA4 Measurement ID (G-XXXXXXX)", required: true },
    ],
    template: ({ accountId, containerId, workspaceId, measurementId }) => `
Set up complete GA4 ecommerce tracking in:
Account: ${accountId}, Container: ${containerId}, Workspace: ${workspaceId}
Measurement ID: ${measurementId}

Follow taggingdocs.com ecommerce specification (ref: taggingdocs.com/datalayer/ecommerce/ecommerce-overview/).

## Step 1: Create Folder
Create folder "GA4 - Ecommerce" to organize all entities.

## Step 2: Create Variables
Data Layer Variables needed (ref: taggingdocs.com/client-side/variables/datalayer-variables/):
- "DLV - ecommerce.items" → dataLayer variable "ecommerce.items"
- "DLV - ecommerce.transaction_id" → dataLayer variable "ecommerce.transaction_id"
- "DLV - ecommerce.value" → dataLayer variable "ecommerce.value"
- "DLV - ecommerce.currency" → dataLayer variable "ecommerce.currency"
- "DLV - ecommerce.shipping" → dataLayer variable "ecommerce.shipping"
- "DLV - ecommerce.tax" → dataLayer variable "ecommerce.tax"
- "DLV - ecommerce.coupon" → dataLayer variable "ecommerce.coupon"
- "DLV - ecommerce.item_list_name" → dataLayer variable "ecommerce.item_list_name"
- "DLV - ecommerce.payment_type" → dataLayer variable "ecommerce.payment_type"
- "DLV - ecommerce.shipping_tier" → dataLayer variable "ecommerce.shipping_tier"

## Step 3: Create Triggers
Custom Event triggers for each ecommerce event:
- "CE - view_item_list"
- "CE - select_item"
- "CE - view_item"
- "CE - add_to_cart"
- "CE - remove_from_cart"
- "CE - view_cart"
- "CE - begin_checkout"
- "CE - add_shipping_info"
- "CE - add_payment_info"
- "CE - purchase"
- "CE - refund"

## Step 4: Create GA4 Event Tags
For each event, create a GA4 Event tag (type "gaawe") with:
- Measurement ID: ${measurementId}
- Event name matching the trigger event
- Appropriate parameters mapped to DLV variables

Example purchase tag parameters:
- transaction_id → {{DLV - ecommerce.transaction_id}}
- value → {{DLV - ecommerce.value}}
- currency → {{DLV - ecommerce.currency}}
- items → {{DLV - ecommerce.items}}

Use the create_tag, create_trigger, create_variable tools for each.
Name everything consistently per taggingdocs naming conventions.
`,
  },

  {
    name: "generate_tracking_plan",
    description:
      "Generate a tracking plan document from the current container state, documenting all events, triggers, variables, and their relationships.",
    arguments: [
      { name: "accountId", description: "GTM Account ID", required: true },
      { name: "containerId", description: "GTM Container ID", required: true },
      { name: "workspaceId", description: "GTM Workspace ID", required: true },
    ],
    template: ({ accountId, containerId, workspaceId }) => `
Generate a complete tracking plan from the current GTM container state.
Account: ${accountId}, Container: ${containerId}, Workspace: ${workspaceId}

Fetch all data:
1. list_tags
2. list_triggers
3. list_variables
4. list_folders

Then produce a structured tracking plan document (ref: taggingdocs.com/resources/documentation-template/) with:

## 1. Container Overview
- Container name and ID
- Total counts: tags, triggers, variables
- Folder structure

## 2. Event Inventory
For each tag, document:
- Event name
- Tag type (GA4 Event, Custom HTML, etc.)
- Trigger(s) that fire it
- Parameters/variables it sends
- Consent requirements

## 3. DataLayer Requirements
For each custom event trigger:
- Required dataLayer push format
- Parameters and their types
- Example code snippet

## 4. Variable Reference
All variables with:
- Name, type, value/path
- Which tags use them

## 5. Trigger Map
All triggers with:
- Type and conditions
- Which tags they fire
- Which tags they block

Format as clean Markdown suitable for sharing with developers.
`,
  },

  {
    name: "setup_consent_mode",
    description:
      "Implement Google Consent Mode v2 in a GTM container following taggingdocs.com best practices.",
    arguments: [
      { name: "accountId", description: "GTM Account ID", required: true },
      { name: "containerId", description: "GTM Container ID", required: true },
      { name: "workspaceId", description: "GTM Workspace ID", required: true },
      {
        name: "cmpPlatform",
        description: "CMP platform (cookiebot, cookieyes, onetrust, custom)",
        required: false,
      },
    ],
    template: ({ accountId, containerId, workspaceId, cmpPlatform }) => `
Set up Google Consent Mode v2 in:
Account: ${accountId}, Container: ${containerId}, Workspace: ${workspaceId}
CMP Platform: ${cmpPlatform || "custom"}

Follow taggingdocs.com consent implementation guide:
(ref: taggingdocs.com/consent/consent-mode/consent-mode-v2/)
(ref: taggingdocs.com/consent/consent-mode/consent-mode-gtm-setup/)

## Key Requirements:

### 1. Default Consent State
Create a Custom HTML tag that fires on "Consent Initialization - All Pages" trigger
that sets default consent to denied:

gtag('consent', 'default', {
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'analytics_storage': 'denied',
  'wait_for_update': 500
});

### 2. Consent Update
After CMP collects user choice, update consent state via:
gtag('consent', 'update', { ... })

### 3. Tag Consent Settings
- Review all existing tags
- Ensure GA4 tags have "analytics_storage" consent requirement
- Ensure Google Ads tags have "ad_storage" and "ad_user_data" requirements
- Custom HTML tags for marketing pixels should respect "ad_storage"

### 4. Verify
- Check that tags fire in "denied" state with limited data (Advanced Consent Mode)
- Or that tags don't fire at all until consent (Basic Consent Mode)

List current tags first, then recommend which consent categories each needs.
`,
  },

  {
    name: "migrate_ua_to_ga4",
    description:
      "Analyze a container for Universal Analytics remnants and create equivalent GA4 tags.",
    arguments: [
      { name: "accountId", description: "GTM Account ID", required: true },
      { name: "containerId", description: "GTM Container ID", required: true },
      { name: "workspaceId", description: "GTM Workspace ID", required: true },
      { name: "measurementId", description: "GA4 Measurement ID", required: true },
    ],
    template: ({ accountId, containerId, workspaceId, measurementId }) => `
Analyze container for UA→GA4 migration opportunities.
Account: ${accountId}, Container: ${containerId}, Workspace: ${workspaceId}
GA4 Measurement ID: ${measurementId}

1. list_tags to find all tags
2. Identify Universal Analytics tags (type "ua" or containing "UA-" measurement IDs)
3. Identify Google Analytics Settings variables

For each UA tag found:
- Document what it tracks (pageview, event, transaction, etc.)
- Propose the GA4 equivalent (gaawc for config, gaawe for events)
- Map UA category/action/label to GA4 event name + parameters
- Note any custom dimensions/metrics that need GA4 custom definitions

Follow GA4 event naming best practices (ref: taggingdocs.com/datalayer/specification/event-naming-rules/):
- Use snake_case
- Max 40 characters
- Use recommended event names where possible

Output a migration plan, then ask before creating any new tags.
`,
  },

  {
    name: "lookup_best_practice",
    description:
      "Look up best practices from taggingdocs.com for a specific GTM/GA4 topic.",
    arguments: [
      {
        name: "topic",
        description:
          "Topic to look up (e.g., 'naming conventions', 'consent mode', 'ecommerce tracking', 'cross-domain', 'debugging')",
        required: true,
      },
    ],
    template: ({ topic }) => `
Look up best practices for "${topic}" from taggingdocs.com.

Use the search_taggingdocs tool to find relevant pages, then use read_taggingdocs_page to fetch
the most relevant page content. Summarize the key best practices and actionable recommendations.

If the topic relates to GTM configuration, also show specific GTM API parameters/values
needed to implement the recommendation.
`,
  },
];
