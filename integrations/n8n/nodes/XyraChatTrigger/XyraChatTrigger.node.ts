import type {
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from "n8n-workflow";

// REST Hook trigger node. On workflow activation, registers a webhook
// with Xyra (`POST /webhooks/subscribe`) and stores the returned id so
// it can DELETE it on deactivation.
//
// We expose ONE event per node instance — most workflows want one
// trigger anyway, and the per-event picker keeps the UI lean.

export class XyraChatTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Xyra Chat Trigger",
    name: "xyraChatTrigger",
    icon: "file:xyra.svg",
    group: ["trigger"],
    version: 1,
    description: "Triggers when an event fires in Xyra Chat.",
    defaults: { name: "Xyra Chat Trigger" },
    inputs: [] as never,
    outputs: ["main"] as never,
    credentials: [{ name: "xyraChatApi", required: true }],
    webhooks: [
      {
        name: "default",
        httpMethod: "POST",
        responseMode: "onReceived",
        path: "webhook",
      },
    ],
    properties: [
      {
        displayName: "Event",
        name: "event",
        type: "options",
        default: "message.received",
        required: true,
        options: [
          { name: "Message received (inbound)", value: "message.received" },
          { name: "Message sent (outbound)", value: "message.sent" },
          { name: "Conversation opened", value: "conversation.opened" },
          { name: "Conversation closed", value: "conversation.closed" },
          { name: "Conversation assigned", value: "conversation.assigned" },
          { name: "Conversation unassigned", value: "conversation.unassigned" },
          { name: "Contact created", value: "contact.created" },
          { name: "Contact updated", value: "contact.updated" },
          { name: "Contact tagged", value: "contact.tagged" },
          { name: "Contact opted out", value: "contact.opted_out" },
          { name: "Bot handoff", value: "bot.handoff" },
          { name: "Bot lead captured", value: "bot.lead_captured" },
          { name: "Bot qualified", value: "bot.qualified" },
          { name: "Broadcast completed", value: "broadcast.completed" },
          { name: "Channel disconnected", value: "channel.disconnected" },
          { name: "Automation fired", value: "automation.fired" },
        ],
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData("node");
        return !!(data.webhookId as string | undefined);
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const credentials = await this.getCredentials("xyraChatApi");
        const baseUrl = (credentials.baseUrl as string) || "https://app.xyrachat.com/api/v1";
        const webhookUrl = this.getNodeWebhookUrl("default") as string;
        const event = this.getNodeParameter("event") as string;
        const res = (await this.helpers.requestWithAuthentication.call(this, "xyraChatApi", {
          baseURL: baseUrl,
          url: "/webhooks/subscribe",
          method: "POST",
          json: true,
          headers: { "X-Xyra-Source": "n8n" },
          body: {
            url: webhookUrl,
            events: [event],
            label: `n8n — ${this.getWorkflow().name ?? "Workflow"}`,
          },
        })) as { id: string };
        const data = this.getWorkflowStaticData("node");
        data.webhookId = res.id;
        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const credentials = await this.getCredentials("xyraChatApi");
        const baseUrl = (credentials.baseUrl as string) || "https://app.xyrachat.com/api/v1";
        const data = this.getWorkflowStaticData("node");
        const id = data.webhookId as string | undefined;
        if (!id) return true;
        try {
          await this.helpers.requestWithAuthentication.call(this, "xyraChatApi", {
            baseURL: baseUrl,
            url: `/webhooks/${id}`,
            method: "DELETE",
            json: true,
          });
        } catch {
          // Unsubscribe is best-effort — if the endpoint is already
          // gone (revoked / deleted on Xyra side), still mark cleanup
          // done so the workflow can re-subscribe later.
        }
        delete data.webhookId;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData() as Record<string, unknown>;
    return {
      workflowData: [
        [
          {
            json: (body.data as Record<string, unknown>) || body,
          },
        ],
      ],
    };
  }
}
