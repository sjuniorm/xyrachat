# OmniChannel Platform — Database Schema

## Entity Relationship Overview

```
tenants ─┬─► users
         ├─► contacts
         ├─► conversations ──► messages
         ├─► channels
         ├─► teams / departments
         ├─► automation_workflows ──► workflow_steps
         ├─► chatbot_configs ──► knowledge_base_documents
         ├─► tags
         └─► notification_preferences

contacts ──► conversations ──► messages
users ──► conversation_assignments
conversations ──► conversation_tags
conversations ──► internal_notes
```

## Tables

See `backend/src/database/migrations/` for full SQL definitions.
