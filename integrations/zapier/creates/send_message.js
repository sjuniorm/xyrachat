const { BASE_URL } = require("../lib/webhook");
const crypto = require("crypto");

const perform = async (z, bundle) => {
  const body = {
    conversation_id: bundle.inputData.conversation_id,
    type: bundle.inputData.type || "text",
    content: bundle.inputData.content,
  };
  if (bundle.inputData.type === "template") {
    body.template = {
      name: bundle.inputData.template_name,
      language: bundle.inputData.template_language || "en_US",
    };
  }
  if (bundle.inputData.type === "image" && bundle.inputData.media_url) {
    body.media = { url: bundle.inputData.media_url };
  }
  const r = await z.request({
    url: `${BASE_URL}/messages`,
    method: "POST",
    body,
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
    },
  });
  return r.data;
};

module.exports = {
  key: "send_message",
  noun: "Message",
  display: {
    label: "Send a message",
    description:
      "Send a text / template / image to a Xyra conversation. WhatsApp enforces the 24h window — outside it, switch to type=template.",
  },
  operation: {
    perform,
    inputFields: [
      { key: "conversation_id", label: "Conversation id", required: true, type: "string" },
      {
        key: "type",
        label: "Message type",
        type: "string",
        choices: { text: "Text", template: "WhatsApp template", image: "Image" },
        default: "text",
        required: true,
      },
      {
        key: "content",
        label: "Message",
        type: "text",
        helpText: "Required for text. Optional caption for image.",
      },
      {
        key: "template_name",
        label: "Template name (WA template only)",
        type: "string",
      },
      {
        key: "template_language",
        label: "Template language (WA template only)",
        type: "string",
        default: "en_US",
      },
      {
        key: "media_url",
        label: "Image URL (image only)",
        type: "string",
      },
    ],
    sample: {
      id: "msg_01HXY...",
      conversation_id: "conv_01HXY...",
      direction: "outbound",
      type: "text",
      content: "Hi!",
      provider_message_id: "wamid.HBgL...",
      created_at: "2026-05-28T10:34:56.789Z",
    },
  },
};
