// API-key auth. Connection test calls GET /api/v1/me — proves the key
// works AND populates connection-label so the user sees their org id
// in the Zapier connection dropdown.

const BASE_URL = "https://app.xyrachat.com/api/v1";

const test = async (z, bundle) => {
  const response = await z.request({
    url: `${BASE_URL}/me`,
    method: "GET",
  });
  return response.data;
};

module.exports = {
  type: "custom",
  test,
  fields: [
    {
      key: "apiKey",
      label: "API key",
      type: "password",
      required: true,
      helpText:
        "Generate a key at https://app.xyrachat.com/settings/api. Needs scopes appropriate for the triggers and actions you'll use (at minimum `contacts:read` + `messages:write` + `webhooks:write` for typical Zaps).",
    },
  ],
  connectionLabel: "{{bundle.inputData.org_id}}",
};
