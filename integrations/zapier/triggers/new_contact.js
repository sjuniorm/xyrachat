const { subscribeHook, unsubscribeHook, performList, BASE_URL } = require("../lib/webhook");

const sample = {
  id: "contact_01HXY...",
  name: "Lisa",
  phone: "+34612345678",
  email: null,
  instagram_id: null,
  telegram_id: null,
  tags: ["lead"],
  notes: null,
  opted_out: false,
  created_at: "2026-05-28T10:34:56.789Z",
};

const realSample = async (z) => {
  const r = await z.request({
    url: `${BASE_URL}/contacts`,
    params: { limit: 1 },
  });
  const items = r.data && r.data.data;
  return items && items.length ? items : [sample];
};

module.exports = {
  key: "new_contact",
  noun: "Contact",
  display: {
    label: "New contact created",
    description: "Triggers when a contact is created — via inbound DM, API upsert or imported.",
  },
  operation: {
    type: "hook",
    performSubscribe: subscribeHook("contact.created"),
    performUnsubscribe: unsubscribeHook,
    perform: performList,
    performList: realSample,
    sample,
  },
};
