const { subscribeHook, unsubscribeHook, performList, BASE_URL } = require("../lib/webhook");

const sample = {
  id: "conv_01HXY...",
  channel_id: "ch_01HXY...",
  contact_id: "contact_01HXY...",
  assigned_to: null,
  status: "open",
  last_message_at: "2026-05-28T10:34:56.789Z",
  created_at: "2026-05-28T10:34:56.789Z",
};

const realSample = async (z) => {
  const convs = await z.request({
    url: `${BASE_URL}/conversations`,
    params: { limit: 1 },
  });
  const items = convs.data && convs.data.data;
  return items && items.length ? items : [sample];
};

module.exports = {
  key: "new_conversation",
  noun: "Conversation",
  display: {
    label: "New conversation opened",
    description: "Triggers once per contact when they first message any channel.",
  },
  operation: {
    type: "hook",
    performSubscribe: subscribeHook("conversation.opened"),
    performUnsubscribe: unsubscribeHook,
    perform: performList,
    performList: realSample,
    sample,
  },
};
