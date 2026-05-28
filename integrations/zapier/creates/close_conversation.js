const { BASE_URL } = require("../lib/webhook");

const perform = async (z, bundle) => {
  const r = await z.request({
    url: `${BASE_URL}/conversations/${bundle.inputData.conversation_id}/close`,
    method: "POST",
  });
  return r.data;
};

module.exports = {
  key: "close_conversation",
  noun: "Conversation",
  display: {
    label: "Close conversation",
    description: "Sets the conversation status to closed.",
  },
  operation: {
    perform,
    inputFields: [{ key: "conversation_id", label: "Conversation id", required: true, type: "string" }],
    sample: { object: "conversation", id: "conv_01HXY...", status: "closed" },
  },
};
