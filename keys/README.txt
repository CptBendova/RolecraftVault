SIGNING KEY — KEEP THIS OFFLINE
===============================

Put private_key.pem in this folder (copy it from your update kit zip).
It is gitignored on purpose.

Why it matters:
  Every installed copy of Rolecraft Vault has the matching PUBLIC key baked in.
  Any .rcvup signed with this private key is trusted and executed by those copies.

  - If it leaks, someone else can push code your users' apps will run.
  - If you lose it, you cannot sign updates for the existing install base;
    everyone would need a fresh installer with a new key baked in.

Keep an offline backup (USB / password manager). Do not put it in the repo,
in Discord, or in any cloud folder that syncs publicly.

Sign an update:
  npm run sign 1.9.3 "what changed"
