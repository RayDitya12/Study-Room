# SPEC.md — Real-Time Study Room ("StudyRoom")

> This document is the single source of truth. Build everything described here without asking questions.
> If something is unclear, use the decision in Section 1 or the most conventional choice, write it in `DECISIONS.md` (one line each), and keep going.

---

## 0. Operating rules for the agent

1. Work phase by phase (Section 12). After each phase run its acceptance commands and fix failures before moving on.
2. Never stop to ask. Never leave `TODO`, placeholder functions, or "implement later" comments. Every file listed must exist and work.
3. Environment: the developer is on **Windows (PowerShell)**, Node **v24** installed, package manager **npm** (not pnpm/yarn).
   - Do not write bash-only scripts. All scripts must be npm scripts or Node/TS scripts.
   - Do not use symlinks. Use forward slashes in configs.
   - Add `.gitattributes` with `* text=auto eol=lf`.
4. If a pinned dependency version fails to install, use the nearest available version of the **same major**. Do not switch libraries.
5. Everything is TypeScript (strict mode). No `any` unless justified by a comment.
6. Keep the code clean and readable: small files, clear names, comments only for non-obvious logic (clock sync, grace periods, timer transitions).
7. Final gate (must all pass from a clean clone): `npm install`, `npm run typecheck`, `npm test`, `npm run build`.

---

## 1. Locked decisions

| Topic | Decision |
|---|---|
| Product | Real-time study rooms: join by code/link, presence, live chat, shared server-authoritative Pomodoro |
| Identity | Guest only: nickname + a random `clientId` (UUID) stored in `localStorage`. No accounts |
| Room access | Create room → 6-char code + link `/r/:code`. Optional password. No public room list |
| Timer control | Per-room setting `timerControl`: `host` (default) or `everyone`. Host can change it |
| Timer settings | Host-configurable focus / break / long break durations, cycles before long break (default 4), auto-start next phase (default off) |
| Extra features | ALL of: typing indicator, per-user status (Focusing/Break/Away), per-user "current task" text, sound on phase change, automatic host transfer, dark/light theme |
| Persistence | PostgreSQL via Prisma for rooms + last 100 messages. In-memory store implementation for tests and quick start |
| Package manager | npm workspaces |
| Node | `engines.node: ">=22"` (works on Node 24 installed locally) |
| Security | Rate limits, length limits, sanitization, Zod validation on every input, bcrypt for room passwords |
| Testing | Vitest: unit tests (timer machine etc.) + server integration tests with two `socket.io-client` instances. No Playwright |
| UI languages | English (default) and Indonesian, switchable at runtime, persisted |
| Theme | Catppuccin. Dark = **Mocha**. Light = **Latte**. Minimal, calm, focus-oriented |
| Deploy | Client → Vercel. Server → Render/Railway (Docker). DB → Neon/Supabase free Postgres. Plus `Dockerfile` and `docker-compose.yml` for local |

---

## 2. Tech stack and versions

Install the latest stable release within these majors:

**Root:** `typescript@^5.6`, `concurrently@^9`, `vitest@^3`, `tsx@^4`

**shared:** `zod@^3`

**server:** `express@^4`, `socket.io@^4`, `zod@^3`, `@prisma/client@^6`, `prisma@^6` (dev), `bcryptjs@^2` + `@types/bcryptjs`, `cors@^2` + `@types/cors`, `helmet@^8`, `express-rate-limit@^7`, `dotenv@^16`, `tsup@^8` (dev), `tsx@^4` (dev), `socket.io-client@^4` (dev, for integration tests), `@types/express@^4`, `@types/node`

**client:** `react@^19`, `react-dom@^19`, `react-router-dom@^6`, `zustand@^5`, `socket.io-client@^4`, `vite@^7`, `@vitejs/plugin-react@^5`, `tailwindcss@^4`, `@tailwindcss/vite@^4`, `@types/react`, `@types/react-dom`

Do NOT use: Prisma 7, Express 5, Zod 4, Redux, any UI component library, any i18n library (write a tiny one), any audio asset files (generate sound with WebAudio).

Module system: ESM everywhere (`"type": "module"`). TS config: `"strict": true`, `"moduleResolution": "Bundler"`, `"module": "ESNext"`, `"target": "ES2022"`, `"skipLibCheck": true`, `"noUncheckedIndexedAccess": true`.

---

## 3. Repository layout

