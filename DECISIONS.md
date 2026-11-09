# Design notes

Why the code is shaped the way it is. One line per decision, grouped by area.

## Server, storage, protocol

- The meta route reports `memberCount` from the live room runtime and `0` when nothing is loaded: membership is not persisted, so any other number would be a guess.
- Unknown REST routes answer `404 { "error": "INVALID_INPUT" }` — `ErrorCode` has no generic NOT_FOUND entry and inventing one for a typo'd path is not worth a new code.
- Body parse failures (malformed JSON, oversized body) map to `400 INVALID_INPUT`, not `500`. A client that sends junk is not a server error.
- New members start on the first entry of `STATUSES`, which is `focusing`, so nobody has to declare themselves before the room makes sense.
- `timer:reset` acks and broadcasts even when the timer was already reset. A no-op that stays silent leaves two clients disagreeing about the version number.
- Boot recovery applies `complete()` at most once per room; with `autoStart` the next phase is then scheduled normally.
- `MAX_MEMBERS` is validated with `.max(30)`, so the cap cannot be quietly raised through the environment.
- The password failure limiter is a sliding-window counter (5 failures/min per IP+room) rather than a token bucket, because the rule is "5 failures per minute" and a bucket would allow a burst at the start of each window.
- `room:join` with a clientId that is already in the room refreshes the nickname (sanitized, de-duplicated) but keeps the original `joinedAt`, so a reload is not a new member.
- Prisma message pruning runs on an in-process counter. The server is single-instance by design, so a scheduled job would be extra moving parts for nothing.
- `dev:memory` passes `--memory` as an argv flag read in `config.ts` instead of using `cross-env`, which this workspace avoids.
- Root `postinstall` runs `prisma generate`. npm's allowScripts policy skips Prisma's own postinstall, and without a generated client `npm run typecheck` fails on a clean clone.
- The Docker runtime image keeps devDependencies because its CMD runs `npx prisma db push` and the Prisma CLI is a dev dependency. The image build itself was never run here; `docker compose config` is what validates `docker-compose.yml`.

## Timer

- The timer is a state machine in `shared` and the server clock is the only one that moves it. Clients render a versioned snapshot; a client that computes its own phase boundary would drift from the room's.
- Changing `focusMin` in settings can end a running phase but never a session — that distinction lives in `focusEndReason()`, where only `complete`, `skip` and `reset` close a session.
- Preset matching is pure (`client/src/lib/timerPresets.ts`, `matchPreset(values) → id | 'custom'`). `PresetValues` types only the four numbers a preset owns, so `autoStart` and `timerControl` can never make a room "Custom".
- Clicking a preset chip edits the draft only; applying stays the existing Save path. One write, one permission check, one broadcast.
- The "Custom" chip is a `<span>`, not a button. Clicking it would do nothing, and an inert control reads as a bug.
- Two label dictionaries rather than one: `settings.presets.*` carry the ratio ("Deep Focus 50/10") because the chip is where you pick a shape before touching the inputs, and `timer.preset.*` hold the bare name ("Deep Focus") because the summary line already prints the numbers.
- The summary line renders for the host too. The preset name is useful information for whoever is looking at the room.
- `timerStyle` (ring or bar) is a device preference, never room state: two people in one room are allowed to disagree about how it looks.

## Roles and moderation

