import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

// API-key auth. credentialTest hits /api/v1/me which is the cheapest
// authenticated endpoint and validates scopes implicitly.
export class XyraChatApi implements ICredentialType {
  name = "xyraChatApi";
  displayName = "Xyra Chat API";
  documentationUrl = "https://app.xyrachat.com/docs/api/auth";

  properties: INodeProperties[] = [
    {
      displayName: "API key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description:
        "Generate at https://app.xyrachat.com/settings/api. Needs scopes appropriate for the operations you'll use.",
    },
    {
      displayName: "Base URL",
      name: "baseUrl",
      type: "string",
      default: "https://app.xyrachat.com/api/v1",
      description: "Override for self-hosted or staging deployments.",
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: "={{$credentials.baseUrl}}",
      url: "/me",
      method: "GET",
    },
  };
}