```
studyroom/
├─ package.json                # workspaces: ["shared","server","client"], root scripts
├─ tsconfig.base.json
├─ .gitignore  .gitattributes  .editorconfig
├─ .env.example                # documents all env vars (Section 11)
├─ docker-compose.yml          # postgres + server
├─ README.md  DECISIONS.md  SPEC.md
├─ shared/
│  ├─ package.json             # name "@studyroom/shared", "main": "src/index.ts", "types": "src/index.ts"
│  ├─ tsconfig.json
│  └─ src/
│     ├─ index.ts              # re-exports everything
│     ├─ constants.ts          # LIMITS, enums
│     ├─ schemas.ts            # Zod schemas for every payload
│     ├─ types.ts              # inferred types + domain interfaces
│     ├─ events.ts             # ClientToServerEvents / ServerToClientEvents
│     └─ timerMachine.ts       # PURE timer logic (used by server AND tests; client uses remaining())
├─ server/
│  ├─ package.json  tsconfig.json  tsup.config.ts  vitest.config.ts  Dockerfile
│  ├─ prisma/schema.prisma
│  └─ src/
│     ├─ index.ts              # bootstrap: config, store, http server, socket server, graceful shutdown
│     ├─ config.ts             # env parsed with Zod
│     ├─ app.ts                # express app + REST routes
│     ├─ socket/
│     │  ├─ createSocketServer.ts
│     │  ├─ handle.ts          # wrapper: validate (zod) + try/catch + ack
│     │  └─ registerHandlers.ts
│     ├─ rooms/
│     │  ├─ RoomManager.ts     # loads/creates RoomRuntime, cleanup job
│     │  └─ RoomRuntime.ts     # per-room live state: members, timer, scheduler
│     ├─ store/
│     │  ├─ RoomStore.ts       # interface
│     │  ├─ prismaStore.ts
│     │  └─ memoryStore.ts
│     └─ lib/
│        ├─ rateLimiter.ts     # token bucket
│        ├─ sanitize.ts        # text cleaning
│        ├─ ids.ts             # room code, publicId hashing
│        └─ clock.ts           # Clock interface + systemClock
│     └─ __tests__/            # unit + integration tests
└─ client/
   ├─ package.json  tsconfig.json  vite.config.ts  index.html  vercel.json
   └─ src/
      ├─ main.tsx  App.tsx  index.css
      ├─ pages/ Home.tsx  RoomPage.tsx  NotFound.tsx
      ├─ components/
      │  ├─ TimerCard.tsx  TimerRing.tsx  PhaseDots.tsx
      │  ├─ MemberList.tsx  MemberItem.tsx  StatusPicker.tsx  TaskInput.tsx
      │  ├─ ChatPanel.tsx  MessageItem.tsx  ChatInput.tsx  TypingIndicator.tsx
      │  ├─ SettingsDialog.tsx  JoinDialog.tsx  CreateRoomForm.tsx
      │  ├─ ThemeToggle.tsx  LanguageToggle.tsx  SoundToggle.tsx
      │  ├─ ConnectionBanner.tsx  Toaster.tsx  Button.tsx  Dialog.tsx
      ├─ lib/ socket.ts  clock.ts  session.ts  sound.ts  format.ts  api.ts
      ├─ stores/ roomStore.ts  prefsStore.ts  toastStore.ts
      ├─ i18n/ index.ts  en.ts  id.ts  useT.ts
      ├─ theme/ flavors.ts  applyTheme.ts
      └─ hooks/ useRoomConnection.ts  useNow.ts  useDocumentTitle.ts
```

Root `package.json` scripts:

```json
{
  "dev": "concurrently -n server,client -c blue,magenta \"npm run dev -w server\" \"npm run dev -w client\"",
  "build": "npm run build -w server && npm run build -w client",
  "typecheck": "npm run typecheck -w shared && npm run typecheck -w server && npm run typecheck -w client",
  "test": "npm run test -w shared && npm run test -w server && npm run test -w client",
  "db:push": "npm run db:push -w server",
  "db:generate": "npm run db:generate -w server"
}
```

Each workspace defines `typecheck` (`tsc --noEmit`) and `test` (`vitest run`, with `--passWithNoTests` where no tests exist). Server `dev`: `tsx watch src/index.ts`. Server `build`: `prisma generate && tsup`. Client `dev`: `vite`. Client `build`: `tsc --noEmit && vite build`.

`shared` is consumed as TypeScript source (no build step). Client resolves it through the npm workspace plus Vite. Server dev uses `tsx`. Server production build uses `tsup` with `noExternal: ['@studyroom/shared']` so it is bundled into `dist/index.js`. `@prisma/client` stays external.

---

## 4. Domain model

### 4.1 Constants (`shared/src/constants.ts`)

```ts
export const LIMITS = {
  NICKNAME_MIN: 2, NICKNAME_MAX: 20,
  ROOM_NAME_MIN: 1, ROOM_NAME_MAX: 40,
  PASSWORD_MIN: 4, PASSWORD_MAX: 64,
  MESSAGE_MAX: 500,
  TASK_MAX: 80,
  MAX_MEMBERS: 30,
  HISTORY_SIZE: 100,
  FOCUS_MIN: [1, 120], BREAK_MIN: [1, 60], LONG_BREAK_MIN: [1, 60], CYCLES: [2, 8],
} as const;
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const STATUSES = ['focusing', 'break', 'away'] as const;
export const PHASES = ['focus', 'break', 'longBreak'] as const;
export const TIMER_STATUSES = ['idle', 'running', 'paused'] as const;
export const TIMER_CONTROLS = ['host', 'everyone'] as const;
export const ERROR_CODES = [
  'ROOM_NOT_FOUND','PASSWORD_REQUIRED','WRONG_PASSWORD','INVALID_INPUT','RATE_LIMITED',
  'NOT_IN_ROOM','FORBIDDEN','ROOM_FULL','INTERNAL',
] as const;
```

### 4.2 Core types (`shared/src/types.ts`, derived from Zod where possible)

```ts
RoomSettings = {
  focusMin: number;        // default 25
  breakMin: number;        // default 5
  longBreakMin: number;    // default 15
  cyclesBeforeLong: number;// default 4
  autoStart: boolean;      // default false
  timerControl: 'host' | 'everyone'; // default 'host'
}

TimerState = {
  phase: 'focus' | 'break' | 'longBreak';
  status: 'idle' | 'running' | 'paused';
  phaseDurationMs: number;     // full length of current phase
  remainingMs: number;         // authoritative when status !== 'running'
  endsAt: number | null;       // server epoch ms; non-null ONLY when running
  completedFocus: number;      // focus sessions completed in the current set (0..cyclesBeforeLong-1)
  version: number;             // increments on every change
}

Member = {
  userId: string;        // PUBLIC id (never the clientId)
  nickname: string;
  status: 'focusing' | 'break' | 'away';
  task: string;          // '' if none, max 80
  isHost: boolean;
  online: boolean;
  joinedAt: number;
}

ChatMessage = { id: string; userId: string; nickname: string; text: string; createdAt: number }

RoomSnapshot = {
  code: string; name: string; hasPassword: boolean;
  settings: RoomSettings;
  you: { userId: string };
  hostUserId: string;
  members: Member[];
  timer: TimerState;
  messages: ChatMessage[];   // up to last 100, oldest first
  serverNow: number;
}
```