- The moderator tier is one level below the host and only grants timer control (`start`/`pause`/`reset`/`skip`). Settings, roles and host transfer stay with a single host so that "who owns this room" is never ambiguous.
- Becoming host — by transfer or automatically when the host leaves — clears `isModerator`, so no member holds both roles.
- Promotion is host-only, cannot target the host or an unknown/offline id, and lives in `Room.modClientIds` so it survives both a reconnect and a restart.
- `Member.role` (`host` / `mod` / `member`) is derived server-side in `toMember` and re-derived by the client on `room:hostChanged`. One helper, `canControl(clientId)`, backs every privileged action, so the client's idea of who is in charge and the server's cannot diverge.
- `settings.timerControl: 'host'` means "host and moderators". The enum value is unchanged — only the label — so stored rooms and the shared schema stay compatible.
- A member row has one three-dot popover (`MemberMenu`) rather than a row of hover icons: five actions do not fit in a row, and a `role="menu"` is what keyboard users expect. It is positioned `fixed` against the trigger because the member list scrolls and would clip an absolutely positioned menu; it closes on Escape, outside mousedown, scroll or resize.
- Role changes and removals pass through `ConfirmDialog` first; mute/unmute applies immediately, because one more click reverses it.
- `isMuted` is presence state, like the moderator flag: host-only, checked in `sendChat` (ack `MUTED`) and in `setTyping` (dropped silently, so no indicator is broadcast). Someone who drops past the grace window comes back un-muted.
- Kick and ban share one mechanism: a `RoomBlock` row keyed by `(roomId, userId)` with a nullable `expiresAt`. A kick writes `now + KICK_COOLDOWN_MS` and lapses on its own; a ban writes null and lasts until the host lifts it. Only the hashed public `userId` is stored — `clientId` is a secret.
- The block is checked at the top of `room:join`, before the password and capacity checks, so a removed person cannot walk back in under a new nickname. Expired kicks are pruned lazily when that id is next looked at, which saves the store a timer of its own.
- A host-ordered removal emits `room:kicked {userId, reason}` instead of `member:left`, so the removed person's own tab can clear its stored session and show the "you were removed" screen rather than auto-rejoining in a loop.
- A guest can never kick the host (`FORBIDDEN` on non-host callers, `INVALID_INPUT` on the host as a target). Auto-transfer already covers the host leaving.
- `room:getBlocks` (host-only) returns the nickname each blocked person had at removal time, because an id alone is unreadable; `member:unban` lifts a block early.

## Chat

- System lines are stored as translation keys plus params and translated at render, so switching language retranslates the visible history instead of leaving frozen English in a room that is now speaking Indonesian.
- Names are coloured by role: host gold, moderator silver, everyone else mauve. The colour resolves from the live member list, so a message from someone who already left falls back to mauve.
- Typing indicators expire locally after 3 s, so a lost `chat:typing false` cannot leave a stuck indicator forever.
- Client acks time out after 10 s and report `INTERNAL`, so a dropped ack cannot leave the UI waiting.
- `roomStore.timerState` ignores an event whose `version` is older than the current one — out-of-order delivery is normal on a flaky connection.

## Interface

