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
- "Host menu" is a three-dot popover on each member row (`MemberMenu`): timer control, make host, mute, kick, ban. Role changes and removals ask for confirmation first; mute is a one-click toggle the host can reverse just as fast.
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

## Added after the SPEC build (2026-11-08, requested by the owner)

- **Moderator role.** `Member.isModerator` is a second, lower tier: the host stays single (settings, roles, host transfer) while a moderator only gains timer control (`start`/`pause`/`reset`/`skip`). Chosen over multiple hosts so that "who owns the room" stays unambiguous.
- The flag is presence state, held in memory like `status`/`task`: it is not persisted, and it is dropped when the member leaves or the server restarts.
- Becoming host — by transfer or by auto-transfer — clears `isModerator`, so a member never holds both roles.
- Appointing a moderator is host-only (`member:setModerator`, Zod-strict payload) and cannot target the host or an unknown/offline user.
- `settings.timerControl: 'host'` now means "host and moderators". The enum values are unchanged so stored rooms and the shared schema stay compatible; only the label changed to "Host & moderators".
- Chat name colours: host gold (`text-yellow`), moderator silver (`text-subtext1`), everyone else mauve. The colour is resolved from the live member list, so a message from someone who already left falls back to mauve. Own messages keep no name line, per SPEC 8.2.
- Copy link falls back to a hidden `<textarea>` + `document.execCommand('copy')` when `navigator.clipboard` is missing or rejects — which is what happens in an embedded browser over plain http. Failure now toasts `toasts.copyFailed` instead of the misleading `errors.INTERNAL`.

## Member moderation (2026-11-08, requested by the owner)

- The two hover icon buttons on a member row became one three-dot popover (`MemberMenu.tsx`) holding timer control, make host, mute, kick and ban. It is positioned `fixed` against the trigger, because the members list scrolls and would clip an absolutely positioned menu; it closes on Escape, outside mousedown, scroll or resize.
- Role changes and removals go through `ConfirmDialog` first — the owner asked for a confirmation on role changes, and a kick/ban cannot be undone from the row either. Mute/unmute applies immediately since one more click reverses it.
- **Mute.** `Member.isMuted` is presence state like `isModerator`: host-only toggle, checked in `sendChat` (ack `MUTED`) and in `setTyping` (dropped silently, so no indicator is broadcast). It is not persisted, so a member who drops past the grace window comes back un-muted.
- **Kick and ban share one mechanism**: a `RoomBlock` row keyed by `(roomId, userId)` with a nullable `expiresAt`. A kick writes `now + KICK_COOLDOWN_MS` (15 min) and lapses on its own; a ban writes null and lasts until the host lifts it. Only the public `userId` is stored — `clientId` is a secret per SPEC 9.
- The block is checked at the top of `room:join`, before the password and capacity checks, so a removed person cannot get back in under a new nickname. Expired kicks are pruned lazily when that id is next looked at, so the store needs no timer of its own.
- A host-ordered removal emits `room:kicked {userId, reason}` instead of `member:left`. That is what lets the removed person's own tab clear its stored session and show the "you were removed" screen rather than auto-rejoining in a loop.
- Neither the host nor an unknown/offline id is a legal target (`INVALID_INPUT`), and only the host may moderate (`FORBIDDEN`), so a guest can never kick the host to take the room — auto-transfer already covers the host leaving.
- **Blocked list.** `room:getBlocks` (host-only) returns who is kept out with the nickname they had at removal time, so the list is readable; `member:unban` lifts a block early and the row disappears.

## UI readjustments (2026-11-09, requested by the owner)

- **Invisible card titles.** `--color-base` is a theme colour, so under Tailwind v4 `text-base` resolves to *colour* `base` (the page background), never the 1 rem font size — `Home.tsx` was painting "Create a room"/"Join a room" in the background colour. Card titles now use `text-[1rem] text-text`. Where the colour really is wanted (`Button`, the chat send icon) `text-base` stays. Note `text-text` and `text-sm` are unaffected: only `base` collides with a size name.
- Placeholder text moved from `overlay0` to `subtext0` in every input (2.1:1 → 4.1:1 on Latte, 3.6:1 → 7.9:1 on Mocha).
- **Two theme modes, system default.** `ThemePref` keeps `'system'`, but only as the "never chosen yet" value: the inline script and `resolveFlavor` still follow `prefers-color-scheme`, and the first click pins the choice to `light`/`dark`. `setTheme` now takes `Exclude<ThemePref, 'system'>`, so nothing can put it back programmatically; `cycleTheme` and the `theme.system` label are gone, and the toggle shows the flavour you are *looking at*, not the stored pref.
- **Font.** The whole UI is JetBrains Mono at the owner's request. `--app-font` lists `JetBrainsMono Nerd Font` (and `… Nerd Font Mono`) first so a locally installed patched variant — with its icon glyphs — beats the bundled `@fontsource-variable/jetbrains-mono` webfont, which in turn covers visitors who have nothing installed. Both `--font-sans` and `--font-mono` point at `--app-font`, and `body` uses that variable directly instead of `--font-sans`, since `@theme inline` is free to drop a theme variable nothing else references.
