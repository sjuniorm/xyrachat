# @xyrachat/n8n-nodes-xyrachat

n8n community node for Xyra Chat. Lets workflows trigger on Xyra
events (REST Hook style) and call any Xyra REST endpoint as a step.

## Resources / Operations (action node)

| Resource     | Operations                                              |
|--------------|---------------------------------------------------------|
| Contact      | Create / GetMany / Get / Update / Delete / AddTag       |
| Conversation | GetMany / Get / Close / Assign / TransferToBot          |
| Message      | Send / List                                              |
| Broadcast    | GetMany / Create / Launch                                |
| Automation   | Run                                                      |
| Template     | GetMany                                                  |
| Bot          | GetMany / Handoff                                        |
| Outcome      | GetMany                                                  |

## Trigger node

Single node — subscribes to one event type per workflow:

- `message.received`
- `conversation.opened`
- `conversation.closed`
- `bot.handoff`
- `bot.lead_captured`
- `contact.created`
- `contact.tagged`
- `contact.opted_out`
- `broadcast.completed`
- `automation.fired`

## Install

n8n cloud / self-hosted:

```bash
npm install @xyrachat/n8n-nodes-xyrachat
# then restart n8n
```

Or via the n8n UI (self-hosted): Settings → Community Nodes →
Install → `@xyrachat/n8n-nodes-xyrachat`.

## Publish

```bash
cd integrations/n8n
npm install
npm run build
npm publish --access public
```

Then register at https://n8n.io/integrations so it shows up in the
official community-nodes list.
