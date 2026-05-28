const { BASE_URL } = require("../lib/webhook");

const perform = async (z, bundle) => {
  const r = await z.request({
    url: `${BASE_URL}/contacts/${bundle.inputData.contact_id}/tags`,
    method: "POST",
    body: { tags: bundle.inputData.tags },
  });
  return r.data;
};

module.exports = {
  key: "add_tag",
  noun: "Tag",
  display: {
    label: "Add tag to contact",
    description: "Adds one or more tags to a contact. Idempotent — duplicates are deduped.",
  },
  operation: {
    perform,
    inputFields: [
      { key: "contact_id", label: "Contact id", required: true, type: "string" },
      { key: "tags", label: "Tags", required: true, type: "string", list: true },
    ],
    sample: { id: "contact_01HXY...", tags: ["lead", "vip"] },
  },
};
