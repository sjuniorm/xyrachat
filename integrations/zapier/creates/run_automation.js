const { BASE_URL } = require("../lib/webhook");

const perform = async (z, bundle) => {
  const r = await z.request({
    url: `${BASE_URL}/automations/${bundle.inputData.automation_id}/run`,
    method: "POST",
    body: {
      contact_id: bundle.inputData.contact_id,
      trigger_data: bundle.inputData.trigger_data || {},
    },
  });
  return r.data;
};

module.exports = {
  key: "run_automation",
  noun: "Automation",
  display: {
    label: "Run automation",
    description: "Manually fire an existing Xyra automation against a contact.",
  },
  operation: {
    perform,
    inputFields: [
      { key: "automation_id", label: "Automation id", required: true, type: "string" },
      { key: "contact_id", label: "Contact id", required: true, type: "string" },
      { key: "trigger_data", label: "Trigger data (JSON)", type: "string" },
    ],
    sample: { object: "automation_run", automation_id: "auto_01HXY...", contact_id: "contact_01HXY...", status: "success" },
  },
};
