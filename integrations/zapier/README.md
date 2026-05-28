# Xyra Chat — Zapier Platform CLI app

Public Zapier app for Xyra Chat. Built with the
[Zapier Platform CLI](https://platform.zapier.com/quickstart/cli-tutorial).

## Triggers (REST Hook — instant)
- `new_message` — `message.received`
- `new_conversation` — `conversation.opened`
- `bot_handoff` — `bot.handoff`
- `new_contact` — `contact.created`

## Creates
- `send_message` — text or template, any channel
- `create_contact` — upsert by phone / email / handle
- `add_tag` — append tag(s)
- `close_conversation`
- `assign_conversation`
- `run_automation`

## Searches
- `find_contact` — by phone or email

## Develop locally

```bash
cd integrations/zapier
npm install
npm install -g zapier-platform-cli
zapier login
zapier register "Xyra Chat"   # one-time
zapier push
zapier validate
zapier test
```

## Submit for review

```bash
zapier promote 1.0.0
```

Zapier reviews + adds the app to the public directory at
`zapier.com/apps/xyra-chat`. Same process for every new version —
push to staging, promote when ready.
