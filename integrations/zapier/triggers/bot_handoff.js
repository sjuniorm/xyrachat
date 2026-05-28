const { subscribeHook, unsubscribeHook, performList } = require("../lib/webhook");

const sample = {
  bot_id: "bot_01HXY...",
  conversation_id: "conv_01HXY...",
  reason: "keyword_trigger",
};

module.exports = {
  key: "bot_handoff",
  noun: "Bot handoff",
  display: {
    label: "Bot handoff requested",
    description: "Triggers when a bot escalates a conversation to a human (keyword match, knowledge gap, [HANDOFF_REQUESTED], or API-triggered).",
  },
  operation: {
    type: "hook",
    performSubscribe: subscribeHook("bot.handoff"),
    performUnsubscribe: unsubscribeHook,
    perform: performList,
    performList: async () => [sample],
    sample,
  },
};
