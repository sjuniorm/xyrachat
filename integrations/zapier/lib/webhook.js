// Shared subscribe/unsubscribe helpers for the REST Hook triggers.
// All four triggers follow the exact same pattern — only the event
// type differs — so we centralise it here.

const BASE_URL = "https://xyra-chat.vercel.app/api/v1";

const subscribeHook = (eventType) => async (z, bundle) => {
  const data = {
    url: bundle.targetUrl,
    events: [eventType],
    label: `Zapier — ${bundle.meta && bundle.meta.zap ? bundle.meta.zap.title : "Zap"}`,
  };
  const response = await z.request({
    url: `${BASE_URL}/webhooks/subscribe`,
    method: "POST",
    body: data,
    headers: { "X-Xyra-Source": "zapier" },
  });
  return response.data;
};

const unsubscribeHook = async (z, bundle) => {
  const id = bundle.subscribeData && bundle.subscribeData.id;
  if (!id) return {};
  await z.request({
    url: `${BASE_URL}/webhooks/${id}`,
    method: "DELETE",
  });
  return {};
};

// Pulls the event body straight from `bundle.cleanedRequest` (Zapier
// auto-parses the JSON POST). The Xyra envelope is { id, type, data }
// — Zaps care about `data`, so we extract it for downstream steps.
const performList = async (z, bundle) => {
  const body = bundle.cleanedRequest || bundle.rawRequest || {};
  if (body.data) return [body.data];
  return [body];
};

// For "Find Sample Data" UX during Zap setup. Returns the most recent
// event's data shape so Zap authors can map fields without firing.
const performListSample = (sampleResource) => async () => [sampleResource];

module.exports = { subscribeHook, unsubscribeHook, performList, performListSample, BASE_URL };
