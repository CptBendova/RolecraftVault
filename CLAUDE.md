# Rolecraft Vault — project notes

## Public Rolecraft transition (owner instruction, 27 September 2026)

The owner authorized publishing the former private Chat edition as the public
Rolecraft app on `CptBendova/RolecraftVault` master. Historical notes below
describe earlier private development and do not override that decision. Keep
existing GitHub history, installed data identities, encrypted user data and
release signing identities intact. Public source and release artifacts must be
reviewed so local vaults, exports, credentials and signing material stay local.

## Character page and gallery grid polish (1.341)

Owner request: make the character page and gallery grid modern and easy to use.
Gallery tiles (`.cpage-aside .tile`, `.imggrid .tile`) keep object-fit: contain
(whole pictures; cropping portrait art was a regression in 1.234 and
test-grid-view requires it) but now sit in a visible `--panel` frame, so mixed
shapes read as an even grid. Grid captions are a solid dark strip, not a fade
(the fade smudged over Light's pale frame). CloseX's icon is always light on its
fixed dark scrim. Character facts render as a `dl.cpage-facts` of labelled cards;
`.cpage-actions` becomes a two-column grid on phones.

On phones the grid toolbar filled the first screen. Without a selection, CSS
hides the selection-only controls (they stay in the DOM with their disabled
rules; tests read them) and makes the variant/album filter rows single
swipeable rows. `.has-selection` on the grid view restores them, and floats the
bulk actions above the bottom navigation because the phone header scrolls away.

## Unstuck sync overlay and longer Gemini voices (1.340)

1.338's quiet deferral exposed an old gap: a pass interrupted mid-apply (epoch
changed, e.g. Chat opened, while \`onApplied\` was pending) skipped its catch
report, and the next tick deferred silently while the user typed, so the
blocking "applying" overlay stayed forever. The tick's \`finally\` now replaces
any leftover "applying" status, and \`commitPending\` reports "busy" when editing
starts mid-pass. \`SyncSavingOverlay\` also turns into a non-blocking banner after
20 s without a new status, so the app can never freeze behind it. Keep both.

Gemini TTS returns 24 kHz 16-bit mono PCM (48,000 bytes/s). The old 8 MiB cap
stopped at about 2m55s, short of the 4,000-character reply limit, and failed
as "Voice response is too large". Windows, Android and Chat's player now share
a 24 MiB cap (about 4m20s). Chat voice errors name the service that failed.

Pictures as JPG: Photo info saves a JPG original byte for byte (it used to say
"already JPG" and offer nothing) and converts other formats with photoJpegCopy.
Settings > Character portraits as JPG exports every character portrait plus
each variant's own profileImg (rule 2), named after the character and variant,
as files or one zip, via photoJpegBytes. Originals are never rewritten.
test-photo-info.js covers both.

## ElevenLabs character voices (1.339)

Owner request (29 September 2026): ElevenLabs as a second voice provider,
chosen per character, with a model setting and both tap-to-play and auto-read.
Characters and variants carry text-only `ttsProvider` ("" inherits,
"openrouter" or "elevenlabs"), `elevenVoiceId` and `elevenVoiceName` in
VARIANT_FIELDS and `resolveCharacter`. The per-device `ui:chat-voice` pref
(encrypted, never synced) holds model (`eleven_v4` / `eleven_v4_turbo`),
playback ("tap" / "auto"), `zeroRetention` and `allowRetention`.

Native only: app/elevenlabs.js (safeStorage key file `elevenlabs-key.bin`) and
Android ElevenLabsPlugin + ElevenLabsCodec (Keystore). Requests are
POST /v1/text-to-speech/{voice}?output_format=mp3_44100_128 and GET /v2/voices,
header `xi-api-key`, no redirects, MP3 validated, 16 MiB/4,000-character caps.
The newest speech request abandons an older one; lock, background, Stop and
closing Chat cancel. The voice list and remote preview URLs never load by
themselves. ElevenLabs zero retention (`enable_logging=false`) is Enterprise
only, so the owner chose an explicit per-device "Allow ElevenLabs to keep voice
requests" switch: `voicePlan` refuses ElevenLabs in a story that requires ZDR
unless that switch or Enterprise zero retention is on. Never relax it silently.

Auto-read starts from `finishRoleplayReply` after the reply's save commits,
only for replies generated on this device while that story is on screen, and
queues them in order. Tapping any voice button stops playback and clears the
queue. The playback code uses only refs and setters and adds no ChatApp hooks
(the lock/visibility handlers keep the first render's `stopVoice`).
`VoiceSettings` is its own component for the same reason. ElevenLabs keys are
not part of credential sharing. Tests: test-elevenlabs-native.js,
test-elevenlabs-java.js, test-chat-voice-plan.js and test-chat-elevenlabs-ui.js.

## Sync on demand by default (1.338)

Owner request (28 September 2026): sync must run only when the user asks and
must never interrupt Chat or the library. The app passes `defaultManual: true`
to the engine: a device with no saved `ui:sync-manual-refresh` is on demand;
an explicit "0" (automatic) or "1" is always respected. On-demand devices still
passively publish their own saved chats (1.319) but never poll peers, import,
reload or show the overlay until Sync now (library pill, Settings > Sync, or
Chat's Refresh paired chats). Library edits reach peers on that device's own
Sync now pass. An automatic peer of an on-demand device settles on "waiting to
confirm", not Up to date, because the partner confirms only when asked.

Interruption sources removed, keep them removed:
- The full-screen "Saving verified synced changes" overlay shows only for
  `applying` reports that write library records. Chat-only writes (`chatOnly`)
  and redraw-only retries of an already committed reload (`reloadOnly`) never
  show it. Every `applying` report sets both flags explicitly, because
  `report()` merges the previous status and would otherwise inherit them.
- Chats arriving through the library lane (only `chats:all` + `sync:state`
  written) reload Chat via `onStoriesApplied`, not the whole library; a failed
  one sets `storiesNeedReload`, which the full lane now also retries.
- A refused UI reload retries with exponential back-off (to 60 s) instead of
  every pass. Clock-only story merges do not report `applying`.
- `#rcv-chat-root` is never made `inert` while Chat is open: Chromium moves
  focus out of an inert subtree, closing the Android keyboard on every apply.
- `report()` drops notifications identical to the current status (lastSynced
  alone refreshes at most every 30 s); background rechecks from a settled phase
  do not flash Checking. Each notification re-renders the whole library and Chat.
- Unchanged polls back off to 4x the interval; wakes, local saves and Sync now
  reset it. `storiesQuiet` (`window.RolecraftChatSyncQuiet`: streaming or a
  keystroke in the last 1.5 s) postpones unrequested Chat-lane passes.
- `lastChatAt` caches per immutable messages array; the story list re-renders
  with every stream paint. Identical draft-handoff peer lists keep their state.
`test-sync-on-demand.js` covers these over the real encrypted transport.

## OpenRouter latest-model aliases (private 1.336)

OpenRouter lists latest-family aliases such as `~deepseek/deepseek-pro-latest`
with one leading tilde in the actual model ID. Chat can select them from the
provider catalog; every native request, manual model control and synced
memory/coordinator model must accept that exact safe prefix. Keep rejecting
embedded, repeated or trailing tildes. Android's former rejection said "The
chat request is invalid" before a provider call. `test-private-chat.js` and
`test-chat-native-start-rejection.js` cover the actual Windows and Android
request validators plus sync model fields.

## Bulk Chat sync conflict cleanup (private 1.335)

The Sync conflict review can move every live conflict copy, including copies
on later review pages, to Recently deleted in one confirmed action. Capture
each copy's revision when the user confirms; after queued saves finish, require
the exact set and all revisions to remain current. Use one compare-and-swap
Chat save so sync stamps recoverable tombstones together. Keep originals and
unrelated stories untouched. A failed durable write must expose Retry save,
using the existing merge-aware recovery rather than repeating blind deletes.
`test-chat-conflict-bulk-ui.js` covers pagination, a queued draft save, stale
revisions, retry recovery, tombstones and phone layout.

## Chat conflict copies and review (private 1.334)

Full-device sync can join two or more simultaneous append-only conversation
paths only when each revision proves the same retained message base and every
shared message is byte-for-byte unchanged. Identical message trees with only
revision/timestamp differences also join; changed notes, memory, scene state,
deleted turns and rewritten messages still keep recoverable copies. New copies
of an existing conflict copy use the original conversation identity and one
display suffix, not a nested chain. Do not automatically delete older copies.
`test-chat-conflict-proliferation.js` covers three devices, unsafe edits, stale
peer resurrection and both conflict-copy formats.

The Chat conflict review pages eight copies and compares only the visible
transcripts. Its delete action waits for queued local saves, then rechecks the
selected revision before writing a recoverable tombstone. A failed save must
keep the copy available for Retry save. `test-chat-conflict-review-ui.js`
covers a held draft save, many long copies and phone-sized page controls.

## Device sync reachability and the Sync settings section (private 1.333)

Both transports keep one listening port for the life of a pairing (Node
`cfg.listenPort`, Android prefs `listenPort`), falling back to a random port
only if it is taken. Every lock, Android app switch and restart used to rebind
to a new random port and clear the peer map, leaving UDP discovery (often
blocked) as the only way back. Verified endpoints persist in the sealed pairing
config (`endpoints`, newest 32) and are restored on resume as "known"
candidates. Evidence has provenance: `direct` (authenticated inbound request
after the nonce check, UDP, verified index reply) always wins; `gossip` carries
the sender's `age` and never replaces an endpoint verified in the last five
minutes; `known` (persisted or invitation seed) never replaces anything. The
seed is only a hint for a device never reached. Discover returns fresh peers
plus known candidates; offline ones back off in the engine as before.

The Windows sync listener binds 0.0.0.0 and refuses requests whose local or
remote address is not private; outgoing requests pick the source address on
the peer's subnet (or let the OS route). Adapter ranking puts Wi-Fi/Ethernet
first and Hyper-V/WSL/VMware/VirtualBox/Docker/VPN last; broadcasts follow each
adapter's netmask. Requests use `agent:false` (a pooled keep-alive socket to a
restarted peer failed with ECONNRESET) and a 3 s connect timeout. Refusals are
empty responses with `X-RCV-Reason` (paused/auth/expired/busy/invalid) and
`X-RCV-Time`; clients name clock skew over 90 s, locked peers, re-paired peers,
closed apps and absent devices. Index replies list `cannotReach` (devices whose
last connection attempt failed at network level in the last three minutes); the
reached side reports `cannotReachMe`, so a one-way Windows firewall is flagged
on the device that can fix it. `diagnose` is read-only (Windows adds the
network category via a fixed PowerShell query). Engine fixes: manual refresh
no longer pauses the listener; draft-lane returns set `manualRequested`; the
publish keep set includes both base and extra images; clocks may carry up to
1,024 entries; conversation joins accept an `originMessages` proof that
survives pure local appends. Tests: `test-vault-sync-reachability.js` (real
sockets, UDP deliberately split), `test-vault-sync-reachability-java.js`
(lifted Android endpoint logic and wording), updated Android rebind/pipeline.

Settings has a sticky header with section chips (`SettingsNav`) built from
`data-settings-section` anchors; every section stays mounted. Order is
Appearance, Security, Updates, Sync, Backup, Help. `window.__rcvSettingsSection`
opens Settings at a section (the sync pill uses "sync"). The SyncPanel strips
Electron's IPC error prefix, shows tone/last synced/per-device state and retry
time, withdraws an expired QR, confirms Leave, and keeps primary, conflict
review and computer reverse-pairing under Advanced (tests click those controls
while the fold is closed; that works). In the unpaired state every control must
stay outside folds. Keep layout-critical inline styles on the camera, selects
and text fields: tests mount the panel outside `.rcv`. `test-settings-sync-ui.js`
covers the chips, sticky header, sync deep link and panel states.

## Chat panels and group chrome (private 1.331)

Settings and the Scene panel use `PanelTabs` with `.rcchat-pane` sections.
Inactive panes stay mounted but `hidden`, so drafts, pending saves and field
IDs keep working; do not unmount them. `setSettings("device")` opens the
Connection pane (sidebar button and missing-key prompts); `setSettings(true)`
opens Story. Keep the modal header row sticky so Close stays reachable. The
group scene summary (`GroupSceneStrip`) renders inside the header, never over
the transcript; guard React number children (`count > 0 &&`, never
`length &&`), which rendered a stray "000". The permanent speaker preflight row
was removed; "Preview what they will see" lives in the speaker picker. The
docked Scene panel needs `#rcv-chat-root .rcchat-modalback.rcchat-docked`
specificity because the base modalback rule appears later in chat.css.
ModalFrame marks explanatory paragraphs of 260+ characters `data-long` (a
three-line, keyboard-expandable preview); notices, errors and previews are
exempt. `scripts/test-chat-panels-ui.js` covers these. Chat saves use
`storage.syncCommit`, not `storage.set`; UI fault-injection tests must intercept
the current path without weakening separate CAS coverage. ScenePanel's own
Retry scene save must call the merge-aware `retrySave` after a failed write,
not call `persist` again (which refuses further saves until recovery). Verify
the requested scene fields are still on the target chat after recovery before
closing the panel; a concurrent alternate-device version may be kept as a
separate conflict copy instead.

## Manual Chat refresh and visible reload acknowledgement (private 1.319)

Manual refresh suppresses peer polling and incoming merges, not passive sharing.
While the vault is open and unlocked, the native `serve` operation keeps its
authenticated LAN listener alive; a durable local Chat save stages and publishes
the latest `stories1` head without fetching peers. The five-second status pulse
renews the native 20-second serving lease. Lock, background without the explicit
service, or app closure still pauses the listener. A receiving device's Refresh
now can therefore fetch the source's latest saved chat even if that source uses
manual mode. Do not let native peer wakes trigger an import in manual mode.

After a sync commit, Chat and library reloads acknowledge only a current saved
read. A busy editor, failed save, lock, in-flight local mutation, damaged vault
load, or reload timeout must reject the acknowledgement so the sync engine can
retry without overwriting edits. A previous render load must not acknowledge a
newer sync checkpoint merely because it finished later.

## Chat reading surface (private 1.316)

Each turn renders through the memoized `ChatMessageRow` from primitive props
plus the stable `rowActions` ref; do not pass freshly built objects or inline
handlers, or typing and stream deltas will re-render every visible turn again.
New ChatApp hooks go after the existing ones (the fake-React performance test
relies on the state order). Reading position: `nearBottom` means "following".
An upward wheel, touch or key gesture, or an upward scroll, stops following at
once; returning within 24px of the end resumes it. Streaming growth while not
following only raises the "New reply" jump control; never scroll the reader.
A ResizeObserver on `.rcchat-transcript` keeps late layout (portraits, fonts)
at the end only while following. Earlier turns auto-load only after a real
gesture; keep the Show earlier button for pointer, keyboard and screen-reader
users and for `.rcchat-messages>button` tests. `content-visibility:auto` is
limited to turns beyond the newest 24 so phone windows and scrollTop-based
reading tests stay exact; it never removes messages from context, search or
sync. Turn menus and the composer status/price popovers must stay above later
turns and the composer: MessageTools marks its article `data-menu`, flips up
near the composer and closes on outside press, Escape and Back. Keep phone
controls at 48px, composer radius 14px (phone) / 20px (desktop), and identical
Quality/Performance geometry. `scripts/test-chat-reading-flow-ui.js` covers
these behaviours.

## Visible Chat sync and automatic paired replies (private 1.313)

The older one-phone Chat link can exchange while Chat is visible when the
newer Automatic device sync group is disabled. It remains bounded and is not a
replacement for the chunked multi-device protocol: tell users to use Settings
> Automatic device sync for larger histories and more than two devices. Reuse
an unchanged snapshot fingerprint rather than sending the whole transcript
through native bridges each poll. Only acknowledge a remote snapshot after
encrypted local persistence succeeds. Keep local edit, scene-draft, reply,
failed-save and lock guards. Enabling group sync may pause, but must not erase,
the saved older one-phone pairing.

Two-character automatic group replies are opt-in per conversation. Start only
for a new user Send with the selected character and one other Present member.
The second paid request reads the first durably saved reply on the same branch.
Never restart a paid request automatically after interruption; use the existing
explicit round review and recovery. The AI group coordinator updates inferred
scene facts separately; manual scene notes remain optional overrides.

## Interrupted group rounds and scene-save failures (private 1.312)

Group reply plans are local recovery markers, not permission to send after a
restart or Chat close. Validate the saved branch, speaker, and last completed
reply before offering an explicit review of the remaining paid requests. A
pending, failed, empty, or changed reply blocks resumption. Dismissing a marker
does not delete any transcript messages. Scene-panel drafts must not report a
successful save until encrypted storage resolves; on failure retain the draft
and allow an explicit retry without losing later typing.

## Chat launcher and group context (private 1.311)

The Chat launcher is rendered by `ChatApp` into the Dashboard or sidebar slot.
State referenced by its effects or render must be declared inside `ChatApp`, not
inside a child panel: a missing binding can crash the renderer before the
launcher appears. Exercise `test-chat-performance.js` and the real 360px/800px
launcher UI test after moving hooks or navigation state.

