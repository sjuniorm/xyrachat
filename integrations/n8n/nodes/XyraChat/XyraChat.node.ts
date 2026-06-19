import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IHttpRequestOptions,
} from "n8n-workflow";
import { NodeOperationError } from "n8n-workflow";
import crypto from "crypto";

// Single Resource/Operation node — n8n's canonical pattern. Add a new
// operation by appending to the options array + adding a `case` in
// execute(). All HTTP calls go through xyraRequest() which respects
// the user's per-credential baseUrl override + injects bearer auth.

export class XyraChat implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Xyra Chat",
    name: "xyraChat",
    icon: "file:xyra.svg",
    group: ["communication"],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: "Call the Xyra Chat REST API.",
    defaults: { name: "Xyra Chat" },
    inputs: ["main"] as never,
    outputs: ["main"] as never,
    credentials: [{ name: "xyraChatApi", required: true }],
    properties: [
      // ---- Resource picker --------------------------------------
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        default: "contact",
        options: [
          { name: "Contact", value: "contact" },
          { name: "Conversation", value: "conversation" },
          { name: "Message", value: "message" },
          { name: "Broadcast", value: "broadcast" },
          { name: "Automation", value: "automation" },
          { name: "Template", value: "template" },
          { name: "Bot", value: "bot" },
          { name: "Outcome", value: "outcome" },
        ],
      },

      // ---- Operations per resource -------------------------------
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["contact"] } },
        default: "create",
        options: [
          { name: "Create or update", value: "create", action: "Create or update a contact" },
          { name: "Get many", value: "getMany", action: "Get many contacts" },
          { name: "Get one", value: "get", action: "Get a contact" },
          { name: "Update", value: "update", action: "Update a contact" },
          { name: "Delete", value: "delete", action: "Delete a contact" },
          { name: "Add tag", value: "addTag", action: "Add a tag to a contact" },
          { name: "Opt out", value: "optOut", action: "Mark contact as opted out" },
        ],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["conversation"] } },
        default: "getMany",
        options: [
          { name: "Get many", value: "getMany", action: "Get many conversations" },
          { name: "Get one", value: "get", action: "Get a conversation" },
          { name: "Close", value: "close", action: "Close a conversation" },
          { name: "Assign", value: "assign", action: "Assign a conversation" },
          { name: "Transfer to bot", value: "transferToBot", action: "Transfer to bot" },
        ],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["message"] } },
        default: "send",
        options: [
          { name: "Send", value: "send", action: "Send a message" },
          { name: "List", value: "list", action: "List messages in a conversation" },
        ],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["broadcast"] } },
        default: "getMany",
        options: [
          { name: "Get many", value: "getMany", action: "Get many broadcasts" },
          { name: "Create", value: "create", action: "Create a broadcast draft" },
          { name: "Launch", value: "launch", action: "Launch a draft broadcast" },
        ],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["automation"] } },
        default: "run",
        options: [{ name: "Run", value: "run", action: "Run an automation" }],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["template"] } },
        default: "getMany",
        options: [{ name: "Get many", value: "getMany", action: "Get many templates" }],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["bot"] } },
        default: "getMany",
        options: [
          { name: "Get many", value: "getMany", action: "Get many bots" },
          { name: "Handoff", value: "handoff", action: "Trigger a bot handoff" },
        ],
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["outcome"] } },
        default: "getMany",
        options: [{ name: "Get many", value: "getMany", action: "Get many outcomes" }],
      },

      // ---- Common ID fields -------------------------------------
      {
        displayName: "Contact ID",
        name: "contactId",
        type: "string",
        default: "",
        required: true,
        displayOptions: {
          show: {
            resource: ["contact"],
            operation: ["get", "update", "delete", "addTag", "optOut"],
          },
        },
      },
      {
        displayName: "Conversation ID",
        name: "conversationId",
        type: "string",
        default: "",
        required: true,
        displayOptions: {
          show: {
            resource: ["conversation", "message"],
            operation: ["get", "close", "assign", "transferToBot", "send", "list"],
          },
        },
      },
      {
        displayName: "Broadcast ID",
        name: "broadcastId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { resource: ["broadcast"], operation: ["launch"] } },
      },
      {
        displayName: "Automation ID",
        name: "automationId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { resource: ["automation"], operation: ["run"] } },
      },
      {
        displayName: "Bot ID",
        name: "botId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { resource: ["bot"], operation: ["handoff"] } },
      },

      // ---- Contact: create / update -----------------------------
      {
        displayName: "Fields",
        name: "contactFields",
        type: "collection",
        placeholder: "Add field",
        default: {},
        displayOptions: { show: { resource: ["contact"], operation: ["create", "update"] } },
        options: [
          { displayName: "Name", name: "name", type: "string", default: "" },
          { displayName: "Phone (E.164)", name: "phone", type: "string", default: "" },
          { displayName: "Email", name: "email", type: "string", default: "" },
          { displayName: "Instagram ID", name: "instagram_id", type: "string", default: "" },
          { displayName: "Telegram ID", name: "telegram_id", type: "string", default: "" },
          { displayName: "Notes", name: "notes", type: "string", default: "" },
          {
            displayName: "Tags",
            name: "tags",
            type: "string",
            typeOptions: { multipleValues: true },
            default: [],
          },
        ],
      },
      {
        displayName: "Tag",
        name: "tag",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { resource: ["contact"], operation: ["addTag"] } },
      },

      // ---- Message: send ----------------------------------------
      {
        displayName: "Type",
        name: "messageType",
        type: "options",
        default: "text",
        options: [
          { name: "Text", value: "text" },
          { name: "WhatsApp template", value: "template" },
          { name: "Image", value: "image" },
        ],
        displayOptions: { show: { resource: ["message"], operation: ["send"] } },
      },
      {
        displayName: "Content",
        name: "content",
        type: "string",
        typeOptions: { rows: 3 },
        default: "",
        displayOptions: { show: { resource: ["message"], operation: ["send"] } },
      },
      {
        displayName: "Template name",
        name: "templateName",
        type: "string",
        default: "",
        displayOptions: {
          show: { resource: ["message"], operation: ["send"], messageType: ["template"] },
        },
      },
      {
        displayName: "Template language",
        name: "templateLanguage",
        type: "string",
        default: "en_US",
        displayOptions: {
          show: { resource: ["message"], operation: ["send"], messageType: ["template"] },
        },
      },
      {
        displayName: "Image URL",
        name: "mediaUrl",
        type: "string",
        default: "",
        displayOptions: {
          show: { resource: ["message"], operation: ["send"], messageType: ["image"] },
        },
      },

      // ---- Conversation: assign ---------------------------------
      {
        displayName: "Agent ID (blank = unassign)",
        name: "agentId",
        type: "string",
        default: "",
        displayOptions: { show: { resource: ["conversation"], operation: ["assign"] } },
      },

      // ---- Broadcast: create ------------------------------------
      {
        displayName: "Name",
        name: "broadcastName",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { resource: ["broadcast"], operation: ["create"] } },
      },
      {
        displayName: "Channel ID",
        name: "broadcastChannelId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { resource: ["broadcast"], operation: ["create"] } },
      },
      {
        displayName: "Template ID",
        name: "broadcastTemplateId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { resource: ["broadcast"], operation: ["create"] } },
      },

      // ---- Automation: run --------------------------------------
      {
        displayName: "Contact ID",
        name: "automationContactId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { resource: ["automation"], operation: ["run"] } },
      },
      {
        displayName: "Trigger data (JSON)",
        name: "automationTriggerData",
        type: "string",
        default: "{}",
        displayOptions: { show: { resource: ["automation"], operation: ["run"] } },
      },

      // ---- Bot: handoff -----------------------------------------
      {
        displayName: "Conversation ID",
        name: "handoffConversationId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { resource: ["bot"], operation: ["handoff"] } },
      },
      {
        displayName: "Reason (optional)",
        name: "handoffReason",
        type: "string",
        default: "",
        displayOptions: { show: { resource: ["bot"], operation: ["handoff"] } },
      },

      // ---- List/Get pagination ----------------------------------
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        typeOptions: { minValue: 1, maxValue: 200 },
        default: 50,
        displayOptions: { show: { operation: ["getMany", "list"] } },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const out: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const resource = this.getNodeParameter("resource", i) as string;
      const operation = this.getNodeParameter("operation", i) as string;
      const result = await runOperation.call(this, resource, operation, i);
      if (Array.isArray(result)) {
        for (const r of result) out.push({ json: r });
      } else {
        out.push({ json: result });
      }
    }
    return [out];
  }
}