**Identity rules**
- `clientId`: UUID v4 generated client-side, stored in `localStorage`, sent on join. **It is a secret** and is NEVER sent to other users.
- `userId` (public) = first 12 hex chars of `sha256(clientId + ":" + roomId)`. Computed server-side (`lib/ids.ts`).
- Same `clientId` with several tabs = ONE member with several sockets. Member is `online` while at least one socket is connected.
- Nickname duplicates inside a room: server appends ` (2)`, ` (3)`… to the later joiner (truncate to stay ≤ 20 chars).

### 4.3 Prisma schema (`server/prisma/schema.prisma`)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Room {
  id               String    @id @default(cuid())
  code             String    @unique
  name             String
  passwordHash     String?
  hostClientId     String
  focusMin         Int       @default(25)
  breakMin         Int       @default(5)
  longBreakMin     Int       @default(15)
  cyclesBeforeLong Int       @default(4)
  autoStart        Boolean   @default(false)
  timerControl     String    @default("host")
  // persisted timer
  timerPhase       String    @default("focus")
  timerStatus      String    @default("idle")
  timerDurationMs  Int       @default(1500000)
  timerRemainingMs Int       @default(1500000)
  timerEndsAt      BigInt?
  completedFocus   Int       @default(0)
  timerVersion     Int       @default(0)
  createdAt        DateTime  @default(now())
  lastActiveAt     DateTime  @default(now())
  messages         Message[]
  @@index([lastActiveAt])
}