Group scene text fields now draft locally and flush after an idle pause, on blur
or on panel close. A visible Save control remains while they are unsaved. Their
field-level comparison is anchored to the original branch so an incoming sync
or sibling branch cannot be overwritten by an old editor. Do not add a lock
handler that delays Android's security lock indefinitely; an instant lock or a
failed storage write can still interrupt a pending draft. The user must see a
save failure and keep the editor open if a write fails.

Group lore selection is capped and ranked only after whole-word matching. Keep
the selected speaker's lore scope, persona and chat-attached books, and expose
triggered but skipped entries in the context inspector and review export. Cast
cards show manual presence over AI-inferred presence and label both knowledge
sources; this is a storytelling aid, not a secrecy guarantee because transcript
and cumulative memory remain shared. Branch previews use the branch checkpoint,
never the current leaf's later scene facts.

## Chat context, cost and review controls (private 1.310)

Automatic and rebuild memory can use a per-conversation `memoryModel`, with an
empty choice following the roleplay model. Its request retains the conversation's
zero-retention choice and protected native key; selection never silently changes
the reply model. Keep model catalog limits separate for the worker. Pre-send and
group-round costs are only approximate catalog-based previews, not provider
charges, and memory/coordinator calls may add cost. Unknown pricing must stay
unavailable rather than becoming zero.

Conversation search is local-only over saved message text, including inactive
branches and older messages outside the render window. Jumping to a result must
navigate its branch before revealing and scrolling to the turn. Search must not
change transcript content, compaction, or the roleplay request. The AI scene
review shows its source reply and before/after values; a user may selectively
apply or correct AI-only fields. Current AI fields can be edited without
changing manual scene or per-character notes. Every apply/correction remains
conditional on the current branch and scene; preserve recoverable undo.

Prompt cache measurements use provider-reported read/write tokens from saved
replies on the active path. Missing usage is unknown, not zero, and read share
is not a dollar-savings calculation. Stable directions precede changing scene
facts in the system prompt while the user's priority-1 directions, selected
character, privacy setting and prompt semantics remain unchanged. Do not add
universal provider-specific cache controls or promise a cache hit. Keep the
renderer offline and run focused search, memory, pricing, coordinator and cache
regressions when changing this flow.

## Optional AI group coordinator (private 1.308)

Group chats can opt into an additional OpenRouter chat-completion check. Off is
the default; Suggest stages an inspectable proposal, and Auto applies it.
Automatic checks run on the first reply, on clear scene/cast transitions or a
saved scene event, every third later group reply in the default Balanced mode,
and once after the final reply of a queued round. Per-conversation frequency
can instead be scene events only or every reply. The coordinator model can be
selected separately from the roleplay model; an unset choice follows it.
Analyze now deduplicates an identical scene/model/privacy input unless the
user explicitly chooses Force another paid check. The fixed native
Windows/Android bridge accepts bounded recent turns, cumulative memory excerpt,
AI-tracked scene/cast notes and manual shared scene facts. It uses the protected
inference key and the conversation's existing zero-retention choice. It never
sends `sceneEvents` or user-authored per-speaker `knowledge`, starts another
roleplay reply, edits a transcript or retries a paid request. Lock/background
and closing Chat cancel the local check.

AI output is untrusted and strictly validated. It may be a sparse update or an
empty no-op; the scene field is a concise complete current state when changed,
not a copy of the earlier memory or recent transcript. It writes only `aiSceneLocation`,
`aiSceneState`, `castScene[*].aiPresence`/`aiKnowledge`, and an optional next
speaker drawn from the active cast. The manual scene/location/presence/knowledge
remain separate and authoritative. Branch checkpoints include the AI fields;
sync validates both proposals and CAS-protected undo snapshots. Local extra-call
cost bookkeeping counts repeated attempts, distinguishes unknown provider cost
from zero, and never enters the synced chat record. A result cannot
apply after the leaf, message text, scene or manual notes change. Earlier
branches must never inherit a later AI recap. Keep the renderer offline and
run the focused coordinator/branch tests after changing this flow.

Private 1.315: the coordinator's short JSON response must not share a tiny
completion allowance with a model's hidden reasoning. OpenRouter may return
`finish_reason: length` after spending the allowance on thinking. The native
bridges request low reasoning and a bounded 8,192-token completion ceiling for
this auxiliary check only. Do not change the user's roleplay reasoning choice,
privacy routing, transcript, or automatically retry a paid analysis. Reject a
truncated result without applying scene notes.
Record the cost of failed requests, but do not stamp their scene fingerprint as
analyzed. This keeps an explicit retry available after an output-limit failure
without triggering an automatic paid retry. Older 1.314 failure ledgers may
already have the fingerprint and require the user's one-time Force action.

## Group scene and cast controls (private 1.305)

The same saved conversation and message ancestry serve every speaker. `participants`
contains identity only, `activeSpeakerKey` names the next speaker, and each saved
assistant turn owns its own `speaker`. The new cast picker uses `add-only` to add
without silently switching. The `@name` picker now offers distinct actions:
Address keeps the name in the draft and adds an absent character without changing
the next speaker; Reply as selects that character and removes the typed shortcut.
Enter defaults to Address. Removing a participant retains their earlier turns
and branches. The new-chat wizard can start with a group, but does not insert a
solo greeting for that group.

Group requests include only the selected speaker's full character directions.
Other active members contribute bounded identity reference; they must not carry
another actor's system instructions. `sceneState` is shared current-scene text.
`castScene` holds bounded presence and per-speaker knowledge notes; presence is
not proof of what someone witnessed, and only the selected speaker's knowledge
note is sent in that reply. Both fields validate in `chat-sync-core.js` before
sync/restore. This is a storytelling aid, not a secrecy barrier: old transcript
and cumulative memory are shared with every speaker. Never claim it hides a
fact that has already entered those shared fields.

Manual Send remains the default. The optional two- or three-speaker reply queue
requires an explicit confirmation disclosing one potentially paid roleplay call
per speaker and possible additional memory/Director calls. The order can be
changed before confirmation. It chains only from a durably saved turn, selects
each next speaker only after that save, and stops without auto-retry after an
error, Stop, lock, close, background or failed save. Stop after current reply
lets the in-flight answer finish but prevents the remaining paid calls. The
unsent draft belongs to the first turn only; later turns add no synthetic user
messages. Verify these boundaries with the focused group tests and the 360px
renderer checks after changing request flow.

## Group continuity and scoped context (private 1.307)

`sceneVersions` is a sparse scene checkpoint map keyed by message ancestry, with
`$root` as the fallback. Navigating, editing, deleting or forking an old branch
restores only scene notes from its path; legacy chats with no checkpoints keep
their current-leaf notes but conservatively clear unknown earlier-branch state.
Cast membership remains current, while notes for removed characters move to
`dormantCastScene` and return when that identity is re-added. Keep these maps and
`sceneEvents` validated in `chat-sync-core.js` before sync or restore.

The reviewed scene draft is made locally from recent turn excerpts and does not
save until the user applies it. `sceneEvents` contains user-authored off-scene
facts with an explicit recipient list; only events addressed to the selected
speaker enter that speaker's temporary context. They never enter the shared
transcript or automatic memory. This is not a privacy barrier for story facts
already present in the shared transcript or memory, so the UI must say so.
New groups default to the selected speaker's lorebooks; older group chats with
no saved `groupLoreScope` retain all active cast books for compatibility. The
speaker-only scope still includes persona and chat-attached books.
Tests must prove no recipient event leaks into another speaker's request or the
shared memory worker, and that old branches do not inherit future scene facts.

## Premium visual system (private 1.304)

A paint-level pass over both editions; storage, sync, provider and package
identities are unchanged. The shared stylesheet ends with one clearly labelled
1.304 block, and app/chat.css ends with its Chat counterpart. Keep these rules:

- Titles (h1.serif, modal titles, Spotlight and the wordmark) use --font-display,
  a system serif stack (Palatino Linotype on Windows, Noto Serif on Android). The
  CSP blocks data: fonts, and a bundled font would be an app/vendor shell change,
  so do not embed one casually.
- Every theme's primary action follows its accent. Dark and Light set --btn-grad
  to brass (Light dark brass with white text); .hero keeps the dark-stage brass.
  The focus ring is --focus-ring (the accent) in every theme.
- A chosen segmented Settings option is a raised surface with an inset accent
  line, not a second solid primary. Quality's primary glow and Performance's
  shadow reset both exclude .settings-choice, or the marker disappears.
- Text over artwork sits on a fixed dark scrim in every theme. Light and Custom
  redefine --brass there to --art-accent; plain Light brass measured 3.4:1.
  Bucket covers get a bottom scrim; the New bucket card is excluded.
- .rcv > .scrollbody has z-index 1 under the Android bars. A picture viewer or
  slideshow inside it lifts the column with :has(.lb-root, .ss-root); without it
  the viewer's Blur and Photo info controls were hidden under the bottom bar.
- Android tablets can be wider than 760px, so touch sizing keys off .phone, not
  the phone media query: rail items, actions, chips, close and blur are 48px.
- Quality motion is opacity-led (views, sheets, first twelve cards/pictures,
  image fade-in) so measured layout never moves; dialogs keep their lift. It is
  gated by prefers-reduced-motion and removed by Performance. Nothing loops.
- Custom palettes publish --scheme so native pop-ups match; Chat copies it.

test-premium-visual.js checks these promises in all four themes and both modes,
plus a 360px phone, an 800px Android tablet and reduced motion. It fails on 1.303.
Two older UI checks were stale after 1.303 moved Chat and Prompt Vault; they now
look for the launcher in the sidebar and reach Prompt Vault via the Dashboard.

## One visible Rolecraft app (private 1.303)

The former private Chat build is now the only user-facing Rolecraft app. This
is a display and navigation consolidation, not a storage migration. Windows
must keep the former Chat user-data profile, installation identity and trusted
updater path; Android must keep the former Chat application ID and signing key.
Changing either identity can strand the encrypted library, conversations or
provider credentials. The older standard Android package remains separate and
must be explicitly backed up or transferred before removal. Dashboard stays
home, Chat is a fifth main destination, and Prompt Vault opens from Dashboard.
The 27 September public transition above supersedes the earlier publication
restriction; retain the installed data identities when publishing.

## Earlier private Chat compaction and usage display (private 1.302)

Automatic memory now also triggers on Send after about 5,000 estimated tokens
of older post-checkpoint transcript are eligible, independent of a large model
window. The 75% input-budget safeguard remains; each conversation can select
8,000 estimated tokens or the older 75%-only behavior. Existing chat records
need no migration: absent trigger setting means the new default, and merely
opening a chat or viewing settings never calls the provider. The complete
message tree and previous checkpoint stay untouched. Summaries still append
only new chronological batches, retain recent turns verbatim and must commit
before a roleplay reply uses them. A failed summary leaves prior memory and
the unsent turn safe. UI token badges distinguish provider-reported input,
output, cache reads, included reasoning and cost when available; never turn
unavailable provider fields into zero or confuse app estimates with billing.
Do not relax Require zero data retention to chase prompt-cache hits.

## Read-only Chat review export (private 1.301)

The original conversation JSON remains unchanged. A separate review export
contains the full saved conversation tree and memory checkpoints, plus the
current output of the real context assembler: provider usage retained on
messages, permanent/temporary estimates, active lore, selected checkpoint and
the request messages as of export. This preview excludes an unsent draft and
must not be described as a replay of an earlier provider request. Do not add
API keys, raw pictures, drafts, unrelated library records or creator memos.
The operation must never mutate the vault or contact the provider. Android
review files must save to public Downloads or fail visibly; a private-storage
fallback makes a shareable review file impossible to find. Warn that the JSON
is unencrypted and requires the user's deliberate attachment to share it.

## Optional Jev Story Director (private 1.300)

The Chat renderer contains no network primitive or key. Windows and Android
native OpenRouter bridges accept one bounded, fixed-shape evaluation request
and send it only to `/api/alpha/decisions` using the OS-protected inference
key. The feature is off by default and per conversation. It is unavailable
when Require zero data retention is on: the Decisions API does not document
the same per-request `provider.zdr` contract used by chat completions. Never
silently relax this privacy setting. The extra call follows a completed reply,
not each streamed token; failures never retry or alter the saved reply.

The scores live under the local `ui:chat-director:<id>` key, outside the
synced chat record, transcript and compaction source. Coach mode considers the
latest three completed assistant turns on the active path; at least two poor
scores on a measure add a temporary note below priority 1 and 2 in the next
request. A queued group round scores only its final reply, which includes the
intermediate replies in its short history. Unscored or branched-away turns do
not count, and an unscored latest reply cannot trigger an older coaching note.
This is a local aid,
not a guarantee of story quality and not a second model writing prose.

## Chat continuity across paired devices (private 1.299)

Conversations are synced as single indexed records, but their messages form a
tree. Two up-to-date Chat peers may append different turns to the same observed
base before either receives the other. The old whole-record conflict rule
created duplicate chats and left one apparent timeline behind. The private
sync core now joins only two proven append-only revisions: both must share the
same last-applied message ID set, preserve every shared message byte-for-byte,
and leave all non-message story settings unchanged. Both new leaves become
selectable paths in one conversation. Deterministic ordering, clock ancestry
and revision ancestry make the join converge on repeated exchanges. Deleting or
editing existing text, changing memory/settings, a missing base proof, or an
unsafe message graph retains the old recoverable conflict-copy behavior.

The Chat-only lane may run after explicit first-library approval (`accepted`),
even while encrypted pictures are unfinished. It must not mark that library
`approved` or bypass the initial preview/consent step. Photo work remains
paused in the foreground Chat view. Never use chat-only convergence as evidence
that pictures or other library records have completed syncing.

## Immediate Chat sync wakeups (private 1.306)

The previous Chat-only lane polled every two seconds after each pass, spent
another 750 ms discovering devices, and republished the entire library/photo
head for every new message. On a large library or with an offline third peer,
that looked like a failed sync. A successful encrypted `chats:all` save now
wakes the local loop; native Windows and Android publishers send a signed,
content-free UDP wake only after the story head is durably updated. Receivers
deduplicate and authenticate it before scheduling an immediate index check.
Wakes may be lost, so the periodic poll remains. They carry no chat text,
secrets or acknowledgements and do not relax lock or background rules.

An existing compatible library head can update only its `stories1` extension.
The native fast path verifies the new extension chunks and atomically preserves
the previous library index, picture references and establishment state. A
missing, incompatible or damaged base falls back to the full retained publish.
Chat options being open do not count as an active edit; reply generation,
unsaved writes and message editing still defer incoming commits. Validate with
`test-private-chat-sync-wake.js`, `test-private-chat-story-fast-publish.js`,
`test-vault-sync-wake.js` and the four-device live-sync fixture.

## Private Chat visual layout refresh (private 1.298)

Performance chat messages need a single opaque reading-card surface, not a
floating header above a detached bubble; keep its shadows and decorative
animation disabled. Desktop Chat chrome should leave substantial transcript
space above the composer. Dashboard gallery counts should use complete rows at
each width: eight on phones, nine at three columns, twelve at four columns,
and ten or twelve at the widest widths. Verify actual element bounds in both
Quality and Performance modes across themes and phone, tablet and desktop
viewports before changing this balance. The private-only restriction was lifted
by the 27 September public transition above.

## Read-only Chat reloads at sync checkpoints (private 1.297)

After an incoming record checkpoint, vault onApplied reloads the Chat UI. Calling
the ordinary load path used to captureCast and persist chats:all unconditionally.
A received character profile therefore changed a saved story behind the engine's
exact raw-table snapshot, causing its next checkpoint to reject its own reload
as Library changed. Three peers can expose this without any user edits.

Device-sync reloads must be read-only: retain saved snapshots, refresh the live
library used by prompt assembly, and leave drafts alone. Normal opening still
captures changed profiles, recovers interrupted replies and stamps legacy rows,
but must skip semantic no-op writes (including JSON key-order differences).
Revision stamping compares against stored rows, not display-normalized pending
messages, so recovery becomes a causal descendant. Do not weaken raw or encrypted
pointer CAS to hide this error; genuine concurrent edits still stop safely.

## Native photo preparation and explicit screen-off session (private 1.296)

The full 1.296 sync audit was kept private and is not in this repository;
the essentials are below. Android first
preparation previously read each entire encrypted photo through Filesystem into
JS, decrypted and split its data URL, then sent all text back through putBatch.
storage.stageSyncImage now passes only the exact immutable bin/bin2 pointer and
transient derived keys to native SyncImageStager. Restrict paths to that image key
under vault/, authenticate the entire file before staging, preserve the exact
data-URL prefix and 192 KiB ASCII parts, check epochs throughout, and erase key
buffers. Unsupported legacy/non-ASCII representations fall back without guessing;
authentication, disk and cancellation errors do not downgrade. The adapter must
recheck both stored pointer and fingerprint before accepting the descriptor.

Preparation state checkpoints contain only newly staged descriptors and are
coalesced by the existing two-second cadence plus final/failure flush, not every
16 small images. Remote checksum failures cannot invalidate healthy local photo
preparation; only a missing local retained chunk reported by publish can do that.
Offline peer indexes back off 2/5/10/30 seconds, while reachable peers remain
checked. Address changes, successful contact, manual retry, lock and group changes
reset the backoff. Deferred peers never count as acknowledgements.

