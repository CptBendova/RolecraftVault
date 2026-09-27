# Rolecraft

Rolecraft is an offline-first app for characters, personas, lorebooks, pictures, and
roleplay conversations. It runs on Windows and Android. The library works
offline; AI chat and image generation use external providers only when you
choose to send or generate something.

Download the current installer, Android APK, and signed Windows interface update
from the [latest Rolecraft release](https://github.com/CptBendova/RolecraftVault/releases/latest).

## Install without losing your library

Install a newer Rolecraft build **over the existing Chat-edition installation**.
Never uninstall first to update: uninstalling the Android app removes its
private vault and conversations.

- **Windows:** The name on screen is now Rolecraft, but the app continues to
  use the existing `%APPDATA%\Rolecraft Vault Chat` profile. The new installer
  must keep that location so your encrypted library, chats, and settings remain
  available. Use a full installer when native shell files change; a renderer
  update alone cannot deliver those changes.
- **Android:** The launcher name is now Rolecraft, but the application ID stays
  `com.cptbendova.rolecraftvault.chat`. A correctly signed APK with a higher
  version code upgrades that existing Chat app in place and keeps its local
  data. Do not change the application ID or signing key to rebrand it.

The older standard Rolecraft Vault app is a **different installation**. Its
Android storage is not automatically shared with this app. If your latest
library is still there, export a complete backup or use the in-app local
transfer before removing anything. On Windows, an eligible first Chat-edition
installation may copy the standard vault after verification, but an existing
Chat profile is never silently replaced. Check the resulting library before
you retire the older installation.

Before pairing or merging devices, make a full backup of the most up-to-date
library. Sync is not a backup, and a password cannot be recovered for you.

## Use Rolecraft

The Dashboard opens first. Characters, Personas, Lorebooks, and Chat are the
other main destinations in the Windows sidebar and Android bottom bar. Prompt
Vault opens from the Dashboard. You can also manage galleries, buckets, drafts,
and backups. Search, tags, workflow status, themes, accessibility options, and
Quality/Performance modes help organise large libraries. Chat is part of the
same app, not a separate edition or an always-visible overlay.

Roleplay chats can use character cards, personas, lorebook triggers, branches,
group participants, and rolling memory. The complete transcript stays in the
encrypted vault even when older messages are compacted for a model request.
Review the assembled context before sending sensitive writing to a provider.
Provider usage may incur charges.

In group chats, the portrait picker chooses the next speaker, while optional
multi-character rounds use the story in order. A compact scene strip and
recipient-specific scene facts help track who was present or learned something.
Older groups keep their shared transcript and memory behavior. You can opt in
to character-specific knowledge lanes for new private asides and separate
rolling memories; existing shared turns and scene notes remain shared. The
reviewed story ledger links facts, relationships, and promises to source turns
on the current branch. AI scene suggestions are optional and can be reviewed
or undone without regenerating a reply. Optional spending warnings pause
automatic group extras; they are not provider-side billing caps.

You can pair trusted Windows computers and Android devices on the same local
Wi-Fi for encrypted, two-way library and conversation sync. Pairing and the
initial merge require approval. Later edits can flow between paired devices;
concurrent alternatives remain recoverable instead of silently replacing a
record. API keys and passwords are not part of ordinary vault sync. Android
screen-off sync requires an explicitly started foreground session with a
visible Stop notification; otherwise locking or backgrounding pauses access.
After a saved conversation refresh, Chat highlights incoming turns, alternate
branches and conflict copies for review; it never auto-sends a roleplay reply.
You can explicitly offer an unsent draft to another paired device and import it
there if the same chat revision is open and the receiving draft is empty. Ordinary
reply drafts remain local and are never copied by routine sync.

Chat requests use a protected OpenRouter key. Optional image generation uses
protected OpenAI or xAI keys and sends only the prompt and selected references
after an explicit Generate action. The renderer itself cannot make network
requests; native bridges handle the approved provider and local-network work.
Keys are kept outside vault records, exports, and normal sync. Any deliberate
key sharing between paired devices requires a separate, explicit action.

## Work on the code

Read [AGENTS.md](AGENTS.md) and the relevant section of
[CLAUDE.md](CLAUDE.md) before editing. In particular, preserve the existing
Windows profile, Android application ID, release signing identity, encrypted
storage, and user pictures. Do not run a development build against an installed
vault. Use a disposable profile instead:

```powershell
npm install
npm run check
npx electron app --user-data-dir=./tmp-rolecraft-vault
```

For Android, rebuild the web payload before syncing Capacitor assets:

```powershell
npm run build:web
Set-Location mobile
npm run sync
Set-Location android
.\gradlew.bat assembleRelease
```

The Android signing keystore and Windows update-signing material are private.
Never print, commit, upload, or replace them casually. Verify a release APK's
certificate with `apksigner verify --print-certs` before treating it as an
in-place update.

## Licence

Rolecraft is free to use but not open source. User-created writing and images
remain the user's property. See [LICENSE](LICENSE) for the full terms.
