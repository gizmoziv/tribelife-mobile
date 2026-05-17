---
quick_id: 260517-hiy
type: execute
wave: 1
autonomous: true
files_modified:
  - tribelife-backend/src/db/schema.ts
  - tribelife-backend/drizzle/0017_add_message_edits.sql
  - tribelife-backend/drizzle/meta/_journal.json
  - tribelife-backend/drizzle/meta/0017_snapshot.json
  - tribelife-backend/src/routes/chat.ts
  - tribelife-mobile/types/index.ts
  - tribelife-mobile/services/api.ts
  - tribelife-mobile/services/socket.ts
  - tribelife-mobile/components/ui/chat/ContextMenu.tsx
  - tribelife-mobile/components/ui/chat/MessageBubble.tsx
  - tribelife-mobile/components/ui/chat/EditComposer.tsx
  - tribelife-mobile/app/(app)/chat/[conversationId].tsx
  - tribelife-mobile/app/(app)/chat/local.tsx
  - tribelife-mobile/app/(app)/chat/town-square.tsx
  - tribelife-mobile/app/(app)/globe/[roomSlug].tsx
  - tribelife-mobile/app/(app)/globe/group/[conversationId].tsx
must_haves:
  truths:
    - "User can long-press own message and see Edit row in context menu (others' messages: no Edit row)"
    - "Tapping Edit opens an inline editable composer pre-filled with the current message content"
    - "Saving edit calls PATCH /api/chat/messages/:id and on success the message body updates in-place with a `(edited)` label next to its timestamp"
    - "Saving an edit that fails moderation surfaces an Alert with the moderation reason and the message body is unchanged"
    - "Attempting to edit a message with mediaUrls returns 422 from backend (media-edit guard) and the mobile shows an Alert"
    - "Other connected clients in the same room/DM receive `message:edited` and patch the message in their local list within the same session"
    - "GET /room/:roomId/messages and GET /conversations/:id/messages include `editedAt: ISO | null` in every message row"
    - "Reply quotes still render the ORIGINAL snapshot — editing the source message does NOT mutate any reply preview"
    - "Audit row inserted into `message_edits` for every successful PATCH (pre-edit content preserved)"
  artifacts:
    - path: "tribelife-backend/src/db/schema.ts"
      provides: "messages.editedAt column + messageEdits table declaration + messageEditsRelations"
      contains: "editedAt"
    - path: "tribelife-backend/drizzle/0017_add_message_edits.sql"
      provides: "Additive zero-downtime migration: ALTER TABLE messages ADD COLUMN edited_at timestamp, CREATE TABLE message_edits, index on message_id"
    - path: "tribelife-backend/src/routes/chat.ts"
      provides: "PATCH /api/chat/messages/:id route handler + editedAt surfaced in GET handlers"
      contains: "router.patch('/messages/:id'"
    - path: "tribelife-mobile/components/ui/chat/EditComposer.tsx"
      provides: "Inline edit composer (TextInput + Save/Cancel) mirroring ReplyComposer style"
    - path: "tribelife-mobile/services/api.ts"
      provides: "chat.editMessage(messageId, content) method"
      contains: "editMessage"
    - path: "tribelife-mobile/services/socket.ts"
      provides: "onMessageEdited listener helper returning cleanup ()=>void"
      contains: "onMessageEdited"
  key_links:
    - from: "tribelife-backend/src/routes/chat.ts (PATCH handler)"
      to: "tribelife-backend/src/services/claude.ts moderateMessage"
      via: "Synchronous content-filter call on edited content before commit"
    - from: "tribelife-backend/src/routes/chat.ts (PATCH handler)"
      to: "Socket.IO broadcast"
      via: "req.app.get('io') -> io.to(<room>).emit('message:edited', payload)"
      pattern: "io\\.to\\(.*\\)\\.emit\\('message:edited'"
    - from: "tribelife-mobile/components/ui/chat/ContextMenu.tsx"
      to: "Edit composer state in chat screens"
      via: "new onEdit prop (rendered only when isOwn === true) -> sets editingMessage in screen state"
    - from: "tribelife-mobile/services/socket.ts onMessageEdited"
      to: "Chat screens setMessages reducer"
      via: "registered alongside onRoomMessage / onDirectMessage / onGlobeMessage in the same useEffect; cleanup returned"
---

<objective>
Add an unlimited-edit-window message-editing capability spanning DB (additive migration), backend (PATCH endpoint with moderation re-run + audit table + socket broadcast), and mobile (context-menu Edit row gated on `isOwn`, inline edit composer, socket listener, `(edited)` label). Locked behaviors: edits unlimited in time; `(edited)` label always shown; reply quotes freeze to the original content; text-only in v1 (reject when `mediaUrls` is non-null/non-empty); content moderation pipeline re-runs on every edit (re-use the existing `moderateMessage` from `services/claude.ts`); no push re-notification on edit.

Purpose: Lets users fix typos / clarify their own messages while keeping moderation invariants and the freeze-snapshot reply UX intact. The audit table preserves a tamper-evident history for future moderation tooling.

Output: One additive migration, one new PATCH route, two read-endpoint surfacings, one new mobile API method, one new socket listener, one new EditComposer component, one ContextMenu prop change, one MessageBubble label change, and five screen wirings.
</objective>

<context>
@/Users/nir/dev/tribelife-project/CLAUDE.md
@/Users/nir/dev/tribelife-project/tribelife-mobile/.planning/STATE.md
@/Users/nir/dev/tribelife-project/tribelife-backend/src/db/schema.ts
@/Users/nir/dev/tribelife-project/tribelife-backend/src/routes/chat.ts
@/Users/nir/dev/tribelife-project/tribelife-backend/src/services/claude.ts
@/Users/nir/dev/tribelife-project/tribelife-mobile/types/index.ts
@/Users/nir/dev/tribelife-project/tribelife-mobile/services/api.ts
@/Users/nir/dev/tribelife-project/tribelife-mobile/services/socket.ts
@/Users/nir/dev/tribelife-project/tribelife-mobile/components/ui/chat/ContextMenu.tsx
@/Users/nir/dev/tribelife-project/tribelife-mobile/components/ui/chat/MessageBubble.tsx
@/Users/nir/dev/tribelife-project/tribelife-mobile/components/ui/chat/ReplyComposer.tsx