- `--color-base` is a theme colour, so under Tailwind v4 `text-base` resolves to *colour* `base` (the page background) and never the 1 rem font size. Card titles use `text-[1rem] text-text`; `text-base` stays only where the colour is genuinely wanted. `text-text` and `text-sm` are unaffected — only `base` collides with a size name.
- Placeholder text sits on `subtext0`, not `overlay0`: 4.1:1 against the Latte background instead of 2.1:1, 7.9:1 instead of 3.6:1 on Mocha.
- `ThemePref` keeps `'system'`, but only as the "never chosen yet" value: the theme follows `prefers-color-scheme` until the toggle is used, and `setTheme` takes `Exclude<ThemePref, 'system'>` so nothing can put it back programmatically. The toggle shows the flavour you are looking at, not the stored pref.
- The whole UI is JetBrains Mono. `--app-font` lists the locally installed Nerd Font variants first so their icon glyphs win, then the bundled webfont, then the system fallback.
- Copy link falls back to a hidden `<textarea>` + `document.execCommand('copy')` when `navigator.clipboard` is missing or rejects, which is what happens in an embedded browser over plain http. Failure toasts `toasts.copyFailed` instead of the misleading `errors.INTERNAL`.
- `Dialog.onClose` is optional and doubles as the dismissability switch: no handler means no close button, no Escape, no backdrop click. Joining is a question the user has to answer, so that dialog has nothing to dismiss.
- Dialog focus: the first focusable that is not the close button gets focus (a form lands in its first field, a confirmation on Cancel), Tab wraps inside, Escape closes, focus returns to whatever opened it. The effect keys on `open` alone and reads the callback through a ref, because callers pass inline arrows and re-running on every render would pull the caret out of a field mid-keystroke. A dialog stacked on another returns early when focus is not in its own panel, so the top one owns the keyboard.
- Dialog panels scroll (`max-h-full overflow-y-auto overscroll-contain`): at 360×640 the focus summary with history is taller than the screen and its Close button was unreachable.
- Popovers close on scroll only when the event comes from outside the panel. Closing on any capture-phase scroll made everything below the first screenful of the sound popover unusable.
- `MemberMenu` behaves like the `role="menu"` it claims: first item focused on open, Up/Down/Home/End move, Escape and Tab close and return focus to the trigger. Choosing an item focuses the trigger *before* running the action, so a confirmation dialog has a live element to return focus to instead of a menu row that is about to unmount.
- At 360 px the header's code / copy-link / strict-focus row wraps rather than overflowing with Indonesian labels, header gaps tighten below `sm`, and the confirmation button row wraps.
- The middle column's cards are content-sized (`cardPanel`). They were `flex-1` inside a column that is itself `overflow-y-auto`, so the timer got squeezed to exactly the viewport height, overflowed it by a few pixels, and left a scrollbar with almost nothing to move.

## Sound

- Alerts are synthesised from a note table (`client/src/lib/alertSounds.ts`), not audio files: nothing to download, nothing to store, no bandwidth, and the server never learns what you chose.
- Five sounds, exactly. The earlier ten-voice picker was replaced rather than extended because two sound dialogs in one app is one too many; `lib/soundPresets.ts`, `lib/sound.ts` and `components/SoundPicker.tsx` are gone.
- That loss is softened by a migration: `migratePrefs` maps each stored legacy name onto the closest surviving sound (`gong → bell`, `arpeggio → chime`, `beep`/`sweep → pulse`, `pluck → marimba`, `classic → chime`), `PREFS_STORAGE_VERSION` is 2, an explicit stored `alertSound` always wins, and an unrecognisable name falls back to the default instead of throwing.
- The table is data plus scheduling only, which makes it testable without WebAudio: five ids, positive frequencies, ascending non-negative onsets, durations ≤ 2 s, relative gains in (0, 1], both variants present and different for every sound that makes noise, and `master × sound gain × loudest note ≤ 1` so nothing can clip at volume 100.
- `none` carries `wave: null` and `playAlert` returns before touching `getAudioContext()`, so the silent option never opens a context.
- Square and sawtooth voices are written quieter than sine ones, because equal-gain oscillators sum and clip.
- Preview is one button per sound rather than one for the selected row, so you can audition a sound before committing to it. Choosing a row previews it too, which is how the old picker worked.
- `lib/audio.ts` owns the single lazily created `AudioContext`, the first-gesture resume listeners, and one `GainNode` bus per feature (`alerts`, `ambient`). That is what lets the ambient engine and the alert volume slider set their own levels without touching each other.
- Ambient noise and alert chimes share no code path: generation and looping are pure (`lib/noise.ts`), wiring is not (`lib/ambient.ts`). Every property of the generators — lengths, values inside [-1,1] after `normalize`, determinism from a seeded rng, |mean| < 0.05 — is asserted on plain arrays, because this workspace has no jsdom.
- `loopBuffer(samples, fade)` folds the tail over the head instead of trusting a zero-value boundary. Real noise does not end at zero, so a plain loop point is an audible click.
- The pink-noise mean test uses a 262 144-sample run rather than the 4096 the other properties use: Kellet's filter is a set of decaying accumulators and still carries its start-up offset over a few thousand samples. Brown noise is left out of that assertion for the opposite reason — a random walk genuinely wanders, and the lowpass and gain stage are what keep it usable.
- Buffers are 6 s, stereo, with an independent rng run per channel — the same noise in both ears is mono with extra steps — and they are cached per `${type}@${sampleRate}`, so returning to a colour costs no CPU and cannot re-trigger a start transient.
- `startAmbient(type, volume)` is also the volume setter: if the type is already playing it delegates to `setAmbientVolume` and returns. Rebuilding the source to move a slider would click and reset the loop phase.
- Autoplay needed no new machinery. The shared context already installs first-gesture resume listeners and `startAmbient` calls `resumeAudio()` for the case where a suspended context is handed a pref that says "play"; picking a sound from the popover *is* the gesture.
- Ambient is strictly local: no socket event, no server field, no room state. The only thing another person can infer is that you have a voice running, from the tint on the header trigger.
- `ambientOnlyWhileFocus` reads `timer.status === 'running' && timer.phase === 'focus'` from the room store, so the fade follows the server-authoritative timer — including a host starting or stopping the room — without dedicated plumbing.
- Rain and waves are an oscillator driving a depth gain, so the swell is not faked by re-scheduling levels from JS.
- `useAmbient` is mounted on both `RoomPage` and `Home`, because both host the popover; a control with nowhere to route reads as broken. Unmounting stops it.