model Message {
  id        String   @id @default(cuid())
  roomId    String
  room      Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  clientId  String
  nickname  String
  text      String
  createdAt DateTime @default(now())
  @@index([roomId, createdAt])
}
```

Schema is applied with `prisma db push` (v1 simplification; document this in README). `timerEndsAt` is a `BigInt` in Prisma: convert to/from `number` in `prismaStore.ts`.

### 4.4 Store interface (`server/src/store/RoomStore.ts`)

```ts
interface StoredRoom { id; code; name; passwordHash: string|null; hostClientId; settings: RoomSettings; timer: TimerState; createdAt: number; lastActiveAt: number }
interface StoredMessage { id; roomId; clientId; nickname; text; createdAt: number }
interface RoomStore {
  createRoom(input: { code; name; passwordHash; hostClientId; settings }): Promise<StoredRoom>;
  getByCode(code: string): Promise<StoredRoom | null>;
  saveRoomState(roomId: string, patch: Partial<{ hostClientId; settings; timer; lastActiveAt }>): Promise<void>;
  addMessage(m: Omit<StoredMessage,'id'|'createdAt'> & { createdAt?: number }): Promise<StoredMessage>;
  getRecentMessages(roomId: string, limit: number): Promise<StoredMessage[]>; // oldest first
  listRunningRooms(): Promise<StoredRoom[]>;      // timer.status === 'running'
  deleteInactiveSince(cutoffMs: number): Promise<number>;
  codeExists(code: string): Promise<boolean>;
}
```
Implement `memoryStore.ts` (Maps) and `prismaStore.ts`. Pruning: after every 20th `addMessage` for a room, delete all but the newest 100 messages of that room (in-memory counter per room is fine).

---

## 5. Realtime protocol (Socket.io, fully typed)

`shared/src/events.ts` exports `ClientToServerEvents` and `ServerToClientEvents`; both server (`new Server<C2S, S2C, {}, SocketData>`) and client (`Socket<S2C, C2S>`) use them. Every client→server event has an **ack callback** `(res: Ack<T>) => void` where `type Ack<T> = { ok: true; data: T } | { ok: false; error: ErrorCode }`. All payloads are validated with Zod schemas from `shared/src/schemas.ts` on the server, via `handle(schema, fn)`.

### Client → Server

| Event | Payload | Ack data | Rules |
|---|---|---|---|
| `time:sync` | `{ clientSentAt: number }` | `{ clientSentAt, serverNow }` | Allowed before join. No auth |
| `room:join` | `{ code, nickname, clientId, password? }` | `RoomSnapshot` | See 7.3. Idempotent for same clientId |
| `room:leave` | `{}` | `{}` | Explicit leave: immediate removal (no grace) |
| `chat:send` | `{ text }` | `ChatMessage` | Trim, 1–500 chars, rate limited |
| `chat:typing` | `{ isTyping: boolean }` | `{}` | Broadcast to others only |
| `member:update` | `{ status?, task? }` | `Member` | Updates own status/task |
| `timer:start` | `{}` | `TimerState` | Start or resume |
| `timer:pause` | `{}` | `TimerState` | |
| `timer:reset` | `{}` | `TimerState` | Back to focus, idle, completedFocus 0 |
| `timer:skip` | `{}` | `TimerState` | Go to next phase |
| `room:updateSettings` | `Partial<RoomSettings>` | `RoomSettings` | Host only |
| `room:transferHost` | `{ targetUserId }` | `{}` | Host only; target must be an online member |

Timer events require permission: `settings.timerControl === 'everyone'` OR caller is host; otherwise ack `FORBIDDEN`.

### Server → Client

| Event | Payload | When |
|---|---|---|
| `member:joined` | `Member` | New member, or an offline member came back online |
| `member:left` | `{ userId }` | Member removed (grace expired or explicit leave) |
| `member:offline` | `{ userId }` | Last socket disconnected, grace period running |
| `member:updated` | `Member` | Status/task/nickname/host flag changed |
| `room:hostChanged` | `{ hostUserId, reason: 'transfer' \| 'auto' }` | |
| `room:settingsUpdated` | `RoomSettings` | |
| `timer:state` | `{ timer: TimerState; reason: 'start'\|'pause'\|'reset'\|'skip'\|'complete'\|'settings'; by?: string }` | Every timer change |
| `chat:message` | `ChatMessage` | New message (sent to everyone in the room including the sender) |
| `chat:typing` | `{ userId, isTyping }` | To everyone except the sender |

Join/leave/host-change "system lines" in the chat are generated **client-side** from these events (translated, not persisted).

### Reconnect protocol
- The Socket.io client auto-reconnects. On every `connect`: (1) run clock sync, (2) if a stored session exists for the current room (`{code, nickname, clientId, password}` in memory + `sessionStorage`), re-emit `room:join` and **replace** the whole room state with the new snapshot (dedupe not needed since state is replaced).
- Server treats the re-join as the same member (same `clientId`), cancels any pending grace removal.

### Clock sync (client, `lib/clock.ts`)
- Do 5 `time:sync` round trips on connect (spaced 200 ms). For each: `rtt = now - clientSentAt`, `offset = serverNow + rtt/2 - now`. Use the offset of the sample with the **smallest RTT**. Re-sync every 30 s and on tab becoming visible.
- `serverNowEstimate() = Date.now() + offset`.
- Remaining time shown = `max(0, endsAt - serverNowEstimate())` when running, else `remainingMs`.

---

## 6. Timer state machine (`shared/src/timerMachine.ts`) — PURE functions, no timers, no I/O

```ts
phaseDurationMs(phase, settings): number
createInitialTimer(settings): TimerState        // focus, idle, full duration, completedFocus 0, version 0
getRemainingMs(t: TimerState, now: number): number // running ? max(0, endsAt-now) : remainingMs
start(t, now): TimerState        // idle|paused -> running; endsAt = now + remainingMs; version+1. If already running: return t unchanged
pause(t, now): TimerState        // running -> paused; remainingMs = max(0, endsAt-now); endsAt=null; version+1. If not running: unchanged
reset(t, settings): TimerState   // focus, idle, completedFocus 0, version = t.version+1
complete(t, settings, now): TimerState // phase finished naturally (see below)
skip(t, settings, now): TimerState     // user skipped current phase (see below)
applySettings(t, settings): TimerState // see below
```

**Transitions (`next` helper)**
- `complete` from `focus`: `completedFocus' = completedFocus + 1`. If `completedFocus' % cyclesBeforeLong === 0` → phase `longBreak`, else `break`.
- `complete` from `break`: → `focus`.
- `complete` from `longBreak`: → `focus` and `completedFocus = 0`.
- `skip` from `focus`: → `break` (do NOT increment `completedFocus`). `skip` from `break`: → `focus`. `skip` from `longBreak`: → `focus`, `completedFocus = 0`.
- After any transition: `phaseDurationMs = phaseDurationMs(newPhase, settings)`, `remainingMs = phaseDurationMs`. If `settings.autoStart` → `status='running'`, `endsAt = now + duration`; else `status='idle'`, `endsAt=null`. `version+1`.
- `applySettings`: if `status === 'idle'`, set `phaseDurationMs = remainingMs = phaseDurationMs(phase, newSettings)`; if running/paused, leave the current phase untouched (new durations apply from the next phase). Clamp `completedFocus` to `< cyclesBeforeLong`. `version+1`.

All functions return NEW objects (immutable).

---

## 7. Server design

### 7.1 REST (`app.ts`)
Middleware: `helmet()`, `cors({ origin: config.CORS_ORIGIN.split(',') , credentials: false })`, `express.json({ limit: '10kb' })`, `trust proxy` from config.

| Route | Body/Params | Response |
|---|---|---|
| `GET /health` | | `{ ok: true, uptime }` |
| `POST /api/rooms` | `{ name, password?, clientId, settings? }` (Zod) | `201 { code }`. Generates unique 6-char code (retry up to 5 times). Hashes password with bcryptjs (cost 10). Sets `hostClientId = clientId` |
| `GET /api/rooms/:code/meta` | | `{ exists: boolean, name?, hasPassword?, memberCount? }` (never leaks hash). Code normalized to upper-case |

Rate limit: `express-rate-limit` — 20 requests/minute/IP on `POST /api/rooms`, 120/minute/IP on `meta`. Error responses: `{ error: ErrorCode }` with proper HTTP status (400/404/429/500).

### 7.2 RoomManager and RoomRuntime
- `RoomManager.getOrLoad(code)` returns the in-memory `RoomRuntime` (loading from the store on first use), or `null` if the room doesn't exist. Keeps `Map<code, RoomRuntime>`.
- On boot: `store.listRunningRooms()` → load each runtime and re-schedule its phase-end timeout. If `endsAt <= now` at boot, apply `complete()` immediately once.
- Cleanup job every hour: `store.deleteInactiveSince(now - ROOM_TTL_DAYS days)`; also unload runtimes with zero members that have been idle ≥ 10 minutes.

`RoomRuntime` holds:
```ts
roomId, code, name, passwordHash, hostClientId, settings, timer,
members: Map<clientId, { userId, nickname, status, task, joinedAt, sockets:Set<string>, graceTimer?: Timeout }>,
phaseTimeout?: Timeout, clock: Clock, emitter: { toRoom(event, payload), toRoomExcept(socketId,...) }
```
Methods: `join`, `disconnectSocket`, `leave`, `sendChat`, `setTyping`, `updateMember`, `timerAction(actor, 'start'|'pause'|'reset'|'skip')`, `updateSettings`, `transferHost`, `snapshotFor(clientId)`, `dispose`.
Inject `Clock` (`now()`, `setTimeout`, `clearTimeout`) so tests can use fake timers.

**Phase scheduling:** whenever timer becomes `running`, clear any existing `phaseTimeout` and set `setTimeout(onPhaseEnd, max(0, endsAt - now))`. `onPhaseEnd`: if `timer.status !== 'running'` return; if `now < endsAt - 5` re-schedule for the remainder; else `timer = complete(timer, settings, now)`, persist, emit `timer:state` with `reason:'complete'`, and re-schedule if the new state is running (autoStart). Clear the timeout on pause/reset/skip/dispose. Persist the timer to the store after EVERY change (`saveRoomState`).

**Empty room:** when the last member is removed and the timer is running → `pause()` it and persist (so time doesn't silently expire).

### 7.3 Join flow (`room:join`)
1. Validate payload. Normalize `code` to upper-case. Sanitize nickname (7.6).
2. `getOrLoad(code)`; missing → `ROOM_NOT_FOUND`.
3. If the room has a password: the member is **not already present** (same clientId already a member bypasses the check) AND (no password given → `PASSWORD_REQUIRED`; `bcrypt.compare` false → `WRONG_PASSWORD`). Password attempts limited: 5 failures per minute per (IP + room) → `RATE_LIMITED`.
4. If new clientId and members.size ≥ `MAX_MEMBERS` → `ROOM_FULL`.
5. Add/refresh the member: add the socket id to `sockets`, cancel `graceTimer`, de-duplicate nickname, set `socket.data = { code, clientId, userId }`, `socket.join('room:'+code)`.
6. Emit `member:joined` to others (only if the member is new or was offline). Ack the `RoomSnapshot` (members include offline-in-grace members with `online:false`; `messages` from `store.getRecentMessages(roomId, 100)`).
7. If `clientId === hostClientId` the member is host (`isHost:true`).

### 7.4 Presence, grace period, host transfer
- On socket `disconnect`: remove its id from the member's `sockets`. If it becomes empty → mark offline, emit `member:offline`, start `graceTimer` of `PRESENCE_GRACE_MS` (default 15000).
- When the grace timer fires (or on explicit `room:leave`) → `removeMember`: delete from map, emit `member:left`. If the removed member was host AND other members exist → auto-transfer host to the online member with the smallest `joinedAt` (persist `hostClientId`, emit `room:hostChanged` with `reason:'auto'` and `member:updated` for old/new host). If no other members remain, keep `hostClientId` unchanged (the original host returns as host), and pause a running timer.
- Also, if the host is only *offline within grace*, do nothing until grace expires.
- Manual `room:transferHost` (host only): target must exist and be online; persist; emit `room:hostChanged` with `reason:'transfer'`.

### 7.5 Chat
`chat:send`: sanitize (7.6); empty after sanitize → `INVALID_INPUT`; rate limit per clientId: **5 messages per 5 seconds** (token bucket), exceeding → ack `RATE_LIMITED`. Persist with `store.addMessage`, emit `chat:message` to the whole room, ack the message. Typing: `chat:typing` is forwarded to everyone except the sender; rate limit 10 events/second/socket (silently drop extra); on disconnect, emit `isTyping:false` for that member.

### 7.6 Sanitization (`lib/sanitize.ts`)
`cleanText(input, max)`: normalize to NFC, remove control characters (`[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]`), remove zero-width/bidi override characters (`\u200B-\u200F\u202A-\u202E\u2066-\u2069`), collapse runs of whitespace to a single space (for nickname and task; for chat keep single newlines but collapse 3+ newlines to 2), trim, cut to `max`. Nickname must have ≥2 chars after cleaning. React escapes output; **never use `dangerouslySetInnerHTML`**. Linkify is NOT required.

### 7.7 Socket server setup
`new Server(httpServer, { cors: { origin: CORS_ORIGIN list }, pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 1e4 })`. `handle()` wrapper: `schema.safeParse(payload)` fail → ack `INVALID_INPUT`; thrown `AppError(code)` → ack `{ok:false,error:code}`; unknown error → log + `INTERNAL`. Handlers other than `time:sync` and `room:join` require `socket.data.code` else `NOT_IN_ROOM`. Never trust any `userId` from the client — always derive from `socket.data`.

Graceful shutdown on SIGTERM/SIGINT: stop accepting connections, persist all running timers (they are already persisted on change), close io, disconnect Prisma.

---

## 8. Client design

### 8.1 Routes (react-router)
- `/` → `Home`: hero + two cards: **Create room** (name, optional password, nickname) and **Join room** (code input, 6 chars, auto-uppercase). Language/theme toggles in the header.
- `/r/:code` → `RoomPage`: fetch `GET /api/rooms/:code/meta`. Not found → `NotFound` state with "back home". If the stored session lacks a nickname → show `JoinDialog` (nickname + password field only when `hasPassword`). On success → room UI. Wrong password → inline error, stay in dialog.
- `*` → `NotFound`.
- Nickname is remembered in `localStorage` (`studyroom.nickname`) and pre-filled.
- Creating a room: `POST /api/rooms` then navigate to `/r/:code` (the creator's clientId is host; password, if set, is kept in the in-memory session so they auto-join).
- Header in room: room name, code with **Copy link** button (toast "Link copied"), connection status.

### 8.2 Room page layout
Desktop (≥1024px): 3 columns — left **MemberList** (280px), center **TimerCard** (flex), right **ChatPanel** (360px). Tablet/mobile: single column with tabs at the bottom: `Timer | Members | Chat` (Timer is the default tab; chat tab shows an unread dot). Minimal: lots of whitespace, rounded-2xl cards, 1px borders, no heavy shadows.

**TimerCard:** `TimerRing` (SVG circle, stroke-dashoffset progress, smooth `transition` only on color not on the offset), big `mm:ss` (tabular-nums), phase label (Focus / Break / Long break, translated), `PhaseDots` (cycles before long break; filled = completedFocus), controls: Start/Pause toggle, Reset, Skip. Controls are disabled with a tooltip/label ("Only the host can control the timer") when the user lacks permission. Phase color: focus = mauve, break = green, longBreak = blue. Render loop: `useNow(250)` hook (setInterval 250 ms) + `serverNowEstimate()`. `role="timer"`, and `aria-live="off"` on the digits.

**MemberList:** sorted: host first, then online by joinedAt, then offline. Each item: avatar circle (first letter, color derived from userId hash from the Catppuccin accents), nickname, "(you)" tag, host crown icon (inline SVG), status chip (Focusing/Break/Away, with dot color), task text (truncated, full text in `title`), offline members dimmed with "reconnecting…". Host sees a "Make host" action in a small menu on other **online** members. Bottom of the list (for the current user): `StatusPicker` (3 segmented buttons) and `TaskInput` ("What are you working on?", max 80, saves on blur/Enter, debounced 500 ms).

**ChatPanel:** scrollable list, auto-scroll to bottom only if the user is already near the bottom; shows "New messages ↓" pill otherwise. Own messages aligned right with accent background. System lines (joined/left/host changed/phase changed) are small centered muted text. `TypingIndicator`: "Anna is typing…", "Anna and Budi are typing…", "Several people are typing…" (translated); entries expire after 3 s without refresh. `ChatInput`: Enter sends, Shift+Enter newline, counter shown when >400 chars, emits `chat:typing true` throttled to once per 2 s and `false` after 2.5 s idle or on send. On `RATE_LIMITED` ack → toast "Slow down a little".

**SettingsDialog** (host only button ⚙ in the timer card): fields focus/break/long break minutes (number inputs with min/max from `LIMITS`), cycles before long break, auto-start switch, timer control (Host only / Everyone) radio. Save → `room:updateSettings`. Non-hosts see settings read-only in a small summary line under the timer ("25 / 5 / 15 min · 4 cycles").

**Other:** `ConnectionBanner` (top, "Reconnecting…" while disconnected, disappears on success). `Toaster` (bottom-center, auto-dismiss 3 s). `useDocumentTitle` sets `"24:13 · Focus — StudyRoom"` while on a room page, restores on leave. Sound: see 8.5.

### 8.3 State (zustand)
- `roomStore`: `{ connection: 'connecting'|'connected'|'disconnected', snapshot fields: code, name, hasPassword, settings, hostUserId, youUserId, members (Map or array), timer, messages, typing: Record<userId, expiresAt>, systemLines merged into messages list as local-only items }`. Actions applying each server event; the `timer:state` action ignores payloads with `timer.version < current.version`.
- `prefsStore` (persisted to localStorage key `studyroom.prefs`): `{ theme: 'system'|'light'|'dark', lang: 'en'|'id', soundOn: boolean }`.
- `toastStore`.
- `lib/session.ts`: `getClientId()` (create + persist), `getNickname/setNickname`, in-memory + `sessionStorage` room session (`code`, `nickname`, `password?`).
- `useRoomConnection(code)` hook: creates the socket (autoConnect false), wires all server events to the store, runs clock sync and join on connect, cleans up on unmount (emit `room:leave` then disconnect). One socket per page visit.
- Socket URL: `import.meta.env.VITE_SERVER_URL || undefined` (same origin). In dev, `vite.config.ts` proxies `/api` and `/socket.io` (with `ws: true`) to `http://localhost:3001`.

