# DECISIONS.md

One line per decision taken where SPEC.md left room for interpretation.

- Meta route `memberCount` returns the live count when the room runtime is loaded, otherwise `0` (members are not persisted).
- Unknown REST routes answer `404 { "error": "INVALID_INPUT" }` since `ErrorCode` has no generic NOT_FOUND entry.
- New members start with status `focusing` (first entry of `STATUSES`).
- `timer:reset` acks and broadcasts even when the timer was already in the reset state (keeps clients convergent).
- REST body parse failures (malformed JSON / too large) map to `400 INVALID_INPUT` instead of `500`.
- Prisma message pruning uses an in-process counter (spec allows it; single-instance server).
- The password failure limiter is a sliding-window counter (5 failures/min per IP+room) rather than a token bucket, matching "5 failures per minute" semantics exactly.
- `room:join` re-join with the same clientId refreshes the nickname (sanitized + de-duplicated) but keeps the original `joinedAt`.
- Boot recovery applies `complete()` at most once per room, as specified; with `autoStart` the next phase is then scheduled normally.
- "Host menu" is a crown icon button on each member row (visible on hover/focus) instead of a dropdown, since transferring the host is the only action.
- Chat system lines are stored as translation keys + params and translated at render, so switching language retranslates the visible history.
- Phases 6 and 7 were implemented together: the timer card and the room page are one screen and share the same connection hook.
- `MAX_MEMBERS` is validated with `.max(30)`, so the SPEC cap cannot be raised through the environment.
- Root `postinstall` runs `prisma generate`; npm's allowScripts policy skips Prisma's own postinstall, and without the generated client `npm run typecheck` fails on a clean clone.
- `dev:memory` passes `--memory` as an argv flag (read in `config.ts`) instead of using `cross-env`, which SPEC excludes.
- Typing indicators expire locally after 3 s, so a lost `chat:typing false` cannot leave a stuck indicator.
- Client acks time out after 10 s and report `INTERNAL`, so a dropped ack cannot leave the UI waiting forever.
- `roomStore.timerState` ignores an event whose `version` is older than the current one (out-of-order guard).
- The Docker runtime image keeps devDependencies because the SPEC-mandated CMD runs `npx prisma db push`, and SPEC pins the Prisma CLI as a dev dependency.
- The Docker image build was not run locally (Docker daemon not started); `docker compose config` validates `docker-compose.yml`.
- Browser-driven acceptance (two tabs, themes, chime, refresh mid-run) could not be automated in this environment and is listed as manual verification steps.
