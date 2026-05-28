const { BASE_URL } = require("../lib/webhook");

const perform = async (z, bundle) => {
  const r = await z.request({
    url: `${BASE_URL}/conversations/${bundle.inputData.conversation_id}/assign`,
    method: "POST",
    body: { agent_id: bundle.inputData.agent_id || null },
  });
  return r.data;
};

module.exports = {
  key: "assign_conversation",
  noun: "Conversation",
  display: {
    label: "Assign conversation",
    description: "Assign a conversation to a specific agent. Leave agent id blank to unassign.",
  },
  operation: {
    perform,
    inputFields: [
      { key: "conversation_id", label: "Conversation id", required: true, type: "string" },
      { key: "agent_id", label: "Agent id (blank = unassign)", type: "string" },
    ],
    sample: { object: "conversation", id: "conv_01HXY...", assigned_to: "user_01HXY..." },
  },
};