### 8.4 Theme — Catppuccin (`theme/flavors.ts`, `index.css`)

Define CSS variables per flavor on `html[data-theme="mocha"]` / `html[data-theme="latte"]`. `applyTheme.ts`: resolves `prefs.theme` (`system` uses `prefers-color-scheme`) → sets `data-theme` and `color-scheme` on `<html>`, listens to media query changes. Add an inline script in `index.html` that reads `studyroom.prefs` and sets `data-theme` before first paint (avoid flash). Constants: `DARK_FLAVOR = 'mocha'`, `LIGHT_FLAVOR = 'latte'`.

Palettes (hex):

```
mocha:  rosewater f5e0dc flamingo f2cdcd pink f5c2e7 mauve cba6f7 red f38ba8 maroon eba0ac peach fab387 yellow f9e2af
        green a6e3a1 teal 94e2d5 sky 89dceb sapphire 74c7ec blue 89b4fa lavender b4befe
        text cdd6f4 subtext1 bac2de subtext0 a6adc8 overlay2 9399b2 overlay1 7f849c overlay0 6c7086
        surface2 585b70 surface1 45475a surface0 313244 base 1e1e2e mantle 181825 crust 11111b
latte:  rosewater dc8a78 flamingo dd7878 pink ea76cb mauve 8839ef red d20f39 maroon e64553 peach fe640b yellow df8e1d
        green 40a02b teal 179299 sky 04a5e5 sapphire 209fb5 blue 1e66f5 lavender 7287fd
        text 4c4f69 subtext1 5c5f77 subtext0 6c6f85 overlay2 7c7f93 overlay1 8c8fa1 overlay0 9ca0b0
        surface2 acb0be surface1 bcc0cc surface0 ccd0da base eff1f5 mantle e6e9ef crust dcdfe5
```