<interfaces>
<!-- Key contracts extracted from the codebase. Executor should use these directly. -->

From tribelife-backend/src/services/claude.ts (existing pipeline — re-use, do not modify):
- export interface ModerationResult { isAllowed: boolean; reason?: string }
- export function moderateMessage(content: string): ModerationResult
  Synchronous keyword/regex blocklist. Used by both src/socket/dmHandler.ts (dm:message)
  and src/socket/roomHandler.ts (room:message). Rejection path emits
  socket.emit('message:rejected', { reason: modResult.reason }). PATCH handler
  mirrors that semantics by returning 422 { error: <reason> }.

From tribelife-backend/src/db/schema.ts (messages table, existing — extend in place):
- messages.id: serial pk
- messages.content: text notNull
- messages.senderId: integer references users.id (set null on delete)
- messages.roomId: varchar(100)  — values: "timezone:<IANA>" OR "globe:<slug>" OR null
- messages.conversationId: integer references conversations.id (cascade) — null for room messages
- messages.mediaUrls: jsonb $type<string[]>() — null OR string[]; non-empty array means "media message"
- messages.kind: varchar(20) default 'user' — 'user' | 'system'; do NOT allow editing kind='system' (the senderId-null on system messages already blocks via the owner check)

From tribelife-backend/src/routes/chat.ts:
- router.use(requireAuth)        — applies to every route in this file; PATCH inherits it
- AuthRequest type — req.user!.id is the authenticated user id (number)
- /api/chat is mounted at server.ts line 152
- Existing GET handlers select an explicit projection: { id, content, createdAt, senderId, senderName, senderHandle, senderAvatar, mentions, mediaUrls, kind } — add `editedAt: messages.editedAt` to BOTH:
  * router.get('/conversations/:id/messages', ...)  (currently lines ~325-347)
  * router.get('/room/:roomId/messages', ...)        (currently lines ~418-436)
  Map straight into the response row — attachReactions/attachReplyTo do not strip unknown fields.

Existing broadcast patterns (mirror these in the PATCH handler):
- DM broadcast:    io.to(`conversation:${conversationId}`).emit('dm:message', payload)   (src/socket/dmHandler.ts:178)
- Room broadcast:  io.to(timezoneRoom).emit('room:message', payload)                     (src/socket/roomHandler.ts:105) — timezoneRoom value == messages.roomId
- Globe broadcast: io.to('globe:' + slug).emit('globe:message', payload)                  (src/socket/globeHandler.ts:146) — value also stored on messages.roomId
- REST-route emit pattern (mirror this for PATCH): const io = req.app.get('io') as Server | undefined; io?.to(<room>).emit(<event>, <payload>);   (src/routes/groups.ts:381-383)

Broadcast event for edits (single event name, target chosen by stored fields):
- Event name: 'message:edited'
- Payload: { messageId: number, content: string, editedAt: string, roomId: string | null, conversationId: number | null }
- Target room selection (in PATCH handler, AFTER successful commit):
  * if message.conversationId != null  ->  io.to(`conversation:${message.conversationId}`)
  * else if message.roomId != null      ->  io.to(message.roomId)   // works for both 'timezone:*' and 'globe:*'
  * (both null = legacy/bad row -> skip emit)

From tribelife-mobile/types/index.ts (Message — extend in place):
- Existing: id, content, senderId, senderHandle, senderAvatar?, senderName?, roomId?, conversationId?, createdAt, mentions?, reactions?, replyTo?, replyToId?, mediaUrls?, kind?
- Add: editedAt: string | null

From tribelife-mobile/services/socket.ts (mirror onMessageRejected — line 188):
- export function onMessageRejected(cb: (data: { reason?: string }) => void): () => void {
    socket?.on('message:rejected', cb);
    return () => socket?.off('message:rejected', cb);
  }
  Add the analogous export function onMessageEdited(cb: (data: { messageId: number; content: string; editedAt: string; roomId: string | null; conversationId: number | null }) => void): () => void