Follow-up report: one missing retained local chunk still used to invalidate the
whole library, repeating completed work if repair was interrupted. Updated native
shells advertise photoCacheInspection:1 and implement bounded read-only
missingChunks metadata inspection. Repair only descriptors touching those pieces,
and retain successfully repaired descriptors across interruptions. Older shells
keep safe full-rebuild fallback. Cached fingerprint checks must say Checking, not
Preparing; the latter means actual photo work. Background consent also covers
picture preparation, not merely network transfer.

Screen-off sync is an explicit unlocked-session exception requested by the owner.
The native dataSync service starts only while visible and after notification
permission, has a Stop action, renews bounded CPU/Wi-Fi leases only from verified
unlocked sync calls, and stops on expiry, destruction, task removal or Android's
dataSync timeout. No boot receiver, sticky restart, persistent unlock or provider
background privilege. The controller is ephemeral and needs fresh native active
confirmations; auth.lock and rcv-locking always stop it. The normal background lock
gate is deferred only while this controller is active and keeps checking expiry.
Permission-sheet hiding may preserve a pending start, but explicit lock/Stop may
not. Old permission/JS callbacks must never cancel or revive a newer session.

MainActivity keeps only the service-approved WebView running after normal
Capacitor pause/stop callbacks, so provider cancellation still runs. Native
dispatch and active() recheck foreground-or-service after asynchronous callbacks.
Credential operations recheck foreground inside their critical sections. Status
heartbeats bypass the serial preparation queue only after the same unlock check.
Windows already disables timer throttling for enabled sync; minimize remains
supported while the app is unlocked and the computer awake. Neither platform
promises sync after force-stop/process termination or during computer sleep.

## Avoid repeated sync work and overlap bounded photo reads (private 1.295)

Large libraries previously rebuilt their immutable index and resent every retained
chunk identity on every unchanged poll. Reuse parsed raw tables, validated scans,
publications and settled reconciliations only with exact raw/state strings,
image descriptors, peer revisions and primary selection. Clear on errors,
lock/stop, group changes and Chat lane transitions. Renew native publication and
retained-cache validation at least every 30 seconds; a cache is not proof of a
durable received photo. Keep live discovery, authenticated index exchanges and
primary refresh on unchanged polls. Never skip an initial merge approval.

Android/web storage memoizes only eligible library and sync-state plaintext
behind exact encrypted pointers, bounded to 32 MiB and cleared each auth epoch.
Reads still check the current pointer; sync commits retain the final atomic
expected-pointer CAS. Never memoize pictures or arbitrary keys. Exact-key
checkpoints batch pointer reads instead of enumerating all image keys, retain
epoch checks through staging/commit, and do not remove old files before commit.
Coalesce progress metadata with record checkpoints instead of writing both.

Native shells advertise chunkConcurrency:2 with chunkBatch:4. The engine drains
both bounded reads, preserves part order and checks the whole photo digest.
Android has two chunk workers and a two-request queue; control operations remain
serial. Register all HTTP connections before opening, disconnect on pause, and
check epochs before cache writes and bridge replies. Serialize startup and cache
replacement; cache interface enumeration for only one second, cleared on pause.
No wire-format, key, photo-quality or vault-durability changes.

Focused tests: test-sync-idle-performance executes a 741-photo descriptor fixture
and asserts zero repeat staging/scans on idle polls, plus edits/renewal/lock;
test-sync-read-cache uses real IndexedDB and WebCrypto for pointer races and
lock epochs; test-sync-android-pipeline executes actual Java dispatch/pause
methods; test-sync-batch-engine verifies bounded, ordered and drained requests.
These demonstrate avoided work and bounded overlap, not physical Wi-Fi speed.

## Changeable primary and one visible library (private 1.294)

The former conflict comparator preferred any revision carrying the original
primary in its vector clock, then a hash, not the most recent edit date. Thus a
newer independent edit could be labelled sync conflict. Private 1.294 adds a
protected primaryPreference register (sequence, author, device, label), exchanged
only through authenticated native index messages and invitations. Original
cfg.primary remains the pairing identity. Make this device primary requires an
established local library; it never re-pairs, clears caches or mirrors away unique
items. Updated peers reject old index exchanges once the policy is active.

Single-library merge preserves normal causal descendants from every device.
Only the selected primary causally resolves a genuine library clash against its
visible frontier version. Other peers keep the frontier until that resolution
arrives. Alternate characters/personas/lore/prompts become deterministic Bin
archives, not visible duplicate cards. Conversation conflict policy is unchanged.
Archive/image dependencies commit before source replacement; interruption must
not advertise ancestry for unsaved writing. Recheck primary selection before
checkpoints, including null-to-selected transitions during image downloads.

Legacy conflict cleanup is explicit per-group review, never name-based deletion.
The chosen content keeps the original identity; removed copies and overwritten
revisions retain their picture references in deterministic Bin entries. Reviewed
copy tombstones include the whole observed family clock. Character syncAliases
preserve existing chat references without rewriting speakers/transcripts/memory.
Review uses an exact raw-library fingerprint and atomic data/state CAS. A stale
review fails closed. Generated recovery tombstones prevent stale archive seeds
from resurrecting a deliberately purged Bin item. No live photo bytes are deleted.

## Observing characters share the ongoing scene (private 1.293)

1.292 retained the transcript but still used the API assistant role for every
character. In group reply requests only, other characters' historical turns now
use user-role scene input with their existing speaker label. Only turns matching
the selected characterId AND variantId use assistant. Label real persona turns
separately; never mistake another character's dialogue for the user's. Stored
roles, speaker identities, active-path ancestry and memory-worker source remain
unchanged. Account for every added label in both token estimates. A card's initial
situation cannot reset established story events. Being added to the UI cast does
not mean arriving in the fictional scene: explicitly witnessed observable events
are known even before that character's first generated reply, while private
thoughts/off-scene secrets are not automatically shared. No duplicated recent
history, new paid summarization call or inferred observer-presence state is needed.

## Group continuity and mobile layers (private 1.292)

Switching the selected character never changes transcript ancestry or checkpoints.
The earlier group implementation nevertheless injected the newcomer's opening
scenario/examples into established scenes and mixed every participant's system
commands. Established groups now omit those seeds; reference cast retains factual
profiles but only the selected speaker supplies explicit system directions.
Shared memory keeps historical actors, including the original speaker of legacy
unlabelled narration. A request-only final roleplay direction hands off to the
selected speaker even after an assistant-ended Continue. Count this cue against
both the input-token estimate and native 2048-message limit; never save it as a
message or feed it to the memory worker. Mocked context tests verify payloads,
not whether a live provider always follows the roleplay instructions.

Mobile Options needs a stacking level on the isolated header itself, not only its
dropdown: positioned quality bubbles previously painted over that whole context.
The composer sits above messages but below Options. Keep empty mobile actions and
placeholders short enough for a single-line field and retain accessible speaker
labels. Test actual elementFromPoint hits at keyboard-height, not just z-index.
Existing memory-rebuilt suffixes are removed for display without rewriting chats;
new/resumed rebuild copies retain the clean original title and separate identity.
Last-chat dates come from real nonpending message timestamps, not settings changes
or the date memory was rebuilt. Original copies and checkpoints remain recoverable.

## Bounded encrypted sync batches (private 1.291)

Automatic sync keeps its existing 192 KiB text chunks and SHA-256 descriptors.
Updated native shells advertise chunkBatch:4; the shared engine batches at most
four pieces per native call. A peer's authenticated index determines whether
its native transport supports the batch wire response. Older peers use their
existing single-chunk requests; an authentication/checksum error must never
trigger a downgrade. The RCVSYNCB1 response carries existing AES-GCM-encrypted
blob packets with an HMAC binding direction, request nonce and exact response
body, avoiding another gzip/encryption wrapper. Verify peer identity, exact
ordered chunk identities, count, size and every chunk digest before use. Keep
all lock/background epochs and immutable cache rules; no plaintext photos on
the network, no parallel unbounded downloads and no change to pairing secrets.
Android's disposable encrypted chunk cache uses atomic rename without forcing
a flash flush for every part. Published heads, pairing and vault commits retain
their durability rules. Missing/damaged chunks must be authenticated and rebuilt,
never mistaken for committed photo data.

Android automatic-sync image preparation uses the existing encrypted bin2
binary format only when decoding/re-encoding a data URL is byte-exact. The
pointer/fingerprint transaction and compare-and-swap remain the sole commit.
Do not replace this with setBinary's blind commit. The original image bytes and
prefix round-trip unchanged; noncanonical data URLs retain the old text path.
This update is private Chat only, with full Windows installer and APK required.

## Chat navigation, not a floating shortcut (private 1.290)

The owner wants the entry named Chat. Windows places it below Prompt Vault in
the sidebar; Android phones and tablets place it only on the Dashboard, without
adding a sixth bottom-navigation cell. The vault advertises a permitted slot via
data-rcv-chat-launch. Chat uses its existing root-attribute observer and a React
portal to fill that slot, not a new polling loop or whole-document observer.
Launcher/retry controls disappear behind overlays, sheets, picture viewers and
non-ready vault states. Keep launch handlers in Chat so this UI-only relocation
does not change conversations, persistence or provider calls. Shared Chat tests
must find the portal outside rcv-chat-root. Full Windows installer and APK carry
the Chat script/style changes; renderer-only patches cannot deliver them.

## Reference-image prompt ideas (private 1.289)

CharacterImageStudio keeps twelve local, provider-neutral writing aids in
STUDIO_PROMPT_IDEAS. Selecting an idea only previews text. Require an explicitly
selected reference before applying it; never select pictures or generate on the
owner's behalf. Add preserves existing text, Replace is a separate explicit
action, and the 8,000-character limit must disable overflow rather than truncate
writing. The final editable prompt is the sole prompt sent by Generate; no hidden
identity instruction is added to arbitrary user prompts. All presets request
identity preservation without promising exact likeness, restored missing detail,
or an output resolution. Model, size, quality and paid-request controls remain
independent. No native bridge or vault format change is needed.

## Private group roleplay, image batches and allowances (1.288)

Originally a private-only update; the 27 September public transition permits
reviewed source and release artifacts. Group
conversations keep an explicit active cast and next speaker. Removed characters
must not re-enter permanent context through the legacy original character or a
saved cast snapshot. Historical messages retain speaker identities; removing a
participant never rewrites history. Memory reads that attributed history without
copying static profiles. Choosing a speaker or an @ suggestion does not contact
the provider; only an explicit reply action does. Preserve existing conversations,
branch ancestry, drafts and conditional persistence. Sync validates the new cast
and historical speaker fields before accepting them.

The owner now authorizes Generate N and save to gallery, replacing the old
preview-then-Save-only workflow. Set count/caption/visibility before generating.
Use sequential bounded requests and durably append every successful result.
Never replay paid calls automatically after failure. A failed save keeps a
bounded preview for retry; already saved pictures remain ordinary gallery data.
Fullscreen image previews must sit above the studio and consume Escape/Back
before closing their parent. Hidden viewer controls must not intercept taps or
keyboard focus; preserve an accessible way to show controls or close.

API balances are truthful capabilities, not guesses. The owner chose normal-key
allowance and a billing link instead of collecting a powerful management key.
OpenRouter /api/v1/key returns spending-cap remaining/usage, not account credits;
/credits requires management access. OpenAI/xAI normal image keys do not expose
a supported account balance in this integration. Native fixed billing links
provide that path. Refresh is explicit, bounded and read-only; keys never enter
renderer state. Cancel and clear checks on lock/background/key change, and never
store the results in vault records or sync. Both native shells require rebuilding.

## Explicit private API key sharing (1.287)

Settings > Automatic device sync > Share API keys between devices offers one
saved OpenRouter, OpenAI or xAI key for five minutes to trusted group members.
The receiver explicitly imports, and existing credentials are never replaced.
The disclosure must explain provider account/credit access to every member of
the paired group. CredentialShare/credential-share reuse the providers' exact
OS-protected storage formats; no key is ever returned over IPC or to WebView.
Offers keep only sealed bytes in native memory, with random identifiers and
expiry. They are cleared on pause/lock/background or closing the sharing panel.
Authenticated, nonce-bound LAN request/response envelopes carry the deliberate
transfer only; index, chunks, snapshots and backups remain credential-free.
Check the expected offer ID, provider and sender identity before local storage.
Import fails if the receiver is locked, the offer changed/expired, secure storage
fails or a key exists. Windows uses exclusive link publication; Android provider
saves and imports share WRITE_LOCK. Keys already imported are independent: stop
sharing or leaving the group does not revoke them; revoke at the provider if
needed. Never test with real owner credentials. Native changes require full
Windows installer and APK, not a renderer-only patch. Public standard unchanged.

## Photo information and JPG copies (private 1.286)

PhotoInfoModal reads img: directly only on explicit inspection, never thumbnail
or preview cache bytes. photoSourceInfo validates raster MIME/signature and exact
base64 byte length; decodePhotoOriginal supplies displayed pixel dimensions.
photoJpegCopy draws at those dimensions over white, checks canvas bounds/output
and exports through saveFile with collection=pictures. Originals/records are not
rewritten. Do not imply lossless conversion, retained animation, EXIF or alpha.
Closing, locking or hiding invalidates pending work before export starts. The
nested SimpleModal must consume Escape before grid/viewer handlers; pause the
slideshow when opening information. Test true original/thumbnail differences,
JPEG bytes and white alpha flattening, export failure, and lifecycle cancellation.

## Gallery profile selection (private 1.285)

ImageGridView's profile control must not live inside the variant assignment row:
characters without variants and personas still need it. Require exactly one
selected picture and await persistence before the success toast. The grid viewer
passes gallery variant tags, so normalise DEFAULT_VID to the main portrait, not a
nonexistent variant. withGalleryProfile validates the image/target, resets only
the changed portrait's Chat framing and retains an otherwise orphaned previous
portrait as a gallery entry. Never rewrite the original image bytes. Tests cover
real phone/desktop grid selection and Default/variant/persona persistence.

## Private image-provider error reporting (1.284)

Never discard a rejected image request's structured error: HTTP 400 alone cannot
distinguish an invalid parameter from a provider safety refusal. Both native
bridges parse at most 64 KiB of error JSON and show bounded message/code/type/param
fields plus a validated x-request-id. Android must read getErrorStream, not the
success stream. Non-JSON, oversized and missing bodies retain the HTTP status.
Redact the active key, full prompt, credential patterns, data URLs, long encoded
strings and links before display, then cap the message. Authentication/redirect
bodies are never echoed. Policy codes get neutral safety wording; do not change
moderation or retry paid requests. Render the result as wrapping plain text,
never HTML, and do not persist raw errors to chats, vault records or logs.

## Private character image studio (1.283)

The owner requested direct OpenAI and xAI image generation for private Chat on
Windows and Android. This was not part of the older standard builds; it is part
of the current Rolecraft app. The renderer
stays offline: `app/image-generation.js` and Android `ImageGenerationPlugin`
own explicit Generate calls to fixed HTTPS image endpoints, with no redirects
or remote result downloads. OpenAI reference edits use multipart `image[]`;
xAI edits use JSON `image` or `images`, not OpenAI's multipart format. Current
provider model allowlists and request formats are covered by native tests.
Resolution presets preserve exact aspect ratios and are independently validated
by both bridges. OpenAI permits at most 8,294,400 pixels, 3840 per edge and
multiples of 16: exact 2:3 therefore tops out at 2336x3504, not 2560x3840.
Only 16:9/9:16 presets reach a 3840 edge. Grok permits 1k/2k, never 4k.
Show actual returned dimensions and never silently upscale. GPT Image 2.5 alone
adds xhigh/max quality; GPT Image 2 stops at high and Grok at medium.

Provider keys are separate from OpenRouter and sealed with safeStorage or
Android Keystore, outside vault data, exports and paired sync. The user's prompt
and at most four selected references are the only content sent. Large originals
are resized into upload copies; original vault images never change. Response,
decoded-image and reference limits apply on both sides of the native bridge.
One request per device, an absolute five-minute deadline, and no paid retries.
Cancel/lock/background invalidates late results but cannot guarantee the provider
stops billing. Android resume alone does not unlock the image bridge.

Generated previews are not library records until explicit Save. Preserve all
existing pictures and fields: reread the latest character array, validate the
target/variant, then append the fresh image ID with `syncCommit` compare-and-swap.
Hold pendingVaultWrites for the operation, check the unlock epoch after awaits,
and pass the epoch guard into saveImage so delayed writes cannot repopulate
image caches after lock. Failed saves retain the preview for retry, never
resurrect a deleted character, and never attach an unpersisted picture.
Generated gallery pictures use ordinary backup/sync; provider keys never do.

Full Windows installer and signed APK required: a renderer patch alone cannot
deliver either native bridge. Local mocked providers exercise 360px/desktop UI,
fresh IDs, concurrent edits, cancellation and failure handling without paid
requests. Physical-device/API-account checks remain a separate owner check.

## Remembered multi-device sync

Missing optional thumbnails must not re-enter preparation on every idle pass.
Report final preparation counts without throttling, and clear phase-local counts
when moving to checking/saved/synced. The 741-picture regression covers both.

Windows sync cache fingerprints use encrypted-file stat identities, not decrypted
picture content. Yield during bulk checks and keep lock guards after each yield.
A sync:state-only compare-and-swap uses the existing atomic single-file write;
never rebuild the whole vault for bookkeeping. Multi-record replacements remain
atomic. Advertise established=true only from durably approved local sync state.
A newcomer may compare with the starting device or any established peer; the
starting device is not a permanent server. Keep explicit first-merge approval.

