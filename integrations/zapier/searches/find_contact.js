const { BASE_URL } = require("../lib/webhook");

// Returns up to 100 contacts and filters client-side, because the
// public list endpoint doesn't yet expose ?phone= / ?email= filters.
// Cheap until orgs grow past ~10k contacts; we'll add server-side
// filters before that becomes a problem.
const perform = async (z, bundle) => {
  const r = await z.request({
    url: `${BASE_URL}/contacts`,
    params: { limit: 100 },
  });
  const items = (r.data && r.data.data) || [];
  const wantPhone = bundle.inputData.phone && bundle.inputData.phone.trim();
  const wantEmail = bundle.inputData.email && bundle.inputData.email.trim().toLowerCase();
  return items.filter((c) => {
    if (wantPhone && c.phone === wantPhone) return true;
    if (wantEmail && c.email === wantEmail) return true;
    return false;
  });
};

module.exports = {
  key: "find_contact",
  noun: "Contact",
  display: {
    label: "Find contact",
    description: "Look up a contact by phone or email. Returns empty if not found.",
  },
  operation: {
    perform,
    inputFields: [
      { key: "phone", label: "Phone (E.164)", type: "string" },
      { key: "email", label: "Email", type: "string" },
    ],
    sample: {
      object: "contact",
      id: "contact_01HXY...",
      name: "Lisa",
      phone: "+34612345678",
    },
  },
};