From tribelife-mobile/services/api.ts (chat namespace, line 142 — append a method):
- Existing methods follow: `name: (...args) => request<T>(path, { method, body: JSON.stringify(...) })`
- Add: editMessage: (messageId: number, content: string) => request<{ message: Message }>(`/api/chat/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify({ content }) })

From tribelife-mobile/components/ui/chat/ContextMenu.tsx:
- Current props: { visible, onClose, onReact, onCopy?, onReply?, onReport?, onTranslate?, messageContent }
- Pattern: each optional `on*` prop renders its action row only when the prop is defined.
- Add: onEdit?: () => void   AND   isOwn?: boolean (default false)
- Render the Edit row ONLY when `onEdit !== undefined && isOwn === true`. Callers pass `isOwn={selectedMessage.senderId === user?.id}` so other users' messages never show Edit.

From tribelife-mobile/components/ui/chat/ReplyComposer.tsx (style + layout template to mirror in EditComposer):
- View column with surfaceElevated bg, primary-colored vertical bar on left, content area, close ✕ button on right.
- Theme: useTheme() -> { colors }; constants: FONTS from '@/constants'.

Chat screen wiring template (the five screens listed in `files_modified` all share this shape; lines as of current head):
- tribelife-mobile/app/(app)/chat/[conversationId].tsx:302  const offDm = onDirectMessage(...)
- tribelife-mobile/app/(app)/chat/[conversationId].tsx:345  const offRejected = onMessageRejected(...)
- tribelife-mobile/app/(app)/chat/local.tsx:207             const offRoom = onRoomMessage(...)
- tribelife-mobile/app/(app)/chat/local.tsx:240             const offRejected = onMessageRejected(...)
- chat/town-square.tsx, globe/[roomSlug].tsx, globe/group/[conversationId].tsx follow the same useEffect-with-cleanup shape (verify each file before adding the handler).
Add `const offEdited = onMessageEdited((p) => setMessages(prev => prev.map(m => m.id === p.messageId ? { ...m, content: p.content, editedAt: p.editedAt } : m)))` in the SAME useEffect and include `offEdited()` in the cleanup return.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema — add editedAt column + message_edits audit table + generate migration</name>
  <files>tribelife-backend/src/db/schema.ts, tribelife-backend/drizzle/0017_add_message_edits.sql, tribelife-backend/drizzle/meta/_journal.json, tribelife-backend/drizzle/meta/0017_snapshot.json</files>
  <action>
In `tribelife-backend/src/db/schema.ts`:

(a) Inside the existing `messages` pgTable declaration (currently lines 120-143 — the table object that already has id/content/senderId/roomId/conversationId/mentions/createdAt/deletedAt/replyToId/mediaUrls/translatedContent/kind), add ONE new nullable column declaration directly after `deletedAt` to keep schema readers grouped. Use the project's exact snake_case mapping pattern visible in surrounding columns (e.g. `replyToId: integer('reply_to_id'), mediaUrls: jsonb('media_urls')`). The new field is named `editedAt` in JS and `edited_at` in SQL with `timestamp` type and no default. Nullable on purpose — pre-existing rows must remain unedited (NULL) so the additive deploy is zero-downtime.

(b) Immediately AFTER the `messages` block AND its `messagesRelations` block (currently ends at line 392), add a NEW `messageEdits` pgTable declaration named `'message_edits'` with columns: `id: serial('id').primaryKey()`, `messageId: integer('message_id').references(() => messages.id, { onDelete: 'cascade' }).notNull()`, `content: text('content').notNull()`, `editedAt: timestamp('edited_at').notNull()`. Apply ONE index inside the table-callback options: `messageIdx: index('message_edits_message_idx').on(t.messageId)` — mirrors the existing `messages_room_idx` / `reactions_message_idx` naming style.

(c) After the new table, add `export const messageEditsRelations = relations(messageEdits, ({ one }) => ({ message: one(messages, { fields: [messageEdits.messageId], references: [messages.id] }) }));` — match the surrounding `*Relations` export pattern in this file.

(d) Generate the migration: from `tribelife-backend/` run `npm run db:generate`. Drizzle Kit will emit `drizzle/<NNNN>_<auto_random_name>.sql` plus a paired `drizzle/meta/<NNNN>_snapshot.json` and append an entry to `drizzle/meta/_journal.json`. The current latest entry is `0016_add_user_bio` — the new entry will be `0017_<random>`.

(e) Rename the auto-generated SQL filename AND its journal `tag` field to `0017_add_message_edits` (rename the `.sql` file on disk AND edit the matching journal entry's `tag` value — per the user's logged feedback rule "rename the auto-generated random name + the journal tag together"). Do NOT modify the snapshot JSON filename — Drizzle Kit hashes by `idx` so only the journal `tag` and the SQL file basename need to match the conventional name. Verify the resulting SQL emits exactly two DDL stanzas: `ALTER TABLE "messages" ADD COLUMN "edited_at" timestamp;` AND `CREATE TABLE IF NOT EXISTS "message_edits" (...)` + the `CREATE INDEX "message_edits_message_idx" ON "message_edits" ("message_id")` + the FK constraint on `message_id` with ON DELETE CASCADE. No DROP statements, no NOT NULL on `edited_at` in messages, no DEFAULT — additive only.

Conventions per project memory: 2-space indent, single quotes, trailing commas, snake_case in SQL, camelCase in JS, never hand-write a migration.
  </action>
  <verify>
    <automated>cd /Users/nir/dev/tribelife-project/tribelife-backend &amp;&amp; npx tsc --noEmit 2&gt;&amp;1 | tail -20 &amp;&amp; ls drizzle/0017_add_message_edits.sql &amp;&amp; grep -q '"tag": "0017_add_message_edits"' drizzle/meta/_journal.json &amp;&amp; grep -q 'ADD COLUMN "edited_at"' drizzle/0017_add_message_edits.sql &amp;&amp; grep -q 'CREATE TABLE.*"message_edits"' drizzle/0017_add_message_edits.sql &amp;&amp; grep -q 'message_edits_message_idx' drizzle/0017_add_message_edits.sql</automated>
  </verify>
  <done>schema.ts compiles clean under strict tsc; `drizzle/0017_add_message_edits.sql` exists; journal `tag` field updated to `0017_add_message_edits`; SQL is additive (no DROPs); index on message_id present.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Backend — PATCH /api/chat/messages/:id route + editedAt surfaced in GET handlers + socket broadcast</name>
  <files>tribelife-backend/src/routes/chat.ts</files>
  <behavior>
    - PATCH /api/chat/messages/:id with non-numeric id → 400 { error: 'Invalid message ID' }
    - PATCH with body { content: '' } or whitespace-only → 400 { error: 'Message cannot be empty' }
    - PATCH with body content > 2000 chars → 400 with first zod error message
    - PATCH a non-existent message id → 404 { error: 'Message not found' }
    - PATCH a message owned by another user → 403 { error: 'You can only edit your own messages' }
    - PATCH a message where mediaUrls is non-null non-empty → 422 { error: 'Edits are not supported on media messages yet' }
    - PATCH where moderateMessage rejects the new content → 422 { error: <moderation reason> }, message row UNCHANGED, no audit insert
    - PATCH happy path (valid, own, text-only, passes moderation): inserts audit row with OLD content + now(), updates messages.content + messages.edited_at, emits 'message:edited' to correct room, returns 200 { message: <updated row in same shape GET handlers use> }
    - GET /api/chat/conversations/:id/messages includes `editedAt: ISO | null` on every row
    - GET /api/chat/room/:roomId/messages includes `editedAt: ISO | null` on every row
  </behavior>
  <action>
In `tribelife-backend/src/routes/chat.ts`:

(a) ADD `editedAt: messages.editedAt` to the two existing read-projection select() lists — one in the `router.get('/conversations/:id/messages', ...)` handler (the select that currently lists id/content/createdAt/senderId/senderName/senderHandle/senderAvatar/mentions/mediaUrls/kind) and one in the analogous `router.get('/room/:roomId/messages', ...)` handler. Place `editedAt` immediately after `createdAt` so payloads keep timestamp fields grouped. `attachReactions` and `attachReplyTo` pass unknown fields through — no changes needed there. Do NOT modify any other field. Verify by re-reading both handlers and confirming the new key is in the projection.

(b) EXTEND the existing import group at the top of the file: append `messageEdits,` to the destructured import block currently importing `{ conversations, conversationParticipants, messages, users, userProfiles, blockedUsers }` from `'../db/schema'`. Add a new line `import { moderateMessage } from '../services/claude';` near the other service imports. Add `import type { Server } from 'socket.io';` for the `req.app.get('io')` cast (mirror `tribelife-backend/src/routes/groups.ts` line 381 pattern).

(c) DEFINE a zod schema at module scope, above the new route (mirror the existing `translateSchema` const on line 443-445): `const editMessageSchema = z.object({ content: z.string().min(1, 'Message cannot be empty').max(2000) });`. The min-length check guards against empty strings BEFORE trim; after parse we ALSO trim and re-check for the all-whitespace case.

(d) ADD a new route AFTER the `router.post('/translate/:messageId', ...)` handler and BEFORE `export default router`:

  `router.patch('/messages/:id', async (req: AuthRequest, res: Response): Promise<void> => { ... });`

  Inside the handler, in this order:

  1. Parse `messageId` from `req.params.id` via `parseInt`; if `isNaN` -> `res.status(400).json({ error: 'Invalid message ID' }); return;`
  2. `const parse = editMessageSchema.safeParse(req.body);` — if `!parse.success` -> 400 with `parse.error.errors[0].message` per project convention.
  3. `const content = parse.data.content.trim();` — if empty after trim -> 400 `{ error: 'Message cannot be empty' }`.
  4. SELECT the existing message: `const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);` Returns full row including `senderId`, `mediaUrls`, `content`, `roomId`, `conversationId`, `kind`. If `!msg` -> 404 `{ error: 'Message not found' }`.
  5. Authorization: if `msg.senderId !== req.user!.id` -> 403 `{ error: 'You can only edit your own messages' }`. (System messages have senderId null and are caught here.)
  6. Media guard: if `Array.isArray(msg.mediaUrls) && msg.mediaUrls.length > 0` -> 422 `{ error: 'Edits are not supported on media messages yet' }`.
  7. Moderation re-run: `const modResult = moderateMessage(content);` if `!modResult.isAllowed` -> log a `console.error('[chat/edit]', { messageId, userId: req.user!.id, reason: modResult.reason })` (project bracketed-prefix pattern) then `res.status(422).json({ error: modResult.reason ?? 'Content rejected by moderation' }); return;` — do NOT update DB, do NOT insert audit, do NOT broadcast.
  8. Transaction: wrap audit insert + message update in `await db.transaction(async (tx) => { ... })`. Inside: `await tx.insert(messageEdits).values({ messageId: msg.id, content: msg.content, editedAt: now });` then `await tx.update(messages).set({ content, editedAt: now }).where(eq(messages.id, msg.id));` where `const now = new Date();` is declared above the transaction. The audit row preserves the OLD `msg.content`; the messages row gets the NEW `content`. Both `editedAt` values match `now`.
  9. After the transaction, fetch the updated row in the same projection shape the GET handlers use (id, content, createdAt, editedAt, senderId, senderName, senderHandle, senderAvatar, mentions, mediaUrls, kind) by re-selecting joined with users + userProfiles (mirror the GET handler's select). Then run `attachReactions([row], req.user!.id)` and `attachReplyTo(...)` to keep the response shape identical to GET. Single-row helpers return single-element arrays — take `[0]`.
  10. Socket broadcast: `const io = req.app.get('io') as Server | undefined;` (mirror `src/routes/groups.ts:381`). If `io` is defined, choose target room:
      - if `msg.conversationId != null` -> ``io.to(`conversation:${msg.conversationId}`).emit('message:edited', payload);``
      - else if `msg.roomId != null` -> `io.to(msg.roomId).emit('message:edited', payload);` (works for both `timezone:*` and `globe:*` values — Socket.IO room name == messages.roomId in both handlers, per src/socket/roomHandler.ts:105 and src/socket/globeHandler.ts:146)
      - else -> skip emit
    Payload shape: `{ messageId: msg.id, content, editedAt: now.toISOString(), roomId: msg.roomId, conversationId: msg.conversationId }`. Match the singular event name `'message:edited'` per locked decision.
  11. `res.json({ message: <fully shaped row from step 9> });`

(e) Wrap the body in try/catch — on caught error, `console.error('[chat/edit]', err)` and `res.status(500).json({ error: 'Edit failed' });`. Mirror the translate handler's error-handling style (lines 461-505).

Conventions: `void` return type on handler, `.safeParse` not `.parse`, single quotes, 2-space indent, trailing commas, bracketed log prefix `[chat/edit]`. Do NOT add any new tests — project has no test infrastructure (per task brief).
  </action>
  <verify>
    <automated>cd /Users/nir/dev/tribelife-project/tribelife-backend &amp;&amp; npx tsc --noEmit 2&gt;&amp;1 | tail -20 &amp;&amp; grep -q "router.patch('/messages/:id'" src/routes/chat.ts &amp;&amp; grep -q "moderateMessage" src/routes/chat.ts &amp;&amp; grep -q "messageEdits" src/routes/chat.ts &amp;&amp; grep -q "message:edited" src/routes/chat.ts &amp;&amp; grep -q "editedAt: messages.editedAt" src/routes/chat.ts</automated>
  </verify>
  <done>tsc clean on backend; PATCH route exists with correct path; moderation + transaction + socket broadcast wired; editedAt now in BOTH GET projection lists.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Mobile foundation — Message type extension + chat.editMessage API + onMessageEdited socket helper</name>
  <files>tribelife-mobile/types/index.ts, tribelife-mobile/services/api.ts, tribelife-mobile/services/socket.ts</files>
  <behavior>
    - Message type has new field `editedAt: string | null`
    - chat.editMessage(id, content) issues PATCH /api/chat/messages/:id with JSON body { content } and resolves to { message: Message }
    - onMessageEdited(handler) registers a 'message:edited' socket listener and returns a cleanup function — matches the structure of onMessageRejected (line 188 of socket.ts)
  </behavior>
  <action>
In `tribelife-mobile/types/index.ts`:
- Inside the existing `Message` interface declaration (lines 29-45 — the block that currently lists id, content, senderId, ..., kind?), add ONE line: `editedAt: string | null;`. Place it immediately after `createdAt: string;` so timestamps stay grouped. Keep style (semicolons, two-space indent). Do NOT change `GlobeMessage` — globe edit broadcasts reuse the singular `message:edited` event with the same payload shape; mobile globe screens render via the shared MessageBubble component which reads `editedAt` off the `Message | GlobeMessage` union but only `Message` is the type that flows through the PATCH path. If the globe screen later needs the field on its own type, it's a one-line follow-up — out of scope for v1.

In `tribelife-mobile/services/api.ts`:
- Inside the `chat` namespace object (lines 142-174), append a new method BEFORE the closing brace (after `translateMessage`):
  `editMessage: (messageId: number, content: string) => request<{ message: Message }>(\`/api/chat/messages/${messageId}\`, { method: 'PATCH', body: JSON.stringify({ content }) }),`
- Match existing comma + trailing-comma style. No other method signature changes. Do NOT touch other namespaces.

In `tribelife-mobile/services/socket.ts`:
- After the `onMessageRejected` declaration (currently lines 188-191), add a new exported function:

  `export function onMessageEdited(cb: (data: { messageId: number; content: string; editedAt: string; roomId: string | null; conversationId: number | null }) => void): () => void { socket?.on('message:edited', cb); return () => socket?.off('message:edited', cb); }`

- Format the body across multiple lines matching the surrounding helpers (single-statement on() then return cleanup). Keep single quotes, no trailing comma after the function body. Do NOT add a sender helper — mobile uses HTTP PATCH for edits, not a socket-emit path.
  </action>
  <verify>
    <automated>cd /Users/nir/dev/tribelife-project/tribelife-mobile &amp;&amp; npx tsc --noEmit 2&gt;&amp;1 | tail -20 &amp;&amp; grep -q "editedAt: string | null" types/index.ts &amp;&amp; grep -q "editMessage:" services/api.ts &amp;&amp; grep -q "onMessageEdited" services/socket.ts</automated>
  </verify>
  <done>Mobile tsc clean; the three additive exports/fields exist with correct names; no other mobile files modified by this task.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Mobile UI primitives — EditComposer component + ContextMenu isOwn/Edit prop + MessageBubble `(edited)` label</name>
  <files>tribelife-mobile/components/ui/chat/EditComposer.tsx, tribelife-mobile/components/ui/chat/ContextMenu.tsx, tribelife-mobile/components/ui/chat/MessageBubble.tsx</files>
  <action>
(a) CREATE `tribelife-mobile/components/ui/chat/EditComposer.tsx` as a new sibling to `ReplyComposer.tsx`. Public API:

  `interface EditComposerProps { initialContent: string; saving: boolean; onSave: (next: string) => void; onCancel: () => void; }`
  `export function EditComposer({ initialContent, saving, onSave, onCancel }: EditComposerProps) { ... }`

  Implementation directives (no inline code in this plan — these are behavioral requirements):
  - Mirror `ReplyComposer.tsx` outer layout: row container, surfaceElevated background, primary-colored left vertical bar, content area on the right, close ✕ on the far right. Use `useTheme()` for colors and `FONTS` from `'@/constants'`. 2-space indent, single quotes, trailing commas.
  - Replace the read-only handle/preview content slot with a controlled multiline TextInput seeded from `initialContent` on mount via local state. Disable the input while `saving` is true. Placeholder text "Edit message…". Cap visible height with a maxHeight on the TextInput style so a long edit stays in a scroll region.
  - Render an "Edit message" label above the TextInput using the same primary-colored, semiBold, fontSize 12 style as ReplyComposer's `@${senderHandle}` row.
  - Add two TouchableOpacity buttons under the TextInput: Cancel (calls `onCancel`, disabled while saving) and Save (calls `onSave(text.trim())`, disabled when saving OR `text.trim() === ''` OR `text.trim() === initialContent.trim()`). Use COLORS / theme tokens consistent with the rest of `components/ui/chat/`. Default export the component matching the ReplyComposer pattern.
  - Do NOT import the API/socket modules here — composer stays presentational; the screen wires Save → `chat.editMessage` (Task 5).

(b) EDIT `tribelife-mobile/components/ui/chat/ContextMenu.tsx`:
  - Extend `ContextMenuProps` (currently lines 25-34): add `onEdit?: () => void;` and `isOwn?: boolean;`. Keep style (one prop per line, optional via `?`, trailing semicolon).
  - In the destructured params (line 36-45), add `onEdit, isOwn = false,` — explicit default `false` so callers that omit the prop get safe behavior (no Edit row for other users' messages).
  - Add a `handleEdit` callback near `handleReply` (line 83-86): `const handleEdit = () => { onEdit?.(); onClose(); };` matching the surrounding style.
  - In the JSX action-rows block, INSERT a new row immediately AFTER the `onReply` row (currently lines 147-156) and BEFORE the `onTranslate` row. Render the row ONLY when `onEdit && isOwn`. The row's structure mirrors the existing Copy / Reply / Translate / Report rows: TouchableOpacity with `styles.actionRow`, an icon `Text` styled `styles.actionIcon` showing the ✎ pencil glyph (U+270E — single Text character to match the project's icon style; no SVG), and a label `Text` styled `styles.actionLabel` with `colors.text` reading "Edit". onPress calls `handleEdit`. activeOpacity={0.7}.
  - Do NOT change any other action rows, props, or styles.

(c) EDIT `tribelife-mobile/components/ui/chat/MessageBubble.tsx`:
  - In the timestamp render (currently line 366: `<Text style={[styles.bubbleTime, { color: colors.textMuted }]}>{formatTime(message.createdAt)}</Text>`), append a tiny suffix when `message.editedAt != null`. Preferred approach: change the existing Text body to render `{formatTime(message.createdAt)}{message.editedAt ? ' (edited)' : ''}`. This keeps the existing style block untouched and the muted color is inherited. Do NOT introduce a new style key.
  - Do NOT render `(edited)` for system messages — the early-return branch at line 194 already short-circuits and skips the timestamp render entirely, so no extra guard is needed.
  - Read the Message type field as `message.editedAt` (already on `Message` after Task 3). The shared bubble accepts `Message | GlobeMessage`; if `GlobeMessage` lacks the field at the type level, write the conditional as `(message as { editedAt?: string | null }).editedAt ? ' (edited)' : ''` so the component compiles for both unions without forcing a globe-side type change in v1.
  - CONFIRM (read-only check — do NOT mutate): the reply-preview render block at lines 263-278 (for own-bubble) and 319-334 (for other-bubble) reads `replyTo.content` from the prop passed into the component. `replyTo.content` is populated server-side by `attachReplyTo` from the ORIGINAL message at message-load time; the PATCH route never rewrites that snapshot. Reply quotes therefore stay frozen by virtue of the existing data model — NO change to MessageBubble's reply preview rendering. Document this confirmation as an inline comment near the reply preview render: `// Reply quotes intentionally freeze to original content — edit feature does not rewrite replyTo.content (PLAN 260517-hiy).`
  </action>
  <verify>
    <automated>cd /Users/nir/dev/tribelife-project/tribelife-mobile &amp;&amp; npx tsc --noEmit 2&gt;&amp;1 | tail -20 &amp;&amp; test -f components/ui/chat/EditComposer.tsx &amp;&amp; grep -q "isOwn" components/ui/chat/ContextMenu.tsx &amp;&amp; grep -q "onEdit" components/ui/chat/ContextMenu.tsx &amp;&amp; grep -q "(edited)" components/ui/chat/MessageBubble.tsx</automated>
  </verify>
  <done>Mobile tsc clean; EditComposer.tsx exists with the documented public API; ContextMenu exposes onEdit + isOwn props and renders the Edit row only when both truthy; MessageBubble shows `(edited)` suffix when `message.editedAt` is non-null; reply preview rendering unchanged with confirming comment.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Mobile screens — wire ContextMenu isOwn/onEdit, mount EditComposer, register onMessageEdited listener in all five chat screens</name>
  <files>tribelife-mobile/app/(app)/chat/[conversationId].tsx, tribelife-mobile/app/(app)/chat/local.tsx, tribelife-mobile/app/(app)/chat/town-square.tsx, tribelife-mobile/app/(app)/globe/[roomSlug].tsx, tribelife-mobile/app/(app)/globe/group/[conversationId].tsx</files>
  <action>
Apply the SAME wiring to all five screens. They share the long-press → ContextMenu → composer pattern verified in `app/(app)/chat/[conversationId].tsx` (ContextMenu mount at line 861, selectedMessage state at line 119) and `app/(app)/globe/[roomSlug].tsx` (mount near line 466). Re-read each file before editing to anchor on actual line numbers (the screens are large and have drifted).

For EACH of the five screens:

1. **Imports** — add to existing import groups:
   - `import { EditComposer } from '@/components/ui/chat/EditComposer';`
   - Append `onMessageEdited` to the existing socket destructured import (the screens that already import `onMessageRejected` from `'@/services/socket'` — grep confirms all five do under different selector names per `chat.tsx` line 39-45 etc.)
   - Ensure `chat` is imported from `@/services/api` (chat/[conversationId].tsx + chat/local.tsx + town-square.tsx + globe/group/[conversationId].tsx already import some chat methods; globe/[roomSlug].tsx may need it added — verify per file). Use `chat.editMessage` for the PATCH call.
   - Ensure `Alert` is imported from `'react-native'` (all five already use Alert for moderation rejections per the existing `onMessageRejected` callback — confirm in-file).

2. **State** — add a single new useState near the existing `selectedMessage` state line (the conversation screen has it at line 119, globe at line 168; pattern: `useState<Message | null>(null)`):
   - `const [editingMessage, setEditingMessage] = useState<Message | null>(null);` (use `GlobeMessage` instead of `Message` in the two globe screens to match the screen's existing selectedMessage typing.)
   - `const [savingEdit, setSavingEdit] = useState<boolean>(false);`

3. **Long-press handler** — find the existing `handleLongPress` (it sets `selectedMessage` and opens the ContextMenu). No change needed here.

4. **ContextMenu props** — at the existing ContextMenu JSX mount (chat/[conversationId].tsx line 861; globe/[roomSlug].tsx near line 466 — grep within each file for `<ContextMenu` to anchor), add TWO new props alongside the existing onCopy/onReply/onReport/onTranslate slots:
   - `isOwn={!!user && selectedMessage?.senderId === user.id}` — `user` is the existing `useAuthStore()` selector each screen already uses for sender comparisons (the conversation screen has it via authStore, confirm by grep). If a screen lacks the `user` reference, add `const { user } = useAuthStore();` near the other store hooks.
   - `onEdit={selectedMessage && !!user && selectedMessage.senderId === user.id ? () => { setEditingMessage(selectedMessage); } : undefined}` — undefined when not own so the ContextMenu hides the row even if `isOwn` is somehow true. Keep the close-on-tap semantics — ContextMenu's `handleEdit` already calls `onClose()` after firing `onEdit`.

5. **EditComposer mount** — render the new composer just above the message-input composer (each screen has a footer-input region — for the conversation screen the composer area is below the FlatList; for room/globe screens similarly). The composer mounts conditionally:
   ```
   editingMessage ? (
     <EditComposer
       initialContent={editingMessage.content}
       saving={savingEdit}
       onSave={async (next) => {
         setSavingEdit(true);
         try {
           const { message } = await chat.editMessage(editingMessage.id, next);
           setMessages(prev => prev.map(m => m.id === message.id ? { ...m, content: message.content, editedAt: message.editedAt } : m));
           setEditingMessage(null);
         } catch (err: any) {
           Alert.alert('Could not edit message', err?.message ?? 'Please try again.');
         } finally {
           setSavingEdit(false);
         }
       }}
       onCancel={() => setEditingMessage(null)}
     />
   ) : null
   ```
   Place it BEFORE the existing ReplyComposer or the message text-input row. When `editingMessage` is non-null, the screen can either hide the reply-composer / main composer or leave them — minimal change: leave them visible (the user explicitly cancels or saves to dismiss the edit composer). The Alert's title "Could not edit message" matches the project's existing error-alert style used by `onMessageRejected` callbacks already present in the screen.
   For the two globe screens whose existing setMessages state holds `GlobeMessage[]`, the spread `{ ...m, content, editedAt }` still works because the API returns `{ message: Message }` and content + editedAt are shape-compatible (string + string|null). If the screen's state type is strict, cast through `m as GlobeMessage` in the map callback.

6. **Socket listener** — inside the SAME useEffect that already registers `onRoomMessage` / `onDirectMessage` / `onGlobeMessage` and `onMessageRejected` (chat/[conversationId].tsx line 302 + 345; chat/local.tsx line 207 + 240; analogous in town-square + globe + globe/group), add:
   ```
   const offEdited = onMessageEdited((p) => {
     setMessages(prev => prev.map(m => m.id === p.messageId ? { ...m, content: p.content, editedAt: p.editedAt } : m));
   });
   ```
   And include `offEdited();` in the cleanup return alongside the existing `offRoom();` / `offDm();` / `offRejected();` calls. Do NOT add a separate useEffect — same effect keeps lifecycle aligned with the other socket listeners.

7. **DO NOT** modify reply-rendering, message-send, or moderation-rejection paths. Reply snapshots stay frozen; the existing onMessageRejected callback continues to handle send-time rejections; the new edit-time rejection path surfaces via the Alert in step 5.

Conventions: 2-space indent, single quotes, trailing commas, named function expressions for handlers (or inline arrow per surrounding pattern in each file). The five screens have slightly different surrounding code shapes — preserve each file's local conventions (e.g. some use `const handleX = useCallback(...)` while others use inline closures).
  </action>
  <verify>
    <automated>cd /Users/nir/dev/tribelife-project/tribelife-mobile &amp;&amp; npx tsc --noEmit 2&gt;&amp;1 | tail -30 &amp;&amp; for f in 'app/(app)/chat/[conversationId].tsx' 'app/(app)/chat/local.tsx' 'app/(app)/chat/town-square.tsx' 'app/(app)/globe/[roomSlug].tsx' 'app/(app)/globe/group/[conversationId].tsx'; do grep -l "onMessageEdited" "$f" || { echo "MISSING onMessageEdited in $f"; exit 1; }; grep -l "EditComposer" "$f" || { echo "MISSING EditComposer in $f"; exit 1; }; grep -l "isOwn" "$f" || { echo "MISSING isOwn in $f"; exit 1; }; done</automated>
  </verify>
  <done>tsc clean across mobile; all five screens import EditComposer + onMessageEdited; ContextMenu in each screen passes `isOwn` and `onEdit`; live edits patch in via socket listener; failed edits surface an Alert.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| mobile -> backend HTTP | Untrusted authenticated client supplies new message content via PATCH /api/chat/messages/:id |
| mobile -> Socket.IO | Edited broadcasts fan out to a Socket.IO room; recipients are already trusted-participant members of that room |
| backend -> Postgres | Audit insert + message update bundled in a transaction; FK + cascade enforced at DB level |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260517-hiy-01 | Tampering | PATCH /api/chat/messages/:id | mitigate | Authorization step in Task 2 (msg.senderId !== req.user!.id -> 403). Sender immutable — bypass requires a forged JWT (auth middleware already enforces). |
| T-260517-hiy-02 | Tampering | message content (post-edit) | mitigate | Re-run moderateMessage on every edit; reject before commit. Audit row preserves old content for forensics. |
| T-260517-hiy-03 | Tampering | mediaUrls bypass via edit | mitigate | Explicit `Array.isArray(msg.mediaUrls) && length > 0` guard -> 422. Prevents users from sneaking text changes into a media post (v1 deferred per locked decision). |
| T-260517-hiy-04 | Repudiation | edit history | mitigate | Every successful PATCH inserts into `message_edits` with OLD content + timestamp + FK to message. Cascade delete keeps audit consistent with message lifecycle. |
| T-260517-hiy-05 | Information Disclosure | message:edited broadcast | accept | Edited payload only fans to the existing recipient room (conversation:{id} or roomId). Same trust envelope as the original send. No new recipients. |
| T-260517-hiy-06 | Denial of Service | unlimited edit window | mitigate | Existing `/api` rate limiter (express-rate-limit, 120/min) already covers PATCH. No per-message rate limit added — locked decision is "unlimited edits in time," not "unlimited edits per second." If an abuse pattern emerges, follow-up ticket adds per-message throttle reading from `message_edits` count. |
| T-260517-hiy-07 | Elevation of Privilege | non-owner edit | mitigate | Owner check (step 5 in Task 2) is the single authoritative gate. requireAuth middleware ensures req.user is populated before the handler runs. |
| T-260517-hiy-08 | Spoofing | forged socket emit | accept | Server-only emit (REST handler -> io.to(...).emit). Clients can only subscribe via the existing Socket.IO auth handshake; they cannot impersonate server emits. |
| T-260517-hiy-SC | Tampering | npm installs | mitigate | No new npm/pip/cargo packages added in this plan — all changes use existing dependencies (drizzle-orm, zod, socket.io, react-native built-ins). Package legitimacy gate not required. |
</threat_model>

<verification>
End-to-end manual checks after all five tasks complete (no test infrastructure exists per project rules):

1. **Migration**: `cd tribelife-backend && npm run db:generate` — confirm `drizzle/0017_add_message_edits.sql` exists and the journal tag matches. Apply via `npm run db:migrate` against the live db (Docker Postgres on port 5435). Verify with `psql -h localhost -p 5435 -U postgres -d tribelife -c "\d messages"` shows `edited_at | timestamp without time zone` and `\d message_edits` shows the audit table with the index.
2. **Type-check**: `cd tribelife-backend && npx tsc --noEmit` clean. `cd tribelife-mobile && npx tsc --noEmit` clean.
3. **Backend smoke** (curl with a real JWT — user can grab from device or use a test account):
   - Send: `curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"content":"hello"}' http://localhost:4000/api/chat/...` (use an existing conversation/room — exact path depends on which screen the test uses).
   - Edit: `curl -X PATCH -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"content":"hello world"}' http://localhost:4000/api/chat/messages/<id>` — expect 200 with `{ message: { ..., editedAt: <ISO>, ... } }`.
   - Owner check: try PATCH on another user's message id -> expect 403.
   - Media guard: try PATCH on a message with mediaUrls (find one in psql or send one with media) -> expect 422.
   - Moderation: PATCH with a slur from the BLOCKED_PATTERNS list in claude.ts -> expect 422 with the moderation reason.
   - Empty: PATCH with `{"content":"   "}` -> expect 400.
4. **Mobile manual** (iOS Simulator + Android emulator — both required per project constraint):
   - Long-press own message in a DM -> ContextMenu shows Edit row; long-press another user's message -> Edit row absent.
   - Tap Edit -> EditComposer appears pre-filled. Type a new value, tap Save -> message updates in place with ` (edited)` suffix next to timestamp; Save button disables when text is empty or unchanged.
   - Open the same DM on a second device with a different user -> the edit appears in real time via socket listener.
   - Reply to a message, then edit the original -> reply preview should STILL show the old content (frozen snapshot). The edited message's main body shows the new content.
   - Test in light + dark mode (theme tokens used throughout).
5. **Backward compat**: an older mobile build (without Task 3-5 changes) talking to the new backend should keep working — `editedAt` is an additive field on read responses and the client ignores unknown fields.
</verification>

<success_criteria>
- `drizzle/0017_add_message_edits.sql` exists, additive only (no DROP, no NOT NULL/DEFAULT on existing rows), with the journal tag renamed to match the filename.
- `cd tribelife-backend && npx tsc --noEmit` exits 0; `cd tribelife-mobile && npx tsc --noEmit` exits 0.
- `grep -q "router.patch('/messages/:id'" tribelife-backend/src/routes/chat.ts` succeeds.
- `grep -q "editedAt: messages.editedAt" tribelife-backend/src/routes/chat.ts` succeeds (in both GET handlers — total count ≥ 2).
- `grep -q "moderateMessage" tribelife-backend/src/routes/chat.ts` and `grep -q "messageEdits" tribelife-backend/src/routes/chat.ts` both succeed.
- `grep -q "editedAt: string | null" tribelife-mobile/types/index.ts` succeeds.
- `grep -q "editMessage:" tribelife-mobile/services/api.ts` succeeds.
- `grep -q "onMessageEdited" tribelife-mobile/services/socket.ts` succeeds.
- `test -f tribelife-mobile/components/ui/chat/EditComposer.tsx` succeeds.
- `grep -q "isOwn" tribelife-mobile/components/ui/chat/ContextMenu.tsx` succeeds.
- `grep -q "(edited)" tribelife-mobile/components/ui/chat/MessageBubble.tsx` succeeds.
- All five screens listed in Task 5 contain `onMessageEdited` AND `EditComposer` AND `isOwn`.
- Existing community-room + DM message flows continue to work unchanged (no regressions in `room:message` / `dm:message` send paths — only additive changes).
</success_criteria>

<output>
On completion, write `.planning/quick/260517-hiy-add-edit-message-feature-patch-endpoint-/260517-hiy-SUMMARY.md` describing:
- The actual line numbers / minor deviations from the plan (screens drift between commits)
- Confirmation that the migration was generated and journal-tag-renamed
- Confirmation of clean tsc on both packages
- Any follow-up tickets surfaced (e.g. globe-screen explicit `editedAt` typing if GlobeMessage type is tightened, future edit-history viewer UI)
</output>