async function xyraRequest(
  this: IExecuteFunctions,
  options: IHttpRequestOptions,
): Promise<unknown> {
  const credentials = await this.getCredentials("xyraChatApi");
  const baseUrl = (credentials.baseUrl as string) || "https://app.xyrachat.com/api/v1";
  return this.helpers.requestWithAuthentication.call(this, "xyraChatApi", {
    ...options,
    baseURL: baseUrl,
    json: true,
  });
}

async function runOperation(
  this: IExecuteFunctions,
  resource: string,
  operation: string,
  i: number,
): Promise<unknown> {
  switch (`${resource}.${operation}`) {
    case "contact.create":
    case "contact.update": {
      const fields = this.getNodeParameter("contactFields", i, {}) as Record<string, unknown>;
      const url = operation === "update"
        ? `/contacts/${this.getNodeParameter("contactId", i)}`
        : "/contacts";
      const method = operation === "update" ? "PATCH" : "POST";
      return xyraRequest.call(this, {
        url,
        method,
        body: fields,
        headers: operation === "create" ? { "Idempotency-Key": crypto.randomUUID() } : {},
      });
    }
    case "contact.getMany": {
      const limit = this.getNodeParameter("limit", i, 50) as number;
      const res = (await xyraRequest.call(this, { url: "/contacts", method: "GET", qs: { limit } })) as { data: unknown[] };
      return res.data;
    }
    case "contact.get":
      return xyraRequest.call(this, { url: `/contacts/${this.getNodeParameter("contactId", i)}`, method: "GET" });
    case "contact.delete":
      return xyraRequest.call(this, { url: `/contacts/${this.getNodeParameter("contactId", i)}`, method: "DELETE" });
    case "contact.addTag":
      return xyraRequest.call(this, {
        url: `/contacts/${this.getNodeParameter("contactId", i)}/tags`,
        method: "POST",
        body: { tag: this.getNodeParameter("tag", i) as string },
      });
    case "contact.optOut":
      return xyraRequest.call(this, {
        url: `/contacts/${this.getNodeParameter("contactId", i)}/opt_out`,
        method: "POST",
      });

    case "conversation.getMany": {
      const limit = this.getNodeParameter("limit", i, 50) as number;
      const res = (await xyraRequest.call(this, { url: "/conversations", method: "GET", qs: { limit } })) as { data: unknown[] };
      return res.data;
    }
    case "conversation.get":
      return xyraRequest.call(this, { url: `/conversations/${this.getNodeParameter("conversationId", i)}`, method: "GET" });
    case "conversation.close":
      return xyraRequest.call(this, { url: `/conversations/${this.getNodeParameter("conversationId", i)}/close`, method: "POST" });
    case "conversation.assign":
      return xyraRequest.call(this, {
        url: `/conversations/${this.getNodeParameter("conversationId", i)}/assign`,
        method: "POST",
        body: { agent_id: (this.getNodeParameter("agentId", i, "") as string) || null },
      });
    case "conversation.transferToBot":
      return xyraRequest.call(this, {
        url: `/conversations/${this.getNodeParameter("conversationId", i)}/transfer_to_bot`,
        method: "POST",
      });

    case "message.send": {
      const type = this.getNodeParameter("messageType", i, "text") as string;
      const body: Record<string, unknown> = {
        conversation_id: this.getNodeParameter("conversationId", i),
        type,
        content: this.getNodeParameter("content", i, "") as string,
      };
      if (type === "template") {
        body.template = {
          name: this.getNodeParameter("templateName", i),
          language: this.getNodeParameter("templateLanguage", i, "en_US"),
        };
      }
      if (type === "image") {
        body.media = { url: this.getNodeParameter("mediaUrl", i) };
      }
      return xyraRequest.call(this, {
        url: "/messages",
        method: "POST",
        body,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
    }
    case "message.list": {
      const limit = this.getNodeParameter("limit", i, 50) as number;
      const res = (await xyraRequest.call(this, {
        url: `/conversations/${this.getNodeParameter("conversationId", i)}/messages`,
        method: "GET",
        qs: { limit },
      })) as { data: unknown[] };
      return res.data;
    }

    case "broadcast.getMany": {
      const limit = this.getNodeParameter("limit", i, 50) as number;
      const res = (await xyraRequest.call(this, { url: "/broadcasts", method: "GET", qs: { limit } })) as { data: unknown[] };
      return res.data;
    }
    case "broadcast.create":
      return xyraRequest.call(this, {
        url: "/broadcasts",
        method: "POST",
        body: {
          name: this.getNodeParameter("broadcastName", i),
          channel_id: this.getNodeParameter("broadcastChannelId", i),
          template_id: this.getNodeParameter("broadcastTemplateId", i),
        },
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
    case "broadcast.launch":
      return xyraRequest.call(this, {
        url: `/broadcasts/${this.getNodeParameter("broadcastId", i)}/launch`,
        method: "POST",
      });

    case "automation.run": {
      let triggerData = {};
      try {
        triggerData = JSON.parse(this.getNodeParameter("automationTriggerData", i, "{}") as string);
      } catch {
        throw new NodeOperationError(this.getNode(), "Trigger data must be valid JSON.", { itemIndex: i });
      }
      return xyraRequest.call(this, {
        url: `/automations/${this.getNodeParameter("automationId", i)}/run`,
        method: "POST",
        body: {
          contact_id: this.getNodeParameter("automationContactId", i),
          trigger_data: triggerData,
        },
      });
    }

    case "template.getMany": {
      const res = (await xyraRequest.call(this, { url: "/templates", method: "GET" })) as { data: unknown[] };
      return res.data;
    }

    case "bot.getMany": {
      const res = (await xyraRequest.call(this, { url: "/bots", method: "GET" })) as { data: unknown[] };
      return res.data;
    }
    case "bot.handoff":
      return xyraRequest.call(this, {
        url: `/bots/${this.getNodeParameter("botId", i)}/handoff`,
        method: "POST",
        body: {
          conversation_id: this.getNodeParameter("handoffConversationId", i),
          reason: (this.getNodeParameter("handoffReason", i, "") as string) || undefined,
        },
      });

    case "outcome.getMany": {
      const limit = this.getNodeParameter("limit", i, 50) as number;
      const res = (await xyraRequest.call(this, { url: "/outcomes", method: "GET", qs: { limit } })) as { data: unknown[] };
      return res.data;
    }

    default:
      throw new NodeOperationError(this.getNode(), `Unsupported ${resource}.${operation}`, { itemIndex: i });
  }
}
