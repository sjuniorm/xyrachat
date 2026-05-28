const { subscribeHook, unsubscribeHook, performList, performListSample, BASE_URL } = require("../lib/webhook");

const sample = {
  id: "msg_01HXY...",
  conversation_id: "conv_01HXY...",
  contact_id: "contact_01HXY...",
  channel_id: "ch_01HXY...",
  channel_type: "whatsapp",
  direction: "inbound",
  content: "Hi! When are you open today?",
  media_type: null,
  created_at: "2026-05-28T10:34:56.789Z",
};

// performList for "Find Sample Data": Zapier needs to populate the
// field picker even before a real event fires. We call GET /messages
// on the most recent conversation as a real-data fallback.
const realSample = async (z, bundle) => {
  // Pull the most recent conversation + its newest message.
  const convs = await z.request({
    url: `${BASE_URL}/conversations`,
    params: { limit: 1 },
  });
  const conv = convs.data && convs.data.data && convs.data.data[0];
  if (!conv) return [sample];
  const msgs = await z.request({
    url: `${BASE_URL}/conversations/${conv.id}/messages`,
    params: { limit: 1 },
  });
  const msg = msgs.data && msgs.data.data && msgs.data.data[0];
  return [msg || sample];
};

module.exports = {
  key: "new_message",
  noun: "Message",
  display: {
    label: "New inbound message",
    description: "Triggers when a contact sends a message on any connected channel.",
  },
  operation: {
    type: "hook",
    performSubscribe: subscribeHook("message.received"),
    performUnsubscribe: unsubscribeHook,
    perform: performList,
    performList: realSample,
    sample,
  },
};
