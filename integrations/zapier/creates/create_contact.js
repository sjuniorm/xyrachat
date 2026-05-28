const { BASE_URL } = require("../lib/webhook");
const crypto = require("crypto");

const perform = async (z, bundle) => {
  const r = await z.request({
    url: `${BASE_URL}/contacts`,
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: {
      name: bundle.inputData.name,
      phone: bundle.inputData.phone,
      email: bundle.inputData.email,
      instagram_id: bundle.inputData.instagram_id,
      telegram_id: bundle.inputData.telegram_id,
      tags: bundle.inputData.tags,
      notes: bundle.inputData.notes,
    },
  });
  return r.data;
};

module.exports = {
  key: "create_contact",
  noun: "Contact",
  display: {
    label: "Create or update contact",
    description: "Upserts on any matching identifier (phone, email, IG handle, Telegram id).",
  },
  operation: {
    perform,
    inputFields: [
      { key: "name", label: "Name", type: "string" },
      { key: "phone", label: "Phone (E.164)", type: "string" },
      { key: "email", label: "Email", type: "string" },
      { key: "instagram_id", label: "Instagram id", type: "string" },
      { key: "telegram_id", label: "Telegram id", type: "string" },
      { key: "tags", label: "Tags", type: "string", list: true },
      { key: "notes", label: "Notes", type: "text" },
    ],
    sample: {
      object: "contact",
      id: "contact_01HXY...",
      name: "Lisa",
      phone: "+34612345678",
      opted_out: false,
      created_at: "2026-05-28T10:34:56.789Z",
    },
  },
};