## Focus tracking

- The accounting is pure state transitions on one `FocusTrackerState` object in `server/src/focus/focusTracker.ts`, so "only a running focus phase counts", "a pause freezes but never ends" and "an away interval spanning a phase boundary counts once" are testable without a socket, a room or a clock. `RoomRuntime` only decides *when* to call it and what to emit.
- The server measures everything. The client sends exactly one boolean (`{ away }`) and never a duration, a timestamp, a tab or an app; `awaySince`, `awayCount` and `awayMs` are computed from the server's own clock. That is the whole privacy surface of the feature.
- `setTracking` / `setAway` / `onRoomActiveChange` return the same object reference when nothing changed, which is how `RoomRuntime` decides whether a broadcast is warranted. Events fire on transitions only, so a room of 30 tracked members stays silent while everyone is present.
- `awaySince` is part of the projection, so a member who is away when a phase ends gets one more update that closes the live counter. Without it the away chip would keep counting up through the break, which is a lie.
- Every timer write goes through `syncFocus(before, reason)` — `timerAction`, `updateSettings` and `onPhaseEnd` — rather than each path remembering to do it.
- `resetSession` runs for untracked members too. Opting out leaves the counters alone until the session ends, so the chip does not vanish mid-break, but that stored time must not leak into the next session.
- `focus:summary` is emitted only when at least one tracked member measured `activeMs > 0`. A room where nobody opted in gets nothing, so no dialog appears to explain that there is nothing to report.
- `focus:state` is limited to 10 reports per 10 s per socket and silently dropped past that. An error here would be a client bug the user can neither see nor fix, and an away flag is not worth arguing about. `setFocusAway` from someone who never opted in is `FORBIDDEN`, because honouring it would let a client start a timer it did not agree to.
- `useFocusTracking` listens to `document.visibilityState` only. Window blur/focus was rejected: the music iframe and any DevTools or dialog interaction trip it, and this measures the tab, not the window. The 3 s debounce is client-side and re-checked when it fires, so a fast alt-tab reports nothing at all.
- Opt-in is re-sent on every connect rather than trusted to the stored pref, and a tab that is hidden at that moment replays its state immediately — otherwise a background reload would show "present" forever.
- Opting out only announces itself while still connected. Leaving the room also flips the pref to false, and broadcasting that would fire a `FORBIDDEN` toast on the way out for no reason.
- Consent is asked once per room code and only when the room has `strictFocus` on, because that is the case where the absence of tracking is visible to others. Declining is remembered locally, not by the server.
- The pref has a visible switch in the sound and display popover. Without it, someone who declined the consent dialog could only change their mind by clearing storage.
- `sortSummaries` lives in `lib/focusHistory.ts`, not in the dialog that uses it: ranking ("best focus first, then fewest away intervals, then name") is a rule worth pinning down in a test. History is 10 entries in localStorage, 5 shown, parsed defensively — that file is user-editable and the dialog would otherwise render `NaN%`.
- `formatSpent` sits next to `formatRemaining` rather than folding the two into one flagged formatter: the away chip wants `1m 20s`, the summary columns want `m:ss`, and one function with a switch would have made both call sites harder to read.
- The away chip's live counter is its own component, so the 1 s tick re-renders the rows that display it instead of the whole member list.