QR pairing uses the bundled qrcode encoder through version 40 and offline jsQR
decoder, both loaded by desktop and web/mobile entry points. The native reverse
join offer is ephemeral, encrypted to the join QR key, and requires local accept.
Refreshing an invitation must not wait for picture preparation or change group
identity. Expiry belongs to the invitation, never membership. Optional index
descriptors stay outside the shared library payload; unsupported indices are
not downloaded or interpreted. Keep all record/image validation and write guards.
Timestamp-only character/persona revisions may coalesce their clocks, but real
writing and image differences must still preserve conflict copies.

Automatic sync is a separate protocol from passive one-time transfer. The
native Windows transport and Android VaultSyncPlugin serve only immutable,
encrypted chunks. Pairing secrets use safeStorage/Keystore. Authenticated UDP
discovery (44218) and peer gossip replace old addresses; never overwrite a
discovered endpoint with the original invitation's seed address.

The renderer merges per-record vector clocks, previews initial changes and
preserves concurrent writing as deterministic conflict copies. Image originals
are never overwritten or deleted. Previews may differ across devices without
blocking original-image convergence. Only currently applied records hold image
references, so purging a deleted conflict does not demand its pictures forever.
Records and causal state commit in small compare-and-swap checkpoints, only
after every original referenced by that record arrives. Never store unsaved
records in the local causal snapshot: a restart would infer false deletions.
Verified image-cache descriptors checkpoint independently of writing edits and
survive later publishing passes. Initial consent (accepted) is durable, distinct
from completed first reconciliation (approved/established). Keep deletions until
their recovery-bin records are saved. A foreground status heartbeat renews the
native serving lease during long preparation; lock/background guards still win.
Windows stages unchanged files with hard links and replaces files atomically;
Android compares encrypted pointers in the same IndexedDB transaction that
writes values and fingerprints. Failed old-file cleanup must never delete new
committed payloads. Keep the save overlay until UI records have reloaded.

Pause while locked or Android is backgrounded. This is foreground/resumable
sync, not an always-running Android background service. Export backups before
initial reconciliation. Tests cover four-way convergence, later edits, deletion
recovery, restart/discovery, native codec interoperability, IDB races and phone
layout. Physical-device Wi-Fi/firewall/lifecycle checks still matter.

A private, offline-first roleplay library and chat app: characters, personas,
lorebooks, prompts, pictures and conversations, with encrypted local storage.
Ships as a Windows Electron app and an Android app, both built on the same
web edition. Built for CharSnap creators.

**Read this file before changing anything.** It records decisions that are easy to
break by accident.

---

## Layout

```
app/                the Electron app (this is the product)
  main.js           main process: storage encryption, updates, Wi-Fi transfer
  preload.js        the only bridge between main and the interface
  index.html        entry page + CSP
  app.js            THE ENTIRE INTERFACE (~805 KB, compiled React) — see below
  icon.ico          the app's crest, 10 sizes; BrowserWindow and the shortcuts
  icon.png          the same at 256, for anything that will not take an .ico
  vendor/           React UMD builds + self-hosted fonts
web/                embeddable web edition (same interface, browser storage)
mobile/             Android app: the web edition in a WebView (see mobile/README.md)
installer/          HD Electron setup UI (index.html + static crest backdrop,
                    dust and light animated around it) — this is the window
                    people see. Silent NSIS only wraps it into one .exe
build/              installer.nsi (silent wrapper) + setup-icon.ico
scripts/            set-version, sign-update, build-web, build-installer,
                    check-integrity, scan-js, and the test-* checks below
keys/               signing keys — NEVER commit. private_key.pem signs .rcvup
                    updates; rolecraft-release.jks signs the APK and its password
                    is in android-keystore.txt. Losing the jks means no phone can
                    update without uninstalling, which erases that vault
dist/               build output (gitignored)
```

## The single most important thing: app.js

`app/app.js` is **the source of truth for the interface.** It is compiled-looking
code (`React.createElement`, not JSX) because the original JSX source was lost.
Dozens of tested features and bug fixes live only in this file.

- **Do not regenerate it** from a rewritten source, and do not "convert it back to
  clean JSX" in one pass. That will silently drop behaviour.
- Edit it in place. If you want to modernise, do it in small steps and launch the
  app after each one.
- After any edit: `npm test` (parse, no-network sweep, const scan, and every
  check in `scripts/`), then `npm start` and click the affected screen.
  `npm run check` is the fast subset if you only want parse + no-network.

Editing it by script is normal here. Two things bite repeatedly:

- **Anchors must match indentation exactly.** Nested blocks are indented 4 and 6
  spaces, not 2 and 4. Print the target with `JSON.stringify` before writing an
  anchor rather than retyping it from a trimmed listing.
- **Backslashes get eaten by the shell.** `\n`, `—` and regex escapes have
  been mangled three separate times inside `node -e` and heredocs, producing
  silently wrong code (`/\B(?=(\d{3})+(?!\d))/g` became `/B(?=(d{3})+(?!d))/g`
  and stopped grouping numbers). Write the patch to a file with the Write tool and
  run it with `node`, or build the backslash with `String.fromCharCode(92)`.
- `app/main.js` is **CRLF**, `app/app.js` is **LF**. A multi-line anchor written
  with `\n` will not match main.js. Convert, or match single lines.

## Hard rules

1. **The interface never touches the network.** No `fetch`, `XMLHttpRequest`,
   `WebSocket`, `sendBeacon`, or `http://` in `app/app.js` or the web bundle.
   `npm run check` enforces this. Networking lives *only* in the privileged
   shell: `main.js` and the sync/transfer modules for the local network, and
   the fixed-endpoint provider bridges (`openrouter.js`, `image-generation.js`,
   `provider-balances.js`, `elevenlabs.js` and their Android plugins) for explicit user actions.
   AGENTS.md lists exactly what each bridge may contact.
2. **Images are sacred.** Version history, JSON updates and restores capture text
   only — never `profileImg`, `banner`, `gallery`, or variant portraits. A restore
   must never change a picture. **Use `charImgIds(c)` / `personaImgIds(p)` for any
   list of a record's images.** Seven places once built that list by hand and only
   one remembered that a *variant carries its own `profileImg`*, so variant
   portraits went missing from the backup, both exports, the pictures zip, the blur
   list and the stats count (fixed in 1.151). Never write that list out again.
3. **Signing key is the root of trust.** Any `.rcvup` signed with `keys/private_key.pem`
   is trusted and executed by every installed copy. Keep it offline, never commit it.
   If it leaks or is lost, every user needs a fresh installer with a new baked-in key.
4. **Renderer changes ship as `.rcvup` patches. Shell changes need a full installer.**
   Anything touching `main.js`, `preload.js`, or `index.html` cannot be delivered by
   a patch. Since 1.150 this is enforced rather than remembered: `npm run sign`
   diffs those three files against the last release tag (ignoring the version
   stamp), marks the package, and the app refuses a patch that needs the installer,
   naming it. `--shell` / `--no-shell` override the detection. Say which artifact is
   needed in the release notes regardless.
   **"No shell change" does not mean one artifact will do.** The detection
   answers a narrow question — is this patch safe to apply on the old shell —
   and `installer/` is outside it entirely, because a fix there does not
   invalidate the patch, it simply cannot be delivered by one. 1.206 is the
   case to remember: the detection correctly said no shell change, while the
   desktop-shortcut fix it shipped alongside existed only in `installer/main.js`
   and reached nobody except through a fresh `Setup.exe`. Read what actually
   changed, not just the verdict.
   **`app/vendor/` needs the installer too.** A `.rcvup` carries `app.js` alone,
   so a changed font, crest or React build reaches nobody — which is exactly how
   a broken crest once shipped. Since the August 2026 QA pass the detection also
   diffs `app/vendor/` against the last tag, by name rather than by line because
   those are binaries, and names the files. `test-shell-detect.js` covers both
   halves of the rule.
   **Cumulative patches carry a signed shell floor.** A renderer-only release may
   install across a version gap only when the installed shell is at least
   `UPDATE_COMPAT_BUILD`. Update that constant whenever `main.js`, `preload.js`,
   `index.html`, or `app/vendor/` genuinely changes. The signer authenticates it
   as `meta:minShellBuild`. It also keeps legacy `needsShell` routing enabled and
   points `shellBuild` at the same floor so old installed shells fail closed
   instead of ignoring metadata they do not understand. This was added after
   1.244 could be applied directly to shell 1.242 even though 1.243 contained a
   required shell change.
5. Updates are **cumulative full bundles**, not diffs. The newest `.rcvup` contains
   everything; only ever distribute the latest.
6. **Never reference a file from `app.js` by a bare relative path.** A patch is
   loaded from the updates folder and `resolveEntryFile` writes the page it runs
   in there too, so `"vendor/crest-256.png"` resolves beside the patch, where
   there is no `vendor/`. It rewrites `src=`/`href=` in the HTML and `url('vendor/`
   in the CSS, but it cannot rewrite a string the interface builds at runtime.
   Use `ASSET_BASE`, which reads back a script tag the shell has already
   rewritten and is correct with a patch, without one, and in the web and Android
   builds. This cost the crest on the lock screen and in the sidebar for every
   patched copy from 1.166 to 1.191, and looked like a one-off glitch because
   pictures (data URLs) and fonts (named in the CSS) kept working. Since 1.192
   `main.js` also writes a `<base>` into that page, so a bare path degrades to
   merely wrong rather than broken — do not rely on it.

## Data model (all values are strings in encrypted key/value storage)

### Private Chat rolling memory (local 1.256)

Private 1.282 separates provider generation allowance from saved summary size.
Reserve up to 8192 output tokens, at most 20% of the context and within model
limits, because providers can count hidden reasoning against max_tokens. Keep
the selectable 256/384/640 estimated saved-summary limits and short-page scaling;
reject oversized complete additions rather than truncating history. Report both
budgets and possible billed reasoning. No automatic paid retry or privacy change.
Token exhaustion, filtering and excessive saved-summary size have distinct errors.

Rebuild journals use protected storage under ui:chat-memory-rebuild:<source ID>,
not chats:all, so partial copies never enter conversation sync. Save each successful
batch through the epoch-checked save queue. A SHA-256 of source transcript/settings
and resolved profile references allows explicit resume after reopening; old memory
and sync bookkeeping do not invalidate it. Changed inputs restart, and the user can
explicitly Start over. Never contact the provider merely on opening Chat/settings.
Only the completed copy enters chats:all. A completed journal survives a failed
final save, so retry can save without paid regeneration. Clear it after success;
if cleanup fails, its copy ID prevents duplicates. Lock/Stop cancel further work,
but an atomic save already started may finish. Originals remain untouched.

Private 1.280 originally bounded provider output per batch independently of model context: selectable
256/384/640 tokens, Balanced 384 by default. Scale short pages to 12% of their
estimated transcript tokens with a 128-token floor, never exceeding the selected
or model cap. Reserve the full cap while packing; recompute the instruction and
displayed estimate after scaling. The completion marker shares the output cap.
Full eight-message batches across 500 messages reserve at most about 24k summary
tokens with Balanced, not 4k for every batch. Long messages can need more pages.
1.282 supersedes that shared output cap; it now bounds saved summary estimates,
not provider reasoning/output charges or a promise of semantic recall.
Do not shrink or rewrite earlier memory; rebuild-in-copy applies new settings.

Private 1.279 makes worker output chronological history only. Do not request
unresolved threads/consequences: those positive instructions caused repetitive
status sections on every appended batch. Explicitly forbid those sections and
imitating their format from legacy previousMemory. Preserve promises/questions
actually spoken as historical events, not ongoing checklists. Do not strip saved
memory with regexes: that could erase real events. Existing memories are retained;
the confirmed rebuild-in-a-copy path regenerates them from the raw transcript.

Private 1.278 bounds every memory request's new material to eight messages and
6000 estimated tokens, independently of the model's window. One indivisible long
message may exceed that soft page bound but must still fit the actual budget;
never truncate or skip it. The old planner could send 595 messages (~474k tokens)
into one 2048-token response on a million-token model. Request-coverage tests with
small contexts and constant summaries did not exercise that overcompression.
Do not treat deterministic mocked responses as proof of real-model recall.

memoryProfiles supplies allowlisted selected-variant/persona facts only, for
static-fact deduplication, including cast fallback. Exclude creator memos, images,
prompt commands and opening examples. Profiles remain read-only reference, not
events; preserve actual story changes and consequences. The worker reserves up
to 4096 output tokens and includes all reference/input text in its budget.
memoryHistory rejects missing ancestry/cycles/duplicate IDs before a rebuild can
fork away the evidence. Progress gives source spans and estimated input/output
allowance. Checkpoints store allowlisted provider token usage when available,
otherwise explicit estimates. Memory settings report cumulative prior-context
tokens separately from the last summarizer call. These tokens are resent, not
free provider-side persistent memory. No paid model request is made by tests.

Private 1.277 replaces destructive rolling re-summarization with cumulative
additions. memoryPlan reads the previous checkpoint and exactly the new span;
the model summarizes only olderMessages. extendMemory concatenates the previous
text verbatim with the labelled addition. Never depend on the model to repeat
earlier facts. Provenance anchors follow forks. Full transcript, five recent
messages and subsequent growth to 75% remain unchanged. Accumulated memory may
outgrow a context window; fail visibly, never silently shrink old memory or drop
recent messages when automatic memory is enabled.

Private 1.320 supersedes the stored cumulative-copy representation, not the
cumulative context seen by roleplay replies. New memory checkpoints store only
their incremental addition and link to earlier checkpoints by message ancestry;
reply assembly and the memory editor resolve the complete history from that
chain. Summarizer calls receive the new message span and a bounded excerpt of
prior memory, rather than sending the whole cumulative copy again. Correcting
an earlier checkpoint updates linked descendants. Legacy cumulative descendants
are converted only when their old prefix proves the link; ambiguous or
independently rewritten descendants fail closed rather than losing history.
The full transcript remains untouched, including when an active chat is open.

Private 1.324 separates the 75% compaction trigger from the per-batch saved
history allowance. A short catch-up page may ask the model for a smaller
addition, but it must not reduce the user's selected 256/384/640-token detail
allowance to 128 and then reject a complete response. A small, bounded overage
is permitted for model variation; marker, finish-reason and hard-size checks
still reject incomplete or excessively long output without saving it or
retrying a paid call. Do not truncate a finished addition to make it fit.

Private 1.325 gives explicit memory-worker requests a longer, bounded lifetime
than ordinary replies. The old fixed 185-second renderer deadline could cancel
a valid long-running summary regardless of stream progress; both native shells
also used a 180-second socket inactivity timeout. Memory-only requests may wait
longer below Android's ten-minute stream lease, while ordinary replies keep the
old timeout. Stop, lock and background cancellation still win, and there is no
automatic paid retry. A group queue paused before its first reply must resume
the unsent draft (if still present) rather than regenerate from its anchor;
the resumed current index must be numeric so the next speaker gets their turn.

Private 1.328 uses a strict structured history response for the two OpenRouter
DeepSeek V4.1 Flash listings during memory compaction. The provider must support
both non-thinking and structured-output parameters while keeping the same ZDR
choice; unsupported routing fails rather than silently ignoring the parameter.
Version 1.328 also required a matching model-reported processed-message count,
but that proved unreliable and was removed in 1.329. Other memory models retain
their marker format.
Rejected outputs show only format/finish metadata and visible character count,
never story content, and never replace a saved checkpoint or trigger a paid
automatic retry.

Private 1.329 asks DeepSeek V4.1 Flash for only a structured `history` string.
Do not use a model-generated processed-message count as proof that the history
covers the batch: it can be omitted or misreported even after a normal finish.
Require a confirmed `stop`, valid JSON with a text history, nonempty content,
and the existing response-size and saved-token bounds before committing. The
memory planner, not the model, determines the exact ordered source span.
Tolerate extra JSON fields from an older provider response but ignore them.

Private 1.327 scopes non-thinking mode to DeepSeek V4.1 Flash memory-worker
requests on both native bridges. OpenRouter lists this model with optional
reasoning enabled at high by default; its hidden tokens can exhaust the
worker's output allowance before the short history addition is complete.
Keep the roleplay request and other memory models unchanged, preserve the
conversation's ZDR choice, and never auto-retry a paid compaction request.
The provider's length finish alone does not prove reasoning consumption; an
incomplete addition still fails closed without replacing saved memory.

Private 1.326 closes an Android Chat-open race with paired sync. A read can
capture a `bin:` pointer, then sync atomically commit its successor and retire
the old encrypted file between Filesystem `stat` and `readFile`. A bounded
storage read may follow the new current pointer, with unlock-epoch checks and a
current-pointer check before returning Chat text. If the pointer is unchanged
and its file is absent, fail closed; never turn that error into an empty chat or
rewrite the pointer. Keep a healthy paired device untouched for recovery if a
missing-current-file error persists after sync settles.

