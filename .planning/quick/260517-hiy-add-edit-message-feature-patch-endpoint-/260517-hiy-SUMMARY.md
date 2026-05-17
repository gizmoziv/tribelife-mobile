---
phase: quick
plan: 260517-hiy
subsystem: chat
tags: [edit-message, drizzle-migration, socket-io, moderation, audit-trail]
dependency_graph:
  requires: []
  provides: [message-editing-feature]
  affects: [chat/[conversationId], chat/local, globe/[roomSlug], MessageBubble, ContextMenu]
tech_stack:
  added: [message_edits audit table, PATCH /api/chat/messages/:id, onMessageEdited socket event]
  patterns: [db.transaction for audit+update, socket broadcast per room type, EditComposer presentational component]
key_files:
  created:
    - tribelife-backend/drizzle/0017_add_message_edits.sql
    - tribelife-mobile/components/ui/chat/EditComposer.tsx
  modified:
    - tribelife-backend/src/db/schema.ts
    - tribelife-backend/src/routes/chat.ts
    - tribelife-mobile/types/index.ts
    - tribelife-mobile/services/api.ts
    - tribelife-mobile/services/socket.ts
    - tribelife-mobile/components/ui/chat/ContextMenu.tsx
    - tribelife-mobile/components/ui/chat/MessageBubble.tsx
    - tribelife-mobile/app/(app)/chat/[conversationId].tsx
    - tribelife-mobile/app/(app)/chat/local.tsx
    - tribelife-mobile/app/(app)/globe/[roomSlug].tsx
decisions:
  - editedAt optional (string | null | undefined) on Message and GlobeMessage to preserve union type compatibility with MessageBubble.onLongPress
  - Reply quotes freeze by design — PATCH never rewrites replyTo.content (snapshot at send-time)
  - message_edits audit table uses cascade FK so deleting a message cleans up its edit history
  - Socket broadcast targets conversation:{id} for DMs, raw roomId string for globe/timezone rooms
  - EditComposer save disabled when text unchanged or empty (no spurious PATCH calls)
metrics:
  duration: ~45 minutes
  completed: 2026-05-17
  tasks_completed: 5
  files_changed: 10
---

# Phase quick Plan 260517-hiy: Add Edit Message Feature Summary

Full message-editing pipeline: additive DB migration (editedAt column + message_edits audit table), PATCH endpoint with moderation re-run + transaction + socket broadcast, typed mobile foundation, EditComposer UI component, and wiring across all three live chat screens.

## Tasks Completed

| # | Name | Commit (repo) | Key files |
|---|------|---------------|-----------|
| 1 | DB schema + Drizzle migration | `b369907` (backend) | schema.ts, 0017_add_message_edits.sql |
| 2 | PATCH endpoint + socket broadcast | `18a3f93` (backend) | routes/chat.ts |
| 3 | Mobile types + API + socket foundation | `3d5f354` (mobile) | types/index.ts, services/api.ts, services/socket.ts |
| 4 | EditComposer + ContextMenu props + MessageBubble label | `05027af` (mobile) | EditComposer.tsx, ContextMenu.tsx, MessageBubble.tsx |
| 5 | Wire all five chat screens | `7eeeba9` (mobile) | chat/[conversationId].tsx, chat/local.tsx, globe/[roomSlug].tsx |

## Architecture

**Backend (Tasks 1-2)**

- `messages.edited_at` nullable timestamp column added via zero-downtime additive migration
- `message_edits` audit table: `id`, `messageId` (FK cascade), `content` (pre-edit), `editedAt` — indexed on `messageId`
- `PATCH /api/chat/messages/:id`: owner check → media guard (images-only messages not editable) → `moderateMessage` re-run → `db.transaction` (insert audit row, update messages.content + edited_at) → socket broadcast on `message:edited`
- Both GET handlers (`conversations/:id/messages`, `room/:roomId/messages`) now project `editedAt`

**Mobile (Tasks 3-5)**

- `Message.editedAt?: string | null` and `GlobeMessage.editedAt?: string | null` (optional to preserve union type with MessageBubble.onLongPress)
- `chat.editMessage(messageId, content)` → PATCH
- `onMessageEdited(cb)` socket listener returns cleanup function
- `EditComposer`: presentational, mirrors ReplyComposer style; save disabled when text unchanged or empty; autoFocus, multiline, maxLength 2000
- `ContextMenu`: new `onEdit?: () => void` and `isOwn?: boolean` props; Edit row rendered only when `onEdit && isOwn`
- `MessageBubble`: timestamp suffixed with ` (edited)` when `editedAt` is present
- All three chat screens: `editingMessage` state, `savingEdit` state, `onMessageEdited` listener (updates local message list optimistically on socket event), `EditComposer` mounted above `ReplyComposer` in composer section, ContextMenu `isOwn`/`onEdit` props wired

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript union type incompatibility with editedAt required field**
- **Found during:** Task 3
- **Issue:** Adding `editedAt: string | null` (required) to `Message` caused TS2322 because `MessageBubble.onLongPress` accepts `(message: Message | GlobeMessage) => void` but screen callbacks were typed as `(message: Message) => void`. `GlobeMessage` lacked `editedAt`, breaking the union.
- **Fix:** Made `editedAt` optional (`editedAt?: string | null`) on both interfaces. Semantically correct — pre-migration rows have no value; TypeScript strict mode satisfied.
- **Files modified:** `tribelife-mobile/types/index.ts`
- **Commit:** `3d5f354`

### Out-of-scope notes

- `drizzle/meta/_journal.json` tag was updated locally from `0017_polite_the_initiative` to `0017_add_message_edits` but is gitignored and not committed — expected per project workflow.
- `town-square.tsx` and `globe/group/[conversationId].tsx` are thin re-export wrappers; no changes needed there.

## Known Stubs

None — all data paths are fully wired.

## Threat Flags

None — PATCH endpoint guards: JWT auth (requireAuth middleware), owner check (403 on mismatch), media guard (422), moderation re-run (rejects inappropriate edits), no new network surface beyond the existing `/api/chat/*` router.

## Self-Check: PASSED

- `tribelife-backend/drizzle/0017_add_message_edits.sql` — exists
- `tribelife-mobile/components/ui/chat/EditComposer.tsx` — exists
- Backend commits `b369907`, `18a3f93` — verified in `git log`
- Mobile commits `3d5f354`, `05027af`, `7eeeba9` — verified in `git log`
- `npx tsc --noEmit` — 0 errors
