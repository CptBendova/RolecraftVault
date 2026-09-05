# Rolecraft Vault 1.252 quality audit

## Fixed

- Persona search ignored tags and search terms; both libraries now share a
  normalized search helper.
- Numbered names sorted lexically; the shared comparator now uses natural order.
- Persona cards and image tiles did not support Space activation.
- A nested control's key event could activate its parent card as well.
- Storage failure offered no retry control and suggested a restore that was not
  accessible from that screen. It now offers a non-mutating reload and advises
  preserving the original files.
- The guide incorrectly implied recovery drafts were not written before Save.
- Release routing could compare shell changes against a non-release tag. It now
  selects only the app's flat version-tag format.

## Checked

The complete regression suite covers Windows renderer behaviour, 360px Android
layouts and tablet layouts, card/grid sizes, custom themes, Quality/Performance
and reduced motion, touch targets, navigation, imports and JSON updates,
Downloads export, image ownership and bin recovery, encrypted restore,
lock/write guards, and large-transfer failure handling.

This release does not change vault locations, native package identities,
encryption formats, or signing keys. Source cleanup is limited to shared search,
sort and keyboard helpers; the surviving renderer source remains intact.

## Limits of verification

Source inspection, regression simulations, visible Electron UI checks, Android
release compilation, signature checks and artifact hashes do not prove every
hardware scenario. Physical Android biometric prompts and multi-gigabyte
transfers on a real phone still require device testing. No trusted Windows
Authenticode certificate is configured, so SmartScreen warnings remain possible.