Name variables `--ctp-<name>`. Tailwind v4 wiring in `index.css`:

```css
@import "tailwindcss";
@theme inline {
  --color-base: var(--ctp-base);       --color-mantle: var(--ctp-mantle);   --color-crust: var(--ctp-crust);
  --color-surface0: var(--ctp-surface0); --color-surface1: var(--ctp-surface1); --color-surface2: var(--ctp-surface2);
  --color-overlay0: var(--ctp-overlay0); --color-overlay1: var(--ctp-overlay1);
  --color-text: var(--ctp-text);       --color-subtext0: var(--ctp-subtext0); --color-subtext1: var(--ctp-subtext1);
  --color-mauve: var(--ctp-mauve);     --color-green: var(--ctp-green);     --color-blue: var(--ctp-blue);
  --color-red: var(--ctp-red);         --color-peach: var(--ctp-peach);     --color-yellow: var(--ctp-yellow);
  --color-teal: var(--ctp-teal);       --color-pink: var(--ctp-pink);       --color-lavender: var(--ctp-lavender);
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, "JetBrains Mono", monospace;
}
body { background: var(--ctp-base); color: var(--ctp-text); }
```
Use classes like `bg-base`, `bg-mantle`, `bg-surface0`, `border-surface1`, `text-text`, `text-subtext0`, `text-mauve`. System font stack only (no web font downloads). Visible focus rings (`outline-mauve`). `prefers-reduced-motion` respected (no ring animation).