Private 1.330 extends that read retry to a bounded burst of successive Chat
pointer replacements; one retry was insufficient when several sync commits
landed during a large read. The Retry opening Chat control must navigate into
Chat after a successful read. Local `chats:all` saves now compare the exact
plaintext read or last durably written, because a delayed save can otherwise
replace a newer synced transcript even though the UI sync guard was idle when
the save started. After a failed CAS, keep unsaved edits in memory and block
further saves or paid replies. Explicit Retry save merges the current disk
version with those edits, retaining divergent revisions as recoverable Chat
copies; it must not blindly retry the old whole-table write. Ancestry-only
sync state changes must not rotate the encrypted Chat pointer. A full-sync
commit whose UI reload fails retains a reload obligation until it succeeds.
The 1.330 queued-reply guard caps automatic memory at four paid batches per
explicit Send, preserving each completed checkpoint and pausing before a
roleplay request if more is needed. A read-only reply view may reuse another
speaker's complete proof-validated incremental lane only while every active
turn is shared; never copy that lane into the selected speaker's saved memory
or use it after an audience/private turn. Do not put a Promise.race timeout
around a durable Chat write: a late commit after the UI abandoned it could
leave the in-memory ancestry behind storage. Bound paid memory and provider
waiting instead, without automatic paid retries.

Private 1.320 also makes backup restore fail closed on missing live, cover or
Bin pictures and malformed records. A paired sync group must be left before
restore; the old sync ancestry and old backup-export timestamp are cleared in
the atomic replacement. Re-pairing and first-merge approval are explicit.
Format-2 Chat sync manifests retain verified per-conversation records by
content hash, downloading only changed conversations when a peer republishes.
The local `chats:all` encrypted record is still monolithic; changing that
storage contract requires a separate, tested migration across backup, both
native storage implementations, Chat and sync.

Rebuild memory in a copy is explicitly confirmed because it can make multiple
provider requests. It forks the active transcript, clears old summaries only in
the temporary copy, and sequentially reconstructs memory from all eligible older
messages. Persist only the finished copy in chats:all; never replace the original
or expose half a rebuilt copy. 1.282 saves local resumable progress separately.
No roleplay reply is generated. Pins and per-chat privacy routing remain active.
An atomic final save already in progress may finish even if Stop is pressed;
that completed copy remains recoverable after reopening. Opening Settings or a
conversation must never start a rebuild. The 24000-character response limit is
for each addition, not the cumulative memory editor.

Private 1.276 makes provider zero-data-retention routing a per-conversation
`requireZdr` preference. Only literal boolean false opts out; absent, invalid
and older preferences stay strict in both native bridges. The setting persists
through new-story setup, model selection, branching and sync. Send/regenerate
and the separate memory worker must receive the same choice. Never forward an
arbitrary renderer provider object or automatically retry with weaker privacy.
Explain provider retention when opting out; account-level policies still apply.
This supersedes older notes describing ZDR as unconditional. The Windows native
bridge changed, requiring the full private installer, not a renderer-only patch.

Private 1.275 includes an automatic agency/viewpoint contract in priority-2
permanent context on every roleplay request, including existing conversations
and compacted branches. Narration stays with the selected AI character, never
inventing the user's words, thoughts, emotions, actions or reactions. Persona
fields and prior assistant overreach are not permission to control the user.
Keep the priority-1 custom prompt precedence intact and keep this roleplay
contract out of the separate factual memory-worker request. Prompt regression
coverage includes every reply style, missing cast, fallback cast and compaction.

Private 1.271 indexes message siblings per immutable messages array and newest
children once per branch navigation. Do not restore per-visible-message scans
of the full transcript. Memory checkpoint lists share a single ancestry set;
conversation previews need only their current leaf, not its entire path. Lore
inspection normalizes the last eight messages once and shares activation and
reason collection. Mini portraits coalesce only in-flight storage reads, never
cache settled blur settings or images across mounts. Opening the conversation
drawer must not reset the reader's scroll position; prepending earlier messages
anchors the existing first message. Gallery portrait changes reset old Chat
framing only for the changed base/variant portrait. The performance regression
counts real operations instead of depending on machine timing.

Private 1.270 keeps per-character/variant `chatPortraitCrop` as bounded x/y/zoom
framing only, using the existing portrait image. It adds no image references or
replacement images. Preserve crops through text restores and saved cast fallback;
never serialize them into model context. A new portrait resets its old framing.
Message avatars retain the thumbnail size/blur guards and lazy loading.
`TokenBreakdown` must tolerate the initial null/debounced budget. Reply budgets
must be integers before the native bridge, otherwise the Windows validator drops
a fractional max_tokens. Lore activation and its inspector share trigger-shape
normalization; selecting another story after deletion must skip sync tombstones.

Private 1.269 establishes an explicit roleplay priority order: always-active
conversation prompt (1), core character/permanent settings (2), temporary story
context and transcript (3). Selected styles override card style suggestions but
yield to the priority-1 prompt, superseding the 1.262 policy below. Keep provider
constraints and the separate factual memory-worker instructions intact.

Editing a user turn can regenerate from a new immutable sibling. `send` reads
`chatsRef.current`, not the previous render's `active` snapshot, and persists the
edit before compaction/provider calls. Old replies and checkpoint ancestry stay
intact. Failed edits remain recoverable locally and never initiate a request.
Composer focus restoration must not depend on `busy`: reply completion, errors
and Stop must leave the reader alone even on Android with a fine-pointer device.
`test-chat-edit-reply-ui.js` executes these paths with real disposable storage.

Local 1.262 gives every roleplay request an explicit task/role contract, includes
character demographics and persona taglines, and makes selected reply styles
take priority over conflicting card/example/optional-prompt style suggestions.
`roleplayText` expands only {{char}}/{{user}} in authored context and new
greetings; never expand existing transcript or memory text or mutate records.
The shared assembler feeds both native OpenRouter bridges unchanged. Keep the
memory worker separate: it summarizes facts, never continues the roleplay.
Long replies warn below a 2,000-token effective cap; no automatic spending-cap
increase. The warning is guidance, not a model-specific minimum. Prompt tests
cover all 48 style combinations, persona fallback, token caps and native payloads.

Local 1.258 matches lore triggers as literal whole words/phrases with Unicode
letter, number and combining-mark boundaries. Scan each of the latest eight
messages separately; never assemble a phrase across messages. Do not scan
character descriptions, injected lore or rolling memory for activation. The
private 1.309 behavior requires a trigger even for attached entries; trigger-free
entries stay inactive. `test-chat-lore-triggers.js`
covers substring false positives and the retained activation window.

Local 1.257 adds per-conversation `alwaysActivePrompt`, `replyPerspective`,
`replyBalance` and `replyLength`. These are permanent roleplay context, survive
compaction and branching, and are not memory-worker instructions. Requests use
named character/persona fields only; never attach `creatorMemo` or serialize a
whole library record. Opening scenario/examples are optional temporary context:
recent messages take priority, and compaction retires those opening blocks.
`permanentTokens + temporaryTokens` must equal the displayed input estimate.
Both categories are resent and can incur provider costs; permanent is not free
model memory. `test-chat-prompts.js` covers the field and budget boundaries.

`chats:all` holds the full immutable-message tree plus `memories` checkpoints
anchored by `throughId`. Only ancestors before the retained recent exchanges
may supply a memory. Forking remaps eligible anchors; deleting a subtree drops
its checkpoints. Do not replace the transcript with a summary or share a future
checkpoint with sibling branches. Increasing recent-exchange retention can fall
back to an earlier checkpoint or the original messages.

Compaction runs only inside an explicit Send/Regenerate operation, at 75% of the
estimated input budget. It uses the same native provider bridge and ZDR routing,
with independent input/output reservations and bounded sequential catch-up
batches. Five actual messages plus the newest user turn stay verbatim by
default; three to five are configurable. Pins are separate authoritative context.
Summaries require an explicit completion marker, reject truncated/filtered output,
and commit before use. Stop, lock, errors or failed writes must never advance an
unverified checkpoint or start a reply after cancellation. The pending user/reply
turn is saved only after compaction succeeds, keeping unsent drafts on failure.

After a checkpoint all subsequent messages accumulate in context until the next
75% threshold, not a last-five sliding window. The mobile composer starts at one
line and resets after Send; sentence capitalisation is requested from the user's
keyboard. Advisory context calculation is debounced, streamed text paints at
most every 80 ms, and unchanged prose is memoized. Send and Inspect context still
assemble the exact live transcript, never the debounced preview.

Private 1.273 moves keystroke state into `ChatComposer`. Its synchronous draft
ref is authoritative for Send/Inspect; the parent receives a 600 ms advisory
update. Programmatic clears also increment the draft-save revision so an empty
advisory value cannot leave an already-saved draft behind. Do not reset local
composer state from delayed preview props. Phones initially render 12 messages;
Show earlier/Show latest only change the drawing window, never `activePath`,
`assemble`, `memoryPlan`, stored messages or checkpoint retention.

An Android explicit stream owns `ChatStreamLease`, a best-effort partial CPU and
Wi-Fi lock with a ten-minute ceiling. Cancellation, stream completion/failure
and plugin destruction release it. It neither keeps the screen on nor bypasses
vault background locking, and is not a promise against Doze/OEM restrictions.
Both bridges require the SSE terminal marker; EOF alone is not success. Android
also forwards finish_reason so truncated/filtered memory is rejected. A failed
unlocked stream saves received text with a single inline error, never silently
retries a paid request. Tests execute the actual native stream/lease and measure
parent render count while typing, alongside the full-history memory regressions.

Private 1.274 suspends nonessential library work while Chat is open. The
`rcv-workspace` event drives `setWorkspacePaused` in the automatic-sync engine;
it pauses native work, stops timers, checks suspension between storage/hash
operations and resumes without changing pairing or acknowledged checkpoints.
The older Chat link originally waited until Chat closed; private 1.313 permits
it while visible, subject to draft, lock and save guards. Local saves and lock guards must
remain active. In-flight atomic writes are never rolled back or falsely marked
as undone. Library image pumps include workspaceOpen in both pause and resume
dependencies; otherwise a modal change can overwrite the quiet flag or leave
images permanently paused. The hidden library does not paint or cycle artwork.
Theme propagation is mutation/resize driven, never a half-second rewrite of all
inherited styles. Context details are on-demand; Send remains authoritative.

The context preview explains the extra request and cost rather than claiming
the post-compaction reply is already known. Tests in `test-chat-memory.js` and
`test-chat-memory-ui.js` exercise the real helpers and renderer with an offline
native stub. No paid provider call is required for the regression suite.

### Private Chat device sync (local 1.259)

Private 1.280 supersedes the full-sync suspension in 1.274 only for conversations.
An established, locally approved stories1 group uses storyTick while Chat is open.
It reads chats and saved sync metadata, not library records or picture bytes;
publishes the last established library snapshot plus the latest conversation
extension; and only pulls peer conversation extensions. First-sync approval,
CAS, lock/background guards and conflict preservation remain required. Cache
unchanged local/peer snapshots so writing does not repeatedly hash transcripts.
The same native encrypted chunk transport and remembered group are reused.

Pending AI placeholders are excluded from outgoing conversation views, rewinding
the projected leaf to the saved user turn. The sender's full record is untouched;
completed responses supersede that projected revision. Do not persist or stream
each token. Imports wait while generation/edits/saves are active. Chat-only UI
reloads replace conversation state without touching drafts, focus, selection or
library images, and never stamp imported revisions as a local edit. Incoming
commit and reload share the applying gate; failed reload is retried. Full library
sync resumes when Chat closes. Standard editions do not enter this private lane.

The owner prioritizes preserving and continuing the same chats over an unbroken
socket. `chat-sync-core.js` stores per-conversation revision ancestry in `_sync`.
Identical writing converges, descendants supersede ancestors, and concurrent
edits preserve a deterministic conflict copy. Deletion is a recoverable revision,
not erasure. Never strip ancestry or replace immutable transcripts with summaries.
Chat UI saves stamp local revisions; merged peer revisions are saved unmodified.
The save queue, lock epoch, busy gate and failed-save gate protect concurrent
renderer operations. Acknowledgments are added only after local persistence.

`chat-link-server.js` is separate from the passive vault-transfer server. It serves
one explicitly paired phone, retains bounded pending snapshots until acknowledged,
and never writes vault records itself. Android's `ChatLinkPlugin` carries native
HTTP only to literal RFC1918 addresses, never follows redirects, and pauses on
activity backgrounding. Both directions use gzip plus AES-256-GCM with fresh IVs
and distinct direction AAD. Nonces bind responses to requests. A 256-bit pairing
secret is sealed by Windows safeStorage or Android Keystore outside vault exports.
UDP discovery is authenticated with that secret and only answers private LAN peers.
Never include API keys or pairing configuration in chat snapshots.

The loop sends changes, skips acknowledged incoming snapshots, retries with capped
backoff and resumes after lock/sleep. Windows disables timer throttling only while
the link is running, so a minimized unlocked host remains usable. Native guards
still refuse locked access. On Android the native transport verifies the current
unlocked UI state, cancels by epoch and closes requests when paused. An oversized
snapshot (32 MiB UTF-8), invalid packet, failed disk write or missing peer remains
local and must never report Saved on both devices. Sync is not a backup.

Snapshots carry only chats and selected character/persona/lore writing needed to
continue them; creatorMemo and image bytes are excluded. The local library wins
when that character exists. Bucket-cover backgrounds and portraits use local images
and respect image blur choices. Drafts are local encrypted UI preferences, not
peer conversation data. Tests cover core merging, actual encrypted loopback HTTP,
the real renderer's acknowledgments/failing writes/late-lock responses, responsive
scene panels, safe formatting and bucket-cover selection.

### Windows Chat migration (1.253 Chat branch)

The 1.253 migration omitted Chromium's per-profile OSCrypt context. Copying
`enc:` files and `e:` PIN blobs is insufficient even under the same Windows
account: safeStorage uses the key protected in `Local State.os_crypt`. 1.254
copies only that OS-protected context into Chat's `standard-encryption` runtime
profile before Electron is ready. The original Chat runtime and its encryption
context are preserved. Capture the stable Chat root before selecting the copied
runtime and retain it for the import pointer and the single-instance lock.
Never initialize safeStorage and then attempt to change its context in-process.

`scripts/verify-chat-windows-encryption.js` tests this using separate Electron
processes and actual Windows safeStorage encryption. It must pass in addition
to the ordinary suite for migration releases. The previous password-only fixture
used `pln:pwd:` data and could not catch failure to decrypt Windows `enc:` records.

The Chat edition has a different userData folder. A fresh Chat profile must not
appear to have lost the user's standard library. `chat-migration.js` copies only
sealed `.dat` records and `security.json` from the standard profile into a new
`standard-copy-<uuid>` directory inside Chat. This is setup of a new encrypted
snapshot, not an unlocked-record write or an in-place restore. It verifies each
copy and checks that source metadata did not change before atomically publishing
`standard-import.json`. Every later Chat startup resolves that pointer for the
vault, security and restore/rewrap journals. Do not revert those paths to the
top-level Chat folder on future releases.

Only the three known first-run bookkeeping files are permitted in a destination
eligible for automatic migration; any user data or password metadata prevents
replacement. Pending source restore/rewrap operations must finish in the standard
app first. Developer `--user-data-dir` launches never auto-read a real standard
vault. Failed copies are isolated, are never selected, and do not change either
existing library. Windows retains the original password and sealed records;
Android's separate package requires backup import or local transfer.

| Key | Contents |
|---|---|
| `chars:all` | array of characters |
| `personas:all` | array of personas |
| `lore:all` | array of lore entries |
| `prompts:all` | array of prompts |
| `trash:all` | the bin: `[{tid, type, record, deletedAt}]`, purged after 30 days. `type` is `character`, `persona`, `lore` or `prompt`, but **only characters and personas are ever put in it** — `restoreFromTrash` understands all four, nothing sends the other two |
| `img:<id>` / `th:<id>` | original image / thumbnail (data URLs) |
| `sz:<id>` | byte size of that image, written once by `saveImage` so stats need not re-read it |
| `buckets:meta`, `pbuckets:meta` | bucket covers + empty buckets |
| `lore:meta`, `prompts:meta` | book covers + empty books |
| `blurset` | ids of blurred images |
| `ui:charsort`, `ui:textsize`, `ui:contrast`, `ui:cardsize`, `ui:dashorder`, `ui:advopen` | preferences |
| `thumbver`, `charfields`, `lorefields` | **one-time migration markers.** Each guards a migration that runs once and then writes its marker. Do not clear or reuse them. |

Character: `{id, name, age, gender, pronouns, tagline, tags[], searchables[],
bucket, lorebooks[], story, personality, scenario, firstMessage, exampleMessage,
creatorMemo, systemPrompt, alwaysActiveSystemPrompt, nsfw, nsfwPicture, variants[],
sections[], sectionOrder, profileImg, banner, gallery[{imgId, caption, album,
variantId}], albums[], imgMeta{}, history[], createdAt, updatedAt}`

- A **variant** carries its own `name`, its own copies of the text fields, and its
  own **`profileImg`**. That last one is the trap in rule 2.
- `variantId` on a gallery image: `""` = shared by all variants,
  `"__default__"` (`DEFAULT_VID`) = Default only, otherwise a variant id.
- `imgMeta[imgId]` carries album/variant for images that aren't gallery entries
  (portraits, banner).
- `history[]` = up to 20 text-only snapshots for restore.

**Preferences must load only after the vault is unlocked.** Reading storage while
locked fails silently and resets the preference — this was a real bug. Load them in
the same gated block as the records, not in their own effect.

## Security model

