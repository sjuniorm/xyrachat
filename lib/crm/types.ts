// Provider-agnostic CRM abstraction. The contact-sync hook + UI talk to this;
// lib/crm/hubspot.ts (+ pipedrive/salesforce later) implement CrmClient. Pure
// types — safe to import anywhere.

export type CrmProvider = "hubspot" | "pipedrive" | "salesforce";

export type CrmConnectionRow = {
  id: string;
  org_id: string;
  provider: CrmProvider;
  connected_by: string | null;
  account_label: string | null;
  api_base: string | null;
  access_token_vault_id: string | null;
  refresh_token_vault_id: string | null;
  token_expires_at: string | null;
  scopes: string | null;
  status: "active" | "revoked" | "error";
  error_message: string | null;
  last_sync_at: string | null;
};

// A contact to push into the CRM (from a Xyra contact / captured lead).
export type CrmContactInput = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
};

export type CrmUpsertResult = { id: string | null };

// OAuth token bundle from a provider's code-exchange / refresh.
export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresInSec: number;
  scope?: string;
  apiBase?: string | null; // Pipedrive/Salesforce return a per-account base
  accountLabel?: string | null;
};

// What each provider implements. The token is already resolved (Vault read +
// refreshed if expired) by the facade before this is called.
export interface CrmClient {
  upsertContact(accessToken: string, apiBase: string | null, input: CrmContactInput): Promise<CrmUpsertResult>;
}
