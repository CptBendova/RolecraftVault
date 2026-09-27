# Security policy

Rolecraft (repository: Rolecraft Vault) is offline-first and stores vault data
locally, but reports about any of the following should be treated as sensitive:

- vault encryption, the master password, PIN, Windows Hello or Android biometrics;
- signed `.rcvup` update verification, the Windows installer or APK signing;
- local Wi-Fi transfer, paired device sync, the chat link, pairing QR codes or
  explicit API-key sharing between paired devices;
- storage of OpenRouter, OpenAI or xAI keys, and the native bridges that send
  explicit chat, voice or image requests;
- imports, backups, exports and Android storage.

## Reporting a vulnerability

Use **Security > Report a vulnerability** on this GitHub repository. That opens a
private report visible only to the maintainer. Do not include exploit details,
private vault data, signing material, passwords, API keys, or pairing codes in a
public issue.

Include the affected Rolecraft version and platform, the impact, reproduction
steps using disposable data, and any suggested mitigation. The latest published
release is the supported version; reports affecting older releases should say
whether the problem still reproduces after updating.

## What to expect

The maintainer will acknowledge a usable report, investigate it privately, and
publish a fixed release before disclosing details that would put existing users
at unnecessary risk. Signing keys, vault files, and personal data must never be
attached to a report.