Every value: optional AES-256-GCM (PBKDF2, 210k) with the master password, then
wrapped again by Windows DPAPI via `safeStorage`. The PIN is convenience only.
Exports are deliberately plaintext. The web edition uses IndexedDB + WebCrypto with
the same contract, minus the DPAPI wrap.

Wi-Fi transfer is LAN-only, opt-in, and the payload is encrypted with a key derived
from the one-time pairing code. The sharing device is **passive**: it serves
`/whoami`, `/manifest` and `/delta` and is never modified by a transfer. Since 1.152
a **mirror** (the only operation that deletes) also asks the other device over
`/mirror-request`, which holds the HTTP response open while that device shows a
dialog; it can allow, refuse, or reverse the direction. Everything fails closed —
no answer, no window, or an older build all mean refuse. Since 1.153 the manifest is
built when sharing starts rather than when it is asked for, because building it
reads and decrypts every record and used to blow the receiver's timeout.

## CharSnap interop (learned the hard way)

CharSnap's **export** format and its **import** format are different. Import
requires top-level `name, gender, tagline, variants[]`, and per-variant
**snake_case** keys: `personality, description, first_message, age` (age is a
string), plus optional `scenario, example_message, system_prompt,
always_active_system_prompt, creator_comment, variant_name, variant_tagline`.
Emitting the 16-key export shape fails validation. Lorebook import uses the Chub
structure plus CharSnap's own fields, and every entry needs ≥1 trigger.

Lorebook files are not reliably flat. Standalone v3 books use `{spec:
"lorebook_v3", data:{entries:[...]}}`, while character cards put the same book
under `data.character_book`; older Chub and CharSnap files keep `entries` at the
root. Some generators also write triggers as comma-separated text rather than
an array. `normalizeLoreImport` deliberately unwraps all of these shapes and
normalises `triggers`, `keys`, `key`, or `keywords` through `toTermList`. Do not
make the root-level `entries` check strict again.

There are **two importers**: "Import JSON" (Basics tab) takes a whole character;
"Import Variant" (Details tab) takes a **bare variant object with the fields at the
root**. They are not interchangeable.

- Custom sections have no CharSnap equivalent, so they are folded into the
  description by `foldSections`, each headed `Title: text` on the same line, single
  spaced inside a section with a blank line between sections.
- Four section titles are claimed instead of folded: "System override", "NSFW system
  override", "Prefill instructions" and "Additional first messages". **Only the
  first section claiming a title gets it**; a duplicate falls back into the
  description. `sectionKinds()` and `splitCharSnapSections()` are built from the same
  rule so the token counter and the export cannot disagree.
- "Hide guts" has no flag in the file: it *is* `|~ … ~|` wrapped around the
  description and personality. Offered as a separate export rather than stored on
  the character.
- At most 5 versions per character, 3 lorebooks per bot, 1500 characters per entry.

## Versioning

The displayed version is a flat number — **1.224** — not semver. It lived in five
places that had drifted to three different values, so it now has one owner:

```bash
npm run set-version 1.224    # rewrites all six display sites at once
```

When the release changes anything the signer counts as shell (main.js,
preload.js, index.html, vendor, or the Chat/sync/provider scripts it lists),
also advance `UPDATE_COMPAT_BUILD` with `node scripts/set-version.js 1.224
--shell`. `npm run set-version 1.224 --shell` silently drops the flag (npm
consumes it), and `npm run sign` then refuses the release.

That rewrites `APP_VERSION` in `app/app.js`, `FACTORY_BUILD` in `app/main.js`,
`app/package.json`, `installer/package.json`, `!define VERSION` in `build/installer.nsi`, and both
`versionName` and `versionCode` in `mobile/android/app/build.gradle`. Never edit
those by hand. `npm run sign` refuses to sign when the version does not match
`FACTORY_BUILD`.

The Android `versionCode` has to be a plain increasing integer, so it is derived
by flattening the display version: 1.224 becomes 1224. It was added late — the
Android project sat at `versionName "1.0"` / `versionCode 1` for every release up
to and including 1.158, which is exactly the drift this script exists to stop.

The **root `package.json` keeps its own semver** (`1.9.3`) and is intentionally
left alone: npm requires valid semver there, and `1.224` is not. Nothing
user-facing reads it — it only names the npm scripts.

Add a `CHANGELOG` entry in `app/app.js` for anything users would notice, written
for a user rather than a developer. Entries before 1.092 are reconstructed from the
code, not a real record — the UI says so, and that label should stay.

Settings > Version history reads like game patch notes (rewritten September
2026: 246 long entries became 33 short ones). Each release has a `heading`
(the plain version, no "(private …)" labels), a short `title` such as "Faster
Saves", and one to ten `notes`, each at most 140 characters and starting with
its kind: `New: `, `Improved: `, `Fixed: ` or `Note: ` (install instructions).
`releaseSections` groups them under those headings in both Version history and
"What's new", which shows exactly `CHANGELOG[0]`, so that entry must be the
current release on its own. Only the current decade (1.330 onwards for 1.337)
stays release by release; each older decade is one "1.320–1.329" highlights
entry. After `set-version` crosses into a new decade, run
`npm run fold-changelog` (idempotent; it merges the finished decade's New,
Improved and Fixed notes into one "Highlights" entry and drops its install
notes), trim that entry to its best ten and give it a name, then
`npm run build:web`. `test-changelog-folding.js` enforces all of this.

## Settings opens two windows of its own

`TrashModal` (Recently deleted) and `ChangelogModal` (Version history) are
separate windows, not folds inside Settings. Both were folds until 1.223, and
with fifty in the bin or a hundred and forty releases listed, opening either
pushed the rest of Settings out of reach.

- They are **state on the root**, not on `SettingsModal`, and render as its
  siblings. Nested inside it they would inherit its stacking context and its
  backdrop click. Settings stays open behind them.
- Escape is taken in the **capture phase** and stopped there, like every other
  modal here, so it closes the window without Settings acting on the same
  press. `test-modal-escape.js` exists because that went wrong once.
- The bin is grouped by kind (`TRASH_GROUPS`): Characters, Personas, Lorebook
  entries, Prompts. The last two can never fill, so they are shown disabled
  with a line saying why rather than sitting there empty. Groups start open
  when the whole bin is 15 or fewer and folded above that, and a search opens
  whichever groups it found something in — a match hidden inside a fold would
  make the search worse than useless.
- Both windows search. The changelog searches the note bodies as well as the
  headings, because what you remember is the thing that changed.

## The shell's own traps

Shell fixes cost everyone a 541 MB installer, so it is worth finding them in
batches. What the August 2026 sweep turned up, all fixed in 1.227:

- **`encodeValue` falls back to `"raw:"` when there is no master key.** Anything
  writing while locked therefore stored the record with no password layer at
  all, under DPAPI only, while `security.json` went on saying a password was
  set. `vault-set` and `vault-delete` were gated; **receiving a transfer was
  not**, and it writes every record that arrives. `writeValue` itself now
  refuses when `isLocked()`, which covers every caller including future ones.
  Gate the IPC entry points too, for a message the panel can show.
- **A transfer writes your records to disk in the clear.** `transfer.plain` is
  the decrypted stream, applied a line at a time. The receive path removes it on
  every exit it controls, but a crash or a force quit is not one of them.
  `clearTransferLeftovers()` sweeps it, `incoming.bin` and `transfer.bin` at
  startup as well as at the end of a transfer. It must not touch `updates/current/`,
  which is the installed patch.
- **The main process had nothing catching a throw.** Anything outside an
  `ipcMain.handle` — a timer, a stream callback, a socket — ended the process and
  the window simply vanished. `process.on("uncaughtException")` and
  `unhandledRejection` now log instead.
- **The transfer server listened on `0.0.0.0`** when `lanAddress()` had already
  worked out the one address it wanted, so it also answered on VPN and virtual
  adapters. It binds to `ip`.
- **`x | 0` is 32-bit.** The range arithmetic in `sendFile` wrapped any offset
  past 2 GB to a negative number. Vaults here run to several gigabytes.

`main.js` is **CRLF**: build every multi-line anchor by joining with `
`, or
it will not match. Check the file is still all-CRLF after editing it.

To try the real shell without touching the real vault:
`npx electron app --user-data-dir=./tmp-vault --remote-debugging-port=9333`,
then drive `window.storage` over CDP. Kill stray `electron.exe` first or the
user-data folder stays locked and the next run cannot start.

## Nothing may take the whole interface down

`app.js` mounts inside a `Boundary` class component (`getDerivedStateFromError` /
`componentDidCatch`). Before 1.226 there was none, so **any** error thrown while
drawing unmounted the entire tree: the page went blank, and with nothing left on
it there was no way to reach Settings and undo whatever caused it. One bin entry
whose `record` had gone was enough. The fallback offers Try again and Reload and
says the vault is untouched.

Two things follow from this:

- **`scripts/build-web.js` pins the desktop mount as an exact string** and stops
  the build if it does not match, rather than shipping a web bundle that mounts
  nothing. Changing how the app mounts means updating `DESKTOP_MOUNT` there. It
  caught exactly this in 1.226 — and note the failure is only visible if you read
  the build output, because `npm run build:web` printing an error while a `grep
  Wrote` finds nothing looks the same as success.
- A boundary is a backstop, not a licence. Anything drawing from stored data
  should still tolerate a record that is missing or malformed — `t.record || {}`
  rather than `t.record.name`.

**A list grouped by a fixed set of kinds needs a catch-all.** `TRASH_GROUPS` ends
with `{ type: null, label: "Other" }` and `trashGroupOf()` routes anything
unrecognised into it. Without that, grouping the bin in 1.225 made entries of any
other kind invisible while Settings went on counting them, so they could be
neither restored nor removed.

## The bin owns the pictures of what is in it

Nothing that removes a record may drop its images. `deleteChar` never did;
the JSON import's overwrite path did, which is why an overwritten character
could not be restored until 1.224. Move the record with `sendToTrash` /
`sendManyToTrash` and leave the pictures alone — `purgeTrashEntry` is the
only thing that removes them, when the entry is emptied or ages out.

**And purging only removes what nothing else holds.** `heldImageIds()`
collects every id the live records and the *other* bin entries point at, and
`purgeTrashEntry` drops the remainder. This is not hypothetical: a restored
backup writes images under the ids in the file, so a binned record and a live
one can hold the same picture, and emptying the bin used to take the live
one's picture with it. The 30-day sweep computes that set **once**, before
anything goes, or entries purged in the same pass keep each other alive.
Build these lists with `imageIdsOf` / `charImgIds` / `personaImgIds`, per
rule 2 — never by hand.

Character and persona imports remap every image id (`normalizeCharacterImport`),
so an import cannot cause that collision itself. Lore and prompt entries are
the exception to all of this: they still delete outright and never reach the
bin, which is deliberate.

## Sections are edited in two places

There is no single sections editor. `SectionsField` is the shared one, used by
`RecordModal` for personas, lorebooks and prompts. **`CharacterEditor` keeps its
own copy of the same list** — its own title input, bin, textarea and token
label, wired to `set("sections", …)` instead of an `onChange` prop. Changing one
does nothing to the other, and "edit character" is the one people mean.

This cost a full cycle in 1.220: copy and paste buttons were added to
`SectionsField`, the driver reported two bins and no copy buttons, and the
feature was simply not on the screen it had been asked for. Anything touching
sections has to be done twice and checked on both screens. `sectionKinds` and
the token label are already shared; only the markup is duplicated.

The clipboard behind copy and paste (`SECTION_CLIP`, `putSectionOnClip`,
`useSectionClip`) is module level with its own subscribers, because copying in
one editor and pasting in the next unmounts the component holding it. It is
deliberately not persisted. A pasted section always takes a fresh `uid()`:
`sectionOrder` addresses a section as `sec:<id>`, so a reused id would put two
sections in one slot — the same shape of bug as rule 2.

## The in-app guide

`GUIDE` in `app/app.js` is a 17-section contents page. It is plain JSON, so it can
be parsed, edited and re-serialised with `JSON.stringify(G, null, 2)` rather than
patched by hand.

- **No em dashes anywhere in it.** Asked for directly. Rewrite the sentence rather
  than swapping the punctuation.
- It is shown in both editions, so anything Windows-only (device transfer, updates)
  must say so.

## Ship procedure

```bash
npm run set-version 1.224           # keep every version site in step first
npm test                            # every check in scripts/, exits non-zero if any fail
npm start                           # launch and actually click the thing
npm run build:web                   # regenerate the web bundle from app/app.js
npm run sign 1.224 "what changed"   # -> dist/Rolecraft-update-1.224.rcvup
npm run build:installer             # always, even when a patch would do
cd mobile && npm run sync           # copies the web bundle just built into android/
cd android && ./gradlew assembleRelease   # -> app/build/outputs/apk/release/
```

A release carries **three application artifacts plus checksums**, and every
published one has: the
`.rcvup` patch, `Rolecraft-Setup-<v>.exe`, and
`Rolecraft-<v>.apk`, accompanied by `SHA256SUMS.txt`. The Android build is
not optional and not separate —
`set-version` writes `versionName` and `versionCode` for exactly this reason, and
`npm run sync` copies whatever is in `web/`, so `build:web` has to have run
first or the APK ships the previous interface.

Say in the release notes which Windows artifact is actually needed. Verify the
published `.rcvup` afterwards by downloading it, base64-decoding
`files["app.js"]` and comparing sha256 against the local build — a release once
went out without the changes it claimed.

`build:installer` needs a staged Electron build at `dist/Rolecraft Vault/`, which
is gitignored. The installer script now rebuilds it from
`node_modules/electron/dist` every time so a dependency upgrade cannot leave a
stale runtime in the public installer. It also needs NSIS
(`winget install NSIS.NSIS`); winget does not put `makensis` on PATH, so
`scripts/build-installer.js` looks in Program Files. Configure a trusted Windows
certificate through the `ROLECRAFT_WINDOWS_CERTIFICATE` or
`ROLECRAFT_WINDOWS_CERTIFICATE_SHA1` environment variable; release environments
should also set `ROLECRAFT_REQUIRE_AUTHENTICODE=1` so signing fails closed.

## Where it ships

`github.com/CptBendova/RolecraftVault`, **public**, and GitHub Releases is the
only distribution channel. Nothing is automatic: the app never checks for
updates and never downloads anything. A user fetches the `.rcvup` from a release
themselves and hands it to **Settings, App updates**, which is what lets rule 1
hold — the interface has no network at all, and the shell only ever reads a file
the user picked.

**A tag is not a release.** `v1.202` is tagged and pushed but was never
published; 1.203 superseded it minutes later. So the tags and the releases do
not line up, and `git tag` is not evidence that a version reached anybody. Check
the Releases page before assuming a version shipped. The user-facing `CHANGELOG`
still carries a 1.202 entry that nobody ever received, near-duplicating 1.203's
— harmless, but do not treat CHANGELOG entries as proof of a release either.

**Commits can sit past the last tag at the same version number.** Nothing stops
work landing on `master` after a release without a version bump, and
`build:installer` will happily stamp the old number onto it. Before building,
run `git diff v<latest>..HEAD` and bump first if anything shipping has changed.

## Setting up a new machine (done 24 August 2026)

The repository carries its own history and its keys, but none of the toolchain.
On a fresh Windows box, in this order:

| Tool | How | Note |
|---|---|---|
| Node 22+ | `winget install OpenJS.NodeJS.LTS` | last verified on 24.19.0 |
| JDK 21 | `winget install Microsoft.OpenJDK.21` | sets `JAVA_HOME` machine-wide by itself. Java 25 does not work with this Gradle |
| NSIS | `winget install NSIS.NSIS` | lands in Program Files (x86), the first path `build-installer.js` checks |
| Android SDK | command line tools, below | Android Studio is not needed and never was |

Then `npm install`, `npm test`, and `cd mobile && npm install`.

Nothing about the code needed touching. Four environmental things cost the time:

- **winget does not update an already-open terminal.** `npm` reads as "not
  recognized" in the window you ran the installer from while working perfectly in
  a new one. Same for `JAVA_HOME` and `ANDROID_HOME`, and same for any tool
  spawned from a shell that started before the install.
- **npm 11 blocks postinstall scripts**, including the one that fetches the
  Electron binary. It warns rather than failing, so the install looks fine and
  `npm start` then dies on a missing exe. `npm approve-scripts electron`, or run
  `node node_modules/electron/install.js` directly.
- **The Android SDK installs headless.** Unzip `commandlinetools-win-*_latest.zip`
  from `dl.google.com` into `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`, set
  `ANDROID_HOME` and `ANDROID_SDK_ROOT`, then `sdkmanager platform-tools
  "platforms;android-36" "build-tools;36.0.0"`. Licenses must be accepted first,
  and `sdkmanager --licenses` does not read a PowerShell pipe: redirect a file of
  `y` lines into it through `cmd /c` instead. AGP pulls `build-tools;35.0.0` in on
  its own during the first build, which is expected.
- **Extract that zip somewhere shallow.** It contains a guava jar named
  `listenablefuture-9999.0-empty-to-avoid-conflict-with-guava.jar`, which crosses
  MAX_PATH from a deep temp directory. `Expand-Archive` then leaves a half
  unpacked tree that still looks like a folder, and `sdkmanager.bat` is simply
  absent from it.