### 8.5 Sound (`lib/sound.ts`)
WebAudio only: lazily create an `AudioContext`, resume it on the first user gesture (click/keydown listener installed once). `playPhaseChange(toPhase)`: focus → two ascending sine notes (C5→E5, ~0.15 s each, soft envelope, gain ≤ 0.15); break/longBreak → two descending notes (E5→C5). Called from the `timer:state` handler when `reason === 'complete'` and `prefs.soundOn`. A `SoundToggle` (speaker icon) in the header. Fail silently if audio is unavailable.

### 8.6 i18n (`i18n/`)
- `en.ts` exports a nested `const en = { ... } as const` dictionary; `id.ts` is typed `Messages` (derived from `en`, with strings widened) so a missing key is a **compile error**.
- `useT()` returns `t(key, params?)` with dot-path keys and `{name}`-style interpolation; reads `prefsStore.lang`. Pluralization: use separate keys (`typing.one`, `typing.two`, `typing.many`).
- Sections to translate: `app`, `home`, `join`, `room` (header, copy link, connection), `timer` (phases, buttons, permission hints, settings summary), `members` (status labels, menu, you, host, offline), `chat` (placeholder, system lines, typing, errors, new messages), `settings` (all labels), `errors` (one entry per `ErrorCode`), `toasts`, `theme`, `language`, `sound`, `notFound`.
- Server errors arrive as codes → UI shows `t('errors.<CODE>')`.
- `document.documentElement.lang` follows the selected language. Default `en`. Indonesian copy must be natural (e.g. "Mulai", "Jeda", "Atur ulang", "Lewati", "Ruang belajar", "Fokus", "Istirahat", "Istirahat panjang").
- Format time with `Intl.DateTimeFormat(lang)` for chat timestamps (HH:mm).

---

## 9. Security checklist (all required)
- Zod validation on every REST body and every socket payload; reject unknown/extra fields (`.strict()`).
- Length limits from `LIMITS`; `maxHttpBufferSize` 10 KB; `express.json` limit 10 KB.
- Text sanitization (7.6); no HTML rendering of user text.
- Rate limits: REST per IP; chat per clientId; typing per socket; password attempts per IP+room.
- `clientId` never broadcast; public `userId` is a hash. Server derives identity from `socket.data`, never from payloads (except `room:join`).
- Host-only actions enforced server-side; client UI hiding is cosmetic.
- bcrypt hash for passwords; `passwordHash` never leaves the server.
- CORS restricted to `CORS_ORIGIN`; `helmet` enabled; no secrets in client bundle; `.env` in `.gitignore`.
- Cap `MAX_MEMBERS` 30 per room.

---

## 10. Testing (Vitest)

**shared (`shared/src/__tests__/timerMachine.test.ts`)** — table-driven:
- initial state per settings; `start` sets `endsAt = now + remaining`; `pause` computes remaining correctly; start/pause idempotency; resume after pause continues from the remaining time.
- `complete`: focus→break; 4th focus→longBreak; longBreak→focus resets `completedFocus`; with `autoStart` the new phase is `running`.
- `skip` from focus does not increment `completedFocus`.
- `applySettings` when idle updates duration; when running leaves it; clamps `completedFocus`.
- `version` increments on each real change; all functions don't mutate input.

**shared:** schema tests (nickname bounds, strict objects, settings ranges).

**server unit:** `sanitize` (control chars, zero-width, collapse, truncate), `rateLimiter` (token bucket with fake clock), `ids` (room code alphabet/length, publicId is stable and different per room), `RoomRuntime` with fake clock + memory store: phase auto-advance on timeout, autoStart re-schedules, grace removal, auto host transfer, empty-room pauses timer, nickname de-duplication.

**server integration (`server/src/__tests__/integration.test.ts`)**: start the real app on a random port with `memoryStore` and `PRESENCE_GRACE_MS=200`; use two `socket.io-client` sockets (A creates the room through REST):
1. A and B join; each receives the other in `member:joined`; snapshot of B contains A as host.
2. Chat: B sends → A and B both receive `chat:message`; message appears in a fresh snapshot on a third join.
3. Wrong password / missing password / room not found acks.
4. Permission: with `timerControl:'host'`, B's `timer:start` → `FORBIDDEN`; A's works and both get `timer:state` with an identical `endsAt`; host updates settings to `everyone` and then B can pause.
5. Disconnect B → A receives `member:offline`; B reconnects within grace → no `member:left`; B disconnects again and waits > grace → A receives `member:left`.
6. Host leaves explicitly → B becomes host (`room:hostChanged` reason `auto`).
7. Invalid payload (message > 500 chars) → `INVALID_INPUT`; spam > 5 messages quickly → `RATE_LIMITED`.
8. `time:sync` returns a plausible `serverNow`.

**client:** `i18n` parity test (every key in `en` exists in `id` and vice versa, same `{placeholders}`); `format` helpers test (`mm:ss`); a small test for the clock-offset selection (smallest RTT wins).

Vitest config: client uses `environment: 'jsdom'` only if needed (add `jsdom` dev dependency); keep tests free of React rendering where possible.

---

## 11. Config, env vars, deployment

`.env.example` (root, documented):
```
# Server
PORT=3001
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://studyroom:studyroom@localhost:5432/studyroom?schema=public
STORE=prisma            # prisma | memory  (if DATABASE_URL is empty, falls back to memory with a console warning)
PRESENCE_GRACE_MS=15000
MAX_MEMBERS=30
ROOM_TTL_DAYS=7
TRUST_PROXY=0           # set 1 behind Render/Railway
# Client (Vite)
VITE_SERVER_URL=        # empty in dev (proxy). In production: https://your-server.onrender.com
```
`config.ts` parses env with Zod, loads `dotenv` from the repo root (`path` resolved relative to the file) and fails fast with a readable message on invalid values.

