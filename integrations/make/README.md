# Xyra Chat — Make.com Custom App

Make.com connector for Xyra Chat. Lets Make scenarios trigger on
Xyra events and call any Xyra REST endpoint as an action.

## Modules

**Connection**
- `connection/api-key.json` — collects the Xyra API key
- `connection/test.json` — verifies with `GET /api/v1/me`

**Triggers (instant via REST Hook)**
- `triggers/message-received.json` — on inbound DM (any channel)
- `triggers/conversation-opened.json` — on first message in a channel
- `triggers/bot-handoff.json` — when a bot escalates to a human
- `triggers/contact-created.json` — on new contact

**Actions**
- `actions/send-message.json` — text or template, any channel
- `actions/create-contact.json` — upsert by phone/email/handle
- `actions/add-tag.json`
- `actions/close-conversation.json`
- `actions/assign-conversation.json`
- `actions/run-automation.json` — fire an existing Xyra automation

**Searches**
- `searches/find-contact.json` — by phone or email

## Submitting to Make

1. Sign in at https://developers.make.com → Apps → Create a new app.
2. Set base configuration:
   - **Base URL:** `https://app.xyrachat.com/api/v1`
   - **Theme color:** `#9333EA`
3. Paste the `app.json` manifest contents into App Settings.
4. For each module, paste the corresponding `.json` file into the
   matching module slot (Trigger / Action / Search).
5. Test locally with a personal API key + a test scenario.
6. Submit for verification → Make reviews + adds to the public app
   library at `make.com/en/integrations/xyra-chat`.

Trigger lifecycle: Make scenarios that activate an instant trigger
POST to `/api/v1/webhooks/subscribe` with `X-Xyra-Source: make` —
Xyra creates a webhook_endpoints row pointing at Make's URL with
the right event filter. On scenario deactivation, Make calls
`DELETE /api/v1/webhooks/:id`. The customer never touches the Xyra
webhooks UI for this flow.

## Local testing

```bash
# Verify your key works:
curl -H "Authorization: Bearer $XYRA_KEY" \
  https://app.xyrachat.com/api/v1/me

# Subscribe a fake endpoint to confirm webhook delivery:
curl -X POST -H "Authorization: Bearer $XYRA_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Xyra-Source: make" \
  https://app.xyrachat.com/api/v1/webhooks/subscribe \
  -d '{"url":"https://webhook.site/<your-id>","events":["message.received"]}'
```