The move itself proved two things worth recording. `npm run build:web`
regenerated `web/js/rolecraft-app.web.js` byte for byte against the committed
copy, so a release built here matches one built there. And the relative
`storeFile` path in `mobile/android/keystore.properties` works: a release APK
built on the new machine reports the same certificate SHA-256 as the keystore.
Confirm that with `apksigner verify --print-certs`, never with `keytool`.

**Do not run the development build against the real vault.** If the source tree's
`FACTORY_BUILD` differs from the installed app's version, starting it treats any
`.rcvup` you have installed as stale and deletes it, silently returning the
installed app to whatever the last installer gave it. Use a throwaway vault:

```bash
npx electron app --user-data-dir=./tmp-vault
```

The library itself lives in `%APPDATA%\Rolecraft Vault\` and is not in the
project. Move it between machines with the device transfer in Settings, or an
exported backup.

## Layout notes

- A record that opens over the library (character, persona, editor) is a
  `.scrollbody.sheet`: `position: fixed`, and **must not be width-capped**, or the
  library shows around it on a large screen.
- The reading column is capped and the gallery takes the surplus, so a wider screen
  means bigger pictures rather than longer lines. Above 1700px the gallery drops its
  oversized lead tile and becomes an even grid.
- `.scrollbody` is reused by small scrollers inside panels, which is why the column
  rule is `.rcv > .scrollbody` and not `.rcv .scrollbody`.
- On a Capacitor phone, fixed `.scrollbody.sheet` records stop above the 62px
  bottom navigation plus `safe-area-inset-bottom`. Do not give them the library's
  `100vh - 56px` height: 56px is the top bar and leaves six pixels drawn into the
  bottom navigation.

## Phone copies dying while saving around 1 GB (1.168)

1.166 got the bytes onto the phone. Saving then stuffed every picture into IndexedDB. Android WebView IDB fills up around a gigabyte (QuotaExceededError, or a put that never returns), so a 4 GB vault stopped at about 30%. The UI also failed to clear its busy state if `storage.set` threw.

Since 1.168, Capacitor stores anything over 16 KB as a file under `Directory.DATA/kv/` in 384 KB chunks, with only a `file:` pointer in IDB. `window.storage` still returns the same strings. The browser edition is unchanged. Retrying a merge after install skips hashes that already match.

## Encrypted vault folder on Android (1.172)

Holding those files as UTF-8 data-URL strings and then `get()`-ing them back into the WebView is what made a multi-GB library slow and then close the app: the dashboard preloaded every picture, compare hashed by reading each original, and `imgCache` never let go.

Since 1.172, large records on Capacitor are AES-256-GCM files under `Directory.DATA/vault/` (`RCVS1` + iv + ciphertext). The wrap key is a device key in IDB when no master password is set, or the master key when one is. IDB only keeps a `bin:` pointer and the 16-char fingerprint. `hash()` of old `file:` leftovers reads bytes, not a JavaScript string. The interface on a phone loads thumbnails only, at most three at a time, and keeps 64 thumbs / 4 full pictures. `kv/` files from 1.168–1.171 still read. The browser edition is unchanged.

### Cross-edition integrity boundaries (1.241)

Streaming text is stateful even when the surrounding JSON and encryption are
correct. Android Filesystem calls encode each JavaScript string separately, so
the backup writer must not split a UTF-16 surrogate pair between calls. Windows
reads decrypted transfer NDJSON with `StringDecoder`; decoding independent 1 MiB
buffers corrupts a UTF-8 sequence that crosses the buffer boundary.

Android storage treats the encrypted file as staged data. Its `v:` pointer and
`h:` transfer fingerprint are one IndexedDB transaction, and only that commit
makes the new file live. Deletion commits removal of both metadata keys before
best-effort file cleanup. Password changes migrate the legacy `file:` payloads
from 1.168-1.171 into `bin:` files before committing the new security record and
wrapped file key; skipping those pointers either left plaintext behind or left
old-password ciphertext unreadable.

Full-backup verification is about the payload actually written, not only the
four top-level arrays. Covers and bin records contribute image references,
missing bytes abort export, and every array element is checked before restore.
Lorebook and prompt exports carry book metadata as well as entry pictures so
empty books and covers survive a round trip.

1.173 asks the Filesystem plugin for storage before the first write and `mkdir`s `vault/`. On Android 8–12 the plugin still prompts; without `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32) in the app manifest that prompt auto-denies and a copy fails immediately. Android 13+ does not need the prompt for app-private files.

## Public Android exports (1.243, 1.248)

An HTML download link is swallowed by the Capacitor WebView, and Capacitor's
Filesystem enum does not expose modern public Downloads or Pictures
collections. `FileExportPlugin` is therefore the owner of user-visible exports.
JSON, text, backups and ZIP archives go through `MediaStore.Downloads` in
bounded writes. Individual pictures go through `MediaStore.Images` with
`Pictures/Rolecraft Vault` as their relative path so Gallery apps can see them.
Android 8 and 9 use the matching public directory and must run the media scanner
after finishing a picture. They also require the native `FileExportPlugin` to
request `WRITE_EXTERNAL_STORAGE` before opening that public directory; declaring
the permission in the manifest does not grant it at runtime. Keep the requested collection explicit in the JS
bridge, accept it only for an `image/*` MIME type natively, and leave the
app-private Filesystem path as a failure fallback rather than the advertised
destination.

## Phone copies dying around 130 MB (1.166)

A Capacitor HTTP response is read entirely into a Java byte array, then base64, then a JS string. Around 130 MB that stops, which is why computer-to-computer copies (streamed to disk) worked and PC-to-phone did not.

Since 1.166 the PC packs `/delta-file?i=N` batches. A picture larger than 4 MB of plaintext is its own batch, then sent in 1 MB slices (`off`/`n`). The phone decrypts each piece, saves it, and asks for the next. Both devices need 1.166. `/delta-file` with no query is still the combined file, so an older PC receiver still works.

## PC-to-Android transfer fast path (1.229)

The original batched protocol stayed compatible, but it did far more work than
the receiver used. `/delta-start` built a combined encrypted file *and* every
Android batch, PBKDF2 ran again for each batch on both devices, and an ordinary
8 MB batch crossed Capacitor's native bridge in three HTTP calls. On a vault with
hundreds of batches, encryption setup and round trips became a material part of
the copy.

Modern receivers now put their need in the query string:

- Android asks for `/delta-start?mode=batches` and the PC never builds the
  duplicate combined file.
- Desktop asks for `/delta-start?mode=combined` and the PC never builds unused
  Android batches.
- No `mode` means compatibility: both are still built, so old receivers work
  with a new sender. Old senders ignore the query and still work with new
  receivers.

Every batch in one pack shares a salt and PBKDF2-derived key but has its own
random 96-bit AES-GCM IV. Reusing a key with unique IVs is the intended GCM
model. New Android copies cache that key; older copies see a valid ordinary
`RCVX2` file and merely repeat the derivation as before. The Android slice is
12 MB now, which covers the base64 expansion of the normal 8 MB picture batch,
so the common case takes one native request. An oversized picture is still
sliced below Capacitor's response limit.

After records have actually saved, both new receivers send an authenticated
`/delta-complete`. Only then does the sender say Complete, and it deletes
`delta.bin` / `delta-N.bin` immediately. Failure to acknowledge is harmless and
kept out of the receive result because an older sender has no such route.
`test-delta-slices.js` lifts the real mode, writer, key cache, slice downloader,
and cleanup functions and exercises this compatibility matrix.

## Streamed binary Android transfers (1.239)

The 1.229 fast path still had a lifecycle ceiling: the Windows server stopped on
a fixed ten-minute timer, it prepared every batch before the phone received the
first one, and pictures remained base64 data URLs inside JSON. Capacitor then
base64-encoded each encrypted HTTP response again to cross the native bridge.
A large vault could therefore spend its whole lifetime packing, create several
full copies in memory, or have the sender disappear while the phone was saving.

Current Android requests `mode=stream-batches` with a random idempotent session
id. The Windows sender must keep these properties together:

- every session owns `delta-<session>-N.bin`, never the legacy global names;
- the first finished batch is published through `/progress?id=...` immediately;
- no more than three unacknowledged batches are retained on disk;
- `/delta-ack` deletes a batch only after Android authenticated and processed it;
- any authenticated activity renews the ten-minute idle lease; and
- `/delta-complete` cleans only that session, not another phone's active files.

`RCVX3` is still AES-256-GCM with the shared per-session key and a unique IV per
file. Its plaintext is a sequence of length-prefixed metadata plus bytes. Data
URLs are decoded on Windows and image bytes travel directly; text remains UTF-8.
Old receivers keep `RCVX2`, and old senders that ignore the new mode still fall
back to the old batch path.

Android's `TransferTransport` plugin streams each GET into a private cache file.
Only bounded 512 KB reads cross back to JavaScript, so CapacitorHttp never builds
a whole-response byte array and base64 string. Each slice retries four times.
The foreground service holds both a partial CPU wake lock and a high-performance
Wi-Fi lock. Do not replace this with a WebView-only keepalive.

Transferred pictures are stored under the `bin2:` pointer format. It contains a
private encrypted binary file plus the original data-URL prefix; `get` rebuilds
the data URL only when the interface needs it. The IDB pointer is the commit:
write a unique new file, change the pointer, then remove the previous file.
Never delete the old file before the replacement is complete. A known transfer
fingerprint is stored directly instead of hashing the picture again.

A partial mirror must perform no deletions. New records that saved are retained
for a retry, but `removable` is applied only when every requested record saved.
`test-large-transfer.js` covers framing, retry, leasing, acknowledgements,
atomic pointer order, mirror safety, native streaming and both wake locks.

## Android: the two things that broke transfers (1.160)

Both were found by reading Capacitor's own Android source in
`mobile/node_modules/@capacitor/android/.../CapacitorHttpUrlConnection.java`,
after two releases had shipped fixes aimed at the wrong thing. Read that file
before theorising about the transfer again.

- **`window.Capacitor.Plugins` does not exist here.** It is built by Capacitor's
  JS runtime (`@capacitor/core`), and `index.html` loads `rc-transfer.js` as a
  plain script with no bundler, so nothing ever creates it. `native-bridge.js`
  only ever *reads* `cap.Plugins`. The call that works is
  **`Capacitor.nativePromise("CapacitorHttp", "request", opts)`**, which is the
  same channel `Plugins` would have used underneath. Reaching for
  `Plugins.CapacitorHttp` threw on every request, and the error said the bridge
  had not loaded when it was the lookup that was wrong — which sent the diagnosis
  off toward Android permissions for two rounds. `INTERNET` was never missing.
- **A binary request body needs `dataType: "file"`.** Android base64-decodes the
  body *only* in that branch; otherwise it writes the string as UTF-8, so the
  payload arrives ~4/3 the length and fails to decrypt with nothing logged. It
  looks exactly like a wrong pairing code. That decode is also guarded by
  `SDK_INT >= 26`, which is why `minSdkVersion` is 26 and not 24: on 24 and 25 the
  guard skips the write entirely and the body goes out empty.
- Responses are fine as they are: `responseType: "arraybuffer"` comes back as a
  base64 string, which `ask()` already handles.
- `tests/` still does not exist, but `scratchpad/test-transfer.js` shows the shape
  that caught this: lift `ask` and `nativeRequest` out of the real file by brace
  matching, stub `nativePromise` to decode the body *the way Android does*, and
  assert the bytes an actual HTTP server receives. Note `lift()` must look for
  `async function` first or it silently drops the keyword.

**Release APKs do not look like debug APKs inside.** AGP renames resources to
short paths (`res/o-.png`, no `mipmap-` directories) and re-compresses PNGs, so
verifying an icon by path or by sha256 against the source raster both fail. Match
by decoded dimensions and look at the image. `keytool -printcert -jarfile` also
reports "Not a signed jar file" for a correctly signed APK, because it only
understands v1 JAR signing; use `apksigner verify --print-certs`.

## Icons and installer branding (1.159)

One mark across all three editions: a brass crest with a keyhole on the app's
dark blue. Letter-based designs were tried first and rejected — an initial says
nothing the name beside it is not already saying.

Everything is generated from one SVG rather than drawn per platform, so there is
no second copy to keep in step. The rasters were produced by rendering that SVG
to a canvas in the browser and reading the PNG bytes back; the `.ico` files are
assembled in Node, since an ICO is just a directory followed by the PNGs.

- **Windows app.** `app/icon.ico`. The packaged exe is a renamed `electron.exe`,
  so it wore Electron's icon and called itself Electron in file properties until
  1.159. `scripts/build-installer.js` now stamps the icon and the version strings
  with `rcedit` on **every** build, because `dist/` is gitignored and gets
  rebuilt from scratch elsewhere. Doing it once by hand would not survive.
- **Windows installer.** Since 1.165 this is a separate Electron app in
  `installer/`: a frameless 16:9 window, a still of the brass crest, gold dust
  and a breathing light around it (not a camera move — those jump when they loop).
  `scripts/build-installer.js` stages that app with the product as `resources/payload`,
  then a **silent** NSIS script (`build/installer.nsi`) wraps it into one Setup.exe.
  People never see NSIS pages. `build/setup-icon.ico` is the crest with a download
  badge so setup is telling apart from the app in a Downloads folder. Imagine
  watermarks the bottom-right of generated art; crop it off before shipping.
  A top-left crop (`crop=1100:618:0:0`) throws the subject off-centre. Take a
  square centred on the shield instead so the mark is gone and the keyhole stays
  in the middle of the lock-screen tile.
- **Android.** The adaptive icon is the two vectors in `drawable/` and
  `drawable-v24/`; the `mipmap-*` PNGs are only for launchers older than API 26,
  where the shape has to be baked in. The crest spans x 26..82, y 20..88 of the
  108dp viewport, inside the ~72dp a launcher mask may leave, so no mask clips it.
- **Web.** A 48px PNG inlined as a data URI in `web/index.html`, rather than a
  file, because the bundle gets dropped into other people's pages.
- The finish page launches the app through `explorer.exe`, not directly. The
  installer runs elevated, and a direct `Exec` would hand that elevation to the
  app; the vault is per user, so it could quietly create a second empty one under
  the administrator's account.

To preview wizard changes without installing anything, compile a throwaway copy
of `installer.nsi` with `RequestExecutionLevel user` and an empty install
section, run it, and screenshot with PowerShell `CopyFromScreen`. Call
`SetProcessDPIAware()` first or the window rectangle comes back in the wrong
coordinate space and the capture is cropped.

## Graphics modes and theme motion (1.230)

Private 1.272 adds Quality-only theme-derived materials and short compositor
entrances to Chat and library surfaces. Keep mode geometry, opaque prose surfaces,
mini portrait framing and the compact keyboard layout unchanged. WritingIndicator
is the only new repeating decoration: IntersectionObserver gates it to visible
content, the host pauses on visibility/lock, and Performance/reduced-motion stop
it. Do not animate bucket images, add perpetual ambient loops or replace privacy
filters. Forced colours suppress decorative gradients and shadows. The focused
`test-chat-quality-motion.js` covers these gates with an offline provider stub.

Private 1.268 uses a single-row mobile Chat header. Keep secondary controls and
context/sync details in Options, not another toolbar or composer row. Test long
loaded conversations when reopening the same story and switching equal-length
histories; content-only effect dependencies miss these navigation events. Keep
keyboard resize following subordinate to the reader's near-bottom state.

Android `captureInput` must stay false for normal writing. CapacitorWebView's
true branch returns a raw BaseInputConnection instead of the WebView editor
connection, bypassing the IME's correction and capitalisation flags. HTML
autocorrect attributes cannot fix that native bypass. Preserve composition
events and never send a reply for an IME-confirmation Enter key.

Private 1.260 refreshes the shared library and Chat styling without changing the
storage or sync protocol. Keep mode geometry identical. Text-bearing Chat
surfaces (including novel reading and message labels) must stay opaque over a
bucket cover; never solve this by dimming every user's images. Performance
disables backdrop filters on the Android navigation bar as well as dialogs, but
must retain privacy image filters. Chat's mode and reduced-motion gates include
pseudo-elements. `MessageTools` collapses actions on phones and resets to the
appropriate state when the viewport crosses 760px. The real-renderer
`test-visual-refresh.js` checks 32 combinations of viewport/theme/graphics mode,
short keyboard-height viewports, collapsible actions, and opaque novel surfaces.
It uses a disposable fixture and does not contact a provider or real vault.

Android Chat uses a distinct package identity, so a first install beside the
standard edition is not an upgrade or automatic library migration. The empty
Dashboard explains both safe import paths. QR transfer errors previously appeared
above the receiving controls in a long Settings dialog and could be missed;
results now scroll into view and announce errors. Rejected preview promises must
clear the busy state. `verify-private-chat-shell.js --vault-transfer` exercises
the complete Android receiver against a disposable real Windows shell, including
binary pictures, but stubs Android native HTTP/filesystem and is not hardware QA.

Quality and Performance are resource contracts, not only CSS choices. Four
details are easy to miss because the screen can look correct while the browser
keeps doing unnecessary work:

- Do not preload the crest film into a detached video. `CrestMark` creates the
  real video only when a large live crest is visible in Quality; Performance
  must not download or initialise a decoder for it.
- Canvas dust takes its colour from the current theme. Pass the theme through as
  a dependency so switching Dark, Light, CharSnap or Custom, including changing
  the live Custom accent, rebuilds the motes with the new `--brass` value
  immediately without a reload.