**Quick start must work without a database:** `STORE=memory npm run dev` (PowerShell: `$env:STORE="memory"; npm run dev`). Document both in README. Add a `dev:memory` script in server (`cross-env`-free: implement by reading `STORE` default; provide the PowerShell example only).

**docker-compose.yml:** services `db` (postgres:16-alpine, volume, healthcheck, user/password/db `studyroom`) and `server` (build `./server` with the repo root as context, depends_on db healthy, env from compose, port 3001). `server/Dockerfile`: multi-stage, base `node:22-slim`, `apt-get install -y openssl`, copy workspace manifests, `npm ci`, `npm run build -w server`, runtime stage copies `dist`, `prisma`, production `node_modules`; `CMD ["sh","-c","npx prisma db push --skip-generate && node dist/index.js"]`.

**client/vercel.json:** SPA rewrite `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`. Build command `npm run build -w client` with root directory = repo root (document in README), env `VITE_SERVER_URL`.

**Render:** add `render.yaml` (web service, docker, env vars incl. `CORS_ORIGIN`, `DATABASE_URL`, `TRUST_PROXY=1`, health check path `/health`). Note in README: free instances sleep → first connect can be slow; add the "Connecting…" banner behavior and retry.

---

## 12. Implementation phases (execute in order)

**Phase 0 — Scaffold.** Root + 3 workspaces, tsconfigs, scripts, `.gitignore`, `.gitattributes`, `.editorconfig`, `.env.example`, empty-but-valid entry files.
✔ Accept: `npm install` OK; `npm run typecheck` OK.

**Phase 1 — Shared.** `constants`, `schemas`, `types`, `events`, `timerMachine` + its tests + schema tests.
✔ Accept: `npm test -w shared` passes; typecheck OK.

**Phase 2 — Server core.** `config`, `lib/*`, `RoomStore` + `memoryStore` + `prismaStore` + `schema.prisma`, `app.ts` REST, `index.ts`. Unit tests for `sanitize`, `rateLimiter`, `ids`.
✔ Accept: `STORE=memory` server starts; `POST /api/rooms` then `GET /api/rooms/:code/meta` work (covered by a supertest-free test using `fetch` against the started app); tests pass.

**Phase 3 — Realtime: presence + chat.** Socket server, `handle`, `RoomManager`, `RoomRuntime` (join, leave, grace, host transfer, chat, typing, member updates), `time:sync`.
✔ Accept: integration tests 1, 2, 3, 5, 6, 7, 8 pass.

**Phase 4 — Realtime: timer.** Timer actions, permissions, phase scheduling, persistence, boot recovery, settings update, empty-room pause. Runtime unit tests with fake clock.
✔ Accept: integration test 4 and runtime tests pass.

**Phase 5 — Client foundation.** Vite + Tailwind v4 + theme (Mocha/Latte, flash-free), i18n (en/id) + parity test, prefs store, router, `Home` (create/join), `api.ts`, shared UI primitives (`Button`, `Dialog`, `Toaster`), header toggles (theme, language, sound).
✔ Accept: `npm run build -w client` passes; Home renders in both themes and both languages.

**Phase 6 — Room page.** `useRoomConnection`, clock sync, `roomStore`, `JoinDialog`, `MemberList` (+ `StatusPicker`, `TaskInput`, host menu), `ChatPanel` (+ typing, system lines, unread pill), responsive layout with mobile tabs, `ConnectionBanner`.
✔ Accept: with `npm run dev`, two browser tabs (different `clientId`: use a private window) see each other, chat live, change status/task, reconnect after killing/restarting the server.

**Phase 7 — Timer UI + extras.** `TimerCard`, `TimerRing`, `PhaseDots`, `SettingsDialog`, permission states, WebAudio sounds, `useDocumentTitle`, copy-link, clock-offset test.
✔ Accept: start in tab A → tab B shows the same remaining time (±250 ms); pause/resume/skip/reset sync; phase auto-advances with a chime (set focus = 1 min to verify); refreshing a tab mid-run restores the correct time.

**Phase 8 — Hardening and deploy files.** Review Section 9 item by item; `Dockerfile`, `docker-compose.yml`, `render.yaml`, `vercel.json`; fix all typecheck/test failures.
✔ Accept: `npm run typecheck`, `npm test`, `npm run build` all pass from a clean `npm install`.

**Phase 9 — Docs.** `README.md` (see 13) and `DECISIONS.md`.

---

## 13. README requirements
1. One-paragraph pitch + feature list + screenshots placeholder section (`docs/screenshots/` with a note to add them).
2. **Architecture** section: an ASCII/Mermaid diagram of client ↔ Socket.io ↔ RoomRuntime ↔ Store/Postgres; explain **server-authoritative timer** (`endsAt` timestamps, clock-offset sync, why not client intervals), **reconnect + grace period**, **host transfer**, **identity model** (clientId vs public userId), and **why `shared/` exists** (typed events).
3. Quick start (memory mode), full start (Postgres via `docker compose up -d db` + `npm run db:push`), env var table, scripts table, test instructions.
4. Windows/PowerShell notes.
5. Deploy guide (Neon → Render → Vercel) with the env vars each needs.
6. Known limitations / roadmap: single server instance (in-memory presence; scale-out would need the Socket.io Redis adapter + shared presence), guest identity can be spoofed by clearing storage, `db push` instead of migrations in v1.

---

## 14. Definition of done
- Every file in Section 3 exists and is used.
- All acceptance checks in Section 12 pass; final gate in Section 0 passes.
- App works in English and Indonesian, Mocha (dark) and Latte (light), desktop and mobile widths.
- No console errors in normal use; no `TODO`/placeholder code; no secrets committed.
