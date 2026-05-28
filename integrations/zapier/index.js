// Xyra Chat — Zapier Platform CLI app entry point.

const authentication = require("./authentication");

const newMessage = require("./triggers/new_message");
const newConversation = require("./triggers/new_conversation");
const botHandoff = require("./triggers/bot_handoff");
const newContact = require("./triggers/new_contact");

const sendMessage = require("./creates/send_message");
const createContact = require("./creates/create_contact");
const addTag = require("./creates/add_tag");
const closeConversation = require("./creates/close_conversation");
const assignConversation = require("./creates/assign_conversation");
const runAutomation = require("./creates/run_automation");

const findContact = require("./searches/find_contact");

// Apply the bearer token to every request + JSON content-type.
const includeBearerToken = (request, z, bundle) => {
  if (bundle.authData.apiKey) {
    request.headers = request.headers || {};
    request.headers.Authorization = `Bearer ${bundle.authData.apiKey}`;
    request.headers["Content-Type"] = "application/json";
    request.headers["User-Agent"] = "Zapier/XyraChat-Connector";
  }
  return request;
};

// Surface Xyra error bodies to Zapier UI as readable messages.
const handleHTTPError = (response, z) => {
  if (response.status >= 400) {
    const body = response.json || {};
    const err = body.error;
    const message = err
      ? `${err.message} (${err.code})`
      : `HTTP ${response.status} from Xyra Chat API`;
    throw new z.errors.Error(message, err?.code || "http_error", response.status);
  }
  return response;
};

module.exports = {
  version: require("./package.json").version,
  platformVersion: require("zapier-platform-core").version,

  authentication,
  beforeRequest: [includeBearerToken],
  afterResponse: [handleHTTPError],

  triggers: {
    [newMessage.key]: newMessage,
    [newConversation.key]: newConversation,
    [botHandoff.key]: botHandoff,
    [newContact.key]: newContact,
  },
  creates: {
    [sendMessage.key]: sendMessage,
    [createContact.key]: createContact,
    [addTag.key]: addTag,
    [closeConversation.key]: closeConversation,
    [assignConversation.key]: assignConversation,
    [runAutomation.key]: runAutomation,
  },
  searches: {
    [findContact.key]: findContact,
  },
};