- Pausing dust means cancelling its pending animation frame. A loop that keeps
  requesting a frame and merely skips drawing still wakes the renderer sixty
  times a second under every panel. Resume it when the library is visible again.
- Reduced motion includes pseudo-elements. The crest breathes and gleams through
  `::before` and `::after`, so the media rule must still those as well as ordinary
  elements.

Short entrance motion for panels belongs to Quality and is theme-neutral.
Performance and reduced-motion remove it through the same global gates. Run the
real renderer check below whenever changing the theme root, ambient layer, crest,
panels, or Graphics setting.

Custom theme memory lives beside `rcv-theme` in localStorage, not inside the
encrypted vault, because its colours must be available before unlock. Store only
the four user-facing colours. `customThemeVars` owns every derived colour and the
contrast protection; do not start persisting individual CSS variables or let a
Settings preview bypass that function. The same inline variables must be present
on locked, loading, error and ready roots so no state flashes back to Dark.

### Responsive dashboard, libraries and image grid (1.238)

- A routine backup is a Settings concern. Keep export, restore, transfer and
  backup health together under **Backup & transfer**; reserve the Dashboard's
  health area for something the user can recover immediately, such as a draft.
- Dashboard gallery art is deliberately bounded by `dashboardPictureLimit`:
  every device gets at least eight pictures when that many exist, rounded up to
  a complete measured row and capped at twelve. Phones use two compact columns;
  tablets and desktop widths get totals that fit their measured columns.
  Initialise the measured column count from the device class so the first render
  does not briefly queue desktop quantities on a phone. The ResizeObserver must
  attach after `ready`, because the Dashboard ref does not exist during the
  loading render.
- On Android, **Start from anywhere** and **Recent work** are the only Dashboard
  sections that collapse. Their state is device-local and Reset layout clears
  it along with the custom section order.
- Character and persona card size is a Settings choice, not a library-toolbar
  control. Both libraries use `.grid-cards`; a local hard-coded persona grid
  silently ignored the shared preference. The root carries `cards-small`,
  `cards-medium` or `cards-large`; an Android phone must render exactly 3, 2 or
  1 card per row respectively.
- The phone sidebar is exactly five equal grid cells. Its desktop `.brand` and
  `.side-tools` children have inline display styles, so the phone override must
  win explicitly or the Rolecraft crest and name occupy cells under the Android
  bar and push navigation off centre.
- At 360px, Spotlight stacks image above prose and uses `object-fit: contain`.
  A fixed wide `cover` stage magnifies and crops portrait artwork, which shipped
  in 1.234. Dashboard counts use two columns and gallery labels remain visible
  without hover. Audit every primary screen, record, editor and Settings for
  page overflow as a set; they do not share all their layout rules.
- Performance skips the full Spotlight original, not the picture. Its preview is
  first in the Dashboard's stable priority batch, followed by the visible gallery
  tiles, so returning from a large library cannot strand Dashboard art behind
  off-screen card reads. Android tablets carry a `.tablet` root class derived
  from their physical shortest screen edge; keep their Spotlight side by side
  even when WebView scaling puts the CSS viewport under the phone breakpoint.
- A picture at or below 1000px can still exceed the phone's one-megabyte preview
  guard and legitimately has no `th:` value because `makeThumb` does not rescale
  it. Performance may fall back to the original for the one bounded Spotlight,
  but do not weaken the guard for ordinary library cards or galleries.
- Do not use `overflow-wrap: anywhere` on mobile modal buttons. It breaks even
  short words into vertical fragments when a segmented row gets narrow. Settings
  choice groups use explicit phone grids and `.settings-choice` keeps each label
  whole; longer ordinary actions may still wrap at spaces.
- Responsive Electron checks use `useContentSize: true`; otherwise a framed
  320px window has only 304px of renderer space and the test is not measuring the
  width it names. Keep the exact 320px phone and 600px tablet-threshold cases.
- The image grid's editing header is sticky on desktop but must scroll away on
  Android; stacked variant and album tools otherwise leave no viewport for the
  pictures. Phone Small/Medium/Large is exactly 3/2/1 columns and tablet is
  exactly 4/3/2. The whole tile already opens the image, so Android hides the
  duplicate corner open button and keeps Select and Blur in opposite corners.

### Android 15/16 system bars (1.247)

Target SDK 35 made edge-to-edge mandatory and target SDK 36 removed the opt-out.
`WindowCompat.setDecorFitsSystemWindows(window, true)` is therefore not a safe
way to protect the WebView on current Android. `MainActivity` applies system-bar
and display-cutout insets to the native content container on API 35+, then zeros
only those handled inset types before they reach the WebView. Do not return
`WindowInsetsCompat.CONSUMED`: keyboard inset changes still need to reach the
WebView or focused editor fields can disappear behind the IME. Older supported
Android versions keep the reliable fitted-window behavior.

## Testing notes

The private runner disables native Windows occlusion for disposable Electron
checks. Background build sessions otherwise report `visibilityState: hidden`
even on focused test windows, suppressing image intersections and delaying
renderer calls. Never carry these test-only flags into the shipped app.

`npm test` runs everything below, plus `check-integrity` and `scan-js`, and exits
non-zero if any of them fail. It finds `scripts/test-*.js` by name, so a new
check is picked up without being registered anywhere. Run one on its own with
`node scripts/<name>.js`. Each was written because something shipped broken:

| Script | What it catches |
|---|---|
| `test-shell-detect.js` | a release routed to the wrong artifact — a patch that needed the installer, or the reverse. Covers `app/vendor/` (rule 4) |
| `test-update-compatibility.js` | a cumulative renderer package skipping over a required Windows shell release |
| `test-release-engineering.js` | current runtimes, dependency-chain removal, installer compression/signing hooks, clean test profiles, CI, security guidance and checksum ownership |
| `test-hardening.js` | the security posture of both shells and the Android manifest, asserted from the source rather than assumed |
| `test-modal-escape.js` | Escape dismissing what is on top and only that. Needs Electron |
| `test-native-drag.js` | reordering by drag, driven with real mouse events. Synthetic DragEvents pass against broken code. Needs Electron |
| `test-grid-drag-paths.js` | every drop target accepting on `dragenter` as well as `dragover` |
| `test-grid-edge-scroll.js` | the grid scrolling while a picture is carried to its edge |
| `test-grid-view.js` | the gallery's layout, measured rather than eyeballed. Needs Electron |
| `test-image-gates.js` | the rules deciding when a full-size original may be read |
| `test-add-image.js` | adding pictures from the phone's gallery, including the ones Android cannot decode |
| `test-file-save.js` | exports actually writing a file on Android, where a browser download does nothing |
| `test-qr-scanner.js` | the scanner's framing staying square on any screen |
| `test-touch-targets.js` | controls staying big enough to hit with a finger |
| `test-perf-mode.js` | what performance mode turns off |
| `test-ui-modes.js` | live theme recolouring, paused animation frames, panel fit at phone width, Performance doing no off-screen film work, and reduced-motion covering pseudo-elements. Read the canvas `fillStyle`, not random anti-aliased pixels. Needs Electron |
| `test-custom-theme.js` | Custom colour controls, live derived palette, accessible text, phone-width fit and persistence across a reload. Needs Electron |
| `test-premium-visual.js` | the 1.304 visual contract: accent primaries and focus rings with readable contrast in every theme, segmented Settings choices, text over artwork, Quality-only motion and reduced motion, viewer stacking over the Android bars, phone toolbars and tablet touch targets. Needs Electron |
| `test-chat-reading-flow-ui.js` | the 1.316 chat contract at 360px, keyboard height and desktop: compact header/composer, layered turn menus and Options, streaming that never moves a reader who scrolled up, jump-to-latest, typing that re-renders no turns, gesture-loaded history, group speaker collapse, and Quality/Performance geometry parity. Needs Electron |
| `test-chat-panels-ui.js` | the 1.331 panels: group scene summary in the header (no floating strip or stray counters), no permanent preflight row, story-list avatar cluster, sectioned Settings/Scene panels with keyboard tabs and a sticky close, expandable long help text, the docked Scene panel on wide screens, and the model-limit default for chats without a saved context size. Needs Electron |
| `test-ui-layout-audit.js` | all primary screens, records and editors fitting phone/tablet/desktop/wide viewports; Dashboard hierarchy and picture count; working library card sizes; and five centred Android navigation cells. Needs Electron |
| `test-device-unlock-screen.js` | a real locked Android render with biometric enrollment, including the unlock action. It catches component-scoped platform flags that only fail for protected vaults. Needs Electron |
| `test-window-restore.js` | a window restoring onto a display that is still attached |
| `scan-js.js` | assignment to a `const` binding — a runtime TypeError `node --check` cannot see. One of these killed every phone copy in 1.173. Takes file paths; scope-aware, and skips strings, templates, comments and regex |
| `test-update-assets.js` | the crest failing to load under an active patch (rule 6). Needs Electron; `NO_BASE=1` simulates a shell older than 1.192 |
| `test-warm-pass.js` | the background warm asking for more originals than it can keep |
| `test-image-eviction.js` | both picture caches, including that neither eviction loop can spin forever |
| `test-device-limits.js` | phone vs tablet vs desktop limits, across reported and unreported memory |
| `test-phone-image-guard.js` | the rule keeping full originals off a phone, including when a picture has never been measured |
| `test-delta-slices.js`, `test-transfer.js` | the transfer wire format and what Android actually puts on the socket |
| `test-transfer-resilience.js` | transfer timeouts staying as requested, and both receivers giving up when a sender vanishes during packing |
| `test-transfer-panel.js` | what the panel *says* on both ends: that a received vault appears without a relaunch, and that the sender reports it finished. Needs Electron |
| `test-section-clipboard.js` | copying a section between records: the clipboard surviving an unmount, fresh ids on paste, and the header not overflowing a phone. Covers both section editors. Needs Electron |
| `test-phone-scrollbars.js` | drawn scrollbars on a phone (menu, library column, panels), the theme row wrapping instead of running off the panel, and that the deliberate desktop bars survive. Runs with OverlayScrollbar so this Chromium behaves like the WebView. Needs Electron |
| `test-settings-popups.js` | the bin and version history opening as their own windows, searchable, and Escape closing one without closing Settings. Needs Electron |
| `test-import-overwrite.js` | an overwritten record reaching the bin with its pictures, and emptying the bin sparing a picture a live record still holds. Needs Electron |
| `test-robustness.js` | a damaged or unrecognised bin entry blanking the app or hiding from every group, plus the countdown clamp, the search trim and a long name running off the editor. Needs Electron |
| `test-shell-guards.js` | the shell's own guards: no write while locked, no plaintext left behind by a transfer, byte offsets past 2 GB, and the LAN-only listen. Lifts main.js; plain node |
| `test-ux-systems.js` | bottom navigation/back dispatch, durable undo, visible draft protection, text-only templates, Android biometrics, Windows Hello, and `.rcvup` file handoff |

They all follow the same rule, which is the point:

**Lift the real code and run it.** Find it in the file by name or by its first and
last line, brace-match to its end, and `new Function` it with stubs. Never retype
the logic into the test — lift it, or the test proves nothing about what ships. A
test that cannot fail proves nothing either: run it against the code *before* the
fix and watch it fail before trusting it.

What has worked well besides:

- **Lift the real function out of `app.js` and run it.** Find it by name, brace-match
  to its end, and `new Function` it with stubs for what it closes over. This has
  caught real bugs, including ones in the fix being written. Do not retype the logic
  into the test — lift it, or the test proves nothing about the shipped code.
- **Drive the web build in the browser** for anything visual, and measure rather than
  eyeball: element rects, computed styles, grid track counts.
- **Ask the element that has a width whether something overflowed.** A flex row
  sized to its own content always answers no: `scrollWidth > clientWidth` on the
  button group was false while a button sat well off the side of the card
  around it. Measure against the card, or compare `getBoundingClientRect().right`
  with the container's. In 1.220 that false negative was caught only by looking
  at a screenshot, which is exactly what measuring is meant to replace. Check a
  narrow width too — 360px is the phone that breaks these rows, and a header
  that fits on a desktop can still run off the card there.
- Electron's `capturePage()` on a `show: false` window returns a stale or empty
  frame. `win.show()`, focus it, wait, then capture.
- **A closed fold looks exactly like no fold.** Two assertions in
  `test-settings-popups.js` passed against the very code they were written to
  condemn, because the thing they measure only misbehaves once it is opened.
  Press the control first, then measure. Run every new check against the old
  code and read which ones *pass*: any that do are not testing what you think.
- **Styling `::-webkit-scrollbar` opts that element out of Android's overlay
  scrollbars.** The overlay ones fade away by themselves and take no layout
  space; a styled one is drawn permanently and repainted on every frame of a
  fling, which reads as a flickering bar. That was the flashing line under the
  phone menu in 1.221. On a touch layout, hide the bar (`scrollbar-width: none`
  plus `::-webkit-scrollbar { display: none }`) rather than styling it — a
  finger cannot grab 6px anyway. `.sidebar`, `.scrollbody` and `.modal` are all hidden below 760px for
  this reason; the desktop bars are deliberate and stay.
- To see any of that from a desktop Chromium, launch with
  `app.commandLine.appendSwitch("enable-features", "OverlayScrollbar")`.
  Without it, desktop Chromium always reserves scrollbar space and the
  difference is invisible. The measurement that settles it is the room the
  element sets aside: `offsetHeight - clientHeight - borders`, which is 0 for an
  overlay bar and the styled width for a drawn one. Comparing screenshot pixels
  during a scroll proves nothing — the content underneath is moving too.
- The transfer panel is Electron-only. To render it in the web build, stub
  `window.transfer` before opening Settings. Three things about that stub cost
  an afternoon in 1.219, all of them making the harness look like the bug:
  **every reply needs `ok: true`.** `preview` and `start` are both read as
  `if (r && r.ok)`, so a stub returning a perfectly sensible
  `{added, updated, removed}` sends the panel down its error path, no plan
  appears, and the Confirm button — which is the *same* button with a different
  label — never renders. It looks exactly like a broken panel.
  **Type through the browser, not through `.value`.** Setting the input's value
  leaves React's state empty and the button stays disabled. Focus the field and
  use CDP `Input.insertText`.
  **Settings is a modal over the library**, so close it before counting
  `.char-card`s, or the library reads as empty and a passing fix looks failed.

Things a harness **cannot** check, which must be tried by hand:

- Image uploads (needs a real canvas for thumbnails).
- **A real two-device Wi-Fi transfer.** PC to phone has been run against real
  hardware repeatedly since 1.166 and is the source of most of the transfer
  notes above. PC to PC still has not, and mirroring needs 1.153+ on both.
- **Anything needing the window itself**: full screen, and the Settings control
  for it, were checked by driving the real window and measuring its rectangle.
  Match the Electron process by pid, not by window title — `*Rolecraft*` also
  matches a browser tab on the GitHub page and the installed copy, and keys sent
  to the wrong window produce a confident, meaningless pass.

**A check is only trusted because its exit code is read.** Both `scan-js.js` and
`test-update-assets.js` once printed their verdict and exited 0 regardless, so
either could have failed for a whole release without anyone seeing it. Anything
new here must exit non-zero when it fails, and be watched doing so.

The same applies to how a check finds the code it lifts. Seven of these had the
old machine's absolute path (`C:/Rolecraft/rolecraft-vault/...`) baked in, and
had been throwing ENOENT since the project moved drives — a full release cycle
during which the whole suite proved nothing. They are `__dirname`-relative now.
Never write an absolute path into a check.

Still worth doing: moving them into `tests/`.

### Device unlock, Android Back, and update-file ownership (1.232)

- Android biometric unlock stores only an AES-GCM ciphertext in private native
  preferences. Its key is authentication-bound in Android Keystore and the
  enrolled secret is the already-derived 32-byte vault key, never the master
  password. A password change/removal deletes the enrollment.
- Capacitor invokes plugin methods on its task handler. Construct and authenticate
  `BiometricPrompt` through `getBridge().executeOnMainThread`; its API is
  main-thread-only. Treat `BIOMETRIC_STATUS_UNKNOWN` as worth trying, and return
  the exact unavailable reason to Settings instead of silently hiding the feature.
- `LockScreen` is a separate component from `RolecraftVault`. It must derive its
  Android label from its own prop or platform check, never the `ON_PHONE` const
  local to `RolecraftVault`; that crashes only after native status reports an
  enrolled biometric, before either unlock path can be used.
- Windows Hello gates a DPAPI-protected copy of that same derived vault key.
  Every non-`Verified` OS result fails closed. Do not replace the fixed WinRT
  script with renderer-controlled PowerShell input.
- `window.__rcvAndroidBack()` is the single bridge between the AndroidX back
  dispatcher and React. It returns true only when it unwound a modal, editor,
  record, book, or library destination; false at Dashboard lets Android exit.
- The Android bottom bar remains reachable while fixed record sheets are open.
  A primary destination must clear the complete reading stack (record, entry and
  book) before changing the library underneath it. Do not clear editors through
  this path; their own close flow protects unsaved writing.
- `.rcvup` belongs to `RolecraftVault.Update`, registered by the elevated custom
  installer. Both first launch and `second-instance` must pass the file through
  `installUpdateText`, so double-click cannot bypass signature or shell checks.
- Templates and duplicates are text-only on purpose. Sharing image ids between
  two live records would let deleting a picture from one damage the other.