## Music

- Media state belongs to `mediaMachine` and lives on `RoomRuntime` next to the timer, so every position the room sees comes off the server clock. The client never reports where it is; `RoomSnapshot.media` and `media:state` are the only sources of truth.
- All six mutations funnel through one private `commitMedia(next, reason, by)`. Because the machine returns the same object for a no-op, that one place can say "nothing changed: no write, no broadcast, no version bump", so a redundant `media:play` costs the room nothing.
- Persistence is decided by comparing `videoId`/`loop` before and after rather than passing a boolean from every call site. A pause or a seek moves no disk write, so holding a room's music cannot become a write storm.
- The playhead is deliberately not persisted: a room reloaded from the store comes back `{ status: 'paused', anchorPositionMs: 0 }`, so the video is still there but nobody gets audio until a controller presses play. `setBy` is not persisted either, which is why the card says "Added by someone who has left" when the credit matches nobody present.
- The media limiter is keyed by `clientId`, not the socket id, so a reload cannot refill the bucket. Unlike `focus:state`, exceeding it raises `RATE_LIMITED` — those calls come from a visible button press, which deserves an answer.
- Emptying the room pauses the media inside the same `members.size === 0` block that pauses the timer. It is a plain field write, not a timer action, so it neither bumps the timer version nor emits `timer:state`.
- The engine (`lib/mediaSync.ts`) is pure and takes an injected player, clock and scheduler; `hooks/useMediaSync.ts` is the only file that touches React and the DOM. Without jsdom in the client workspace, that split is what makes the load/seek/play ordering, the buffering guard, the live guard and the loop wrap testable at all.
- Drift correction is 2 s checked every 5 s. It reconciles playback *state* as well as position: while the room plays and this device listens, a player reporting `paused` is asked to play; while the room is paused, a player that started on its own is stopped. The room's status is the only source of truth, so any silence that outlives one drift check gets noticed.
- Only videos whose embed permission allows it can play, and the id is validated before an iframe is ever built from it — a raw URL never reaches the player. The video title is read locally and sent nowhere.
- The player is created once for the first video and survives everything after it, including a clear, and the card keeps its container mounted for the same reason: rebuilding a `YT.Player` per song would download nothing new and leak an iframe per change. Construction is one shared promise per box, because swapping videos while the API script is in flight could call `new YT.Player` twice on one element — the second call gets a div the first already replaced.
- The API replaces the element it is handed, so the node given to it is created imperatively inside a React-owned wrapper. Handing React's own element over is how the page goes blank.
- A player still loading when the card unmounts is destroyed on arrival, and the container is cleared with it: the previous player could not be re-aimed at the next box, so a tab switch away and back would have handed commands to a destroyed player.
- The player is never built into a zero-size box. `useMediaSync` watches its container with a `ResizeObserver` and waits for a real width and height, which on a phone means the Music tab is open or the room started playing while this device listens. Where `ResizeObserver` does not exist, it builds immediately.
- The container only exists once there is a video, so the observer keys on `media?.videoId` rather than the snapshot's presence; the looser key left `laidOut` false forever in a room that started with nothing playing.
- The embed is drawn small on purpose. An iframe player picks its stream from the size it renders at, so shrinking the picture is the only bandwidth lever the IFrame API effectively gives a site like this — `setPlaybackQuality` is deprecated and ignored by the current HTML5 player, and there is no audio-only mode. Sound is what the room came for.
- The record *is* the player. `.vinyl-embed` clips a circle and `.vinyl-frame` puts the 16:9 embed inside it at its natural aspect, as tall as the record and centred, so the disc shows the middle of the frame — which is where a thumbnail keeps its subject. `.vinyl` is transparent; its `::before` carries the grooves and the light wedge over the outer ring only, held back from the middle by a radial mask that rotation cannot disturb, and `::after` stays as the label for people with no button.
- The picture turns with the record. The spin sits on the clip itself rather than on a new wrapper: rotating a circle is invisible, and the 16:9 box inside is exactly as tall as the record, so the crop can never slip outside it at any angle. Both layers share one keyframe and one `data-spin` flag, so grooves and picture cannot drift out of step, and reduced motion stops them together. The record turns only while this device is actually making sound.
- The embed gets `pointer-events: none` from its wrapper, which the injected iframe inherits, because two sets of controls on one video were not merely redundant — pausing through YouTube's own chrome left the room counting and the picture moving with no sound. Play/pause is the record's label, loop, clear, listening and mute are icons with `title`, `aria-label` and `aria-pressed`, and the card stopped carrying a paragraph of explanations for controls that are obvious.
- Ending is local: `tick()` notices the position passing the duration and stops, `replay()` restarts from zero, and neither sends anything, so one person finishing a video cannot stop the room. The end check needs `!loop`, because a looping room's raw position runs past the duration on purpose and the effective position wraps it.
- The seek bar commits on pointer-up and key-up instead of on every input event. Dragging across a three-minute video would otherwise fire thirty seeks, which the 6-per-10-s limiter would refuse mid-drag.
- `muted` is component state, deliberately not a pref: a mute that survives a reload with the volume at 60 is a card that will not make sound for reasons nobody can see.
- Where "always visible" and a mobile tab bar genuinely conflict, sound decides: the Music panel is hidden by the tab switch only while nothing is coming out of it. While it is audible it stays on screen whatever tab is open, and the tab bar marks it with a dot.
- The autoplay gate is a watchdog armed only when this client *should* be making sound, and `joinTheMusic()` is the only thing that answers it. It sits **below** the frame rather than on top of it — a translucent layer over a video is less discoverable than a banner.
- No Content-Security-Policy was added: the client host has none and the API server never serves the SPA (helmet's CSP covers JSON responses only), where adding one would risk breaking the YouTube embed for no threat model that needs it here.

## Testing and verification

- There is no jsdom and no component test environment in the client workspace, so client tests only cover DOM-free modules. Anything that only shows up in a browser — the keyboard and focus passes, the 360 px layout, the themes, the record's rotation — is verified by hand against the two-tab recipe in `README.md`, not claimed as automated.
- `__tests__/testServer.ts` creates rooms straight through the store instead of POSTing `/api/rooms`. The media and focus suites pushed one file past the 20-creates-per-minute-per-IP limit, and a fixture should not be exercising a limiter that another suite tests on purpose; REST creation stays covered by `rest.test.ts`.
- Every payload schema is `.strict()` and bounded by `LIMITS` / `MEDIA.URL_MAX` / `MAX_SEEK_MS` — the seek cap is a named constant in `constants.ts` rather than a magic number inside the schema so a test can assert both bounds — and every handler delegates to a `RoomRuntime` method that checks membership and permission before it touches state. `requireMediaControl` is the only door to a media write and runs membership → `canControl` → the per-`clientId` limiter, so someone without control is refused before a token is spent.
- `MediaPlayer` carries one method the adapter's first sketch omitted: `getTitle()`. The title must be readable locally and sent nowhere, and the only alternative was reaching past the adapter into `window.YT`, which is exactly the coupling the interface exists to prevent.
