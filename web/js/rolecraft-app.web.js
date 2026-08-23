const {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo
} = React;

/* ============================================================
   Rolecraft Vault — a private library for roleplay characters,
   personas, lorebooks and prompts. Data persists via storage.
   Design: deep-ink archive, serif display, brass accents.
   ============================================================ */

/* Single source of truth for the displayed version. Do not hand-edit: run
   `npm run set-version <v>`, which rewrites this line, app/package.json,
   FACTORY_BUILD in main.js and VERSION in build/installer.nsi together. */
const APP_VERSION = "1.189";

/* Version history shown in Settings.
   Only the 1.092 entry is a real record. Everything before it was reconstructed
   by reading the code — this project kept no changelog and has a single commit,
   so earlier releases left no notes behind. The reconstructed entries are
   anchored on the one-time migrations still present in this file (thumbver,
   charfields, lorefields), which are hard evidence that those changes happened,
   in that order. Their version numbers are genuinely unknown, so none are
   claimed. The UI labels this section as reconstructed; keep that label. */
const CHANGELOG = [{
  heading: "1.189 — current",
  notes: ["A tablet is no longer treated as a phone. Everything the Android app does to keep memory in check was measured for a phone and then applied to tablets as well, because the only question being asked was whether this is Android at all. So a large tablet with plenty of memory was holding back exactly as hard as a small phone with very little: fewer pictures kept ready, fewer read at a time, and a smaller allowance overall.","It now looks at the screen and at how much memory the device reports. A tablet keeps three times as many pictures ready to draw, reads more of them at once, and is given an allowance to match what it actually has, so grids and galleries fill in as you scroll rather than being fetched again. Phones are unchanged except that a phone with more memory is now allowed to use more of it, and one with less is asked to use less.","None of this changes what is stored or how it is protected. It only decides how much is kept ready to show."]
}, {
  heading: "1.188",
  notes: ["A library of more than sixty-four characters stopped blanking cards as you scrolled. The phone was keeping a fixed number of picture previews and letting the rest go, so once you had more characters than that, scrolling far enough pushed the earlier ones out and they had to be read again on the way back. It now budgets by how much memory the pictures actually take rather than by how many there are, and since a preview is small, hundreds stay ready at once instead of sixty-four.","Opening a character no longer makes you wait in the grid. Every picture in that character is already read when you open it, but only a handful were being kept ready to draw, so a long gallery fetched them again as you swiped. The pictures belonging to the character you have open are now all kept ready. This costs nothing extra: they were already in memory, and what the screen holds is the same picture rather than a second copy of it.","The dashboard spotlight is drawn from the original now. It is the one picture on that page shown large enough to tell the difference, and on a wide screen it was being enlarged past the size of the preview it was drawn from. The smaller tiles beside it are unchanged, because at the size they are shown the preview is already sharper than the screen can display."]
}, {
  heading: "1.187",
  notes: ["Two limits that keep a phone from running out of memory had stopped doing their job. Neither showed up as a message: the app simply became heavier the longer you used it, and on a large vault it could close on its own.","The first is the small preview of each picture. The phone is meant to keep the last sixty-four and let the rest go, but since 1.182 it kept every one it had ever read, so scrolling a big library slowly filled the phone's memory and never gave any of it back. It lets them go again.","The second is the rule that keeps full-size originals off a phone. A picture is only drawn from its original when it has no smaller preview, and then only if it is small. That test relied on a note of how much each picture weighs, and a picture that had never been measured was let through instead of held back, which is the opposite of what was meant. Those are the pictures most likely to be old and large. Each one is now measured the first time it comes up, kept only if it is genuinely small, and skipped without being read at all from then on."]
}, {
  heading: "1.186",
  notes: ["On a phone, leaving the app — Home, Recents, or switching to another app — locks the vault again, so the PIN is required when you come back. The preview in the app switcher is blank, so nothing from the library is visible there. A copy that is already running is left to finish.","Restoring a lore entry or prompt from the bin no longer lands it on the persona list. Deleting a picture takes it off the screen straight away. Captions count as an update. Opening a character keeps your place in the list. The vault no longer holds every original in memory at once — the character you opened stays ready to swipe, and the rest load quietly in the background."]
}, {
  heading: "1.185",
  notes: ["A character with dozens of pictures was still showing the small previews when you opened it. After you unlock, every original now loads in the background one at a time so the window stays smooth; opening that character jumps its pictures to the front of the line, so a gallery of sixty is already full size when you swipe."]
}, {
  heading: "1.184",
  notes: ["Windows was hitching — especially in Settings and when swiping pictures — because the library behind those screens kept decoding every full photo in the vault and redrawing the whole window for each one. Settings now pauses that work, swiping no longer redraws the list underneath, and Windows only loads full pictures for the character you actually opened. The phone still warms the Characters tab and dashboard as before."]
}, {
  heading: "1.183",
  notes: ["Opening a character on a phone now loads every full picture in that record, not just the first dozen — a larger gallery was still fetching as you swiped. The Characters tab and the dashboard do the same for every picture they show, so cards and “From your galleries” use the full image rather than a small preview."]
}, {
  heading: "1.182",
  notes: ["Pictures on a phone stay visible while you scroll the library. Only a handful of previews were being kept, so cards further down went blank. After unlock the phone now reads every picture preview in the background; originals stay on disk until you open a character or persona, and then that record’s full pictures are loaded so swiping is already ready. Windows no longer decodes every gallery in the vault the moment it opens, which is what made it feel slow."]
}, {
  heading: "1.181",
  notes: ["If a PIN is set, the lock screen is a number pad. A PIN is digits only, but the field used to open the full keyboard, which on a phone covered the screen and offered letters you cannot use. Tap the digits, or use a hardware number row. You can still switch to the master password."]
}, {
  heading: "1.180",
  notes: ["The app icon on a phone showed the crest too close, as if it had been zoomed in, because Android cuts a circle out of the middle of the picture. The shield now sits smaller in the tile so the whole mark is visible.","Opening a picture from a grid now fills the screen, and you can swipe to the next one. The same swipe works in the slideshow. A Grid button sits next to Slideshow at the top of a character or persona, so you do not have to scroll past the writing to find it. Tap a picture to open it; the circle in the corner still selects."]
}, {
  heading: "1.179",
  notes: ["The last Android file never reached the unlock screen. A new picture-preparing step ran as soon as the app opened, before it knew the vault was locked, and that closed the app on start. Unlock is first again. After you unlock, the library opens, then picture previews for the cards and “From your galleries” load from the encrypted folder — originals stay on disk, so a large vault is not held inside the app."]
}, {
  heading: "1.178",
  notes: ["After you unlock on a phone there is a preparing screen that reads every picture preview from the encrypted folder on the device. Originals stay on disk, so a large library does not sit inside the app. “From your galleries” and the cards then have their pictures ready instead of sitting empty."]
}, {
  heading: "1.177",
  notes: ["A master password can be set on a phone that already has a library. It used to rewrite every picture under the new password, which on a vault of a few gigabytes sat on “Working…” and then stopped. Pictures are already in an encrypted folder; the password now locks the key to that folder, which is instant. Small text records are still encrypted with the password as before.","A copy onto a phone keeps going when the screen turns off. Android was putting the app to sleep, which killed the transfer. A small notification stays up while it copies so the work is allowed to continue. You can turn the screen off. Both of these are in the Android file."]
}, {
  heading: "1.176",
  notes: ["Copying a large vault between devices is much quicker to check, and a copy that hits a bad record no longer stops the rest. Checking what is already on the phone used to read every picture just to compare fingerprints; it now reads the fingerprints it already stored when those pictures were saved, so a retry after a failed copy only fetches what is still missing. If one picture cannot be written, the rest of the copy still runs, and the next try picks up the gaps. Both devices need this version."]
}, {
  heading: "1.175",
  notes: ["The lock screen crest is a new loop of the still shield, with gold dust and light moving around it. Imagine puts a Grok mark in the corner of that film; cutting the mark off a wide frame used to slide the shield to the side. The square on the lock screen is taken from the middle of the wide frame, around the shield, so the mark is gone and the keyhole stays in the centre."]
}, {
  heading: "1.174",
  notes: ["A phone copy stopped as soon as it had collected the records and never unpacked any of them. Each batch of records is released from memory once it has been saved, so a large batch is not still being held while the next one arrives. That release was written in a way the phone refuses to run, and it sat immediately after the first batch was saved, so the copy failed there every time. The message it gave was a line of programmer's shorthand rather than anything you could act on, which is why it looked like it had simply stopped.","The copy now runs through every batch as intended. If it does fail, it still reports the reason, and that reason is now the only thing that can appear rather than being hidden behind this fault."]
}, {
  heading: "1.173",
  notes: ["The lock screen crest sits straight now. The keyhole was up and to the left of centre in the picture, so on a phone or a tablet it looked like the shield had been nudged. It is cropped so the keyhole is in the middle of the tile.","A copy onto a phone asks Android for storage before it starts saving, and creates the encrypted vault folder first. Without that, a large copy could fail as soon as it tried to write. Install this Android file over the last one and copy again. Do not uninstall."]
}, {
  heading: "1.172",
  notes: ["Pictures on a phone now live in an encrypted folder on the device, not inside the app. The last copies were saving into the same memory the interface uses, so a library of a few gigabytes made the app slow and then close itself. The app only reads a picture when it is actually on screen, and it lets go of ones you have scrolled past. Checking what is already there no longer loads every photo just to compare. Install this Android file over the last one and copy again. Do not uninstall."]
}, {
  heading: "1.171",
  notes: ["A second copy onto a phone no longer re-reads every picture already there. The last interrupted copy left a few gigabytes on the device, and checking those one by one is what made the next attempt crawl. The phone now remembers a short fingerprint when it saves a record, so a retry only fetches what is still missing. The copy also uses less memory so the app is less likely to close itself mid-way."]
}, {
  heading: "1.170",
  notes: ["Copying a large vault to a phone is less slow. Each piece on the wire is a little bigger (still far under the size that used to kill a copy around 130 MB), and the phone spends less time pausing between records while it saves. Both devices need this version. If a copy stopped around two and a half gigabytes, install the new Android file over the last one and copy again — records already on the phone are skipped."]
}, {
  heading: "1.169",
  notes: ["The lock screen crest is sharp now. It was a tiny picture stretched up, which is why it looked blocky on a phone and on a large monitor. It uses a high-resolution mark, grows with the screen, and the looping film of the metal uses that same sharp still as its first frame. Menu icons and the sidebar crest also change size with the window, so they stay even on a narrow pane or a 4K display. Behind the library, brass light and dust drift slowly so the page does not sit dead; they take their colour from Dark, Light and CharSnap, pause when the app is in the background, and still if you have asked the system for less motion."]
}, {
  heading: "1.168",
  notes: ["A large copy onto a phone no longer dies while saving. The phone was putting every picture into the same small store the interface uses, which fills up around a gigabyte and then stops, even after the computer had already sent everything. Pictures now go into the app's own files on the device, in small pieces, so a library of several gigabytes can finish. If a copy was interrupted, install this Android file over the last one and copy again — records already on the phone are skipped. Do not uninstall, or you lose what landed."]
}, {
  heading: "1.167",
  notes: ["The crest now moves. On the lock screen it sits in a field of brass dust with a breathing light, and a short looping film of the metal catching the glow. The same living crest is in the sidebar. Dust and gleam take their colour from the theme, so Dark, Light and CharSnap all keep the brass they already use. If you prefer less motion, the system setting for reduced motion stills it."]
}, {
  heading: "1.166",
  notes: ["Copying a vault to a phone no longer dies around 130 MB. The computer now sends the library in small pieces, and a picture larger than 10 MB is its own piece, pulled a megabyte at a time so the phone is never asked to swallow the whole file at once. Each piece is saved as it arrives, so a drop mid-way keeps what already landed. Both devices need this version: Windows needs the installer, and the phone needs the new Android file.","The letter R in the sidebar and on the lock screen is gone. The brass crest sits there instead, with a slow gleam that uses the same brass colour in Dark, Light and CharSnap."]
}, {
  heading: "1.165",
  notes: ["The Windows installer is no longer the grey wizard. Setup opens as a full-window high-definition screen with the brass crest held still, gold dust and light moving around it, and a gold progress bar, then copies the app onto this computer. If you already run Rolecraft Vault you do not need this for the app itself. It is for a fresh install, or for anyone running Setup again."]
}, {
  heading: "1.164",
  notes: ["A transfer no longer sits on “gathering the records” with no idea whether anything is happening. The computer now reports how many records it has packed and how many bytes it has sent, and the phone reads that report while it waits, so both screens show a real bar. On a large library the gathering step can still take a while — it is reading every picture that has to move — but the numbers keep moving, so you can tell it is working."]
}, {
  heading: "1.163",
  notes: ["The crest is new. Same shield and keyhole, drawn as brass you could almost pick up rather than a flat graphic, and it now appears on the app, the installer, the phone, and the splash.","The Windows installer looks like it belongs to the app: the welcome page and the header carry the same metal crest on the dark navy, and the setup file in Downloads is marked with a small download badge so you can tell it apart from the installed app."]
}, {
  heading: "1.162",
  notes: ["On a phone you can scan a QR instead of typing the transfer code. Share this vault on the computer now shows the code as a QR as well; on the phone, Settings then Transfer has Scan, which fills the code in for you. You can still type it if you would rather.","Getting a vault ready to share is much faster after the first time. The wait was the computer reading and hashing every picture in the library, and it was doing that again on every press of Share, even when nothing had changed. It remembers those hashes now, so a second share on an unchanged vault is ready almost at once. The first share of a large library still has to read it once."]
}, {
  heading: "1.161",
  notes: ["The Android app is a real installed app now: it opens on its own screen, keeps your vault in the app's private storage on the device, and no longer stalls on the crest. The previous Android build could fail to install, and when it did open it could look like a web page whose storage would not last. This one is signed so phones will take it, then hands off from the crest into the library.","If a Rolecraft Vault is already on the phone from 1.158, 1.159 or 1.160, uninstall that copy first. Android will not put this file over a copy signed as a test build, and uninstalling erases what is in it, so export a backup from Settings if you have anything you want to keep. After this, later APKs install over it normally.","Windows is unchanged. If you already run 1.160, the small update file is enough."]
}, {
  heading: "1.160",
  notes: ["Transfers to and from the Android app now actually work. The fix in 1.159 was aimed at the wrong thing. The app asks Android to make the network request on its behalf, and it was asking through a door that does not exist in this kind of build, so every attempt failed before anything was sent and the panel reported that the bridge had not loaded. It asks the right way now.","A second fault sat behind that one and would have broken a transfer even once it connected. The vault is encrypted and then handed over as raw data, but Android was being told to send it as plain text, so it arrived about half again as long and could not be unscrambled. Nothing reported an error; it would simply have looked like a wrong pairing code. Both are fixed together, and the fix is tested against the exact bytes rather than by eye.","The Android app is now signed properly rather than shipped as a test build. This is the one change that asks something of you: because the old copy was signed differently, Android will not install this one over it. Uninstall the old app first, and note that uninstalling erases whatever is in it, so export a backup first if you have anything you want to keep.","Settings told Android users the wrong story about their own vault. It said the vault lived in “this browser's storage” and that clearing site data would erase it, which is what the web edition says because the Android app is built from it. On a phone or tablet the vault is private to the app, no browser or other app can read it, and it is never copied to Google Drive. It says that now, and it names what does erase it: uninstalling, or clearing the app's storage.","Android 7.0 and 7.1 are no longer supported. The part of Android that unpacks a transfer only exists from Android 8 onwards, so on those two versions a transfer would have sent an empty payload and failed silently. Refusing to install is the more honest outcome."]
}, {
  heading: "1.159",
  notes: ["The app has an icon of its own at last. It was built on a shell called Electron and had been wearing that shell's plain icon ever since, so on the taskbar, in the Start menu and in alt-tab it looked like a generic app rather than this one, and Windows called it Electron in its file details. It is a brass crest with a keyhole now, and it calls itself Rolecraft Vault everywhere Windows shows a name.","The Android app has the same crest. It is drawn as a proper adaptive icon, which means your launcher can mask it to whatever shape it likes, a circle, a rounded square or a squircle, and the crest sits well inside that shape rather than having its edges clipped.","The setup program looks like part of the app now. It was the plain grey wizard that comes as standard: no artwork, someone else's name along the bottom, and a Properties dialog with nothing in it. It opens on a page with the crest and a line about what the app is, it wears the crest with a small download badge so you can tell it apart from the app itself in a Downloads folder, and it offers to open Rolecraft Vault when it has finished.","Starting a transfer on the Android app could fail before it began, and the transfer panel would simply not be there to explain why. The part that reaches the other device was being set up at the moment the app loaded, which is slightly before Android has finished providing it, and when that failed it took the whole panel with it. It is set up when a transfer is actually made now, and if it still cannot start, the panel appears and says so rather than disappearing."]
}, {
  heading: "1.158",
  notes: ["Pictures can be reordered without dragging them. Dragging is the only way a gallery could be rearranged, and dragging does not work on a touch screen at all, so on a tablet or a phone the order of your pictures was simply fixed. Open the grid and every picture now has an arrow on each side that moves it one place. Dragging still works exactly as it did.","Sections and the dashboard were already fine, because both have had move up and move down buttons beside the grip for a while. The gallery had the grip without the buttons. It matches now.","The arrows sit along the bottom of a picture, clear of the buttons for opening, blurring and selecting it, and they work with a finger, a mouse or the keyboard."]
}, {
  heading: "1.157",
  notes: ["“Download all images” said every image in the vault and meant every image attached to a character or a persona. Bucket covers were left behind, and so were lorebook and collection covers and the pictures inside lore entries and prompts. It now takes all of them: covers go into their own folders, and a picture inside an entry is filed under its book and named after the entry it belongs to.","Everything in that zip is the original, at full size, and always was. It reads the stored picture rather than the smaller version used for the cards, so what lands on disk is exactly what you put in.","Bucket covers now have a download corner of their own. Point at a bucket and there is a small arrow beside the buttons for setting and removing its cover, which saves just that picture at full size rather than making you fetch the whole library to get one image.","A bucket whose name cannot be used as a folder name no longer overwrites another one. Two buckets called “A/B” and “A:B” both reduce to the same safe name, and the zip used to keep only whichever was written last."]
}, {
  heading: "1.156",
  notes: ["Giving the gallery the spare width in 1.155 was right, but it went into one picture instead of more of them. The first picture in a gallery spans both columns and stands taller than it is wide, so the wider the screen got the bigger that single image grew, until on a large monitor it was most of what you could see.","A lead picture earns its place when the gallery is narrow and there is only room for one thing at a time. Once there is room for six, it just crowds out the other five. So above a certain width the gallery becomes an even grid and every picture is the same size: on a 2,000 pixel window that is four across at about 200 each, where before it was one at 806 by 927. Below that width nothing changes and the lead picture stays.","The top of the page was left half finished. The creator memo stopped at 760 pixels inside a column with more than twice that to give, and nothing followed it, so the whole band read as empty on a wide screen. It now uses what is there, while still stopping short of the full width of a large monitor, because a memo is read like anything else."]
}, {
  heading: "1.155",
  notes: ["A character or persona on a wide screen was giving the writing the space and the pictures none of it. The writing took one flexible column and the gallery a fixed slice of at most 420 pixels, so every pixel a bigger monitor offered went into making the lines longer: at full width the text ran to about 1,800 pixels across while the pictures stayed small. That is backwards, and it is what made the page look empty.","It is the other way round now. The writing stops at a readable width and the gallery takes whatever is left, so a bigger screen means bigger pictures rather than longer lines. On a 4K monitor the gallery goes from 420 pixels to about 1,150, nearly three times the size, and the writing settles at a width you can actually read. On a small screen nothing changes.","Card size is a setting. Settings has Small, Medium and Large under the reading size, and it applies to the character and persona libraries. Small fits far more on screen at once; large gives each character a proper portrait. It is remembered like the other preferences, and Reset layout puts it back to medium.","The picture count has come off the caption on a card. It shared a line with the tagline in a row that wrapped, so on a narrower card the tagline dropped underneath it and the caption grew from two lines to three, with the dark panel behind it eating further up the picture. It is a small badge in the top corner now: still there if you want it, out of the way of the writing, and covering about half a percent of the card instead of a whole extra line."]
}, {
  heading: "1.154",
  notes: ["The bar showing a vault being got ready to share was in the wrong half of the panel. There is one progress bar and it lives with the receiving controls, so pressing Share put the spinner on the button at the top and the bar itself down beside the code box, which is not where you are looking. It now sits directly under the button you pressed, with a line saying what it is doing and why a large library takes a moment.","Pressing Share also made the receiving button say “Checking what would change”, because both halves of the panel shared one idea of being busy. They are separate now. You still cannot receive while a share is starting; the button simply stops claiming to be working on something you did not ask for."]
}, {
  heading: "1.153",
  notes: ["Sharing a vault timed out before it ever started. The listing the other device asks for is built by reading and decrypting every record you own, pictures included, and hashing each one. That was left until the other device asked for it, and the other device only waits thirty seconds, so on a vault of any real size the first thing that happened was a failure saying the other device did not answer. It had answered; it was still reading.","The work now happens the moment you press Share this vault, with the button telling you it is getting ready and a bar showing how far along it is. The code appears only once this device can answer immediately. The reading is done in small pieces so the window keeps responding rather than freezing while it works.","The device receiving also waits three minutes instead of thirty seconds now, in case it is asking a copy that has not warmed up yet. A device that is not there still fails straight away, because that fails when connecting rather than when waiting.","Opening a character on a large screen left the library showing around it. A character, a persona or the editor opens as a sheet over everything else, but it was sharing the same width limit as the page underneath, so on a 4K monitor it was narrower than the screen. Worse, the two were centred against different things, so the grid of characters poked out past its edge and stayed visible. A sheet now covers the screen it is covering.","Nothing is capped to a narrow column in the middle of a big monitor any more. The libraries, the galleries and anything else built from a grid now use the whole width and simply fit more per row: a 4K screen shows eighteen characters across where it used to show eight. The dashboard keeps a limit of its own, because a heading on the far left with its counts three thousand pixels away stopped reading as one thing.","The reading column inside a record is wider too, but still stops well short of the full width of a large monitor, because a line of text that long is genuinely hard to read. Characters with a gallery keep the two-column layout and now have considerably more room for it."]
}, {
  heading: "1.152",
  notes: ["A mirror is now agreed on both devices. Mirroring is the only thing in the app that deletes records, and until now the device it deleted from was the only one that knew it was happening. The other machine sat there sharing, with no idea. It now shows a box naming both devices and saying how many records would be copied, overwritten and deleted, and nothing is written anywhere until somebody answers it. A question nobody answers counts as a refusal, never as approval.","If the direction is wrong you can turn it around from that box instead of starting again. Choosing “the other way” makes the device that was sharing the one that gets overwritten, and it then shows its own summary and its own red confirm before anything happens. This is the case worth having: you set it up on the wrong machine and notice it on the other screen.","Mirroring needs this version on both devices. An older one cannot be asked, so rather than quietly going ahead without the agreement, mirroring stops and says which installer the other device needs. Merging is untouched and still works with any version, because it only ever adds and updates.","The tick box for mirroring was also the wrong way round in its wording. It said “Mirror the other device”, which reads as though it changes the other machine, when it changes yours. It now says “Mirror onto <this device>” and states that the other device is never changed.","The guide explains all of it properly, including the thing that made it confusing: both devices show the same panel, so both have a mirror tick box, and the one you can see governs only the machine you are looking at. It also now says a transfer is all or nothing, and that exporting a single record is the way to move one character rather than the whole library."]
}, {
  heading: "1.151",
  notes: ["The guide now says which parts belong to the Windows app alone. Copying your vault to another device and installing updates do not exist in the web edition, and their panels are simply not shown there, so the guide said nothing while someone went looking for a button that was never on their screen. Moving a vault out of the web edition is a backup file instead, and the guide says so in the same breath. It also notes that the web edition keeps its vault in the browser’s storage on that computer, so clearing your site data removes it.","The mirroring tick box said “Mirror the other device”, which reads as though it changes the other machine. It changes this one. It now says “Mirror onto <this device>”, matching the “Receive onto” heading above it, and states plainly that the other device is never changed either way.","The guide explains mirroring properly now. It always said which device loses records, but never that the choice is made on that same device, which is the whole reason it is safe: a machine cannot lose your work unless you walk over to it, type the other one’s code in, and tick the box there yourself.","The guide no longer uses em dashes anywhere.","Four things the guide never covered are in it now: choosing several characters at once with Select and what you can then do with them, the reading text size in Settings, files holding more than one character, and being asked what to do when something you are importing is already here.","The guide also said custom sections arrive at CharSnap with their titles above them, which stopped being true when headings moved onto the same line. Publishing to CharSnap now also names the four section titles that do not go into the description at all, which was only mentioned under Tokens before, and says that a second section claiming one of those titles is folded in like any other.","Passwords and safety now names the encryption for anyone who wants it: AES-256-GCM, with the key stretched by PBKDF2 at 210,000 iterations before Windows wraps it again.","A version’s own portrait was missing from your backup. A character’s pictures were gathered by hand in seven different places, and only one of them remembered that a version carries a portrait of its own — so the picture you set on “Young Vela” was left out of the full backup, out of both character exports, out of the pictures zip and out of the stats count. Worse than absent: the character still pointed at it, so importing the file elsewhere produced a version referring to a picture that was not in it. There is one list now, and everything reads from it.","Oddly, characters in the bin were already backed up properly — the bin used the complete list while the live characters beside it did not. So a deleted character kept more of its artwork than one you still had.","If you have a backup taken before today, the version portraits are not in it. Take a fresh one. Nothing in your vault was lost — the pictures have been there all along, only the copies leaving the app were short.","Exporting just the Default threw away the Default’s own pictures. A picture can be marked as belonging to everyone, to one version, or to the Default alone. Exporting the Default kept the shared ones and dropped the ones marked as its own, which is exactly backwards — and the character page had always shown them there, so the file disagreed with what you were looking at.","Removing a bucket’s cover picture deleted the bucket. Only an empty one, and only if you used the small x on its cover — but the bucket was simply gone, when all you asked for was the picture to go. Buckets with characters in them were never affected, since those are held by the characters themselves.","A second section with the same reserved title was labelled wrongly. Give two sections the title “System override” and only the first becomes the override; the second is folded into the description like any other. The counter went by the title alone, so it called both of them overrides — telling you the second was charged to a separate allowance when its words were really being paid for on every reply. The counter and the export now work it out the same way, from the same code.","Adding a version could hand it a name already in use. New versions were named by counting, so deleting one and adding another produced two called “Variant 3” — and both travelled to CharSnap under that name. A new version now takes the first number nothing else is using, and names you have chosen yourself are left alone."]
}, {
  heading: "1.150",
  notes: ["An update that needs the installer now says so, instead of installing and quietly not working. A .rcvup only ever replaces the interface; when a release also changes the part of the app underneath it, applying the patch on its own left the new interface running on the old foundation. It looked installed, and then misbehaved in ways nothing on screen explained. Hand the app such a file now and it refuses by name — telling you which installer to run and which build you are currently on — and leaves your copy exactly as it was.","This can only help from here onwards. The check lives in the part of the app a patch cannot reach, so it arrives with this installer and guards the release after it. A patch applied to an older copy still cannot warn you, because the older copy has nothing in it to do the warning with.","The release notes have always said which file you need. Now the app knows as well, and it is no longer a matter of anyone remembering: the signing step compares the release against the previous one and marks the package itself, ignoring the version stamp that changes every time regardless.","Nothing about your vault, your characters or your settings is touched by any of this. An update that is refused simply does not happen."]
}, {
  heading: "1.149",
  notes: ["Custom sections now carry a token count of their own, under each box. A section is folded into the description when the character reaches CharSnap, so its words are permanent memory — paid for again on every single reply — and it is now shown in brass alongside everything else that is. The four titles CharSnap reserves are marked differently, because they do not go into the description at all: “System override”, “NSFW system override” and “Prefill instructions” become prompt overrides, counted against their own separate allowance, and “Additional first messages” is temporary. Renaming a section to one of those changes where its writing goes, which the counter now makes visible as it happens.","A persona’s sections say “not sent”. A persona reaches the AI as its description alone; nothing folds its sections in the way a character’s are folded, so they cost nothing and are no longer counted as though they did.","The Backstory now carries its own heading in the CharSnap file. Every section travelled under a title while the backstory — which leads the description — arrived unlabelled, so the file opened with one anonymous block and only then started naming things.","Headings now run straight into their own writing — “Backstory: she was born in the reef” — instead of sitting on a line above it.","Sections are single-spaced inside themselves. There is no blank line under a heading and none between the paragraphs beneath it, so a section arrives as one solid block; lines of nothing but spaces go as well. A blank line still parts one section from the next, since that gap is what marks where one ends. What you have written in the app is untouched — this is only how it is laid out in the file.","Every CharSnap export is now offered twice: as it was, and again with the guts hidden. That goes for all three — the whole character, a single version, and every version in one file.","The hidden one wraps the backstory and personality in CharSnap’s |~ and ~| marks, which is exactly what their own “Hide Guts from other Users” toggle does. There is no flag for it in an import file, so a character sent from here has always arrived with its writing on show whatever you had set on CharSnap, and you had to go and switch it on again by hand. Readers now see only the name, tagline and pictures; the AI still reads every word, and so do you.","It is chosen at the moment you export rather than set on the character, because on CharSnap’s side the setting is nothing more than those marks in the text. The two files are named differently, so a hidden export will not quietly replace a plain one in your Downloads folder.","Bringing one home again gives back the writing rather than the punctuation: a description or personality that arrives wrapped has the marks taken off on the way in. A field where you have hidden two separate passages by hand is left exactly as it is."]
}, {
  heading: "1.148",
  notes: ["Every writing field now shows what it costs and when it is sent, right above the box you are typing in. Stats has always broken this down, but only after the fact — the number is most useful while you are deciding how much to write.","The label matters more than the figure. “Permanent” is re-sent with every single reply, so it is shown in brass: backstory, personality and the two system prompts. “Temporary” is sent at the start and trimmed away as a chat grows: scenario, first message, example messages. The creator memo says “not sent”, because it never reaches the AI at all.","A version that has left a field blank shows the Default’s figure marked “inherited”, since those words are what will actually be sent and they cost exactly the same.","The character page now shows the totals for the version you are looking at — permanent and temporary side by side — and follows you as you switch versions, because only one version is ever in play at a time.","Personas show their total too, with no temporary half: every word of a persona is sent with every message. Lorebook entries are marked “only when triggered”, since an entry uses context only while one of its triggers is being matched, and the book itself reports what it would cost if every entry fired at once. Prompts are marked “wherever you use it”, because what a prompt costs depends on the field you paste it into."]
}, {
  heading: "1.147",
  notes: ["There is a Guide in the left-hand column now, between Lock vault and Settings. It opens a contents page of fifteen sections; picking one opens it on top, so closing a section puts you back at the contents rather than at the beginning.","It covers the whole app: what each character field is for and which of them the AI actually reads, how versions of a character work and what they share, pictures and which version they belong to, personas, lorebooks and triggers, prompts, buckets and tags, tokens and how much room you have, importing and exporting, publishing to CharSnap, version history and the bin, moving to another device, passwords, and updates.","There is a search box at the top. It looks through the writing itself rather than only the headings, since the thing you half-remember is usually a phrase rather than a title. Searching “trigger”, for example, finds both Lorebooks and Tokens.","The guide states CharSnap’s own rules where they matter — the limit of five versions, three lorebooks to a bot, 1,500 characters to an entry, what counts as permanent memory, and the fact that no CharSnap file has ever carried pictures."]
}, {
  heading: "1.146",
  notes: ["Prompt collections now have Stats and a text-only export, which lorebooks have always had. They are the same page with different words on it, and the prompt half had been left behind.","Prompts can be exported. There has been an “Import JSON” on the Prompt Vault screen for a while with nothing to export in the first place — characters, personas and lorebooks all had one. Now prompts do too.","Personas can be exported as text all at once. A single persona could already go out as text; the whole set could not, though characters could.","Deleting a version left its portrait behind in the vault forever, with nothing pointing at it — invisible, and carried in every backup and transfer from then on. It is removed with the version now, unless the same picture is used somewhere else in that character.","Removing or replacing a banner left behind the note recording which album it was filed under. Those notes piled up the same way the blurred-picture list used to.","Renaming a lorebook said how many characters and personas had followed it before the change had actually been saved. If the save failed you were told it worked. It waits for the save now.","A character named after one of the handful of names Windows reserves — CON, NUL, PRN and so on — produced a folder inside “Download all images” that Windows refuses to unpack. Those names get an underscore now.","Searchable terms with a space in them were sent to CharSnap exactly as typed, and CharSnap does not allow spaces there. The space becomes a hyphen on the way out, which is what CharSnap itself suggests; what you typed is kept in the vault.","A number with a decimal point in it was formatted as “1,234.5,678”, grouping the digits after the point as well. Nothing shows a fraction today, so this was waiting rather than happening."]
}, {
  heading: "1.145",
  notes: ["The device transfer overstated how much was in your vault. Since the picture sizes started being recorded alongside each image, those entries were being counted as records — so a vault with five hundred pictures announced roughly five hundred more “records” than you have. The figure you see before confirming a transfer is your characters, personas, lore and prompts again, as it was meant to be.","Exporting a version that had since been deleted wrote a file with no versions in it at all, which CharSnap rejects outright. It falls back to the Default now rather than handing you a file that cannot be used.","“Export for CharSnap” now says when CharSnap will refuse the file, and why. It requires a personality, a description, a first message and an age, and a half-written character would be turned away with nothing to explain it. The button now reads, for example, “CharSnap will refuse this until personality, description, first message are filled in” — before you send it rather than after."]
}, {
  heading: "1.144",
  notes: ["Your own sections were missing from a version’s description when that version had writing of its own. CharSnap has no place for custom sections, so they are folded into the description on the way out — the Default has always done this, but a variant with its own backstory took only the backstory and left the sections behind. Every version now carries them, in the whole-character file and in the variant-only file alike.","A section whose title matches one of CharSnap’s own fields still goes to that field rather than into the description — “System override”, “NSFW system override”, “Prefill instructions” and “Additional first messages”. Everything else is yours, so it goes into the description with its title above it. That was already the rule; it now holds for every version rather than only the Default.","A version with no writing of its own still falls back to the Default’s, sections included, exactly as before."]
}, {
  heading: "1.143",
  notes: ["Sending a single version to CharSnap now works. CharSnap has two import buttons and they take different files: “Import JSON” on the Basics tab wants a whole character, while “Import Variant” on the Details tab wants a version on its own, with its fields at the top of the file. This app only ever wrote the first kind, so feeding it to “Import Variant” imported nothing at all — that button ignores the outer fields and never looks inside for the version.","There is a new “Export as a CharSnap variant file” beside the existing one, and both now say which of CharSnap’s two buttons they are for. The new file matches CharSnap’s own blank variant template exactly, field for field and in the same order.","This is what lets you build a character up a piece at a time: send the Default over with “Import JSON” to create the character, then export any other version and drop it into a variant slot with “Import Variant”, rather than replacing the whole thing each time."]
}, {
  heading: "1.142",
  notes: ["The gallery at the bottom of the character editor showed every picture in the character, whichever version you had open. Editing a variant showed the Default’s pictures and editing the Default showed the variants’ — while the button directly above promised that new ones would go to the version you were on. It now shows only the pictures belonging to the version you are editing, using the same rule the character page has always used.","Pictures that belong to no particular version still show on all of them, which is what being shared means. If a version has none of its own, the gallery now says so and points at the tabs, rather than looking empty as though the pictures had gone.","Opening a picture from that gallery still opens the right one. The pictures are addressed by their place in the whole character, so filtering the view could easily have opened the wrong one — the numbering you see now counts what is on screen while the picture itself is still found by its real position."]
}, {
  heading: "1.141",
  notes: ["Characters can be marked adult, and it now travels to CharSnap. Two tick boxes sit under the core details: “NSFW” for adult writing, and “NSFW picture” for pictures that need blurring — the two flags CharSnap actually asks for. Until now every file this app wrote said the character was not adult, whatever it was, and you had to remember to set it again on CharSnap after importing.","They come back in, too. A CharSnap file that carries either flag now arrives with it set instead of being dropped, so a character taken out and brought home keeps the marking. Version history remembers them alongside tags and buckets, so restoring an older draft restores what it was marked as then.","“Export for CharSnap” now tells you what the file will say — “Marked NSFW and NSFW picture, as set on this character”, or that it is marked not adult with a reminder to set it if it should be. It used to tell everyone to go and tick it on CharSnap, because the app had no way of knowing."]
}, {
  heading: "1.140",
  notes: ["Importing a CharSnap file quietly dropped four of its fields. CharSnap keeps the base prompt override, the NSFW prompt override, the prefill instruction override and the alternate greetings on each variant, spelled with underscores — this app only ever looked for a different spelling at the top of the file, so all four vanished on the way in without a word. That included files this app had just written itself, because the export always spelled them CharSnap’s way. Both spellings are read now, wherever they sit, and a file taken out and brought back keeps everything it left with.","Stats now say where a character sits against CharSnap’s own guidance. CharSnap suggests keeping the permanent fields under 2,000 tokens and warns that quality drops badly near 3,000; the counter had the figure but never the yardstick. There is a line for it now, and it says plainly when you are over.","The token estimate now admits where it reads low. It counts about four characters to a token, which is CharSnap’s own rule of thumb, but Cyrillic, Chinese, Japanese and Korean are usually counted a token per character — so for those the figure understates, and it now says so rather than quietly being wrong.","Attaching more than three lorebooks to a character now says what will happen. CharSnap takes at most three per bot; the vault has never limited it and nothing warned you that the fourth would not travel.","The lorebook entry editor now shows CharSnap’s limits while you write. An entry description can be 1,500 characters and about 500 is suggested, so there is a live count that turns to a warning once it will no longer fit. An entry with no triggers now says so too — without one it can never come up in a chat.","“Export for CharSnap” now mentions that the file is marked not-NSFW. This app has no such setting, so the flag always goes out false; if the character is adult you need to tick it on CharSnap after importing.","The sample file was missing fields CharSnap accepts. The two NSFW flags and the four per-variant override and alternate-greeting fields are all in it now, and the note at the top covers the things that catch people out: age is required on every variant, searchables cannot contain spaces, and anything past the fifth variant is ignored."]
}, {
  heading: "1.139",
  notes: ["The descriptions in that popup were wrong about pictures. Three of them said pictures are never inside a JSON file — they are: exporting a character, a persona, a lorebook or a collection on its own carries its pictures, which is why those files are large. The descriptions now say which exports keep pictures and which do not.","Exporting every lorebook at once leaves the pictures out, while exporting a single book keeps them. The same book came to 3.2 KB on its own and 0.4 KB as part of “all lorebooks”. That is how the app has always behaved and is unchanged here, but nothing said so — the description now warns you, and points at the single-book export if you want the pictures.","“Export every version for CharSnap” claimed it was writing all of them. CharSnap accepts at most five, so a character with more quietly lost the rest. It now says how many will actually go — “the first five of your seven” — before you click it."]
}, {
  heading: "1.138",
  notes: ["The import/export popup had its headings in the wrong colour entirely. A button does not inherit text colour from the page, so “Import JSON”, “Export JSON” and the rest fell back to the browser’s own black — on a dark panel, near invisible, and dimmer than the small grey line underneath it, which read as broken. They are the same white the rest of the app uses for a heading now, with the description below in the same grey Settings uses.","The rows are proper theme styling rather than one-off inline values: they match the app’s corner rounding and text size instead of the browser’s defaults, they light up in brass as the pointer crosses them so it is clear they can be clicked, and they take a visible outline when reached by keyboard.","The same popup opened from a character, a persona or a lorebook came out in the dark theme’s colours whatever theme you were using — in the light theme, a dark navy panel with white text in an otherwise white app. The area behind the banner picture at the top of those pages deliberately forces dark colours so the writing over the picture stays readable, and the popup was being treated as part of it. It is now drawn against the app itself, so it takes your theme. Checked on all seven of these popups in all three themes."]
}, {
  heading: "1.137",
  notes: ["Import and export are one button now, on every screen that had them. They had grown into a row of their own — a lorebook carried “Import entry”, “Sample”, “Export JSON”, “Export text only” and “Export for CharSnap” side by side, and a character page four export buttons — all crowding out the things you actually came to the page to do. That book’s toolbar is down from nine buttons to five.","Behind the button is a popup laid out like Settings: the choices split into “Bring in” and “Send out”, each with a line under it saying what it actually does and when you would want it. The bare labels never said whether “Export JSON” included your pictures, or which of the two CharSnap exports to use — now they do.","It also says what applies. The menu on a character tells you which version it is about to export; the one inside a lorebook says that importing there always lands in that book whatever the file claims; the whole-library ones point you at the record itself if you only wanted one."]
}, {
  heading: "1.136",
  notes: ["Closing a character, persona, lorebook or prompt is an X in the top corner now, instead of a button called “Close” sitting at the end of a row of export buttons — the one thing you always want, dressed identically to the things you rarely do. Same place and shape on every record, and Escape still closes as it always has.","Stats no longer read every picture in the vault just to add up how much room they take. Working out a byte count from the length of a stored picture meant loading each one back in full, one after another — the whole library, every time you opened Stats. A picture never changes once saved, so its size is recorded when it is written and read back from a few bytes instead of a few megabytes. Measured on a 164 MB library: 179 ms before, 8 ms after — and older pictures are measured once, then remembered.","Every button that permanently destroys a picture now asks twice. Removing a portrait, a banner, a book cover, a picture in the viewer, or a picture on a lore or prompt entry all did it on a single click with no warning — and unlike a character or a persona, a deleted picture does not go to the bin and cannot be brought back. Each now arms on the first click and says what the second one will do, and forgets after a few seconds so a live trigger is never left under the cursor."]
}, {
  heading: "1.135",
  notes: ["A variant can now have its own age, gender and pronouns. It never could — those three lived on the character, so every variant was the same age as the Default with no way to differ. They behave like every other variant field: fill one in and it is that variant’s, leave it empty and it falls back to the Default, which the box now shows you as its placeholder.","Updating a variant from a JSON file ignored most of what was in the file. Only the written fields were applied — the name, age, gender and pronouns were dropped without a word, so the variant stayed tied to the Default no matter what the file said. It now takes all of them, and a file that names the variant renames it. A file carrying the character’s own name is not treated as a rename.","Sections in a JSON file were never read at all. The importer only ever built sections out of the three override fields and the extra first messages — write your own sections into a file and nothing happened, and the sample file did not list them, so there was no way to discover that. Files carrying sections now bring them across, and the sample shows the field.","Updating a variant also ignored sections entirely, even when they had been read. Sections are shared by every variant, so a file that carries them now applies them whichever variant you have open.","Exporting to CharSnap gave every variant the character’s age. CharSnap keeps age on the variant, so a character whose variants were seventeen, thirty-one and sixty-eight exported as three variants all aged thirty-one. Each carries its own now, and one that has none still falls back to the character’s.","Importing from CharSnap dropped the age of every variant after the first, for the same reason from the other direction. A file with three ages now arrives with three ages."]
}, {
  heading: "1.134",
  notes: ["Downloading pictures now shows a progress bar. Zipping a library is not quick — reading, decoding and checksumming runs at roughly 27 MB a second, so twenty gigabytes takes over ten minutes. All you got before was a count that nudged every twenty-five pictures, which is not enough to tell whether it is working or has wedged. There is now a bar with how many pictures are done, how many there are, and roughly how long is left. It appears wherever pictures are downloaded — a character, a persona, an album, a lorebook, or the whole vault at once.","Which pictures to fetch is worked out before any of them are read, so the total shown is the real total from the first moment rather than climbing as it goes.","A zip holding exactly 65,535 files was written in a way that says “the real number is recorded elsewhere” — and then did not record it anywhere. The three unpackers this was tested against all cope, but it is a claim about the file that is not true. The same applied to a file starting at exactly the four gigabyte mark. Both now take the 64-bit path.","Handing each picture to the browser separately, as 1.133 began doing, cost about 0.12 ms each — around five thousand small pictures that added up to nearly a second. They are gathered into batches of a few megabytes now, which restores the speed while still keeping the archive out of memory."]
}, {
  heading: "1.133",
  notes: ["Downloading images is no longer capped at four gigabytes. 1.132 stopped the app handing you a quietly corrupt archive; it did so by refusing. The zip format keeps every size and position in four bytes, so anything past that wraps around — the archive looks whole and unpacks wrong. The 64-bit form of those fields is now written whenever a value needs it, and the 65,535-file limit is gone with it. A zip that fits in the old shape is still written in the old shape, so nothing that reads them today has to change.","Raising that ceiling on its own would not have helped, because the whole archive used to be assembled in memory before you were given it — with a large library that ran out long before four gigabytes. Each picture is now handed over as it is read and let go of immediately. Measured on 320 megabytes of images, the old way kept about 300 of them in memory and the new way keeps none: the archive is held where the browser can put it on disk.","Folder and file names inside a zip were not marked as being written in UTF-8, so a name in Cyrillic or Japanese — which 1.132 had just made possible — was read back as nonsense by Windows and by anything else that trusts the marking. Names are now marked correctly and repeated in the field designed to carry them, which several unpackers need before they will decode them at all.","Every file in a downloaded zip was dated 30 November 1979, because no modification time was ever written. They now carry the time the download was made."]
}, {
  heading: "1.132",
  notes: ["Characters whose names are not written in the English alphabet exported as “untitled”. A name in Cyrillic, Chinese or Japanese — or even just an accented one — was stripped away to nothing, so every such character produced a file called untitled, each one overwriting the last in your downloads folder. Names of any script now come through.","Two characters with the same name shared one folder inside a downloaded zip, and both started numbering at one — so the zip contained the same paths twice and unpacking it silently kept only the second. They get separate folders now.","Downloading all images crashed if any character had never had a gallery.","Downloading a very large number of images produced a zip that looked fine and was quietly broken, because the format this app writes cannot describe more than four gigabytes. It now says so and asks you to do it in batches, rather than handing you a corrupt file.","Thumbnails were always saved as JPEG, which cannot hold transparency — so a PNG portrait with a clear background came back with a solid black one, and the thumbnail is what every grid and card shows. Pictures that carry transparency keep it.","Importing a backup applied its pictures to the display one at a time, each pass copying everything already loaded. That is the same slowdown fixed for ordinary loading in 1.129, still present in the import. A large import now applies them in one go.","Four places saved to storage from inside a React update, which can run twice — storing the same thing twice — and had nowhere to report a failure. Blurring, unblurring, importing blurred pictures and setting a bucket cover all now save properly. A bucket cover also only lets go of the old picture once the new one is safely stored.","The dashboard’s “recent work” list copied every character, persona, lore entry and prompt in your vault, sorted the lot and kept six — and did it again on every keystroke anywhere in the app, including on screens that do not show it. It now only does that work when something has actually changed."]
}, {
  heading: "1.131",
  notes: ["A tag or trigger you had typed but not pressed Enter on was thrown away when you saved. Nothing said so — the word was sitting there in the box in front of you and simply did not survive. Leaving the box now adds it, and Save reads what is actually on screen rather than what was there a moment before you clicked.","Renaming a lorebook or a prompt collection to a name that already existed merged the two without asking, and handed the surviving one this book's cover — losing the cover it had, with the picture left behind in the vault taking up room. It now tells you the name is taken and changes nothing.","The password boxes in Settings ignored the Enter key, so setting or changing a password meant reaching for the mouse. They submit on Enter now, like the unlock screen always has, and the first box is focused when the dialog opens.","A persona portrait that could not be saved said nothing at all — it just never appeared. It now tells you, and distinguishes a picture it could not read from one there was no room to keep. This was the last upload in the app without that.","Lore entries can be copied out with a button, the way prompts always could. The viewer they share had always supported it; lore entries were simply never given the button."]
}, {
  heading: "1.130",
  notes: ["Cancel in the character editor threw away everything you had written, without a word. It sits directly beside Save, and one wrong click on it after an hour of writing lost the lot. It now asks first, and offers to keep editing — the same warning the persona, lore and prompt editor has had for a while. The character editor, where you write the most, was the one place still missing it.","If you have not actually changed anything, Cancel still closes straight away without pestering you."]
}, {
  heading: "1.129",
  notes: ["Big libraries open faster and stay lighter. Every thumbnail used to arrive as its own separate update, each one copying the whole picture cache and redrawing the screen — which gets slower and slower the more pictures you own. At four thousand pictures that copying alone measured about 1.2 seconds; batching the arrivals together brings it under a thirtieth of a second. You will not notice on a small vault. On a large one you should.","The same picture is no longer fetched several times over. The old check only skipped pictures that had already finished loading, so anything asked for repeatedly while it was still on its way was fetched again each time.","Full-size pictures no longer pile up in memory. Opening one kept it for as long as the app stayed open, so browsing a gallery of large images held every one of them at once. Only the most recent two dozen are kept now; anything older falls back to its thumbnail and is fetched again if you look at it. Viewing fifty large pictures in a row used to add about seventy megabytes and now adds none."]
}, {
  heading: "1.128",
  notes: ["Pictures you had blurred stayed on the blurred list after they were deleted. Nearly every place that removed a picture — deleting a lorebook or a prompt collection, replacing a cover or a banner, emptying the bin — left its name behind, so the list only ever grew and it travelled in every backup you made. Removing a picture now always forgets it was blurred, because there is one piece of code doing both rather than twenty places each having to remember.","Setting a cover or a banner said “Couldn't read that image” when the real problem was that there was no room to save it — the same wrong diagnosis fixed for galleries last time, still in place for single pictures. It now says which of the two happened. A cover that fails to save also leaves the old one exactly where it was, rather than replacing it with nothing."]
}, {
  heading: "1.127",
  notes: ["A picture that failed to save appeared on screen as though it had worked. It was being shown before it was written, so if the vault could not keep it — a full disk, or a browser storage limit on the web version — you saw it sitting there quite happily, and only found out it was never there after restarting. Pictures are now written first and shown second, so what you see is what was actually kept.", "When a picture could not be saved, the app said “Couldn't read those images”. That sends you off checking the file when the real problem is that there is no room left. It now says which of the two went wrong, and if you added several it says how many were added and how many were not, rather than reporting only the failure or only the success.", "Removing a picture from a lore entry or a prompt left its name on the blur list — the last two places still doing that."]
}, {
  heading: "1.126",
  notes: ["An album could be made but never got rid of. Once created it sat in the bar above your pictures for the life of the vault, so a typo or a change of mind was permanent — while buckets and lorebooks have always been deletable. Open an album and there is now a “Delete album” beside the rest. It asks twice, and it lets the pictures out rather than taking them with it: they stay exactly where they were, just unfiled.", "A persona's portrait could not be put in an album. Selecting it and choosing an album said it was impossible, while doing the same thing to a character's portrait worked — the persona side was only looking at the gallery. It works the same way on both now.", "Searching characters folded the word “undefined” into what it looked through for any character missing a story or personality, so typing that word matched them. Every other search in the app already guarded against this."]
}, {
  heading: "1.125",
  notes: ["Renaming a lorebook quietly detached it from everyone. Characters and personas attach a book by its name, and renaming moved the entries and the cover but left every record still pointing at the old name — so the book you had carefully attached to eight characters was attached to none of them, while the link stayed on the page looking fine and opening nothing. The records now follow the rename, and it tells you how many did.", "Deleting a bucket left its cover picture behind in the vault forever, with nothing pointing at it, carried along in every backup from then on. Deleting a lorebook has always cleared its cover; buckets now do the same, for both characters and personas.", "Deleting a persona said “Deleted”, exactly as deleting a lore entry does — but a persona goes to the bin for thirty days and a lore entry does not. It now says so, so you know it can be brought back.", "Deleting a lore entry or a prompt left its pictures on the blur list, the same tidying that landed for characters last time."]
}, {
  heading: "1.124",
  notes: ["Deleting several characters or personas at once went round the bin entirely. One at a time went to the bin for thirty days with its pictures kept, but tick a few and press Delete selected and they were destroyed on the spot, artwork and all — the safety net vanished exactly when you were deleting the most. Selected deletions now go to the bin like everything else.", "Deleting a variant asked nothing at all. One click on a red button and that variant's entire writing was gone, when every other destructive thing in the app asks twice. It asks twice now, and switching to a different variant cancels it rather than leaving it armed on the wrong one.", "Deleting a variant also used to leave any gallery pictures tagged to it pointing at something that no longer existed, which the character page read as “shared by everyone” — so those pictures quietly turned up on every other variant. They are now properly marked as shared instead.", "Opening a character that had no sections at all — one from an old vault, or copied over from a computer running an older build — did not just fail to show them: it blanked the entire window, and reopening landed you on the same character and blanked it again. It opens normally now.", "Deleting a picture left its name behind on the blur list and in the album notes, for the life of the vault, and carried it into every backup. Both are tidied up now."]
}, {
  heading: "1.123",
  notes: ["Your backup was missing two things. Persona buckets were not in it — so any you had created but not yet filled, and any you had given a cover, were gone after a restore. And the bin was not in it either, so anything waiting there went with it, which rather defeats the point of a bin that holds things for thirty days.", "Worse, restoring did not clear those two. A backup restored onto a computer that already had a vault left the old persona buckets and the old bin sitting there among the restored records — so you ended up with a mixture of two vaults rather than the one you asked for. A restore now replaces everything, and the covers and pictures those two need travel with the file.", "Backups made before this are still perfectly good; they simply do not carry those two things, and restoring one now clears them rather than leaving whatever was there."]
}, {
  heading: "1.122",
  notes: ["Prompts could be exported but never brought back. There was no import for them anywhere — not on the Prompt Vault screen, not inside a collection — so the file you got from “Export JSON” was a dead end, and anyone who exported their prompts meaning to move them to another computer or keep them somewhere safe had nowhere to put them. There is now an “Import JSON” on the Prompt Vault screen and an “Import prompt” inside a collection, both with a sample file beside them, exactly as lorebooks have.", "Importing from inside a collection puts everything in that collection, whatever the file says, and a prompt whose title you already have in that collection asks before it lands — the same choices as everywhere else: skip it, bring it in as a copy, or overwrite. Overwriting keeps the prompt's pictures unless the file brings its own."]
}, {
  heading: "1.121",
  notes: ["A “Sample” button now sits beside every “Import JSON”, on characters, personas and lorebooks, and beside “Import entry” inside a book. Each one downloads a blank file listing every field that kind of import accepts, with a note at the top explaining the awkward bits — that empty fields are ignored, that lorebooks are matched to your books by name, that an entry needs at least one trigger. Characters already had one in the editor; the other three are new.",
  "Importing a persona was only reading back part of it. Its tagline, its bucket, the lorebooks attached to it, and every section it had were all dropped on the way in — so exporting a persona and importing it somewhere else quietly gave you a poorer persona than the one that left, with the extra writing simply gone. All of it now comes back, sections in the order you had them.", "This affected files only. Personas moved between computers over Wi‑Fi were never touched by it, and nothing already in your vault was changed — but a persona you imported from a file before this will be missing whatever it had, and the file you imported it from still has it. Importing that file again now brings the rest across."]
}, {
  heading: "1.120",
  notes: ["Stats on a character or persona now show what it costs in tokens, split into permanent and temporary the same way CharSnap splits them. Permanent — description, personality and the two system prompts — is in the conversation for every single reply, so it is the number worth keeping down. Temporary — first message, scenario and example messages — goes in at the start and may be trimmed once the chat gets long. Each is broken down line by line with a character count beside it, so you can see which field is the expensive one.", "The count is for the version you are looking at, not all of them added together, because only one variant is ever in play at a time. Switch to another variant and press Stats again to see what that one costs. Custom sections are counted inside the description, because that is where they end up when the character reaches CharSnap — and prompt overrides are left out of the totals, since those are counted against their own separate allowance. If you have any, the note at the bottom says what they come to.", "Tokens are an estimate at roughly four characters each, which is the same rule of thumb CharSnap quotes. Every model counts slightly differently, so treat it as a close guide rather than an exact figure."]
}, {
  heading: "1.119",
  notes: ["Restoring an older version used to wipe the portrait off every variant. The words came back correctly, but a version only ever records writing — it has never held pictures — and putting those variants back put them back without their artwork. The screen says your images are never changed by a restore, and now they are not. Nothing that was already lost this way can be brought back, but it cannot happen again.", "Importing a character brought its variants across without their portraits, and worse, the portraits it did not bring kept pointing at whatever picture already had that name in your vault — so an imported variant could quietly show a completely different character's face. Variant portraits are now carried across properly and given fresh names on arrival, the same as every other picture in the file.", "An “export text only” file was still carrying the names of variant portraits. No picture ever travelled with it, so the file was as small as it should be, but it named things that only existed in the vault it came from."]
}, {
  heading: "1.118",
  notes: ["On a 2K or 4K screen the pages no longer come apart. Nothing was broken exactly, but with nothing holding the width, a heading would sit against the far left edge while the four counts belonging to it were flung three thousand pixels away to the right, and the buttons on the dashboard stretched to nearly nine hundred pixels each. Every page now keeps to one column of a sensible width and sits in the middle of the screen — the same width the character and lorebook pages already used. Nothing changes below about 1900 pixels wide."]
}, {
  heading: "1.117",
  notes: ["If you made the window short — or zoomed in, which comes to the same thing — the bottom of the menu went off the end of the screen with no way to reach it. Settings is the last item in that menu, so backups, transfer, updates and the bin all became unreachable until the window was made taller again. The menu now scrolls when it runs out of room.", "Between roughly 760 and 1020 pixels wide the menu shrinks to icons, and those icons had no names at all — nothing on hover, and nothing for a screen reader to read out. Every one of them now says what it is.", "The little cross for removing a tag was eleven pixels square and sat right beside the next one. The cross looks the same, but there is now a proper target around it."]
}, {
  heading: "1.116",
  notes: ["A transfer now shows you what it is doing and how far along it is, instead of a spinner. Each step is named — asking the other device what it has, working out what is different, copying across, unpacking, saving — and the two long ones fill a bar with a real percentage, counting the megabytes as they land. The steps that genuinely cannot know how long they will take say so rather than inventing a number.", "Transfers are quicker to start. Working out what differs means reading and fingerprinting every record, and that was happening twice on each device — once to show you the summary and again to do the sync. The result is now kept and reused unless something in the vault actually changed. On a 600 MB library that second pass went from about three seconds to instant, on both devices."]
}, {
  heading: "1.115",
  notes: ["Dropping a file onto the window used to replace the whole app with that file — the interface vanished and you were looking at raw JSON until you restarted. Since importing JSON files is half of what this app is for, that was an easy mistake to make. Files dropped anywhere the app is not expecting one are now ignored, and the window can no longer be navigated away from the interface at all.", "Exporting the Default variant to CharSnap no longer writes a variant name override of “Default” and a variant tagline override repeating the tagline you already set. Those fields are overrides, and the default has nothing to override. Named variants keep their own names, and only carry a tagline override when they actually have a tagline of their own.", "Locking the vault now clears deleted records from memory as well. Everything else was already cleared; the bin was not, so a locked vault still held the full text of anything you had deleted.", "A locked vault can no longer have records deleted. Writing was already blocked while locked, but deleting was not.", "Large exports could silently fail to save. The file was being handed to the browser and then withdrawn in the same instant, which a big library did not always survive.", "The device transfer now refuses an oversized request instead of trying to hold it in memory, so nothing else on your network can push the app over by sending it rubbish while you are on the send screen.", "Setting a master password on the web edition writes the security record before re-encrypting rather than after. Interrupted the other way round — a closed tab at the wrong moment — the records were encrypted with nothing left to record which key had been used."]
}, {
  heading: "1.114",
  notes: ["Device transfer now tells you which vault you are standing in. Both machines say their own name, the panel is split into “send this one” and “receive onto this one”, and before anything is written you get a summary: which device the records are coming from, which device they are landing on, and exactly how many will be added, overwritten and deleted. Nothing is touched until you confirm that summary.", "Mirroring is off by default now. It deletes from whichever device is receiving, and having it on by default was the wrong way round for something that cannot be undone. The tick box now spells out which device loses records, by name.", "Inside a lorebook there is an “Import entry” button. Point it at a JSON file and everything in it joins that book, whatever world the file itself claims — one entry on its own works, and so does a whole lorebook. Duplicate titles still ask before landing. Importing from the Lorebooks screen is unchanged and still files entries by their own world.", "“Export for CharSnap” on a single lore entry, not just the whole book. It writes the same Chub-compatible file with one entry in it."]
}, {
  heading: "1.113",
  notes: ["The “Recently deleted” list in Settings now folds away, the way version history does, and stays folded until you open it. A month of deletions could otherwise fill Settings and push everything under it off the screen. The heading says how many are waiting, so you can see there is something in there without opening it."]
}, {
  heading: "1.112",
  notes: ["Deleting a character or persona no longer destroys it. It goes to a bin for 30 days — pictures and all — and there is a “Recently deleted” list in Settings to put it back, or to remove it for good if you would rather. Anything still in the bin after 30 days is cleared automatically. Lorebook and prompt entries are unchanged for now: those still delete outright.", "New “Export text only” on a single character and on a persona, alongside the existing whole-library one. Personas had no export of their own at all before this; they now have both.", "The tick box under “Receive from another device” was being stretched to the full width of the panel, which is why it sat oddly away from its label. Tick boxes are now the size they should be."]
}, {
  heading: "1.111",
  notes: ["Attaching lorebooks to a character uses a dropdown once you have more than a handful, instead of a wall of chips. The ones already attached stay above it, still one click to remove. Books that actually have entries are listed first, so empty and half-named ones stop crowding out the real ones. With only a few books it stays as chips, which read better."]
}, {
  heading: "1.110",
  notes: ["A character with more than five variants now uses a dropdown instead of a chip for each one, on both the character page and the editor. Past a handful the row of chips became a wall that buried everything under it. There is also a quiet note of how many you have, since CharSnap only takes the first five.", "New “Sample JSON” button beside “Update from JSON”. It downloads a blank file showing every field the update accepts, with a note at the top explaining it — fill in the bits you want changed and leave the rest empty.", "The “Update from JSON” button now says which formats it accepts, and if a file will not load the message names them instead of just refusing."]
}, {
  heading: "1.109",
  notes: ["Writing is no longer thrown away by a stray click. Clicking outside a lore entry or prompt while writing one closed it instantly and lost everything typed. It now asks first, and only when you have actually changed something — Escape asks too, and closing an untouched entry still just closes.", "The theme button now says which theme you are using — “Theme · Dark” — instead of naming the one it would switch to. Reading it as the current theme was the obvious mistake, and it was easy to think you were on the CharSnap theme when you were on the light one.", "The CharSnap theme's main buttons are outlined gold on a dark fill, matching how CharSnap actually draws them, rather than a solid gold slab."]
}, {
  heading: "1.108",
  notes: ["Character, persona and lorebook headers are now a dark banner in every theme, so the name and details stay readable whatever picture sits behind them. Before this, a pale banner swallowed the text in the dark themes and a dark one swallowed it in the light theme — the shade over the picture was far too thin either way.", "Names on the character cards keep a light colour in every theme, and sit on their own shading, so they read over any artwork — light, dark or busy.", "New setting: Text contrast, next to Reading text size. Three levels, if you would like the smaller grey text — labels, captions, secondary lines — plainer than the standard requires. It is remembered between sessions."]
}, {
  heading: "1.107",
  notes: ["Character names are readable on the cards again in the light theme. The name followed the theme's text colour, which is near-black in light — sitting on the dark shade at the bottom of the picture, which made it all but invisible. Names and taglines on cards now keep a light colour whichever theme you use, because that shade is dark in all of them.", "Every piece of text and every button has been checked against the accessibility standard, in all three themes, including text sitting over artwork and the two-tone buttons. The blue button was a shade too light for its white label, and in the light theme the gold and red text used on their own tinted backgrounds were a little too pale. All now pass."]
}, {
  heading: "1.106",
  notes: ["Markdown works in the creator memo again. Moving the memo to the top of the character page in 1.103 accidentally started showing it as raw text, so headings, bold and links appeared as asterisks and hashes. It renders properly again, and still scrolls.", "The small grey labels — SEARCHABLE, LOREBOOKS, CREATOR MEMO, and the age and gender line — were too faint to read in every theme, and nearly invisible in the light one. All three themes have been measured against the accessibility standard for text contrast and now pass. The light theme's gold and red text were slightly too faint as well and have been deepened."]
}, {
  heading: "1.105",
  notes: ["Exporting a persona and importing it back keeps its albums. Album names and which album each picture sat in were discarded on the way in, so a round trip left the gallery as one unsorted pile — the same fault characters had, which was fixed for them but never for personas."]
}, {
  heading: "1.104",
  notes: ["The portrait stays at the top of the character page. It was pinned to the bottom of the header, so a long creator memo pushed it right down the screen, away from the name it belongs to.", "A long creator memo now scrolls inside its own box instead of being cut short behind a link. The page keeps its shape no matter how much you have written."]
}, {
  heading: "1.103",
  notes: ["Tags and searchable terms on the character page now show the first ten with a “+more” button for the rest, instead of filling the screen. A well-tagged character was pushing its own portrait, buttons and writing well below the fold. Click the button to see them all, and again to fold them away.", "The creator memo has moved up into that space, so a character page now reads the way the dashboard spotlight does: portrait, name, tagline, then the memo, with the tags, terms and lorebooks underneath it. Long memos are trimmed with a “Read the rest” link. It no longer appears further down the page as well — it is only shown once."]
}, {
  heading: "1.102",
  notes: ["“Update from JSON” now brings the searchable terms across. It never touched them at all, so updating a character from a file full of terms left whatever handful was already there — which is why only a few showed up no matter what the file contained.", "It also no longer piles tags up. Tags used to be merged with the ones already on the character, so a tag removed from the file could never be got rid of here; the file's list now replaces what is there. A file that carries no tags or terms leaves both alone."]
}, {
  heading: "1.101",
  notes: ["Searchable terms are now shown when you open a character, under the tags. They were being imported and saved correctly all along, but the only place they appeared was inside the editor — so after importing a character there was nowhere to see them, which looked exactly like the import having ignored them.", "The search box now actually searches them, which is the point of the field. Looking up a nickname, a title, or the name of the world a character comes from will now find them even when that word appears nowhere else. The tagline is searched too."]
}, {
  heading: "1.100",
  notes: ["Tags and searchable terms now import whatever shape the file writes them in. Previously only a proper list worked: a file that wrote them as one line — “yandere, age gap” — was accepted without complaint and the tags simply never appeared, which looked like the app ignoring them.", "Imported tags take CharSnap's spelling where they match, so “age gap” arrives as “Age Gap” rather than sitting beside it as a separate tag. Spare spaces are trimmed and the same tag repeated in different capitalisation is only kept once.", "Searchable terms are also picked up when a file puts them on the first variant instead of with the character, which is where some files put them.", "For the record on replacing: choosing “Overwrite existing” when importing does replace a character's tags and searchable terms outright, and clears them if the incoming file has none. “Skip” and “Import as copies” leave the original alone."]
}, {
  heading: "1.099",
  notes: ["Importing a lorebook you already have no longer adds a second copy of every entry. The app now notices entries that are already in the book and asks what you want: skip them, update them from the file, or keep both anyway. Genuinely new entries come in either way.", "Two entries count as the same when they sit in the same book under the same title, so this works on files from CharSnap and Chub too, where the entry numbering is meaningless.", "Updating an entry from a text-only file keeps its pictures. Only a file that brings its own pictures replaces them."]
}, {
  heading: "1.098",
  notes: ["New “Export text only” button on the Characters screen: every character as plain text with no pictures at all. A library that runs to megabytes as a normal export comes out a few kilobytes this way — small enough to read, paste somewhere, or hand to an AI to go over.", "Any lorebooks your characters are linked to travel in that same file, so their wording can be checked against the lore without juggling two exports. Lorebooks nothing points at are left out.", "Lorebooks have the same button when you open one. Both files import straight back into the vault, so text can go out and come back freely — there are simply no pictures to bring with it.", "Exporting a character with “Export JSON” no longer nags about CharSnap tags. That check now only appears where it belongs, on “Export for CharSnap”."]
}, {
  heading: "1.097",
  notes: ["The tag box now suggests CharSnap's tags as you type — all 622 of them, with the ones already in your vault offered first.", "Picking one stores it exactly as CharSnap spells it, so “age gap” becomes “Age Gap” and “adhd” becomes “ADHD”. Your own tags still behave as before. The same tag can no longer be added twice in different capitalisation.", "Exporting for CharSnap now warns you first if a character carries a tag CharSnap does not use, and names it, so you can fix it instead of finding out when the tag quietly vanishes on their end. It is only ever a warning — the export always goes ahead if you want it to.", "Characters have a new “Searchable terms” field, under Tags — nicknames, titles, the series they are from, anything someone might look them up by. It exports to CharSnap, comes back on import, is kept in every export the app makes, and is saved in version history like the rest of the writing. Capitalisation is left exactly as you type it."]
}, {
  heading: "1.096",
  notes: ["Exporting a character and importing it back keeps the gallery as you arranged it. Album names, which album each picture sits in, and which variant a picture belongs to were all discarded on import, so a round trip flattened the whole gallery into one unsorted pile.", "Custom section order now survives an import as well, not just a restore.", "A blurred banner stays blurred when exported.", "A character exported with “Export JSON” can now be imported straight into CharSnap — the file carries what CharSnap needs alongside the vault's own copy, so one file works in both places. For uploading to CharSnap, “Export for CharSnap” is still the better button: CharSnap does not read pictures out of a JSON file at all, so the plain export just carries them for nothing (kilobytes versus megabytes). Upload your images on CharSnap after importing.", "Importing a character from CharSnap keeps their age. CharSnap stores age on the variant rather than with the character, so it was being dropped every time.", "CharSnap variant files can be imported on their own. They arrive named after the variant instead of as “Imported character”.", "Characters exported for CharSnap now carry every field CharSnap's own import template lists."]
}, {
  heading: "1.094",
  notes: ["Restoring an earlier version keeps your custom section order. Restoring used to give every section a new internal id while keeping the old ordering, so the order pointed at nothing and custom sections dropped to the bottom of the page.", "A failed save now says so. If writing to storage failed, the app still reported “Character saved” and carried on as though nothing had happened — the change was simply lost. Failures are now reported, and success is only claimed once the write has actually gone through.", "A failed read no longer looks like an empty vault. A storage error used to be indistinguishable from having no data, so the library appeared empty and the next save would write that emptiness over the top.", "Characters saved before galleries existed no longer break the page they appear on.", "Pictures assigned to a variant that a restore removed are visible again, instead of staying in the vault with nothing showing them."]
}, {
  heading: "1.093",
  notes: ["Reinstalling the app now actually replaces the interface. An installed patch kept overriding the newly installed one, so a fresh install could still show the old interface — including a missing version history. Patches now record which build they were applied to and step aside once the app itself is updated.", "Settings are in a more sensible order: appearance and layout first, then security, then updates and version history, with backups and device transfer at the bottom."]
}, {
  heading: "1.092",
  notes: ["Records are now written to a temporary file and swapped into place, so a crash or power cut mid-save can no longer leave a half-written vault.", "Setting, changing or removing the master password is all-or-nothing. A record that cannot be read aborts the whole operation with nothing altered, and an interruption part-way through is finished automatically on the next launch.", "If saved data cannot be read, the vault now says so and stays closed instead of opening empty — which previously risked the next save writing over everything that was still intact.", "The auto-revert failsafe no longer mistakes an update stuck on the loading screen for a working one, and allows more time for large vaults to open.", "The version number is now the same everywhere — the app, the installer and the update package had drifted to three different values."]
}, {
  heading: "Before 1.092",
  reconstructed: true,
  notes: ["Lorebook entries gained real type and trigger fields. Entries that stored these as a “— Type/Triggers” line of text are converted on first launch.", "Character sections such as scenario, first message, example dialogue, creator notes and system prompts became first-class fields rather than free-form sections, and are lifted across automatically.", "Portrait thumbnails were regenerated at 1000px from the original images, replacing softer earlier ones.", "Characters gained variants, buckets, galleries with albums, and per-image blurring.", "Personas, lorebooks and a prompt vault were added alongside characters.", "Import support for CharSnap, Chub lorebooks, Tavern v1 and v2 character cards, and multi-character bot packs.", "Encrypted local storage with a master password, a quick-unlock PIN, and opt-in LAN transfer between two devices.", "Signed in-place updates, with automatic revert if an update misbehaves.", "Light and CharSnap themes, adjustable reading text size, a reorderable dashboard, and a stats screen."]
}];

/* CharSnap's published tag vocabulary, used to suggest tags while typing and to
   warn before exporting a tag CharSnap will not recognise. Recovered from the tag
   list PDF, so treat it as a good copy rather than an authoritative feed: an
   unknown tag is only ever a warning, never a block. Casing is CharSnap's own and
   matters on export. */
const CHARSNAP_TAGS = [
  "#Christmas2025", "#Halloween2025", "#SecretSanta2025", "#Valentines2026", "Abducted",
  "Abuse", "Abusive", "Academia", "Academic", "Addiction", "ADHD", "Adoptive Family",
  "Adventure", "Age Gap", "Aggressive", "Alien", "Alpha", "Alternate Greeting",
  "Alternate Universe", "American", "Amnesia", "Anal", "Androgynous", "Android", "Angel",
  "Angst", "Anime/Manga", "Antagonist", "Anthropomorphic", "Antihero", "Anxiety", "AnyPOV",
  "Apocalypse", "Aquatic", "Arabic", "Aromantic", "Arranged Marriage", "Art", "Artist",
  "Asexual", "Asian", "Attentive", "Australian", "Autistic", "Baby", "Bad Boy", "Badass",
  "Band", "BDSM", "Bear", "Best Friends", "Beta", "Betrayal", "Big Ass", "Big Breasts",
  "Big Dick", "Biker", "Bilingual", "Bimbo", "BIPOC", "Bipolar", "Bird", "Bisexual",
  "Bishounen", "Blood Play", "Blood/Gore", "Body Horror", "Body Modification", "Bodyguard",
  "Books/Light Novels", "Boss", "Bottom", "Brat", "Brazilian", "Breakup", "Breeding",
  "British", "Bug", "Bully", "Bunny", "Butch", "Butler", "Cafe", "Camping", "Canadian",
  "Cannibalism", "Canon Character", "Canon Compliant", "Canon Divergent", "Captivity",
  "Caring", "Casual Sex", "Cat", "Centaur", "CEO", "Chat Images", "Cheating/N", "Cheetah",
  "Chinese", "Christmas", "Chubby", "Clingy", "Clown", "Clumsy", "CNC/DubCon/NonCon",
  "Cockwarming", "Cocky", "Codependency", "Cold", "Collab", "Comedy", "Comfort", "Comics",
  "Complicated Relationship", "Content Creator", "Cosplay", "Cow", "Cowboy", "Coworker",
  "Cozy", "Creepy", "Criminal", "Crossdressing", "Crush", "Cryptid", "Cuckolding", "Cult",
  "Cumflation", "Cute", "Cybernetic", "Cyberpunk", "Daddy Issues", "Dancer", "Dark",
  "Dark Skin", "Darudere", "Date", "DC", "Dead Dove", "Death", "Deity", "Demihuman",
  "Demisexual", "Demon", "Dense", "Depression", "Deredere", "Detective", "DILF",
  "Disability", "Divorced", "Dog", "Domestic", "Dominant", "Double penetration", "Dragon",
  "Drama", "Dramatic", "Drug/Alcohol Abuse", "Dungeons & Dragons", "Dysfunctional Family",
  "Dystopia", "Easter", "Eccentric", "Edging", "Effeminate", "Egg Laying", "Elder",
  "Eldritch", "Elf", "Emo", "Emotional Abuse", "Emotionally Attached",
  "Emotionally Complex", "Emotionally Dependent", "Emotionally Unavailable", "Enemies",
  "Enemies-to-Lovers", "English", "Entitled", "Espionage", "Established Friendship",
  "Established Relationship", "Established Relationship Variant", "Event", "Evil",
  "Exhausted", "Exhibitionism", "Experiment", "Extrovert", "Fae", "Fake Relationship",
  "Fallen Angel", "Family Dynamics", "Fantasy", "Fantasy Racism", "Farmer", "Feet",
  "Female", "Female Variant", "Femboy", "Feminine", "FemPO", "FemPOV", "Feral",
  "Feudal Japan", "Finnish", "First Responder", "Flirty", "Fluff", "Foodplay", "Forbidden",
  "Forced Proximity", "Found Family", "Fox", "Free Use", "French", "Frenemies",
  "Friend's Relationship", "Friends", "Frog", "Furry", "Futanari", "Futuristic",
  "Gambling", "Gamer", "Gangbang", "Gay", "Genderbend", "Genderfluid", "Genius", "Gentle",
  "German", "Giant", "Gift", "GILF", "Glasses", "Goat", "Goblin", "Gold Digger", "Good",
  "Goth", "Graphic Violence", "Greek", "Green Flag", "Grumpy", "Guard", "Guilty",
  "Gunplay", "Gyaru", "Hacker", "Halloween", "Hanahaki", "Happy", "Harem", "Harpy",
  "Heaven", "Hell", "Hero", "Heterosexual", "Hijab", "Himbo", "Hispanic", "Historical Era",
  "Homeless", "Honest", "Horny", "Horror", "Horse", "Human", "Humiliation", "Hungarian",
  "Hunter", "Hurt/Comfort", "Hybrid", "Hyena", "Idiot", "Immortal", "Imp", "In-Law",
  "Incel", "Indian", "Indifferent", "Indigenous", "Indonesian", "Inexperienced",
  "Insecure", "Intellectual", "Intersex", "Introvert", "Irish", "Isekai", "Italian",
  "Jamaican", "Japan", "Japanese", "Jealousy", "K", "Kemonomimi", "Killer", "Kind",
  "Kitsune", "Knife Play", "Knight", "Korean", "Kuudere", "Lactation", "Lamia",
  "Law Enforcement", "Lawyer", "Lazy", "Lesbian", "LGBTQ", "Lizard", "Lonely", "Loser",
  "Mafia", "Magic", "Maid", "Male", "Male Variant", "MalePO", "MalePOV", "Manipulation",
  "Marriage", "Married", "Marvel", "Masked", "Mean", "Medical", "Medieval",
  "Mental Health", "Mentally Ill", "Merfolk", "Meter System", "Middle Aged",
  "Middle eastern", "Milestone", "MILF", "Military", "Mimic", "Mind Control", "Minotaur",
  "Misunderstood", "MLM", "Modern", "Mommy Issues", "Monster", "Monster Fucking",
  "Monstrous", "Monthly", "Mouse", "Movies", "MPreg", "Multilingual",
  "Multiple Characters", "Multiple Personality", "Muscular", "Music", "Mystery",
  "Mythology", "Naga", "Nature", "Necromancy", "Needy", "Nerdy", "Nervous",
  "Neurodivergent", "New Relationship", "Nihilism", "No Magic", "Noble", "Noir",
  "Nonbinary", "Nonchalant", "Nonenglish Dialogue", "Nonhuman", "Nordic", "NSFL", "NSFW",
  "Object", "Objectfication", "Obsessive", "Occult", "OCD", "Office", "Ogre", "Omega",
  "Omegaverse", "Omorashi", "Open Relationship", "Optimistic", "Oral", "Orc",
  "Original Character", "Original World", "Orynthia collab", "Otaku", "Oviposition",
  "Past", "Past Abuse", "Past Death", "Past Relationship", "Past Suicide", "Pathetic",
  "Patient", "Peasant", "Pegging", "Pervert", "Pet", "Pet Play", "Petty", "Phoenix",
  "Pining", "Pirate", "Plants", "Platonic", "Playful", "Polish", "Polite", "Polyamory",
  "Poor", "Popular", "Possession", "Possessive", "Post Canon", "Post-apocalypse",
  "Power Dynamics", "Praise", "Pregnancy", "Primal Play", "Prison", "Privileged",
  "Promiscuous", "Protective", "Psychic", "Psychopath", "PTSD", "Punk", "Queer", "Raccoon",
  "Realistic", "Rebellious", "Red Flag", "Red Panda", "Redemption", "Reformed",
  "Reincarnation", "Religion", "Revenge", "Reverse Isekai", "Rich", "Rival", "Robot",
  "Romance", "Romani", "Rough Sex", "Royalty", "RPG", "Rude", "Rural", "Russian",
  "Ruthless", "Sassy", "Satire", "Satyr", "Savior Complex", "Scalie", "Scarred", "Scat",
  "Sci-fi", "Scientist", "Scottish", "SCP", "Secret", "Secret Relationship", "Self-harm",
  "Servant", "Sex Work", "Sexist", "Sexual Slavery", "SFW", "Shapeshifter",
  "Shared Living", "Shark", "Sheep", "Shop", "Short", "Shy", "Sickness", "Siren",
  "Size Difference", "Skeleton", "Slavery", "Slavic", "Slice of Fucked-Up Life",
  "Slice of Life", "Slime", "Slow Burn", "Slut", "Small Breasts", "Smart", "Smoker",
  "Smut", "Snake", "Sociopathic", "Soft", "Soldier", "Somnophilia", "Soulmates", "Space",
  "Spanish", "Spider", "Spirit", "Spiritual", "Sports", "Stalker", "Stealth", "Steampunk",
  "Stepfamily", "Stockholm", "Stoic", "Stoner", "Stranger", "Strangers to Lovers",
  "Strict", "Strong", "Submissive", "Suburban", "Sugar Relationship", "Suicidal", "Summer",
  "Summon", "Superhero", "Superhuman", "Supernatural", "Supervillain", "Surfer",
  "Survival", "Swedish", "Switch", "T", "Tall", "Tanned", "Tattoos", "Tease", "Tentacles",
  "Theatre", "Theme", "Themes", "Therapist", "Thicc", "Third Wheel", "Time Manipulation",
  "Tomboy", "Torture", "Touch Averse", "Touch Starved", "Toxic", "TR", "Traditional",
  "Transgender", "TransPOV", "Trapping", "Trauma", "Trust Issues", "Tsundere", "TTG",
  "Twink", "Twins", "Twunk", "Tyrant", "Ukrainian", "Undead", "Underworld", "Unemployed",
  "Unestablished Relationship", "Unhappy Relationship", "Unicorn", "Unrequited", "Urban",
  "User Role", "Utility", "V Shows", "V Variant", "Valentine", "Vampire", "Vanilla",
  "Variants", "Victorian Era", "Video Games", "Vietnamese", "Vigilante", "Vikings",
  "Village", "Villain", "Virgin", "Voodoo", "Vore", "Voyeurism", "War", "Watersports",
  "Webtoon/Manwha", "Weeb", "Weird", "Weird Dick", "Welsh", "Wendigo", "Werewolf",
  "Western", "Wholesome", "Wild", "Winter", "Wips it out", "WLW", "Wolf", "Workplace",
  "Wuxia/Xianxia", "Yakuza", "Yandere", "Yellow Flag", "Zombie"
];
const CHARSNAP_TAG_BY_KEY = (function () {
  const m = {};
  for (const t of CHARSNAP_TAGS) m[t.toLowerCase()] = t;
  return m;
})();
// the tag as CharSnap spells it, or null when it is not one of theirs
const charSnapTag = t => CHARSNAP_TAG_BY_KEY[String(t || "").trim().toLowerCase()] || null;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
/* A key that was never written is not an error, and the two platforms disagree
   about how to say so: the web storage throws "key not found", the desktop one
   returns null. Everything else is a real failure and must propagate. Reporting
   a failed read as "no data" is how a transient error used to turn into an empty
   library, which the next save then wrote over the top of the real one. */
const isMissingKey = e => /not found/i.test(e && e.message || "");
async function sGet(key) {
  try {
    const r = await window.storage.get(key);
    return r ? r.value : null;
  } catch (e) {
    if (isMissingKey(e)) return null;
    console.error("read failed", key, e);
    throw e;
  }
}
/* Throws on failure rather than returning null. Callers announce success on the
   line after `await sSet(...)`, so swallowing the error here made the app claim
   it had saved when nothing was written. Anything not caught locally reaches the
   unhandledrejection handler installed with the toaster. */
async function sSet(key, value) {
  try {
    return await window.storage.set(key, value);
  } catch (e) {
    console.error("save failed", key, e);
    throw e;
  }
}
async function sList() {
  const r = await window.storage.list();
  return {
    keys: r && r.keys || []
  };
}
async function sDel(key) {
  try {
    return await window.storage.delete(key);
  } catch {
    return null;
  }
}
function compressImage(file, maxDim = 1000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let {
          width,
          height
        } = img;
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s);
          height = Math.round(height * s);
        }
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        c.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
/* A fill-in-the-blanks template for "Update from JSON". Deliberately the shape
   CharSnap documents — the app reads that, its own export, and Tavern cards, and
   this is the one worth handing someone who asks what to write. Unknown keys are
   ignored on import, so the note travels with the file harmlessly. */
const SAMPLE_CHARACTER_JSON = {
  _readme: "Fill in what you want to change and leave the rest empty — empty fields are ignored, so a file with only 'personality' set will update only that. 'age' is text, not a number, and CharSnap requires one on every variant. Each variant can also carry its own gender and pronouns; leave them blank and it uses the Default's. 'sections' are your own titled blocks, shared by every variant — CharSnap has no such field, so they are folded into the description on the way out. 'searchables' must not contain spaces. 'nsfw' and 'nsfw_picture' are the character's adult flags and come across on import. CharSnap keeps at most five variants and ignores any beyond the fifth. Rolecraft Vault also accepts its own character export and Tavern v1/v2 cards.",
  name: "",
  gender: "",
  tagline: "",
  tags: [],
  searchables: [],
  nsfw: false,
  nsfw_picture: false,
  sections: [{
    title: "",
    content: ""
  }],
  variants: [{
    variant_name: "Default",
    variant_tagline: "",
    age: "",
    gender: "",
    pronouns: "",
    personality: "",
    description: "",
    first_message: "",
    scenario: "",
    example_message: "",
    creator_comment: "",
    system_prompt: "",
    always_active_system_prompt: "",
    base_system_override: "",
    nsfw_system_override: "",
    prefill_instruction_override: "",
    alternate_greetings: []
  }]
};
/* The same idea for the other two things you can import. These are the vault's
   own shapes rather than CharSnap's, because personas are a Rolecraft idea and
   a lorebook has a documented structure of its own. Every field is listed even
   when empty, so the file doubles as the answer to "what can I put in here?" */
const SAMPLE_PERSONA_JSON = {
  _readme: "One persona. Fill in what you want and leave the rest empty — empty fields are ignored. 'lorebooks' are matched to your books by name, and any that do not exist yet are simply not attached. Sections are for anything extra: appearance, boundaries, writing preferences. To import several at once, put them in a list instead: [ { …persona… }, { …persona… } ].",
  name: "",
  tagline: "",
  role: "",
  pronouns: "",
  bucket: "",
  lorebooks: [],
  description: "",
  sections: [{
    title: "",
    content: ""
  }]
};
const SAMPLE_LOREBOOK_JSON = {
  _readme: "A whole lorebook. This is the Chub / CharSnap structure, so a file exported from either will import here as it is. 'keys' are the words that bring an entry up in a chat, and every entry needs at least one. 'name' at the top is the book; 'comment' or 'name' on an entry is its title.",
  name: "My Lorebook",
  description: "",
  entries: {
    "1": {
      id: 1,
      name: "An entry",
      keys: ["a trigger word", "another"],
      content: "What the AI should know when a trigger word comes up.",
      entryType: "Location",
      enabled: true
    }
  }
};
const SAMPLE_PROMPT_JSON = {
  _readme: "A reusable prompt. 'collection' is the book it goes in — importing from inside a collection puts it there whatever this says. To import several at once, put them in a list: [ { …prompt… }, { …prompt… } ].",
  title: "Tavern opening scene",
  collection: "",
  tags: ["opener"],
  content: "The reusable prompt text."
};
const SAMPLE_LORE_ENTRY_JSON = {
  _readme: "A single lore entry. Importing this from inside a book puts it in that book, whatever 'world' says — leave it empty unless you are importing from the Lorebooks screen, where it decides which book the entry lands in.",
  name: "An entry",
  world: "",
  keys: ["a trigger word"],
  content: "What the AI should know when a trigger word comes up.",
  entryType: "Other"
};
/* Revoking the object URL in the same tick as the click is a race: the browser
   has only been handed the URL, and a large export (a whole library with its
   pictures runs to tens of megabytes) may not have been read yet when the URL is
   pulled out from under it, which shows up as a download that silently fails. */
function revokeSoon(url, delay) {
  setTimeout(() => URL.revokeObjectURL(url), delay || 60000);
}
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  revokeSoon(url);
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Generate a display thumbnail from a stored original. Returns null if the
   original is already small enough (no point re-encoding it). */
function makeThumb(dataUrl, maxDim = 1000, quality = 0.85) {
  const work = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const {
          width,
          height
        } = img;
        if (!width || !height || width <= maxDim && height <= maxDim) {
          resolve(null);
          return;
        }
        const s = maxDim / Math.max(width, height);
        const c = document.createElement("canvas");
        c.width = Math.round(width * s);
        c.height = Math.round(height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        /* Everything was re-encoded as JPEG, which has no transparency: a PNG
           portrait with a clear background came back with a black one, and the
           thumbnail is what every grid and card shows. Formats carrying an
           alpha channel keep it. */
        const kind = /^data:image\/(png|webp)/i.exec(dataUrl);
        resolve(c.toDataURL(kind ? "image/" + kind[1].toLowerCase() : "image/jpeg", quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), 4000));
  return Promise.race([work, timeout]);
}
function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* --- tiny ZIP writer (STORE method, no compression — keeps original bytes) --- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ c >>> 8;
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dataUrlBytes(u) {
  const bin = atob(u.slice(u.indexOf(",") + 1));
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
/* ZIP64, and an archive that is never held in memory.

   The classic zip format keeps every size and offset in four bytes, so an
   archive past 4 GB wrapped around: it looked complete and unpacked wrong or
   not at all. It also could not describe more than 65,535 files. The 64-bit
   fields below are written only when a value genuinely needs them, so an
   ordinary zip stays exactly what older tools already read.

   Raising that ceiling alone would not have helped, because the whole archive
   used to be collected in an array and turned into a Blob at the end — the
   real limit was how much fitted in memory. Each entry is handed to blob
   storage as it is made, which the browser can page to disk, and the caller
   drops its copy of the image immediately after.

   Flag 0x0800 marks the entry name as UTF-8. Since 1.132 allowed names in any
   script this matters: without it, a name written in Cyrillic or Japanese is
   read back as mojibake by Windows Explorer. */
function zipWriter() {
  const enc = new TextEncoder();
  const U16_MAX = 0xFFFF;
  const U32_MAX = 0xFFFFFFFF;
  const u16 = v => [v & 255, v >> 8 & 255];
  const u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255];
  const u64 = v => [...u32(v >>> 0), ...u32(Math.floor(v / 4294967296) >>> 0)];
  const UTF8 = 0x0800;
  /* Zip stores the modified time as a packed DOS date. Leaving it zero made
     every entry list as 30 Nov 1979, which reads as a damaged archive. */
  const now = new Date();
  const dosTime = now.getHours() << 11 | now.getMinutes() << 5 | now.getSeconds() >> 1;
  const dosDate = Math.max(0, now.getFullYear() - 1980) << 9 | now.getMonth() + 1 << 5 | now.getDate();
  /* 0xFFFF and 0xFFFFFFFF are not just the largest values these fields hold —
     they are the marker that says "the real value is in the zip64 record". A
     count or offset that lands exactly on one has to take the 64-bit path too,
     or it reads as a marker pointing at a record that was never written. */
  const chunks = []; // Blobs — the browser may keep these on disk
  /* One Blob per file cost about 0.12 ms each — 2.7x slower over five thousand
     small pictures. Entries are gathered until they are worth handing over, so
     the count of blobs is small while the memory held is still bounded. */
  const FLUSH_AT = 8 * 1024 * 1024;
  let pending = [];
  let pendingSize = 0;
  const flush = () => {
    if (!pending.length) return;
    chunks.push(new Blob(pending));
    pending = [];
    pendingSize = 0;
  };
  const stash = parts => {
    for (const p of parts) {
      pending.push(p);
      pendingSize += p.length;
    }
    if (pendingSize >= FLUSH_AT) flush();
  };
  const central = []; // ~60 bytes per entry, small enough to keep in memory
  let offset = 0;
  let count = 0;
  const add = (name, bytes) => {
    const nameB = enc.encode(name);
    const crc = crc32(bytes);
    const sz = bytes.length;
    /* A name outside ASCII is carried again in the Unicode Path extra field.
       The name itself is already UTF-8 and flagged as such, but some unpackers
       only decode it when this field is present — and it has to be on both the
       local and the central copy, or they read the two in different character
       sets and report the entry as damaged. UTF-8 makes a non-ASCII name
       longer in bytes than in characters, which is the test here. ASCII names
       are left exactly as they were. */
    const uni = nameB.length === name.length ? null : new Uint8Array([...u16(0x7075), ...u16(5 + nameB.length), 1, ...u32(crc32(nameB)), ...nameB]);
    const uniLen = uni ? uni.length : 0;
    // only this entry's own start needs 64 bits; a single image is never 4 GB
    const far = offset >= U32_MAX;
    const local = new Uint8Array([0x50, 0x4B, 3, 4, ...u16(20), ...u16(UTF8), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nameB.length), ...u16(uniLen)]);
    stash(uni ? [local, nameB, uni, bytes] : [local, nameB, bytes]);
    const z64 = far ? new Uint8Array([...u16(1), ...u16(8), ...u64(offset)]) : null;
    central.push(new Uint8Array([0x50, 0x4B, 1, 2, ...u16(far ? 45 : 20), ...u16(far ? 45 : 20), ...u16(UTF8), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nameB.length), ...u16((z64 ? z64.length : 0) + uniLen), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(far ? U32_MAX : offset)]), nameB);
    if (z64) central.push(z64);
    if (uni) central.push(uni);
    offset += local.length + nameB.length + uniLen + sz;
    count++;
  };
  const finish = () => {
    flush();
    let cdSize = 0;
    central.forEach(c => cdSize += c.length);
    const cdAt = offset;
    const need64 = count >= U16_MAX || cdAt >= U32_MAX || cdSize >= U32_MAX;
    const tail = [];
    if (need64) {
      // zip64 end of central directory, then the locator that points back at it
      tail.push(new Uint8Array([0x50, 0x4B, 6, 6, ...u64(44), ...u16(45), ...u16(45), ...u32(0), ...u32(0), ...u64(count), ...u64(count), ...u64(cdSize), ...u64(cdAt)]));
      tail.push(new Uint8Array([0x50, 0x4B, 6, 7, ...u32(0), ...u64(cdAt + cdSize), ...u32(1)]));
    }
    // each classic field still carries the real value whenever it fits
    tail.push(new Uint8Array([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(count >= U16_MAX ? U16_MAX : count), ...u16(count >= U16_MAX ? U16_MAX : count), ...u32(cdSize >= U32_MAX ? U32_MAX : cdSize), ...u32(cdAt >= U32_MAX ? U32_MAX : cdAt), ...u16(0)]));
    return new Blob([...chunks, ...central, ...tail], {
      type: "application/zip"
    });
  };
  return {
    add,
    finish,
    get count() {
      return count;
    },
    get bytes() {
      return offset;
    }
  };
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  /* A multi-gigabyte archive is still being read out of this url long after a
     small one has finished, and revoking it mid-download can cut it off. Hold
     it for a minute per 200 MB, and never less than the original minute. */
  revokeSoon(url, Math.max(60000, Math.ceil(blob.size / 2e8) * 60000));
}
const extOf = u => {
  const m = /^data:image\/([\w+]+)/.exec(u || "");
  const e = m ? m[1].toLowerCase() : "jpeg";
  return e === "jpeg" ? "jpg" : e === "svg+xml" ? "svg" : e;
};
/* w is A-Z, 0-9 and underscore only, so a name written in Cyrillic, Chinese
   or Japanese — or simply an accented one — was stripped to nothing and every
   such character exported as "untitled", each file overwriting the last.
   Letters and digits of any script are kept; anything that could confuse a file
   path still goes. */
/* Windows refuses these names outright, whatever the extension, so a zip
   folder called CON/ cannot be unpacked there and a file called NUL.json
   cannot be written. A trailing underscore keeps the name readable. */
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const sanitizeName = s => (String(s == null ? '' : s).replace(/[^\p{L}\p{N}\-_ ]+/gu, '').trim().replace(/ +/g, '-').slice(0, 40)) || 'untitled';
const safeFileName = s => { const n = sanitizeName(s); return WINDOWS_RESERVED.test(n) ? n + "_" : n; };

/* ---------- JSON import normalizers ---------- */
/* Term lists (searchables) arrive in whatever shape produced the file. Anything
   generated by hand or by an AI is as likely to write one comma-separated string
   as a proper array, and CharSnap hangs several fields off the first variant
   rather than the top level. Being strict here meant the list silently arrived
   empty with nothing to say why, which is the worst of both worlds. */
function toTermList(v) {
  const raw = Array.isArray(v) ? v.map(x => x == null ? "" : String(x))
    : typeof v === "string" ? v.split(/[,;\n]+/)
      : [];
  const out = [];
  const seen = new Set();
  for (const s of raw) {
    const t = s.trim();
    const key = t.toLowerCase();
    if (t && !seen.has(key)) { seen.add(key); out.push(t); }
  }
  return out;
}
/* Tags get the same tolerance, and additionally take CharSnap's spelling when
   they are one of theirs — so an imported "age gap" lands as "Age Gap", matching
   what typing it into the editor would have stored, instead of sitting beside it
   as a second tag. */
function toTagList(v) {
  const out = [];
  const seen = new Set();
  for (const t of toTermList(v)) {
    const canon = charSnapTag(t) || t;
    const key = canon.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(canon); }
  }
  return out;
}
// first source that yields anything wins
function firstTermList(...sources) {
  for (const s of sources) {
    const list = toTermList(s);
    if (list.length) return list;
  }
  return [];
}
function asArray(x) {
  return Array.isArray(x) ? x : [x];
}
function normalizeCharacterImport(obj) {
  // returns [{ char, images, thumbs }]
  const results = [];
  const fresh = (raw, images = {}, thumbs = {}, blurredList = []) => {
    // remap image ids so imports never collide with existing records
    const map = {};
    const remap = oldId => {
      if (!oldId) return null;
      if (!map[oldId]) map[oldId] = uid();
      return map[oldId];
    };
    /* album and variantId carry the gallery's organisation. Rebuilding entries as
       just {imgId, caption} silently flattened it, so exporting and reimporting a
       character lost every album assignment and variant-image binding. */
    const gallery = (raw.gallery || []).map(g => ({
      imgId: remap(g.imgId),
      caption: g.caption || "",
      album: g.album || "",
      variantId: g.variantId || ""
    })).filter(g => g.imgId);
    const profileImg = remap(raw.profileImg);
    const banner = remap(raw.banner);
    /* A variant carries its own portrait, and it was the one image id copied
       through untouched while every other one was remapped. Two things went
       wrong with that. The picture never arrived, because the payload below is
       built from the remap table and the variant's id was never in it; and the
       id it kept could already belong to a picture in this vault, so the
       imported variant quietly adopted a stranger's portrait — the very
       collision the remapping is here to prevent. Done here, above the payload
       and the imgMeta pass, so the picture travels with it. */
    const variants = Array.isArray(raw.variants) ? raw.variants.map(v => {
      const out = { ...v, id: v.id || uid() };
      const img = remap(v.profileImg);
      if (img) out.profileImg = img; else delete out.profileImg;
      return out;
    }) : [];
    // imgMeta carries album/variant for images that are not gallery entries
    // (portraits, banner); its keys are image ids and need the same remapping.
    // Only ids the import actually brought across are kept.
    const imgMeta = {};
    for (const [oldId, meta] of Object.entries(raw.imgMeta || {})) {
      if (map[oldId] && meta) imgMeta[map[oldId]] = { ...meta };
    }
    const outImages = {},
      outThumbs = {},
      outBlur = [];
    for (const [oldId, newId] of Object.entries(map)) {
      if (images[oldId]) outImages[newId] = images[oldId];
      if (thumbs[oldId]) outThumbs[newId] = thumbs[oldId];
      if (blurredList.indexOf(oldId) >= 0) outBlur.push(newId);
    }
    /* Sections get fresh ids so an import cannot collide with an existing record,
       which leaves sectionOrder's "sec:<id>" keys addressing the old ones. Remap
       them; carrying the order through untouched sank custom sections to the
       bottom, the same way restoring a version used to. */
    const secMap = {};
    const sections = (raw.sections || []).map(s => {
      const id = uid();
      if (s.id) secMap["sec:" + s.id] = "sec:" + id;
      return { id, title: s.title || "", content: s.content || s.body || "" };
    }).filter(s => s.content);
    const liveSec = new Set(sections.map(s => "sec:" + s.id));
    const remapped = Array.isArray(raw.sectionOrder)
      ? raw.sectionOrder.map(k => secMap[k] || k)
        .filter(k => String(k).indexOf("sec:") !== 0 || liveSec.has(k))
      : null;
    const sectionOrder = remapped && remapped.length ? remapped : null;
    return {
      char: {
        id: uid(),
        name: raw.name || "Imported character",
        age: raw.age || "",
        gender: raw.gender || "",
        pronouns: raw.pronouns || "",
        // CharSnap keeps these two on the character, not the variant
        nsfw: !!raw.nsfw,
        nsfwPicture: !!raw.nsfwPicture,
        tags: toTagList(raw.tags),
        searchables: toTermList(raw.searchables),
        story: raw.story || raw.backstory || raw.description || "",
        personality: raw.personality || "",
        tagline: raw.tagline || "",
        scenario: raw.scenario || "",
        firstMessage: raw.firstMessage || "",
        exampleMessage: raw.exampleMessage || "",
        creatorMemo: raw.creatorMemo || "",
        systemPrompt: raw.systemPrompt || "",
        alwaysActiveSystemPrompt: raw.alwaysActiveSystemPrompt || "",
        variants,
        lorebooks: Array.isArray(raw.lorebooks) ? raw.lorebooks.filter(x => typeof x === "string") : [],
        bucket: raw.bucket || "",
        sections: sections,
        profileImg,
        banner,
        gallery,
        albums: Array.isArray(raw.albums) ? raw.albums.filter(a => typeof a === "string") : [],
        imgMeta,
        sectionOrder: sectionOrder,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      images: outImages,
      thumbs: outThumbs,
      blurred: outBlur
    };
  };
  if (obj && obj.app === "rolecraft-vault") {
    const imgs = obj.images || {},
      ths = obj.thumbs || {},
      bl = obj.blurred || [];
    for (const raw of obj.char ? [obj.char] : obj.chars || []) results.push(fresh(raw, imgs, ths, bl));
    return results;
  }
  // Character-card style (Tavern v1/v2) and bot-pack containers ({ Characters: [...] })
  const container = obj && (Array.isArray(obj.Characters) ? obj.Characters : Array.isArray(obj.characters) ? obj.characters : null);
  const cards = container || asArray(obj);
  const S = v => (v == null ? "" : String(v)).trim();
  for (const card of cards) {
    const d = card && card.data && (card.spec || card.data.name) ? card.data : card;
    if (!d || typeof d !== "object") continue;
    if (!S(d.name) && !S(d.description) && !S(d.personality)) continue;
    const sections = [];
    const sec = (title, v) => {
      const s = S(v);
      if (s) sections.push({
        title,
        content: s
      });
    };
    /* CharSnap keeps these four on the variant, in snake_case — its documented
       import format lists base_system_override, nsfw_system_override,
       prefill_instruction_override and alternate_greetings as optional
       per-variant fields. This only ever looked for camelCase at the top level,
       which is neither, so a real CharSnap file lost all four without a word —
       including one this app had just written, since the export does emit
       snake_case. Both spellings and both levels are accepted now. */
    const v0 = Array.isArray(d.variants) && d.variants[0] || {};
    const anyOf = (...keys) => {
      for (const k of keys) {
        if (d[k] != null && String(d[k]).trim()) return d[k];
        if (v0[k] != null && String(v0[k]).trim()) return v0[k];
      }
      return "";
    };
    // extra first messages ship as a JSON-encoded array string, or as CharSnap’s
    // alternate_greetings: an array of [greeting, scenario] pairs
    try {
      const rawExtra = anyOf("additionalFirstMessagesAndScenarios", "alternate_greetings", "alternateGreetings");
      const extra = typeof rawExtra === "string" ? JSON.parse(rawExtra) : rawExtra;
      if (Array.isArray(extra) && extra.length) {
        sec("Additional first messages", extra.map(x => typeof x === "string" ? x : JSON.stringify(x)).join("\n\n---\n\n"));
      }
    } catch (e) {}
    /* A file's own sections were never read here — only the four override
       fields below produced any. Writing sections into a hand-made file did
       nothing at all, and the sample did not list them, so there was no way to
       find that out. Sections carried by the file come first, then the
       overrides, which are sections in all but name. */
    (Array.isArray(d.sections) ? d.sections : []).forEach(x => {
      if (x && typeof x === "object") sec(S(x.title) || "Section", x.content || x.body);
    });
    sec("System override", anyOf("baseSystemOverride", "base_system_override"));
    sec("NSFW system override", anyOf("nsfwSystemOverride", "nsfw_system_override"));
    sec("Prefill instructions", anyOf("prefillInstructionOverride", "prefill_instruction_override", "post_history_instructions"));
    const contentOf = v => ({
      tagline: S(v.tagline || v.variant_tagline || v.shortMessage),
      // a hidden character brought home keeps its writing, not the marks
      story: showGutsIn(v.story || v.backstory || v.description || ""),
      personality: showGutsIn(v.personality || ""),
      scenario: S(v.scenario),
      firstMessage: S(v.first_mes || v.firstMessage || v.first_message || v.greeting),
      exampleMessage: S(v.mes_example || v.exampleMessage || v.example_message || v.example_dialogs),
      creatorMemo: S(v.creator_notes || v.characterCreatorComment || v.creator_comment || v.creatorMemo),
      systemPrompt: S(v.system_prompt || v.systemPrompt),
      alwaysActiveSystemPrompt: S(v.superSystemPrompt || v.always_active_system_prompt || v.alwaysActiveSystemPrompt),
      // CharSnap keeps age on the variant; every variant past the first used to lose it
      age: S(v.age),
      gender: S(v.gender),
      pronouns: S(v.pronouns)
    });
    const base = contentOf(d);
    // CharSnap-style variants: first = default (already in base), extras become vault variants
    let variants = [];
    if (Array.isArray(d.variants) && d.variants.length) {
      const first = contentOf(d.variants[0]);
      Object.keys(first).forEach(k => {
        if (!base[k] && first[k]) base[k] = first[k];
      });
      variants = d.variants.slice(1, 5).map((v, i) => ({
        id: uid(),
        name: S(v.variant_name || v.name) || "Variant " + (i + 2),
        ...contentOf(v)
      }));
    }
    /* CharSnap keeps age on the variant, not at the top level — its own
       Full-Character template has no top-level age at all — so reading only d.age
       dropped it on every import. A variant-only file is the bare variant object,
       which has no name either; fall back to variant_name so it does not land as
       "Imported character". */
    const firstV = Array.isArray(d.variants) && d.variants[0] || null;
    const ageOf = x => x && x.age != null && String(x.age).trim() ? String(x.age) : "";
    /* variants[0] is the Default s content, so its variant_name was thrown
       away — which meant a file could never rename the variant it updated.
       It is carried alongside the character rather than on it, so it reaches
       the update dialog without ever being saved onto a record. */
    /* "Default" is not a name — it is what the sample file and CharSnap both
       put in the first slot to mean "this one is the default". Taking it would
       name a variant "Default". */
    const fvn = S(firstV && firstV.variant_name);
    const firstVName = /^default$/i.test(fvn) ? "" : fvn;
    const res0 = fresh({
      name: S(d.name || d.variant_name),
      nsfw: !!(d.nsfw != null ? d.nsfw : v0.nsfw),
      nsfwPicture: !!(d.nsfw_picture != null ? d.nsfw_picture : d.nsfwPicture),
      tags: toTagList(d.tags),
      // CharSnap keeps several fields on the variant, so look there too
      searchables: firstTermList(d.searchables, firstV && firstV.searchables),
      sections,
      age: ageOf(d) || ageOf(firstV),
      gender: d.gender,
      pronouns: d.pronouns,
      ...base,
      variants
    });
    res0.variantName = firstVName;
    results.push(res0);
  }
  return results;
}
function normalizePersonaImport(obj) {
  const results = [];
  const fresh = (raw, images = {}, thumbs = {}, blurredList = []) => {
    const out = {},
      outT = {},
      outBlur = [];
    const map = {};
    const remap = oldId => {
      if (!oldId || !images[oldId]) return null;
      if (!map[oldId]) {
        map[oldId] = uid();
        out[map[oldId]] = images[oldId];
        if (thumbs[oldId]) outT[map[oldId]] = thumbs[oldId];
        if (blurredList.indexOf(oldId) >= 0) outBlur.push(map[oldId]);
      }
      return map[oldId];
    };
    const avatar = remap(raw.avatar);
    /* album carries the gallery's organisation, exactly as it does for characters.
       Rebuilding entries as just {imgId, caption} and dropping albums[] flattened
       it, so exporting a persona and importing it back lost every album. Personas
       have no variants, so there is no variantId to carry here. */
    const gallery = (raw.gallery || []).map(g => ({
      imgId: remap(g.imgId),
      caption: g.caption || "",
      album: g.album || ""
    })).filter(g => g.imgId);
    // keep album names the persona knows about even when nothing is filed under them yet
    const named = Array.isArray(raw.albums) ? raw.albums.map(String).filter(Boolean) : [];
    const used = gallery.map(g => g.album).filter(Boolean);
    const albums = [];
    for (const a of [...named, ...used]) if (albums.indexOf(a) < 0) albums.push(a);
    /* A persona is not just a name and a description. It has a tagline, a bucket,
       the lorebooks it lives in, and sections of its own — and none of them were
       being read back, so exporting a persona and importing it again quietly
       returned a poorer persona than the one that left. Handled the same way the
       character import handles them, including fresh section ids and the
       sectionOrder keys that address them. */
    const secMap = {};
    const sections = (raw.sections || []).map(s => {
      const id = uid();
      if (s.id) secMap["sec:" + s.id] = "sec:" + id;
      return { id, title: s.title || "", content: s.content || s.body || "" };
    }).filter(s => s.content);
    const liveSec = new Set(sections.map(s => "sec:" + s.id));
    const remappedOrder = Array.isArray(raw.sectionOrder)
      ? raw.sectionOrder.map(k => secMap[k] || k).filter(k => String(k).indexOf("sec:") !== 0 || liveSec.has(k))
      : null;
    // imgMeta keys are image ids, so they need the same remapping; only ids the
    // import actually brought across are kept
    const imgMeta = {};
    for (const [oldId, meta] of Object.entries(raw.imgMeta || {})) {
      if (map[oldId] && meta) imgMeta[map[oldId]] = { ...meta };
    }
    return {
      persona: {
        id: uid(),
        name: raw.name || "Imported persona",
        tagline: raw.tagline || "",
        role: raw.role || "",
        pronouns: raw.pronouns || "",
        bucket: raw.bucket || "",
        lorebooks: Array.isArray(raw.lorebooks) ? raw.lorebooks.filter(x => typeof x === "string") : [],
        description: raw.description || raw.personality || "",
        avatar,
        gallery,
        albums,
        imgMeta,
        sections,
        sectionOrder: remappedOrder && remappedOrder.length ? remappedOrder : null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      images: out,
      thumbs: outT,
      blurred: outBlur
    };
  };
  if (obj && obj.app === "rolecraft-vault") {
    const imgs = obj.images || {},
      ths = obj.thumbs || {},
      bl = obj.blurred || [];
    for (const raw of obj.persona ? [obj.persona] : obj.personas || []) results.push(fresh(raw, imgs, ths, bl));
    return results;
  }
  for (const raw of asArray(obj)) if (raw && typeof raw === "object" && (raw.name || raw.description)) results.push(fresh(raw));
  return results;
}
/* A prompt collection could be exported and then never brought back — there was
   no import for it anywhere, so the file was a dead end and anyone who exported
   their prompts expecting to move them had nowhere to put them. Reads its own
   export, a bare prompt, or a list of them. */
function normalizePromptImport(obj, fallbackCollection) {
  const out = [];
  const srcImages = obj && obj.images || {},
    srcThumbs = obj && obj.thumbs || {},
    srcBlur = obj && obj.blurred || [];
  const images = {},
    thumbs = {},
    blurred = [];
  const remap = oldId => {
    if (!oldId || !srcImages[oldId]) return null;
    const nid = uid();
    images[nid] = srcImages[oldId];
    if (srcThumbs[oldId]) thumbs[nid] = srcThumbs[oldId];
    if (srcBlur.indexOf(oldId) >= 0) blurred.push(nid);
    return nid;
  };
  const push = raw => {
    out.push({
      id: uid(),
      title: raw.title || raw.name || "Imported prompt",
      collection: raw.collection || raw.book || fallbackCollection || "",
      content: raw.content || raw.prompt || raw.text || "",
      tags: toTermList(raw.tags),
      images: (raw.images || []).map(im => ({
        imgId: remap(im.imgId)
      })).filter(im => im.imgId),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  };
  const list = obj && obj.app === "rolecraft-vault" ? obj.prompt ? [obj.prompt] : obj.prompts || [] : asArray(obj).filter(raw => raw && typeof raw === "object" && (raw.content || raw.prompt || raw.text));
  list.forEach(push);
  return {
    entries: out.filter(r => r.content),
    images,
    thumbs,
    blurred
  };
}
function normalizeLoreImport(obj, fallbackWorld) {
  const out = [];
  const srcImages = obj && obj.images || {},
    srcThumbs = obj && obj.thumbs || {},
    srcBlur = obj && obj.blurred || [];
  const images = {},
    thumbs = {},
    blurred = [];
  const remap = oldId => {
    if (!oldId || !srcImages[oldId]) return null;
    const nid = uid();
    images[nid] = srcImages[oldId];
    if (srcThumbs[oldId]) thumbs[nid] = srcThumbs[oldId];
    if (srcBlur.indexOf(oldId) >= 0) blurred.push(nid);
    return nid;
  };
  const push = raw => {
    const trig = Array.isArray(raw.triggers) ? raw.triggers : Array.isArray(raw.keys) ? raw.keys : Array.isArray(raw.key) ? raw.key : [];
    out.push({
      id: uid(),
      title: raw.title || raw.name || raw.comment || (Array.isArray(raw.key) ? raw.key.join(", ") : raw.key) || "Imported entry",
      world: raw.world || fallbackWorld || "",
      content: raw.content || raw.entry || raw.description || "",
      entryType: raw.entryType || raw.type || "",
      triggers: trig.map(String).filter(Boolean),
      images: (raw.images || []).map(im => ({
        imgId: remap(im.imgId)
      })).filter(im => im.imgId),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  };
  const done = () => ({
    entries: out.filter(r => r.content),
    images,
    thumbs,
    blurred
  });
  if (obj && obj.app === "rolecraft-vault") {
    for (const raw of obj.lore || []) push(raw);
    return {
      entries: out,
      images,
      thumbs,
      blurred
    };
  }
  if (obj && obj.entries && typeof obj.entries === "object" && !Array.isArray(obj.entries)) {
    // SillyTavern / CharSnap / world-info style lorebook (entries keyed by id)
    const world = obj.name || obj.title || fallbackWorld || "Imported lorebook";
    for (const raw of Object.values(obj.entries)) push({
      ...raw,
      world
    });
    return done();
  }
  if (obj && Array.isArray(obj.entries)) {
    // JAI-style lorebook: { title, entry_count, entries: [ { name, type, keys, content } ] }
    const world = obj.title || obj.name || fallbackWorld || "Imported lorebook";
    for (const raw of obj.entries) push({
      ...raw,
      world
    });
    return done();
  }
  for (const raw of asArray(obj)) if (raw && typeof raw === "object" && (raw.content || raw.entry || raw.description)) push(raw);
  return done();
}

/* CharSnap's lorebook import uses the Chub/world-info structure plus CharSnap's
   own fields (triggers/description/entryType) — emit both per entry. One entry
   on its own is the same file with a single entry in it, so a whole book and a
   single entry can never drift apart. */
function loreToCharSnap(bookName, entries) {
  const out = {
    name: bookName || "Lorebook",
    description: "",
    entries: {}
  };
  entries.forEach((e, i) => {
    const nm = e.title || "Untitled";
    const txt = e.content || "";
    const trig = (e.triggers || []).map(String).filter(Boolean);
    if (!trig.length) trig.push(nm); // CharSnap requires at least 1 trigger per entry
    out.entries[String(i + 1)] = {
      id: i + 1,
      keys: trig,
      secondary_keys: [],
      comment: nm,
      content: txt,
      constant: false,
      selective: true,
      insertion_order: i + 1,
      enabled: true,
      position: "before_char",
      case_sensitive: false,
      priority: 10,
      extensions: {},
      name: nm,
      triggers: trig,
      description: txt,
      entryType: e.entryType || "Other",
      isPublic: false
    };
  });
  return out;
}

/* Convert a vault character into CharSnap's "Import Full Character JSON" shape:
   required top-level fields (name, gender, tagline, variants) + the same content
   field names CharSnap uses in its own character exports, mirrored into
   variants[0] (first variant becomes the default on import). */
/* Which sections CharSnap treats as its own fields rather than as description.
   Shared with the token counter so the two cannot disagree about what ends up
   where — the counter is only worth anything if it matches what is actually
   sent. */
const CHARSNAP_SECTIONS = {
  "system override": "baseSystemOverride",
  "nsfw system override": "nsfwSystemOverride",
  "prefill instructions": "prefillInstructionOverride",
  "additional first messages": "__afms"
};
/* Custom sections are shared by every version and CharSnap has nowhere to put
   them, so they are folded into the description on the way out. One folder,
   used by the Default and by every variant, so the two cannot diverge. */
/* Every section reaches CharSnap under a heading, but the Backstory — which
   leads the description — arrived unlabelled, so the file opened with one
   anonymous block and only then started naming things. It is labelled like the
   rest now.

   The heading runs straight into its own writing — "Backstory: she was born" —
   rather than sitting on a line above it, so there is nothing between a title
   and the text it belongs to. Content is trimmed as well, so a blank line left
   at the top of a section cannot put a gap back. Blocks are still parted by a
   blank line, which is what tells one section from the next. */
function foldSections(text, extras) {
  /* Inside a section every blank line comes out, so a heading runs straight into
     its writing and the paragraphs under it sit on consecutive lines. Between
     one section and the next a blank line stays, because that gap is the only
     thing marking where one ends and the next begins. Trailing spaces go with
     the blank lines, since a line of nothing but spaces reads as an empty one. */
  const LF = String.fromCharCode(10), CR = String.fromCharCode(13);
  const flat = t => String(t == null ? "" : t).split(CR).join("").split(LF).map(x => x.trim()).filter(Boolean).join(LF);
  const blocks = [];
  const body = flat(text);
  if (body) blocks.push("Backstory: " + body);
  (extras || []).forEach(s => {
    const content = flat(s.content);
    if (content) blocks.push((s.title || "Section") + ": " + content);
  });
  return blocks.join(LF + LF);
}

/* CharSnap's "Hide Guts from other Users" toggle has no counterpart in the
   import file: it works by wrapping the field's own text. Their tooltip says you
   "can also manually add |~ and ~| symbols around text to hide specific parts",
   and the toggle does that to the Description and Personality. So the only way
   for a character to arrive already hidden is to send the squigglies. */
const GUTS_OPEN = "|~";
const GUTS_CLOSE = "~|";
function gutsHidden(text) {
  const t = (text == null ? "" : String(text)).trim();
  if (!(t.length > GUTS_OPEN.length + GUTS_CLOSE.length && t.startsWith(GUTS_OPEN) && t.endsWith(GUTS_CLOSE))) return false;
  /* Their tooltip invites marking specific parts by hand, so a field can hold
     several hidden spans. One that opens and closes twice is not a wholly
     hidden field, and stripping its outermost marks would tear the middle out
     of the writing — so the closing mark at the end must be the first one. */
  return t.indexOf(GUTS_CLOSE) === t.length - GUTS_CLOSE.length;
}
function hideGutsIn(text) {
  const t = (text == null ? "" : String(text)).trim();
  // wrapping twice would show one pair of marks to readers instead of hiding
  if (!t || gutsHidden(t)) return t;
  return GUTS_OPEN + " " + t + " " + GUTS_CLOSE;
}
function showGutsIn(text) {
  const t = (text == null ? "" : String(text)).trim();
  return gutsHidden(t) ? t.slice(GUTS_OPEN.length, -GUTS_CLOSE.length).trim() : (text || "");
}
/* What each section costs, and when. A title CharSnap reserves stops being part
   of the description and becomes that field instead — worth showing, because
   renaming a section to "System override" quietly changes where its words go.

   Only the first section claiming a reserved title gets it. A second one with
   the same title falls back into the description like any other, so the answer
   depends on a section's position and not only on its title — reading the title
   alone told you a duplicate was an override when its words were really being
   paid for on every reply. Returns one kind per section, in order, and the split
   below is built from it so the two cannot drift apart. */
function sectionKinds(sections) {
  const mapped = {};
  return (sections || []).map(s => {
    const key = CHARSNAP_SECTIONS[(s.title || "").trim().toLowerCase()];
    if (!key || mapped[key]) return "permanent";
    mapped[key] = s.content || "";
    return key === "__afms" ? "temporary" : "override";
  });
}
function splitCharSnapSections(c) {
  const list = c.sections || [];
  const kinds = sectionKinds(list);
  const mapped = {};
  const extras = [];
  list.forEach((s, i) => {
    if (kinds[i] === "permanent") { extras.push(s); return; }
    mapped[CHARSNAP_SECTIONS[(s.title || "").trim().toLowerCase()]] = s.content || "";
  });
  // anything that is not one of those is folded into the description on the way out
  return { mapped, extras, description: foldSections(c.story, extras) };
}
function charToCharSnap(c, scope, hide) {
  const split = splitCharSnapSections(c);
  const mapped = split.mapped;
  let baseDescription = split.description;
  let afms = "[]";
  if (mapped.__afms) {
    try {
      afms = JSON.stringify(mapped.__afms.split("\n\n---\n\n"));
    } catch (e) {}
  }
  const contentOf = (src, description) => ({
    personality: src.personality || "",
    description: description != null ? description : src.story || "",
    scenario: src.scenario || "",
    firstMessage: src.firstMessage || "",
    exampleMessage: src.exampleMessage || "",
    systemPrompt: src.systemPrompt || "",
    superSystemPrompt: src.alwaysActiveSystemPrompt || null,
    baseSystemOverride: mapped.baseSystemOverride || "",
    nsfwSystemOverride: mapped.nsfwSystemOverride || "",
    prefillInstructionOverride: mapped.prefillInstructionOverride || "",
    additionalFirstMessagesAndScenarios: afms,
    characterCreatorComment: src.creatorMemo || "",
    shortMessage: src.tagline || ""
  });
  const baseContent = contentOf(c, baseDescription);
  const firstLine = (c.story || "").split("\n").map(s => s.trim()).filter(Boolean)[0] || "";
  const tagline = c.tagline || (c.tags || []).join(" | ") || firstLine.slice(0, 80) || "OC";
  const ageStr = String(c.age == null ? "" : c.age).trim() || "18";
  const g = String(c.gender || "").trim().toLowerCase();
  const gender = g === "male" || g === "female" ? g : "others";
  // alternate greetings import as [first_message, scenario] pairs
  let altGreetings;
  if (mapped.__afms) {
    try {
      const arr = JSON.parse(mapped.__afms.split("\n\n---\n\n").length > 1 ? JSON.stringify(mapped.__afms.split("\n\n---\n\n")) : mapped.__afms);
      if (Array.isArray(arr) && arr.length) altGreetings = arr.map(x => Array.isArray(x) ? [String(x[0] || ""), String(x[1] || "")] : [String(x), ""]);
    } catch (e) {
      altGreetings = mapped.__afms.split("\n\n---\n\n").map(s => [s, ""]);
    }
  }
  // CharSnap's DOCUMENTED import schema (gitbook "Required Fields"): snake_case per-variant keys.
  const variantOf = (srcC, description, vName, vTagline) => {
    const out = {
      personality: srcC.personality || baseContent.personality || "",
      description: description || baseContent.description || "",
      first_message: srcC.firstMessage || baseContent.firstMessage || "",
      // a variant with its own age exports it; otherwise the character's stands in
      age: String(srcC.age == null ? "" : srcC.age).trim() || ageStr
    };
    /* Only these two fields. CharSnap's toggle hides the Description and the
       Personality and nothing else — the name, tagline and pictures stay
       visible, which is the point of it. */
    if (hide) {
      out.description = hideGutsIn(out.description);
      out.personality = hideGutsIn(out.personality);
    }
    const opt = (k, v) => {
      if (v != null && String(v).trim()) out[k] = v;
    };
    opt("scenario", srcC.scenario || "");
    opt("example_message", srcC.exampleMessage || "");
    opt("system_prompt", srcC.systemPrompt || "");
    opt("always_active_system_prompt", srcC.alwaysActiveSystemPrompt || "");
    opt("creator_comment", srcC.creatorMemo || "");
    opt("variant_name", vName);
    opt("variant_tagline", vTagline);
    opt("base_system_override", mapped.baseSystemOverride);
    opt("nsfw_system_override", mapped.nsfwSystemOverride);
    opt("prefill_instruction_override", mapped.prefillInstructionOverride);
    if (altGreetings) out.alternate_greetings = altGreetings;
    return out;
  };
  const scopeAll = scope === undefined || scope === "all";
  /* A scope naming a version that has since been deleted matched nothing and
     produced an empty variants array, which is a file CharSnap will not take —
     it requires at least one. Fall back to the Default rather than write it. */
  const picked = scopeAll ? (c.variants || []).slice(0, 4) : (c.variants || []).filter(v => v.id === scope);
  const useDefault = scopeAll || scope === null || !picked.length;
  const variants = useDefault ? [variantOf(c, baseDescription, "", "")] : [];
  picked.forEach((v, i) => {
    // required fields fall back to the Default so each variant is complete.
    // The tagline is NOT inherited: variant_tagline is an override, and filling it
    // with the character's own tagline would set an override that says nothing.
    variants.push(variantOf({
      age: v.age,
      personality: v.personality || c.personality,
      firstMessage: v.firstMessage || c.firstMessage,
      scenario: v.scenario,
      exampleMessage: v.exampleMessage,
      systemPrompt: v.systemPrompt,
      alwaysActiveSystemPrompt: v.alwaysActiveSystemPrompt,
      creatorMemo: v.creatorMemo
    }, (v.story || "").trim() ? foldSections(v.story, split.extras) : baseDescription, v.name || "Variant " + (i + 2), v.tagline || ""));
  });
  /* The first variant becomes the character's default on import, so it must not
     carry overrides: variant_name "Default" renames the default to the word
     "Default", and variant_tagline repeats the tagline already at the top level.
     This holds however the list was built, including a single-variant export. */
  if (variants[0]) {
    delete variants[0].variant_name;
    delete variants[0].variant_tagline;
  }
  const scopedV = scopeAll || scope === null ? null : (c.variants || []).find(v => v.id === scope);
  /* Key order and set follow CharSnap's own "Full-Character" import template.
     tags/searchables go out even when empty, as the template does. The two NSFW
     flags are the character's own now rather than always false — CharSnap asks
     for the first on any adult bot and uses the second to blur the pictures. */
  const main = {
    name: c.name || "Untitled",
    gender: gender,
    tagline: scopedV && (scopedV.tagline || "").trim() ? scopedV.tagline : tagline,
    tags: (c.tags || []).slice(),
    /* CharSnap: searchables "cannot contain spaces (use squishing, hyphens, or
       underscores)". Sent as typed they are refused, so spaces become hyphens
       on the way out — their own suggestion. The vault keeps what you wrote. */
    searchables: (c.searchables || []).map(t => String(t).trim().replace(/\s+/g, "-")).filter(Boolean),
    nsfw: !!c.nsfw,
    nsfw_picture: !!c.nsfwPicture,
    variants: variants
  };
  return {
    main,
    variantFiles: []
  };
}
/* CharSnap has two importers and they take different files. "Import JSON" on the
   Basics tab wants the whole character, which is what charToCharSnap builds.
   "Import Variant" on the Details tab wants a variant on its own — their own
   sample is a bare object, and their table says the per-variant fields are
   "required in each variant object, and at the root of a variant-only JSON".
   Handing it a character file gets nothing imported: it ignores the top-level
   fields and never looks inside variants[]. Key order follows their sample.
   alternate_greetings is left out when empty rather than sent as [["",""]],
   which would land as a blank greeting. */
/* CharSnap refuses a file whose required fields are blank. The app knows the
   contract now, so it can say which ones are missing before you send it rather
   than leaving you to work it out from a rejection. */
function charSnapMissing(c, scope) {
  const file = charToCharSnap(c, scope).main;
  const v = file.variants[0] || {};
  const gaps = [];
  if (!String(file.name || "").trim()) gaps.push("name");
  if (!String(file.tagline || "").trim()) gaps.push("tagline");
  [["personality", "personality"], ["description", "description"], ["first_message", "first message"], ["age", "age"]]
    .forEach(([k, label]) => { if (!String(v[k] || "").trim()) gaps.push(label); });
  return gaps;
}
function charToCharSnapVariant(c, scope, hide) {
  const built = charToCharSnap(c, scope, hide).main.variants[0] || {};
  const v = (c.variants || []).find(x => x.id === scope) || null;
  const S = x => (x == null ? "" : String(x));
  const out = {
    variant_name: S(v ? v.name : ""),
    variant_tagline: S(v ? v.tagline : ""),
    age: S(built.age),
    personality: S(built.personality),
    description: S(built.description),
    first_message: S(built.first_message),
    scenario: S(built.scenario)
  };
  if (Array.isArray(built.alternate_greetings) && built.alternate_greetings.length) out.alternate_greetings = built.alternate_greetings;
  out.creator_comment = S(built.creator_comment);
  out.example_message = S(built.example_message);
  out.system_prompt = S(built.system_prompt);
  out.always_active_system_prompt = S(built.always_active_system_prompt);
  out.base_system_override = S(built.base_system_override);
  out.nsfw_system_override = S(built.nsfw_system_override);
  out.prefill_instruction_override = S(built.prefill_instruction_override);
  return out;
}
const timeAgo = ts => {
  if (!ts) return "";
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const days = Math.floor(h / 24);
  if (days < 30) return days + "d ago";
  return new Date(ts).toLocaleDateString();
};

/* ---------- shared styles ---------- */
const CSS = `
  .rcv * { box-sizing: border-box; }
  .rcv {
    position: relative;
    --ink: #0a0e1c; --ink2: #0e1426; --panel: #121a30; --panel2: #17203a;
    --line: rgba(150,166,214,.14); --line2: rgba(150,166,214,.26);
    --text: #e7ebf7; --mut: #8d97b8; --dim: #8088a2; /* AA on panel2, was #5c6688 at 2.85:1 */
    --brass: #d9b25c; --brass-soft: rgba(217,178,92,.14); --brass-line: rgba(217,178,92,.35);
    --blue: #8aa2f2; --blue-deep: #4a63c8; --danger: #e07a7a;
    --danger-soft: rgba(224,122,122,.12); --danger-line: rgba(224,122,122,.3);
    --chip-bg: rgba(138,162,242,.1); --chip-line: rgba(138,162,242,.25);
    --nav-hov: rgba(138,162,242,.06); --nav-act: rgba(138,162,242,.1);
    --field: rgba(8,12,26,.6); --overlay: rgba(4,6,14,.72);
    --sidebg: linear-gradient(180deg, #0d1224, #0a0e1c);
    --placeholder: radial-gradient(ellipse at 50% 35%, #1a2445, #0e1426);
    --lockbg: radial-gradient(ellipse at 50% 30%, #131c38 0%, #0a0e1c 65%);
    --scroll: #232e52; --shadow: 0 10px 30px rgba(0,0,0,.5);
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: var(--text); background: var(--ink);
    min-height: 100vh; display: flex;
  }
  .rcv.light {
    --ink: #f1f2f7; --ink2: #e9ebf3; --panel: #ffffff; --panel2: #f5f6fb;
    --line: rgba(28,40,80,.13); --line2: rgba(28,40,80,.26);
    --text: #1a2135; --mut: #59637f; --dim: #6a6e7f; /* AA on ink, was #99a0b8 at 2.33:1 */
    --brass: #81601a; --brass-soft: rgba(154,114,31,.1); --brass-line: rgba(154,114,31,.35); /* AA on brass-soft too */
    --blue: #3f57c0; --blue-deep: #3a51b0; --danger: #a64949; /* AA on danger-soft too */
    --danger-soft: rgba(194,85,85,.09); --danger-line: rgba(194,85,85,.3);
    --chip-bg: rgba(63,87,192,.08); --chip-line: rgba(63,87,192,.28);
    --nav-hov: rgba(63,87,192,.06); --nav-act: rgba(63,87,192,.1);
    --field: #f0f2f9; --overlay: rgba(30,38,66,.45);
    --sidebg: linear-gradient(180deg, #ffffff, #f2f4fa);
    --placeholder: radial-gradient(ellipse at 50% 35%, #dde3f2, #c9d2e9);
    --lockbg: radial-gradient(ellipse at 50% 30%, #ffffff 0%, #e8ebf4 65%);
    --scroll: #c3cbe4; --shadow: 0 10px 30px rgba(40,55,110,.16);
  }
  .rcv.charsnap {
    --ink: #0a0a0c; --ink2: #0e0e11; --panel: #151517; --panel2: #1b1b1f;
    --line: rgba(255,255,255,.09); --line2: rgba(255,255,255,.18);
    --text: #ededf0; --mut: #a0a1aa; --dim: #83848c; /* AA on panel2, was #6b6c76 at 3.30:1 */
    --brass: #f0c239; --brass-soft: rgba(240,194,57,.12); --brass-line: rgba(240,194,57,.45);
    --blue: #3fd6d6; --blue-deep: #1fa8a8; --danger: #e07a7a;
    --danger-soft: rgba(224,122,122,.12); --danger-line: rgba(224,122,122,.3);
    --chip-bg: rgba(63,214,214,.09); --chip-line: rgba(63,214,214,.32);
    --nav-hov: rgba(240,194,57,.07); --nav-act: rgba(240,194,57,.12);
    --field: #101013; --overlay: rgba(0,0,0,.74);
    --sidebg: linear-gradient(180deg, #121214, #0a0a0c);
    --placeholder: radial-gradient(ellipse at 50% 35%, #1d1d22, #101013);
    --lockbg: radial-gradient(ellipse at 50% 30%, #18181c 0%, #0a0a0c 65%);
    --scroll: #2b2b32; --shadow: 0 10px 30px rgba(0,0,0,.65);
    --btn-grad: linear-gradient(135deg, #f4cd55, #dda51e); --btn-text: #141414;
    --cs-btn-face: rgba(240,194,57,.10);
  }
  /* CharSnap draws its primary actions as outlined gold on a dark fill rather than
     a solid gold slab, so match that instead of approximating it. */
  .rcv.charsnap .btn-primary { background: var(--cs-btn-face); color: var(--brass);
    border: 1px solid var(--brass-line); }
  .rcv.charsnap .btn-primary:hover { background: rgba(240,194,57,.18); }
  .rcv.charsnap .eyebrow { color: var(--blue); letter-spacing: .24em; }
  .rcv.charsnap .navitem.active { box-shadow: inset 3px 0 0 var(--brass); }
  .rcv .serif { font-family: 'Space Grotesk', 'Inter', sans-serif; font-weight: 700; letter-spacing: -0.02em; }
  .rcv .eyebrow { font-size: 10.5px; letter-spacing: .22em; text-transform: uppercase; color: var(--brass); font-weight: 700; }
  .rcv button { font: inherit; cursor: pointer; border: none; }
  /* Checkboxes and radios are excluded: the shared rule stretched them to full
     width with text-field padding, which is why they floated oddly beside their
     labels instead of sitting next to them. */
  .rcv input:not([type="checkbox"]):not([type="radio"]), .rcv textarea, .rcv select {
    font: inherit; color: var(--text); background: var(--field);
    border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px; width: 100%;
    outline: none; transition: border-color .15s;
  }
  .rcv input[type="checkbox"], .rcv input[type="radio"] {
    width: 16px; height: 16px; flex: 0 0 auto; margin: 0; padding: 0;
    accent-color: var(--blue); cursor: pointer;
  }
  .rcv input:focus, .rcv textarea:focus, .rcv select:focus { border-color: var(--blue-deep); }
  .rcv textarea { resize: vertical; min-height: 110px; line-height: 1.55; }
  .rcv ::placeholder { color: var(--dim); }
  .rcv .btn { border-radius: 9px; padding: 9px 16px; font-weight: 600; font-size: 13.5px; transition: filter .12s, background .12s; }
  .rcv .btn:hover { filter: brightness(1.08); }
  .rcv .btn:focus-visible, .rcv input:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .rcv .btn-primary { background: var(--btn-grad, linear-gradient(135deg, #5670d0, #4a63c8)); color: var(--btn-text, #fff); }
  .rcv .btn-ghost { background: transparent; color: var(--mut); border: 1px solid var(--line); }
  .rcv .btn-ghost:hover { color: var(--text); border-color: var(--line2); }
  .rcv .btn-brass { background: var(--brass-soft); color: var(--brass); border: 1px solid var(--brass-line); }
  .rcv .btn-danger { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-line); }
  .rcv .card { background: linear-gradient(180deg, var(--panel), var(--ink2)); border: 1px solid var(--line); border-radius: 14px; }
  .rcv .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; padding: 3px 10px; border-radius: 99px;
    background: var(--chip-bg); color: var(--blue); border: 1px solid var(--chip-line); }
  .rcv .chip.on { background: var(--brass-soft); color: var(--brass); border-color: var(--brass-line); }
  .rcv .navitem { display: flex; align-items: center; gap: 11px; width: 100%; padding: 10px 14px; border-radius: 10px;
    background: transparent; color: var(--mut); font-size: 14px; font-weight: 500; text-align: left; transition: background .12s, color .12s; }
  .rcv .navitem:hover { color: var(--text); background: var(--nav-hov); }
  .rcv .navitem.active { color: var(--text); background: var(--nav-act); box-shadow: inset 3px 0 0 var(--brass); }
  /* On a 2K or 4K screen nothing broke, but the page stopped holding together:
     the dashboard heading sat on the far left with its four counts flung to the
     far right, three thousand pixels away, and the quick-start cards stretched
     to nearly nine hundred pixels each. Capped to the same 1560 the character
     and lorebook pages already use, and centred, so every screen reads as one
     column at any size. Only the main column is capped — the class is reused by
     smaller scrollers inside panels, which must keep their own width.
     The explicit width matters: auto margins on a flex item cancel the stretch
     it would otherwise get, and without it the column sizes to its content and
     spills past a narrow screen. */
  /* The column itself is no longer capped, so the libraries, the galleries and
     anything else built from a grid use the whole screen and simply fit more per
     row. The two places that came apart when this was uncapped are handled
     directly: the dashboard below, and the reading column inside a record. */
  .rcv > .scrollbody { width: 100%; }
  /* Four counts and a heading stretched across a 4K monitor stopped reading as
     one thing, the heading on the far left and the counts three thousand pixels
     away. Capped here rather than on the column, so it does not cost every other
     screen its width. */
  .rcv .dashwrap { max-width: 2280px; margin-left: auto; margin-right: auto; }
  /* A sheet is the whole screen: a character, a persona or the editor, opening
     over the library. It is position:fixed, so the cap above made it narrower
     than the viewport and left the library visible around it. Nothing behind a
     sheet should be visible through it, whatever the reading column is set to. */
  .rcv > .scrollbody.sheet { max-width: none; margin-left: 0; margin-right: 0; }
  /* Driven by a variable so the size can be chosen in Settings. */
  .rcv .grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--card-min, 180px), 1fr)); gap: 16px; }
  .rcv .char-card { position: relative; overflow: hidden; border-radius: 14px; border: 1px solid var(--line);
    background: var(--panel); cursor: pointer; transition: transform .15s, border-color .15s; aspect-ratio: 3/4; }
  .rcv .char-card:hover { transform: translateY(-3px); border-color: var(--brass-line); }
  .rcv .char-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .rcv .char-card .veil { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 45%, rgba(6,9,20,.92) 88%); }
  .rcv.light .char-card .veil { background: linear-gradient(180deg, transparent 30%, rgba(6,9,20,.55) 62%, rgba(6,9,20,.96) 100%); }
  .rcv .char-card .meta { text-shadow: 0 1px 4px rgba(0,0,0,.65); }
  /* Top corner, opposite the selection tick, so it never pushes the caption. */
  .rcv .char-card .shots { position: absolute; top: 8px; right: 8px; z-index: 2;
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px;
    border-radius: 99px; font-size: 11px; font-weight: 600; color: #e9edf8;
    background: rgba(10,14,26,.62); border: 1px solid rgba(180,195,235,.28);
    text-shadow: 0 1px 3px rgba(0,0,0,.7); }
  .rcv .char-card .meta { position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 14px;
    background: linear-gradient(180deg, rgba(6,9,20,0), rgba(6,9,20,.86) 24%, rgba(6,9,20,.94)); }
  .rcv .wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); grid-auto-rows: 148px; grid-auto-flow: dense; gap: 12px; }
  .rcv .tile { position: relative; border-radius: 14px; overflow: hidden; border: 1px solid var(--line); padding: 0;
    cursor: pointer; background: var(--placeholder); }
  .rcv .tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .35s; }
  .rcv .tile:hover img { transform: scale(1.05); }
  .rcv .tile:hover { border-color: var(--brass-line); }
  .rcv .tile .tlab { position: absolute; bottom: 0; left: 0; right: 0; padding: 24px 10px 8px; font-size: 12px; font-weight: 600;
    color: #eef1fb; background: linear-gradient(180deg, rgba(5,8,17,0), rgba(5,8,17,.86) 45%, rgba(5,8,17,.94)); opacity: 0; transition: opacity .15s; text-align: left;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rcv .tile:hover .tlab, .rcv .tile:focus-visible .tlab { opacity: 1; }
  .rcv .tile.big { grid-column: span 2; grid-row: span 2; }
  .rcv .tile.wide { grid-column: span 2; }
  .rcv .strip { display: flex; gap: 12px; overflow-x: auto; padding: 2px 2px 10px; }
  .rcv .strip::-webkit-scrollbar { height: 8px; }
  .rcv .strip::-webkit-scrollbar-thumb { background: var(--scroll); border-radius: 8px; }
  .rcv .stile { position: relative; height: 200px; border-radius: 14px; overflow: hidden; border: 1px solid var(--line);
    flex: 0 0 auto; cursor: pointer; background: var(--placeholder); padding: 0; }
  .rcv .stile img { height: 100%; width: auto; min-width: 90px; max-width: 320px; object-fit: cover; display: block; transition: transform .35s; }
  .rcv .stile:hover img { transform: scale(1.04); }
  .rcv .stile:hover { border-color: var(--brass-line); }
  .rcv img.blur-img { filter: blur(24px) saturate(.85) brightness(.9); transform: scale(1.14); }
  .rcv .blurbtn { position: absolute; top: 8px; right: 8px; z-index: 2; width: 30px; height: 30px; border-radius: 99px;
    display: flex; align-items: center; justify-content: center; padding: 0;
    background: rgba(10,14,26,.62); color: #e7ebf7; border: 1px solid rgba(180,195,235,.3);
    opacity: 0; transition: opacity .15s; backdrop-filter: blur(4px); }
  .rcv .tile:hover .blurbtn, .rcv .stile:hover .blurbtn, .rcv .wtile:hover .blurbtn, .rcv .wtile:focus-within .blurbtn,
  .rcv .blurbtn.on, .rcv .blurbtn:focus-visible { opacity: 1; }
  .rcv .blurbtn { z-index: 3; }
  .rcv .blurbtn.on { color: #d9b25c; border-color: rgba(217,178,92,.55); }
  /* Moving a picture without dragging it, which is the only way on a touch
     screen. Along the bottom because every other corner of a tile is taken. */
  .rcv .movebtn { top: auto; bottom: 8px; opacity: 1; }
  .rcv .draghandle { cursor: grab; color: var(--dim); padding: 4px 6px; border-radius: 7px; display: inline-flex; }
  .rcv .draghandle:hover { color: var(--text); background: var(--nav-hov); }
  .rcv .draghandle:active { cursor: grabbing; }
  .rcv .drag-over { outline: 2px dashed var(--brass-line); outline-offset: 3px; }
  .rcv .dragging { opacity: .45; }
  .rcv .sec-head { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
  .rcv .wtile { position: relative; border-radius: 13px; overflow: hidden; border: 1px solid var(--line);
    background: var(--placeholder); aspect-ratio: 3/4; }
  .rcv .wtile img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .rcv .wtile .wacts { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 9px; align-items: center;
    justify-content: center; background: rgba(5,7,14,.58); opacity: 0; transition: opacity .15s; z-index: 1; }
  .rcv .wtile:hover .wacts, .rcv .wtile:focus-within .wacts { opacity: 1; }
  .rcv .wtile:hover { border-color: var(--brass-line); }
  /* The character and persona headers sit over artwork whose brightness cannot be
     known, so they are a dark surface in every theme — the same treatment the
     cards use. Redefining the palette on the container means every descendant
     keeps working without touching each one. Values solved so the faintest of
     them still clears 4.5:1 over a pure white banner. */
  /* Optional text-contrast boost. Only the faint colours need lifting — everything
     else already clears the standard comfortably — so these move --mut and --dim
     toward the main text colour. "max" simply makes them the text colour. */
  .rcv.contrast-high { --mut: #bfc5db; --dim: #b9bed1; }
  .rcv.light.contrast-high { --mut: #363f56; --dim: #3e4456; }
  .rcv.charsnap.contrast-high { --mut: #cacbd1; --dim: #bdbec3; }
  .rcv.contrast-max { --mut: var(--text); --dim: var(--text); }
  .rcv.contrast-high .hero, .rcv.contrast-max .hero { --mut: #e2e6f4; --dim: #d3d8ea; }
  .rcv .hero { background: #0a0e1c; color: var(--text);
    --text: #f2f4fc; --mut: #c3c9dd; --dim: #a2a9c0;
    --panel: #151b2c; --panel2: #1b2237; --field: rgba(8,12,26,.6);
    --line: rgba(150,166,214,.18); --line2: rgba(150,166,214,.32);
    --brass: #d9b25c; --blue: #8aa2f2; --danger: #e07a7a;
    --chip-bg: rgba(138,162,242,.12); --chip-line: rgba(138,162,242,.3);
    --brass-soft: rgba(217,178,92,.14); --brass-line: rgba(217,178,92,.35);
    --danger-soft: rgba(224,122,122,.12); --danger-line: rgba(224,122,122,.3); }
  .rcv .hero-back { position: absolute; inset: 0; background-size: cover; background-position: center 25%;
    filter: blur(26px) saturate(1.1); opacity: .18; transform: scale(1.15); }
  /* Rows in the import/export popup. These were inline styles on a bare button,
     which meant the label inherited the browser's default black on a dark panel
     and the description under it ended up brighter than its own heading. A
     button inherits neither colour nor font unless told to. */
  .rcv .filerow { display: block; width: 100%; text-align: left; padding: 11px 13px;
    border-radius: 11px; border: 1px solid var(--line); background: rgba(150,166,214,.03);
    color: var(--text); font-family: inherit; font-size: 13.5px; cursor: pointer;
    transition: border-color .12s ease, background .12s ease; }
  .rcv .filerow + .filerow { margin-top: 7px; }
  .rcv .filerow:hover { border-color: var(--brass-line); background: var(--brass-soft); }
  .rcv .filerow:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
  .rcv .filerow .fr-label { font-weight: 700; font-size: 13.5px; color: var(--text); }
  .rcv .filerow:hover .fr-label { color: var(--brass); }
  .rcv .filerow .fr-hint { font-size: 12.25px; color: var(--mut); margin-top: 3px; line-height: 1.5; }
  .rcv .filegroup + .filegroup { margin-top: 16px; }
  /* The writing used to take one flexible column and the gallery a fixed slice of
     up to 420px, so every pixel a wider screen offered went into making the lines
     longer: at full width the text ran to about 1,800px and the pictures stayed
     small. Backwards. The writing is capped at a readable measure and the gallery
     takes whatever is left, so a bigger screen means bigger pictures. Centred, so
     the pair does not sit against one edge when it cannot fill the width. */
  .rcv .cpage-grid { display: grid; grid-template-columns: minmax(0, 1100px) minmax(300px, 1fr); gap: 24px; align-items: start; justify-content: center; }
  .rcv .cpage-grid.nogal { grid-template-columns: minmax(0, 1100px) 200px; }
  .rcv .cpage-grid.nogal .cpage-aside { grid-template-columns: 1fr; }
  .rcv .cpage-aside { position: sticky; top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-content: start; }
  .rcv .cpage-aside .tile { aspect-ratio: 1; }
  .rcv .cpage-aside .tile.full { grid-column: 1 / -1; aspect-ratio: 4/4.6; }
  @media (max-width: 1120px) {
    .rcv .cpage-grid { grid-template-columns: 1fr; }
    .rcv .cpage-aside { position: static; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
    .rcv .cpage-aside .tile.full { grid-column: auto; aspect-ratio: 1; }
  }
  /* Once the gallery has real room, two columns is the wrong shape: the lead
     tile spans both of them, so the wider the screen the bigger that one picture
     grows, until it is most of what you can see. A lead picture is worth having
     when there is only room for one thing at a time. With room for six it just
     crowds out the other five. Above this width the gallery becomes an even grid
     and every picture is the same size. */
  @media (min-width: 1700px) {
    .rcv .cpage-aside { grid-template-columns: repeat(auto-fill, minmax(186px, 1fr)); }
    .rcv .cpage-aside .tile.full { grid-column: auto; aspect-ratio: 1; }
  }
  .rcv .modal-back { position: fixed; inset: 0; background: var(--overlay); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px; }
  .rcv .modal { width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; padding: 26px; }
  .rcv .lbl { display: block; font-size: 12px; color: var(--mut); margin: 0 0 6px 2px; font-weight: 600; }
  .rcv .row { display: flex; gap: 12px; }
  .rcv .row > * { flex: 1; }
  .rcv .divider { height: 1px; background: var(--line); margin: 18px 0; }
  .rcv .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 100;
    background: var(--panel2); border: 1px solid var(--line2); color: var(--text); padding: 10px 20px; border-radius: 10px;
    font-size: 13.5px; box-shadow: var(--shadow); animation: rcvpop .18s ease-out; }
  @keyframes rcvpop { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  .rcv .scrollbody::-webkit-scrollbar, .rcv .modal::-webkit-scrollbar { width: 10px; }
  .rcv .scrollbody::-webkit-scrollbar-thumb, .rcv .modal::-webkit-scrollbar-thumb { background: var(--scroll); border-radius: 8px; }
  /* the menu only scrolls on a short window, and a default scrollbar there is
     wider than the icons it sits beside */
  .rcv .sidebar::-webkit-scrollbar { width: 6px; height: 6px; }
  .rcv .sidebar::-webkit-scrollbar-thumb { background: var(--scroll); border-radius: 8px; }
  .rcv .sidebar::-webkit-scrollbar-track { background: transparent; }
  .rcv .ss-root { position: fixed; inset: 0; z-index: 95; background: #04060d; overflow: hidden; }
  .rcv .ss-root.ss-hide { cursor: none; }
  .rcv .ss-back { position: absolute; inset: -70px; background-size: cover; background-position: center;
    filter: blur(46px) brightness(.4) saturate(1.15); }
  .rcv .ss-slide { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .rcv .ss-slide img { max-width: 94vw; max-height: 90vh; object-fit: contain; border-radius: 6px;
    box-shadow: 0 30px 90px rgba(0,0,0,.65); }
  .rcv .ss-in { animation: ssfade .9s ease both; }
  .rcv .ss-out { animation: ssfadeout .95s ease both; }
  .rcv .kb0 img { animation: kb0 8s ease-out both; }
  .rcv .kb1 img { animation: kb1 8s ease-out both; }
  .rcv .kb2 img { animation: kb2 8s ease-out both; }
  .rcv .kb3 img { animation: kb3 8s ease-out both; }
  .rcv .ss-paused .ss-slide img, .rcv .ss-paused .ss-progress span { animation-play-state: paused !important; }
  .rcv .ss-ui { position: absolute; left: 0; right: 0; display: flex; align-items: center; gap: 10px;
    padding: 16px 20px; transition: opacity .35s; z-index: 3; }
  .rcv .ss-hide .ss-ui { opacity: 0; pointer-events: none; }
  .rcv .ss-btn { background: rgba(10,14,26,.55); border: 1px solid rgba(180,195,235,.25); color: #e7ebf7;
    border-radius: 99px; padding: 9px 12px; display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600;
    backdrop-filter: blur(6px); }
  .rcv .ss-btn:hover { border-color: rgba(217,178,92,.55); }
  .rcv .ss-btn.on { color: #d9b25c; border-color: rgba(217,178,92,.55); }
  .rcv .ss-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.09); z-index: 3; }
  .rcv .ss-progress span { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #d9b25c, #8aa2f2);
    animation: ssprog 8s linear both; }
  /* Full-screen picture viewer. The old lightbox sat in a 900px card at 72vh,
     which on a phone was a postage stamp with no swipe. */
  .rcv .lb-root { position: fixed; inset: 0; z-index: 92; background: #04060d; overflow: hidden; }
  .rcv .lb-back { position: absolute; inset: -70px; background-size: cover; background-position: center;
    filter: blur(46px) brightness(.35) saturate(1.1); pointer-events: none; }
  .rcv .lb-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    touch-action: none; }
  .rcv .lb-stage img { max-width: 100vw; max-height: 100vh; object-fit: contain; }
  .rcv .lb-chrome { position: absolute; left: 0; right: 0; z-index: 3; display: flex; align-items: center;
    gap: 10px; flex-wrap: wrap; padding: 14px 16px; pointer-events: none; }
  .rcv .lb-chrome > * { pointer-events: auto; }
  .rcv .lb-chrome.top { top: 0; background: linear-gradient(180deg, rgba(4,6,13,.72), transparent); }
  .rcv .lb-chrome.bot { bottom: 0; background: linear-gradient(0deg, rgba(4,6,13,.78), transparent); }
  @keyframes rcvspin { to { transform: rotate(360deg); } }
  /* the indeterminate transfer bar: a step that cannot know how far along it is */
  @keyframes rcv-sweep { from { transform: translateX(-120%); } to { transform: translateX(400%); } }
  .rcv .spin { display: inline-block; width: 13px; height: 13px; border-radius: 50%;
    border: 2px solid var(--brass-line); border-top-color: var(--brass);
    animation: rcvspin .7s linear infinite; vertical-align: -2px; }
  .rcv .crest-mark {
    position: relative; flex: 0 0 auto; overflow: hidden; border-radius: 11px;
    background: #070a12;
    box-shadow: 0 0 0 1px var(--brass-line), 0 0 18px var(--brass-soft);
  }
  .rcv .crest-mark.live { border-radius: 20px; box-shadow: 0 0 0 1px var(--brass-line), 0 0 28px var(--brass-soft); }
  .rcv .crest-mark img, .rcv .crest-mark video { display: block; width: 100%; height: 100%; object-fit: cover; }
  .rcv .lock-screen .crest-mark { overflow: hidden; }
  .rcv .crest-mark::before {
    content: ""; position: absolute; inset: -8px; pointer-events: none; border-radius: 16px; z-index: 1;
    box-shadow: 0 0 16px var(--brass);
    opacity: .28; animation: crest-breathe 5s ease-in-out infinite;
  }
  .rcv .crest-mark::after {
    content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 2;
    background: linear-gradient(115deg, transparent 32%, color-mix(in srgb, var(--brass) 45%, transparent) 50%, transparent 68%);
    transform: translateX(-130%);
    animation: crest-shine 5s ease-in-out infinite;
  }
  @keyframes crest-shine { 0%, 58% { transform: translateX(-130%); } 82%, 100% { transform: translateX(130%); } }
  @keyframes crest-breathe { 0%, 100% { opacity: .22; } 50% { opacity: .55; } }
  .rcv .dust-field { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
  .rcv .lock-screen { overflow: hidden; }
  .rcv .lock-glow {
    position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background: radial-gradient(ellipse 60% 48% at 50% 40%, var(--brass-soft), transparent 70%);
    animation: crest-breathe 6s ease-in-out infinite;
  }
  .rcv .lock-card { position: relative; z-index: 1; animation: lock-rise .75s ease both; }
  @keyframes lock-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .rcv .sidebar .crest-mark.live { border-radius: 11px; }
  .rcv > .sidebar, .rcv > .scrollbody { position: relative; z-index: 1; }
  .rcv .rcv-ambient {
    position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
  }
  .rcv .amb-glow {
    position: absolute; inset: -18%;
    background:
      radial-gradient(ellipse 65% 48% at 12% 18%, var(--brass-soft), transparent 58%),
      radial-gradient(ellipse 50% 42% at 88% 82%, color-mix(in srgb, var(--brass) 14%, transparent), transparent 62%);
    animation: amb-drift 32s ease-in-out infinite alternate;
    will-change: transform;
  }
  @keyframes amb-drift {
    from { transform: translate3d(-1.6%, -1%, 0) scale(1); }
    to { transform: translate3d(1.8%, 1.4%, 0) scale(1.05); }
  }
  .rcv .lock-screen .lock-card { width: min(380px, calc(100vw - 40px)); }
  .rcv .pin-dots { display: flex; justify-content: center; align-items: center; gap: 10px;
    min-height: 18px; margin: 2px 0 14px; }
  .rcv .pin-dot { width: 10px; height: 10px; border-radius: 99px; border: 1.5px solid var(--brass-line);
    background: transparent; }
  .rcv .pin-dot.on { background: var(--brass); border-color: var(--brass); }
  .rcv .pin-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
    width: min(280px, 100%); margin: 0 auto; }
  .rcv .pin-key { height: 54px; border-radius: 999px; font-size: 22px; font-weight: 600;
    font-family: inherit; color: var(--text); background: rgba(150,166,214,.08);
    border: 1px solid var(--line2); cursor: pointer; }
  .rcv .pin-key:active { background: var(--brass-soft); border-color: var(--brass-line); }
  .rcv .pin-key:disabled { opacity: .45; }
  .rcv .pin-key.ghost { font-size: 15px; color: var(--mut); }
  .rcv .navitem svg { flex: 0 0 auto; }
  @keyframes ssfade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ssfadeout { from { opacity: 1; } to { opacity: 0; } }
  @keyframes ssprog { from { width: 0; } to { width: 100%; } }
  @keyframes kb0 { from { transform: scale(1.04) translate(0.5%, 1%); } to { transform: scale(1.13) translate(-1.2%, -0.8%); } }
  @keyframes kb1 { from { transform: scale(1.13) translate(1.2%, -0.8%); } to { transform: scale(1.04) translate(-0.5%, 0.8%); } }
  @keyframes kb2 { from { transform: scale(1.05) translate(-1.4%, -0.5%); } to { transform: scale(1.14) translate(1%, 0.7%); } }
  @keyframes kb3 { from { transform: scale(1.15) translate(0, 0.8%); } to { transform: scale(1.05) translate(0, -0.6%); } }
  @media (prefers-reduced-motion: reduce) { .rcv * { transition: none !important; animation: none !important; } }
  @media (max-width: 1020px) and (min-width: 761px) {
    .rcv .sidebar { width: 72px !important; padding: 18px 10px !important; }
    .rcv .sidebar .navlabel { display: none; }
    .rcv .sidebar .brand > div:last-child { display: none; }
    .rcv .sidebar .brand { justify-content: center; padding-left: 0; padding-right: 0; }
    .rcv .navitem { justify-content: center; padding: 12px 0; }
  }
  @media (max-width: 760px) {
    .rcv { flex-direction: column; }
    .rcv .sidebar { width: 100% !important; flex-direction: row !important; overflow-x: auto; padding: 10px !important; border-right: none !important; border-bottom: 1px solid var(--line); }
    .rcv .sidebar .brand, .rcv .sidebar .navlabel { display: none; }
    .rcv .scrollbody { padding-left: 14px !important; padding-right: 14px !important; }
    .rcv .row { flex-direction: column; }
    .rcv .wall { grid-auto-rows: 118px; }
    .rcv .tile.big, .rcv .tile.wide { grid-column: span 1; grid-row: span 1; }
    .rcv .stile { height: 132px; }
  }
`;

/* ---------- tiny icons ---------- */
const Ic = ({
  d,
  size = 17
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.9",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: d
}));
const CREST_256 = "vendor/crest-256.png";
const CREST_1024 = "vendor/crest-1024.png";
const CREST_LOOP = "vendor/crest-loop.mp4";
function preloadBrandMedia() {
  if (typeof window === "undefined" || window.__rcvBrand) return;
  const a = new Image();
  a.src = CREST_256;
  const b = new Image();
  b.src = CREST_1024;
  if (b.decode) b.decode().catch(function () {});
  window.__rcvBrand = { a, b, v: null };
  const v = document.createElement("video");
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.preload = "auto";
  v.src = CREST_LOOP;
  try { v.load(); } catch (e) {}
  window.__rcvBrand.v = v;
}
if (typeof window !== "undefined") preloadBrandMedia();
function useViewSize() {
  const [v, setV] = useState(() => ({
    w: typeof window === "undefined" ? 1200 : window.innerWidth,
    h: typeof window === "undefined" ? 800 : window.innerHeight
  }));
  useEffect(() => {
    let t = 0;
    const on = () => {
      cancelAnimationFrame(t);
      t = requestAnimationFrame(() => setV({ w: innerWidth, h: innerHeight }));
    };
    addEventListener("resize", on);
    return () => { cancelAnimationFrame(t); removeEventListener("resize", on); };
  }, []);
  return v;
}
function crestFile(cssPx) {
  const need = cssPx * Math.min(3, typeof window === "undefined" ? 2 : window.devicePixelRatio || 1);
  return need > 280 ? CREST_1024 : CREST_256;
}
function CrestMark({
  size = 38,
  live = false
}) {
  const vid = useRef(null);
  const [failed, setFailed] = useState(false);
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const useLive = !!(live && size >= 96 && !reduce && !failed);
  const src = crestFile(size);
  useEffect(() => {
    const el = vid.current;
    if (!el || typeof el.play !== "function") return;
    const p = el.play();
    if (p && p.catch) p.catch(() => setFailed(true));
  }, [useLive]);
  return /*#__PURE__*/React.createElement("div", {
    className: "crest-mark" + (useLive ? " live" : ""),
    style: {
      width: size,
      height: size
    },
    "aria-hidden": "true"
  }, useLive ? /*#__PURE__*/React.createElement("video", {
    ref: vid,
    src: CREST_LOOP,
    poster: CREST_1024,
    autoPlay: true,
    muted: true,
    loop: true,
    playsInline: true,
    onError: () => setFailed(true)
  }) : /*#__PURE__*/React.createElement("img", {
    src: src,
    srcSet: CREST_256 + " 256w, " + CREST_1024 + " 1024w",
    sizes: size + "px",
    alt: "",
    width: size,
    height: size,
    decoding: "async"
  }));
}
function DustField({
  count = 55,
  paused = false
}) {
  const ref = useRef(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = c.getContext("2d", { alpha: true });
    const host = c.closest(".rcv") || document.documentElement;
    const brass = (getComputedStyle(host).getPropertyValue("--brass") || "#d9b25c").trim();
    let rgb = [217, 178, 92];
    const hex = brass.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      rgb = [n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    const motes = [];
    const size = () => {
      const r = (c.parentElement || c).getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      c.style.width = r.width + "px";
      c.style.height = r.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const w = () => c.clientWidth || 1;
    const h = () => c.clientHeight || 1;
    for (let i = 0; i < count; i++) {
      motes.push({
        x: Math.random() * w(),
        y: Math.random() * h(),
        r: Math.random() * 1.8 + 0.25,
        s: Math.random() * 0.28 + 0.04,
        a: Math.random() * 0.4 + 0.06,
        d: Math.random() * 0.5
      });
    }
    let on = true;
    let hidden = document.hidden;
    const vis = () => { hidden = document.hidden; };
    const tick = () => {
      if (!on) return;
      requestAnimationFrame(tick);
      if (hidden || pausedRef.current) return;
      ctx.clearRect(0, 0, w(), h());
      for (const m of motes) {
        m.y -= m.s;
        m.x += Math.sin(m.y * 0.012 + m.d) * 0.2;
        if (m.y < -4) {
          m.y = h() + 4;
          m.x = Math.random() * w();
        }
        ctx.beginPath();
        ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + m.a + ")";
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    tick();
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", vis);
    return () => {
      on = false;
      window.removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [count]);
  return /*#__PURE__*/React.createElement("canvas", {
    ref: ref,
    className: "dust-field",
    "aria-hidden": "true"
  });
}
function AmbientLayer({
  dust = 36,
  paused = false
}) {
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "rcv-ambient",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("div", {
    className: "amb-glow"
  }), /*#__PURE__*/React.createElement(DustField, {
    count: dust,
    paused: paused
  }));
}
/* What a field costs, and when it is sent. The class matters more than the
   number: permanent text is re-sent with every reply, temporary text is trimmed
   away as a chat grows, and some fields never reach the AI at all. Stats has
   always shown this, but only after the fact — it belongs where the writing is.
   "inherited" means a version has left the field blank and is using the
   Default's words, which cost exactly the same. */
const MEMORY_KIND = {
  permanent: { word: "permanent", why: "Sent with every message, so it is paid for again on every reply." },
  temporary: { word: "temporary", why: "Sent at the start of a chat and trimmed away as it gets long." },
  unsent: { word: "not sent", why: "Never reaches the AI, so it costs nothing." },
  override: { word: "override", why: "A CharSnap prompt override, counted against their separate allowance." },
  triggered: { word: "only when triggered", why: "A lorebook entry uses context only while one of its triggers is being matched, then drops out again." },
  pasted: { word: "wherever you use it", why: "A prompt is yours to copy out. What it costs depends on the field you paste it into." }
};
function tokenLabel(text, kind, inherited) {
  const info = MEMORY_KIND[kind] || MEMORY_KIND.permanent;
  const n = estTokens(text);
  return (n ? "~" + fmtNum(n) + " \u00b7 " : "") + info.word + (inherited && n ? " \u00b7 inherited" : "");
}
function FieldMeter({ label, text, kind, inherited, as }) {
  const info = MEMORY_KIND[kind] || MEMORY_KIND.permanent;
  const heavy = kind === "permanent" && estTokens(text) > 0;
  return /*#__PURE__*/React.createElement("div", {
    className: as || "eyebrow",
    style: {
      marginBottom: 10,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", {
    title: info.why + (inherited ? " This version has left it blank, so the Default's words are used." : ""),
    style: {
      letterSpacing: "normal",
      textTransform: "none",
      fontWeight: 600,
      fontSize: 11,
      whiteSpace: "nowrap",
      color: heavy ? "var(--brass)" : "var(--dim)"
    }
  }, tokenLabel(text, kind, inherited)));
}
/* The same figure for a record editor, which lays its fields out with a plain
   label and takes an optional hint underneath. */
const tokenHint = (key, kind, extra) => rec => {
  const own = tokenLabel(String(rec[key] || ""), kind);
  const more = extra ? extra(rec) : null;
  return more ? own + " \u00b7 " + more : own;
};

/* The in-app guide. Data rather than markup so the index, the section popup and
   the search all read from one place, and so a wording fix is a wording fix. */
const GUIDE = [
  {
    "id": "start",
    "title": "Getting started",
    "summary": "What the vault is, and how the app is laid out.",
    "body": [
      "Rolecraft Vault is a private library for the writing behind your roleplay: characters, the personas you play as, lorebooks, and reusable prompts. It keeps them together, lets you edit them properly, and hands them to CharSnap when you want to publish.",
      "Nothing leaves this device. The interface has no way of reaching the internet at all. It cannot sync, phone home, or send a crash report, because the code that would do it is not there. The one exception is the device transfer you start yourself, covered later in this guide.",
      [
        "The column on the left moves between the four libraries: Characters, Personas, Lorebooks and Prompts.",
        "Stats, the theme, locking the vault, this guide and Settings sit at the bottom of that column.",
        "The theme button changes the look of the app, and Settings has a reading text size of Small, Medium or Large if the writing feels too small.",
        "Escape closes whatever is open, and every window also has an X in its top corner.",
        "Nothing is saved until you press Save. Closing an editor with unsaved writing asks first."
      ],
      "Rolecraft Vault comes in two forms: the Windows app, and a web edition that runs in a browser. They are the same library and behave the same way, but two things belong to the Windows app alone: copying your vault to another device, and installing updates. In the web edition those panels are simply not there, and this guide says so where each one comes up."
    ]
  },
  {
    "id": "characters",
    "title": "Characters",
    "summary": "The fields, and which of them the AI actually reads.",
    "body": [
      "A character is one bot. New character opens the editor, and everything about that character lives on that one screen.",
      "The fields are not interchangeable. The AI treats them differently, and knowing which is which is the difference between a character that works and one that quietly eats your context:",
      [
        "Description and Personality are the substance. They are sent with every single message, so everything here is paid for again on every reply. CharSnap reads them as one thing, so the split is for your convenience.",
        "First message opens the chat, Scenario sets the scene, and Example messages show how the character speaks. These fade out of the conversation as it grows long.",
        "System prompt and Always-active system prompt are instructions rather than writing. The always-active one is very strong: good for a rule like never speaking for the user, bad for personality.",
        "Creator memo is never sent to the AI. It is the right place for notes to yourself, especially if you have hidden your guts.",
        "Tagline shows on the card and in listings, and is not sent to the AI either."
      ],
      "Custom sections are yours to name: appearance, rules of the world, anything. CharSnap has no such field of its own, so on the way out they are folded into the description, each one headed by its own title. Four particular titles are handled differently, and Publishing to CharSnap says which."
    ]
  },
  {
    "id": "versions",
    "title": "Versions of a character",
    "summary": "Variants: what they hold, what they share, and the limit of five.",
    "body": [
      "A character can carry several versions of itself. CharSnap calls them variants. Use them for the same character at a different age, in another setting, or written a different way. Switch between them with the tabs in the editor and the chips on the character page.",
      "A version only needs to hold what differs. Leave a field blank and it falls back to the Default's, and the box shows what it will inherit, in grey.",
      [
        "Each version has its own: age, gender, pronouns, tagline, and all the writing.",
        "Shared by every version: tags, searchable terms, custom sections, the bucket, and the lorebooks attached.",
        "Pictures belong to whichever version was open when you added them, and the gallery in the editor shows only that version's.",
        "Copy from Default fills a new version with the Default's writing, so you can edit rather than start over."
      ],
      "CharSnap accepts at most five versions of one character, and ignores any beyond the fifth. You can keep more here, and the export tells you how many will actually travel."
    ]
  },
  {
    "id": "pictures",
    "title": "Pictures",
    "summary": "Portraits, banners, galleries, albums, blurring and downloads.",
    "body": [
      "Characters have a portrait, an optional page banner, and a gallery. Personas have a portrait and a gallery. Lorebook entries and prompts can carry pictures too.",
      [
        "A picture added while a version is open belongs to that version and shows only there.",
        "Grid view is where you move a picture to another version, or mark it shared so every version shows it.",
        "Albums group pictures inside one character: a set of outfits, a set of expressions.",
        "Blur hides a picture behind a frosted panel until you click it. It is remembered per picture and travels in your backups.",
        "Download all images saves the originals, at full quality, as a zip: a folder per character, one for personas, and folders for bucket covers, lorebook covers and the pictures inside lore entries and prompts. Large libraries are written to disk as they go, so there is no practical size limit."
      ],
      "Removing a picture is immediate and cannot be undone. Unlike a character, a picture does not go to the bin. That is why every button that removes one asks twice.",
      "Pictures are never inside a CharSnap file. CharSnap cannot read images out of a file at all, so you upload your art there after importing. They are inside this app's own exports, which is why those files are large."
    ]
  },
  {
    "id": "personas",
    "title": "Personas",
    "summary": "Who you play as, and why length matters here most.",
    "body": [
      "A persona is you: who you are playing as, rather than who you are talking to. Pick one when you start a chat on CharSnap.",
      "Every word of a persona description is sent with every message, exactly like a character's description. A long persona costs the same as a long character, on top of it. This is the single easiest place to waste your context, so keep it to what actually matters in play.",
      "Personas have their own portraits, galleries, buckets and attached lorebooks, and can be exported and brought back the same way characters can."
    ]
  },
  {
    "id": "lorebooks",
    "title": "Lorebooks",
    "summary": "Facts that appear only when their triggers do.",
    "body": [
      "A lorebook is a set of facts the AI pulls in only when they come up. It is how you keep a large world out of the description, where it would be paid for on every single message.",
      "Each entry has triggers, the words that bring it up. When one appears in the recent conversation, that entry joins the next reply and then drops out again. There is no clever matching: if the trigger word is not used, the entry does not appear.",
      [
        "An entry with no triggers can never appear at all. The editor warns you.",
        "Keep an entry under 1,500 characters, which is CharSnap's limit. Around 500 is a comfortable size.",
        "Up to 25 entries can fire on a single message.",
        "A bot can have at most three lorebooks attached on CharSnap. The editor warns you past that.",
        "Entry types (Character, Location, Item, PlotEvent, Other) are for your own sorting and barely affect the AI."
      ],
      "Importing inside a book puts everything into that book, whatever the file claims. Importing from the Lorebooks screen instead files entries by the world named in the file."
    ]
  },
  {
    "id": "prompts",
    "title": "Prompts",
    "summary": "Reusable openers and instructions, kept in collections.",
    "body": [
      "The Prompt Vault holds reusable openers, scene-setters and instruction blocks, grouped into collections. They are yours to copy out and paste wherever you want them. They are not attached to a character and are not sent anywhere on their own.",
      "A collection behaves like a lorebook: rename it, give it a cover, look at its Stats, export it as JSON or as plain text, and import prompts straight into it."
    ]
  },
  {
    "id": "organise",
    "title": "Buckets, tags and searching",
    "summary": "Keeping a large library findable.",
    "body": [
      [
        "Buckets are folders. A character or persona sits in one bucket, and a bucket can have its own cover picture.",
        "Tags describe a character and are how you filter your own library. They may contain spaces.",
        "Searchable terms are extra words that help a character be found. CharSnap does not allow spaces in these, so a space becomes a hyphen when exporting. What you typed stays here unchanged.",
        "The search box on each library screen looks through names, tags, terms and the writing itself.",
        "Select, at the top of the Characters and Personas screens, turns on tick boxes. With several picked you can move them all into one bucket at once, or delete them together. A group deletion goes to the bin exactly as a single one does.",
        "The dashboard can be reordered, and Spotlight picks a character at random each time you open it."
      ]
    ]
  },
  {
    "id": "tokens",
    "title": "Tokens, and why they matter",
    "summary": "Permanent versus temporary, and the numbers to aim for.",
    "body": [
      "Everything you write costs tokens, and the AI has limited room. Stats on any character breaks this down.",
      [
        "Permanent: description, personality, system prompts, and your persona. Sent with every message, so this is the figure worth keeping down.",
        "Temporary: first message, scenario, example messages. Sent at the start and trimmed as the chat grows.",
        "Never sent: creator memo, tagline, tags and searchable terms. These cost you nothing."
      ],
      "CharSnap suggests keeping the permanent fields under 2,000 tokens, and warns that quality drops noticeably approaching 3,000. Stats tells you where you stand against that.",
      "A token is roughly four characters of English. Cyrillic, Chinese, Japanese and Korean are usually counted about one token per character, so for those the estimate here reads low.",
      "If a character is too heavy, a lorebook is usually the answer: move the parts that only matter sometimes into entries with triggers.",
      "Every field shows its own count while you write, just above the box, and each custom section shows one underneath it. A section counts as permanent, because it is folded into the description when the character reaches CharSnap. The four titles CharSnap reserves are the exception: “System override”, “NSFW system override” and “Prefill instructions” become prompt overrides, which have their own separate allowance, and “Additional first messages” is temporary. Renaming a section to one of those changes where its writing goes, and the counter changes with it.",
      "A persona’s sections say “not sent”. A persona reaches the AI as its description alone, so nothing else you put on one costs anything."
    ]
  },
  {
    "id": "files",
    "title": "Importing and exporting",
    "summary": "One button per screen, and which files carry your pictures.",
    "body": [
      "Every screen has a single Import / Export button. The popup says what each choice does and whether your pictures go with it.",
      [
        "Export JSON is this app's own format and includes pictures. This is the one to keep as a backup.",
        "Export text only leaves the pictures out, which makes it small enough to read or paste elsewhere. For characters, any linked lore travels with it.",
        "Exporting all lorebooks at once leaves the pictures behind. Export a single book to keep them.",
        "Import accepts this app's own files, CharSnap files, and Tavern v1 and v2 character cards. A file holding several characters at once, sometimes called a bot pack, is read as all of them.",
        "If something you are importing is already in the vault, you are asked what to do with it before anything is written: bring it in as a copy, overwrite what is here, or skip it.",
        "Download a sample file gives you a blank file listing every field an import will accept."
      ],
      "Update from JSON, inside the character editor, is a different thing from importing: it changes the character you already have rather than creating a new one. It asks whether the file should land on the Default, on the version you have open, or as a new version.",
      "Backups live in Settings. Export backup writes everything (every record and every picture) as one file, and Import backup brings it back."
    ]
  },
  {
    "id": "charsnap",
    "title": "Publishing to CharSnap",
    "summary": "Two import buttons, two different files, and what never travels.",
    "body": [
      "CharSnap has two separate import buttons that take two different files. This catches people out, so the app names which is which.",
      [
        "Export for CharSnap makes a whole character. On CharSnap use Import JSON, on the Basics tab.",
        "Export as a CharSnap variant file makes one version on its own. On CharSnap use Import Variant, on the Details tab. It drops into the variant slot you have open there.",
        "Export every version for CharSnap puts up to five versions into a single file."
      ],
      "That middle one is how you build a character up in pieces: send the Default across to create the character, then add each further version to it later, instead of replacing the whole thing every time.",
      [
        "No CharSnap file contains pictures. Upload those on CharSnap after importing.",
        "A file is only marked adult if you have ticked NSFW on the character here. NSFW picture is the separate setting that blurs your art there.",
        "CharSnap requires a personality, a description, a first message and an age. If any are blank the export says so before you send it, rather than leaving CharSnap to refuse it.",
        "Gender is sent as male, female or others, which is all CharSnap accepts.",
        "Your own sections travel inside the description, each under its own heading, such as “Appearance: tall, blue-grey”, and the backstory is labelled the same way. CharSnap has no sections of its own, so this is how yours survive the trip. Each section is single-spaced inside itself, with a blank line between one section and the next.",
        "Four titles are the exception and do not go into the description at all. “System override”, “NSFW system override” and “Prefill instructions” become CharSnap’s prompt overrides, and “Additional first messages” becomes its alternate greetings. Anything else you have written goes into the description, whatever you called it.",
        "Only the first section claiming one of those four titles gets it. A second section with the same title is folded into the description like any other, and its counter says so.",
        "Every CharSnap export is offered twice: once plainly, and once with the guts hidden. The hidden one wraps the backstory and personality in CharSnap’s |~ ~| marks, so readers there see only the name, tagline and pictures. The AI still reads every word, and so do you. It is chosen when you export rather than set on the character, because on CharSnap’s side the setting is nothing more than those marks in the text.",
        "The two files are named differently, so a hidden export does not quietly replace a plain one in your Downloads folder."
      ]
    ]
  },
  {
    "id": "history",
    "title": "Version history and the bin",
    "summary": "Undoing a change, and what deleting really does.",
    "body": [
      "Every character keeps up to twenty snapshots of its writing. Open History in the editor to look through them and restore one.",
      "A snapshot holds words only. Restoring an old draft never changes, removes or brings back a picture. Your artwork is left exactly as it is, on purpose.",
      "Deleting a character, persona, lorebook or prompt moves it to Recently deleted in Settings, where it waits for thirty days. Its pictures are kept for as long as it is in there, so restoring brings it back whole. Emptying the bin is what actually removes them.",
      "Pictures are the exception: removing one is immediate and permanent, which is why those buttons ask twice."
    ]
  },
  {
    "id": "transfer",
    "title": "Moving to another device",
    "summary": "Copying your vault across your own network.",
    "body": [
      "Settings has a device transfer that copies your vault to another computer over your own network. Nothing goes to the internet. The two machines talk directly, and only while you have that panel open.",
      "Sharing starts on the Windows app. A phone or tablet with the Android app can receive by scanning the QR. The web edition has no device transfer, because a page in a browser cannot open a connection for another machine to reach. To move a vault out of the web edition, use Export backup in Settings and import that file wherever you want it.",
      [
        "Start on the device you are copying from. It shows a one-time code.",
        "On the other device, scan the QR that appears with the code, or type the code. What is sent is encrypted with a key made from it.",
        "Before anything is written you get a summary: which device is sending, which is receiving, and how many records will be added, overwritten or removed. Nothing happens until you confirm."
      ],
      "Both devices show the same panel, and that is the thing worth knowing. Each one has a Share this vault button at the top and a Receive onto box underneath it, so each one also has its own mirror tick box. The tick box you are looking at belongs to the machine you are looking at, and decides what happens to that machine and nothing else. The other device's tick box has no bearing on it.",
      "Mirroring is not something you start on its own, which is why there seems to be no button for it. It is a setting on a copy you are about to receive, so it does nothing until you type the other device's code into the box above it and press the button underneath, on that same machine.",
      [
        "On the device that has the writing, press Share this vault. It shows a one-time code and a QR and then waits. Nothing leaves it unless the other device asks, and nothing on it is changed by any of this.",
        "On the device you want changed, tick the box if you want mirroring, scan the QR or type the code, and press the button. Leave the box alone and the transfer only adds and updates, removing nothing.",
        "Press once to see what would happen and again to do it. So a machine cannot lose your work unless you are standing at that machine, scanning or typing the other one's code into it."
      ],
      "A mirror then asks the other device as well, because it is the only thing that can delete anything. A box appears over there naming both machines and saying how many records would be copied, overwritten and deleted, and whoever is sitting at it can allow it, refuse it, or turn it around. Nothing is written anywhere until that is answered, and a question nobody answers counts as a refusal.",
      "Turning it around is there for the case you are worried about: you set it up the wrong way and notice on the other screen. Choosing it makes the machine that was sharing the one that gets overwritten instead, and it then shows its own summary and its own red confirm button before anything happens. You do not have to start again.",
      "Both devices need this version for that. If the other one is older it cannot be asked, so mirroring stops and says so rather than going ahead without it. Merging is unaffected and works with any version, because it only ever adds and updates.",
      "The first press only compares the two vaults. It writes nothing and reports how many records would be added, overwritten and removed, naming both devices. If anything at all would be removed the confirm button turns red and says which device it is about to mirror onto. Press it again to go ahead, or close the panel and nothing has changed.",
      "A transfer is for making two machines hold the same library. There is no way to share only part of a vault: the device that shares offers all of it, and the other one takes whatever it is missing. To move a single character, persona, lorebook or prompt instead, export that one record to a file and import it on the other machine. That adds the one thing and touches nothing else."
    ]
  },
  {
    "id": "security",
    "title": "Passwords and safety",
    "summary": "Encryption, the PIN, and the one thing that cannot be recovered.",
    "body": [
      "A master password encrypts every value in the vault. Without it the vault cannot be opened. There is no recovery and no reset, because there is nobody holding a copy to ask.",
      [
        "Set it in Settings. The PIN is only a convenience for unlocking quickly on a machine you already trust; it is not a second password.",
        "On Windows the encryption is also tied to your account, so the files are not readable by simply copying them to another machine.",
        "The web edition keeps its vault in the browser's own storage on that computer, encrypted the same way with your master password, but without that extra tie to a Windows account. Clearing your browser's site data removes it, so keep a backup.",
        "For anyone who wants the specifics: values are encrypted with AES-256-GCM, and the key is stretched from your password with PBKDF2 at 210,000 iterations before Windows wraps it again.",
        "Exports are deliberately not encrypted, so other tools can read them. Anyone who gets hold of an export can read it, so keep them somewhere you trust and delete copies you no longer need."
      ],
      "If you forget the master password, an export you made earlier is the only way back. That is the reason to make one.",
      "The interface has no way of reaching the network at all, so nothing here can be sent anywhere by accident. The device transfer is the one exception, it runs only while that panel is open, and what it sends is encrypted with a key made from the one-time code."
    ]
  },
  {
    "id": "updates",
    "title": "Updates",
    "summary": "How new versions arrive, and which file you need.",
    "body": [
      "Updates arrive as a signed file that you pick yourself in Settings. The app installs nothing on its own and never checks for anything.",
      "This is in the Windows app only. The web edition is served rather than installed, so it is already whatever version is being hosted and there is nothing for you to apply.",
      [
        "A .rcvup file updates the interface, which covers almost every release.",
        "A setup .exe is needed when a release changes the part of the app a patch cannot reach. The release notes always say which you need, and from 1.150 the app checks too: hand it a .rcvup that needs the installer and it will tell you, rather than installing something that cannot work.",
        "Only the newest file matters, because each one contains everything before it."
      ],
      "Version history in Settings lists what changed in each release. If an update ever misbehaves the app falls back to the version it shipped with, and Ctrl+Shift+F12 forces that at any time."
    ]
  }
];
const icons = {
  // a question mark in a circle, for the guide
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4 M12 17.2v.01",
  chart: "M3 3v18h18M8 17V9m5 8V5m5 12v-6",
  dash: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  char: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  persona: "M12 2l3 6 6 1-4.5 4.4 1 6.6-5.5-3-5.5 3 1-6.6L3 9l6-1z",
  lore: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5z",
  prompt: "M12 17v5 M9 22h6 M17 2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  plus: "M12 5v14 M5 12h14",
  x: "M18 6L6 18 M6 6l12 12",
  trash: "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
  img: "M3 5h18v14H3z M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",
  down: "M12 3v12 M6 11l6 6 6-6 M4 21h16",
  up: "M12 15V3 M6 7l6-6 6 6 M4 21h16",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  play: "M7 4l13 8-13 8z",
  cup: "M6 15l6-6 6 6",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  grip: "M8 6h.01 M8 12h.01 M8 18h.01 M16 6h.01 M16 12h.01 M16 18h.01",
  check: "M20 6L9 17l-5-5",
  expand: "M8 3H5a2 2 0 0 0-2 2v3 M16 3h3a2 2 0 0 1 2 2v3 M8 21H5a2 2 0 0 1-2-2v-3 M16 21h3a2 2 0 0 0 2-2v-3",
  eyeoff: "M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94 M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M14.12 14.12a3 3 0 1 1-4.24-4.24 M1 1l22 22",
  cdown: "M6 9l6 6 6-6",
  pause: "M7 4h3.5v16H7z M13.5 4H17v16h-3.5z"
};

/* ---------- lock screen ---------- */
function PinPad({
  value,
  onChange,
  onSubmit,
  disabled
}) {
  const press = k => {
    if (disabled) return;
    if (k === "back") onChange((value || "").slice(0, -1));
    else if (k === "go") onSubmit();
    else if ((value || "").length < 32) onChange((value || "") + k);
  };
  useEffect(() => {
    const h = e => {
      if (disabled) return;
      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onChange((value || "").slice(0, -1));
      } else if (/^\d$/.test(e.key)) {
        e.preventDefault();
        if ((value || "").length < 32) onChange((value || "") + e.key);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [value, onChange, onSubmit, disabled]);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "go"];
  return /*#__PURE__*/React.createElement("div", {
    className: "pin-pad",
    role: "group",
    "aria-label": "PIN number pad"
  }, keys.map(k => /*#__PURE__*/React.createElement("button", {
    key: k,
    type: "button",
    className: "pin-key" + (k === "back" || k === "go" ? " ghost" : ""),
    disabled: disabled,
    "aria-label": k === "back" ? "Delete" : k === "go" ? "Unlock" : "Digit " + k,
    onClick: () => press(k)
  }, k === "back" ? /*#__PURE__*/React.createElement(Ic, {
    d: icons.left,
    size: 18
  }) : k === "go" ? /*#__PURE__*/React.createElement(Ic, {
    d: icons.check,
    size: 18
  }) : k)));
}
function LockScreen({
  authState,
  onUnlocked
}) {
  const view = useViewSize();
  const pinMode = authState.pinSet;
  const [mode, setMode] = useState(pinMode ? "pin" : "password");
  const pin = mode === "pin";
  const crest = Math.round(pin ? Math.min(148, Math.max(96, Math.min(view.w * 0.2, view.h * 0.16))) : Math.min(280, Math.max(176, Math.min(view.w * 0.26, view.h * 0.28))));
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const setDigits = useCallback(v => {
    setVal(String(v || "").replace(/\D/g, "").slice(0, 32));
    setErr("");
  }, []);
  const submit = useCallback(async () => {
    if (!val || busy) return;
    if (mode === "pin" && val.length < 4) {
      setErr("PIN needs at least 4 digits");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = mode === "pin" ? await window.auth.unlockPin(val) : await window.auth.unlockPassword(val);
      if (r.ok) {
        onUnlocked();
        return;
      }
      setErr(r.error || "Try again");
      setVal("");
    } catch {
      setErr("Something went wrong — try again");
    }
    setBusy(false);
  }, [val, busy, mode, onUnlocked]);
  return /*#__PURE__*/React.createElement("div", {
    className: "lock-screen",
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--lockbg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 90
    }
  }, /*#__PURE__*/React.createElement(DustField, {
    count: 70
  }), /*#__PURE__*/React.createElement("div", {
    className: "lock-glow",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("div", {
    className: "lock-card",
    style: {
      textAlign: "center",
      width: 330
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "0 auto " + (pin ? 14 : 22) + "px",
      width: crest,
      height: crest,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(CrestMark, {
    size: crest,
    live: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Rolecraft Vault"), /*#__PURE__*/React.createElement("h1", {
    className: "serif",
    style: {
      fontSize: pin ? 24 : 30,
      margin: "6px 0 6px"
    }
  }, "Vault locked"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      marginBottom: pin ? 10 : 18
    }
  }, pin ? "Enter your PIN." : "Your library is encrypted with your master password."), pin ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "pin-dots",
    "aria-live": "polite",
    "aria-label": val.length ? val.length + " digits entered" : "No digits yet"
  }, (val.length ? val : "    ").split("").map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "pin-dot" + (val.length ? " on" : "")
  }))), /*#__PURE__*/React.createElement(PinPad, {
    value: val,
    onChange: setDigits,
    onSubmit: submit,
    disabled: busy
  })) : /*#__PURE__*/React.createElement("input", {
    type: "password",
    autoFocus: true,
    value: val,
    placeholder: "Enter your master password",
    onChange: e => {
      setVal(e.target.value);
      setErr("");
    },
    onKeyDown: e => e.key === "Enter" && submit(),
    style: {
      textAlign: "center",
      letterSpacing: "0.05em",
      fontSize: 17
    }
  }), err && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--danger)",
      fontSize: 13,
      marginTop: 10
    }
  }, err), !pin && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    style: {
      width: "100%",
      marginTop: 14
    },
    disabled: busy,
    onClick: submit
  }, busy ? "Unlocking\u2026" : "Unlock"), authState.pinSet && /*#__PURE__*/React.createElement("button", {
    className: "btn",
    style: {
      background: "none",
      color: "var(--mut)",
      marginTop: 12,
      fontSize: 12.5
    },
    onClick: () => {
      setMode(m => m === "pin" ? "password" : "pin");
      setVal("");
      setErr("");
    }
  }, pin ? "Use master password instead" : "Use PIN instead")));
}

/* ---------- lightbox ---------- */
function useSwipeNav(onNav) {
  const start = useRef(null);
  return {
    onPointerDown: e => {
      if (e.button) return;
      if (e.target && e.target.closest && e.target.closest("button, input, textarea, a, [role='button']")) return;
      start.current = {
        x: e.clientX,
        y: e.clientY
      };
    },
    onPointerUp: e => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      onNav(dx > 0 ? -1 : 1);
    },
    onPointerCancel: () => {
      start.current = null;
    }
  };
}
function Lightbox({
  items,
  index,
  imgCache,
  fullCache,
  requestFull,
  blurred,
  onToggleBlur,
  onClose,
  onNav,
  onSetProfile,
  onCaption,
  onRemove,
  autoPlay
}) {
  const [playing, setPlaying] = useState(!!autoPlay);
  useEffect(() => {
    if (!requestFull || !items.length) return;
    const n = items.length;
    requestFull(items[index].imgId, true);
    if (n > 1) requestFull(items[(index + 1) % n].imgId, true);
    if (n > 2) requestFull(items[(index + 2) % n].imgId);
    if (n > 1) requestFull(items[(index - 1 + n) % n].imgId);
  }, [index, items, requestFull]);
  useEffect(() => {
    if (!playing || items.length < 2) return;
    const t = setInterval(() => onNav(1), 3200);
    return () => clearInterval(t);
  }, [playing, items.length, onNav]);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNav(-1);
      if (e.key === "ArrowRight") onNav(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, onNav]);
  const swipe = useSwipeNav(d => {
    if (items.length > 1) onNav(d);
  });
  const hold = e => e.stopPropagation();
  const item = items[index];
  if (!item) return null;
  const src = fullCache && fullCache[item.imgId] || imgCache[item.imgId];
  return /*#__PURE__*/React.createElement("div", {
    className: "lb-root",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": item.caption || "Picture"
  }, src ? /*#__PURE__*/React.createElement("div", {
    className: "lb-back",
    style: {
      backgroundImage: "url(" + src + ")"
    }
  }) : null, /*#__PURE__*/React.createElement("div", {
    className: "lb-stage",
    onPointerDown: swipe.onPointerDown,
    onPointerUp: swipe.onPointerUp,
    onPointerCancel: swipe.onPointerCancel
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: item.caption || "gallery image",
    draggable: false,
    decoding: "async",
    className: blurred && blurred[item.imgId] ? "blur-img" : undefined
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--dim)",
      padding: 60
    }
  }, "Loading image\u2026"), items.length > 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    "aria-label": "Previous image",
    onPointerDown: hold,
    onClick: () => onNav(-1),
    style: {
      position: "absolute",
      left: 12,
      top: "50%",
      transform: "translateY(-50%)"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.left
  })), /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    "aria-label": "Next image",
    onPointerDown: hold,
    onClick: () => onNav(1),
    style: {
      position: "absolute",
      right: 12,
      top: "50%",
      transform: "translateY(-50%)"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.right
  })))), /*#__PURE__*/React.createElement("div", {
    className: "lb-chrome top"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "rgba(231,235,247,.8)",
      textShadow: "0 1px 8px rgba(0,0,0,.8)"
    }
  }, index + 1, " of ", items.length), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      display: "flex",
      gap: 8
    }
  }, items.length > 1 && /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    "aria-label": playing ? "Pause slideshow" : "Play slideshow",
    onClick: () => setPlaying(p => !p)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: playing ? icons.pause : icons.play
  })), /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    "aria-label": "Close",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.x
  })))), /*#__PURE__*/React.createElement("div", {
    className: "lb-chrome bot"
  }, onCaption ? /*#__PURE__*/React.createElement("input", {
    value: item.caption || "",
    placeholder: "Add a caption for this image\u2026",
    onChange: e => onCaption(index, e.target.value),
    style: {
      flex: 1,
      minWidth: 160,
      background: "rgba(6,9,20,.55)",
      color: "#e7ebf7",
      border: "1px solid rgba(180,195,235,.25)"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 120,
      fontSize: 13.5,
      color: "rgba(231,235,247,.85)",
      textShadow: "0 1px 8px rgba(0,0,0,.8)"
    }
  }, item.caption || ""), onToggleBlur && /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    onClick: () => onToggleBlur(item.imgId)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: blurred && blurred[item.imgId] ? icons.eyeoff : icons.eye,
    size: 14
  }), blurred && blurred[item.imgId] ? "Unblur" : "Blur")), onSetProfile && /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    onClick: () => onSetProfile(item.imgId, item.variantId)
  }, "Set as profile"), onRemove && /*#__PURE__*/React.createElement(DangerButton, {
    className: "btn btn-danger",
    label: "Remove",
    armedLabel: "Click again \u2014 this picture is gone",
    onConfirm: () => onRemove(index)
  })));
}

/* One button instead of five. Import and export had spread across every screen
   — the lorebook page alone carried Import entry, Sample, Export JSON, Export
   text only and Export for CharSnap in one row — crowding out the things you
   actually came to do. They live behind a single button now, in a popup with
   room to say what each one is for, which the bare labels never did.
   Groups and items may contain falsy entries so a caller can drop one with a
   condition inline; empty groups are removed, and a menu with nothing in it
   renders nothing at all. */
function FilesMenu({ label, title, note, groups }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = ev => {
      if (ev.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);
  const live = (groups || []).filter(Boolean).map(g => Object.assign({}, g, {
    items: (g.items || []).filter(Boolean)
  })).filter(g => g.items.length);
  if (!live.length) return null;
  /* The popup is rendered at the theme root rather than where the button sits.
     ".rcv .hero" re-declares the whole dark palette — deliberately, so text over
     a banner picture stays readable — and three of these buttons live in a hero.
     A modal that happened to be their DOM descendant inherited that override and
     came out dark navy in the light theme, in an otherwise white app. Floating
     above everything, it should take the app's theme, not its trigger's. */
  const portalTo = typeof document !== "undefined" && document.querySelector(".rcv");
  const shell = /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setOpen(true),
    title: title || "Import and export"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.down,
    size: 13
  }), " " + (label || "Import / Export")));
  const sheet = open && /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 74
    },
    onMouseDown: ev => {
      if (ev.target === ev.currentTarget) setOpen(false);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      position: "relative",
      maxWidth: 520,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": title || "Import and export"
  }, /*#__PURE__*/React.createElement(CloseX, {
    onClose: () => setOpen(false),
    label: "Close"
  }), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Files"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      margin: "2px 0 12px",
      paddingRight: 44
    }
  }, title || "Import and export"), live.map((g, gi) => /*#__PURE__*/React.createElement("div", {
    key: gi,
    className: "filegroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginBottom: 8
    }
  }, g.heading), g.items.map((it, ii) => /*#__PURE__*/React.createElement("button", {
    key: ii,
    className: "filerow",
    onClick: () => {
      setOpen(false);
      it.onClick();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fr-label"
  }, it.label), it.hint && /*#__PURE__*/React.createElement("div", {
    className: "fr-hint"
  }, it.hint))))), note && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--dim)",
      marginTop: 14,
      lineHeight: 1.5
    }
  }, note)));
  return /*#__PURE__*/React.createElement(React.Fragment, null, shell, sheet ? portalTo ? ReactDOM.createPortal(sheet, portalTo) : sheet : null);
}

/* Closing a record meant finding a button called "Close" at the end of a row of
   export buttons — the one thing you always want, dressed identically to the
   things you rarely want. It is an X in the top corner now, the same place and
   shape on every record. Escape still closes, as it always has.
   "fixed" on the full-page records so it stays put while the page scrolls under
   it; "absolute" inside the entry popup so it sits on the card, not the screen. */
function CloseX({ onClose, label, fixed }) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": label || "Close",
    title: label || "Close",
    className: "closex",
    style: {
      position: fixed ? "fixed" : "absolute",
      top: fixed ? 16 : 14,
      right: fixed ? 20 : 14,
      zIndex: 6,
      width: 34,
      height: 34,
      padding: 0,
      borderRadius: 999,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(8,12,26,.62)",
      border: "1px solid var(--line2)",
      color: "var(--text)",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.x,
    size: 16
  }));
}

/* The guide. Two levels on purpose: the first window is a contents page you can
   scan, and a section opens on top of it rather than replacing it, so closing a
   section puts you back where you were rather than at the beginning. The search
   looks through the writing itself, not just the headings, because the thing you
   half-remember is usually a phrase from the body. */
function GuideModal({ onClose }) {
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState("");
  const section = openId ? GUIDE.find(g => g.id === openId) : null;
  useEffect(() => {
    const h = ev => {
      if (ev.key !== "Escape") return;
      // a section closes back to the contents; the contents closes the guide
      if (openId) setOpenId(null);else onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, openId]);
  const needle = q.trim().toLowerCase();
  const textOf = g => [g.title, g.summary].concat(g.body.map(b => Array.isArray(b) ? b.join(" ") : b)).join(" ").toLowerCase();
  const shown = needle ? GUIDE.filter(g => textOf(g).includes(needle)) : GUIDE;
  const para = (b, i) => Array.isArray(b) ? /*#__PURE__*/React.createElement("ul", {
    key: i,
    style: {
      margin: "0 0 12px",
      paddingLeft: 20,
      color: "var(--mut)",
      fontSize: 13.5,
      lineHeight: 1.65
    }
  }, b.map((li, j) => /*#__PURE__*/React.createElement("li", {
    key: j,
    style: {
      marginBottom: 5
    }
  }, li))) : /*#__PURE__*/React.createElement("p", {
    key: i,
    style: {
      margin: "0 0 12px",
      color: "var(--mut)",
      fontSize: 13.5,
      lineHeight: 1.7
    }
  }, b);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 76
    },
    onMouseDown: ev => {
      if (ev.target === ev.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      position: "relative",
      maxWidth: 620,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": "Guide"
  }, /*#__PURE__*/React.createElement(CloseX, {
    onClose: onClose,
    label: "Close guide"
  }), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Guide"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      margin: "2px 0 6px",
      paddingRight: 44
    }
  }, "How to use Rolecraft Vault"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.6,
      marginBottom: 12
    }
  }, "Pick a section to read it. Everything here describes this app as it is now."), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Search the guide\u2026",
    "aria-label": "Search the guide",
    style: {
      width: "100%",
      marginBottom: 14
    }
  }), shown.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--dim)",
      padding: "18px 0"
    }
  }, "Nothing in the guide matches \u201c" + q.trim() + "\u201d.") : shown.map(g => /*#__PURE__*/React.createElement("button", {
    key: g.id,
    className: "filerow",
    onClick: () => setOpenId(g.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: "fr-label"
  }, g.title), /*#__PURE__*/React.createElement("div", {
    className: "fr-hint"
  }, g.summary))))), section && /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 78
    },
    onMouseDown: ev => {
      if (ev.target === ev.currentTarget) setOpenId(null);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      position: "relative",
      maxWidth: 620,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": section.title
  }, /*#__PURE__*/React.createElement(CloseX, {
    onClose: () => setOpenId(null),
    label: "Back to the guide"
  }), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Guide"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      margin: "2px 0 12px",
      paddingRight: 44
    }
  }, section.title), section.body.map(para), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setOpenId(null)
  }, "\u2190 All sections"), (() => {
    const i = GUIDE.findIndex(g => g.id === section.id);
    const next = GUIDE[i + 1];
    return next ? /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => setOpenId(next.id)
    }, next.title + " \u2192") : null;
  })()))));
}

/* A delete that asks twice. Characters, personas, lore and prompts go to the
   bin and can be brought back, so a stray click there costs nothing — but an
   image is gone the moment dropImage runs, and every button that did that
   destroyed an original on one click. The arming clears itself after a few
   seconds so a live trigger is never left sitting under the cursor, and the
   label says what the second click will do rather than just "sure?". */
function DangerButton({ label, armedLabel, onConfirm, className, style, icon, armedIcon, iconSize, title, stop, el, role, tabIndex }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const say = armed ? armedLabel || "Click again to remove" : label;
  const go = ev => {
    if (stop) ev.stopPropagation();
    if (armed) {
      setArmed(false);
      onConfirm(ev);
    } else setArmed(true);
  };
  // some of these live as a styled span with role=button, so the tag is a prop
  return /*#__PURE__*/React.createElement(el || "button", {
    className: className,
    role: role,
    tabIndex: tabIndex,
    style: armed ? Object.assign({}, style, { color: "var(--danger, #e5484d)", fontWeight: 700 }) : style,
    title: title ? armed ? say : title : say,
    "aria-label": say,
    onClick: go,
    onKeyDown: ev => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        go(ev);
      }
    }
  }, icon ? /*#__PURE__*/React.createElement(Ic, { d: armed ? armedIcon || icon : icon, size: iconSize || 13 }) : say);
}

/* ---------- tag input ---------- */
function TagInput({
  tags,
  onChange,
  placeholder,
  suggestions,
  preserveCase // searchable terms are names and phrases, so their capitalisation is kept
}) {
  const [draft, setDraft] = useState("");
  const listId = useRef("tags-" + Math.random().toString(36).slice(2, 8)).current;
  const add = () => {
    const raw = draft.trim();
    if (!raw) return setDraft("");
    /* Vault tags stay lowercase as they always have, but CharSnap's casing is
       part of the tag ("ADHD", "WLW", "Age Gap") and it is what gets exported, so
       one of theirs is stored exactly as they spell it. Matching is
       case-insensitive both ways, so "adhd" cannot end up alongside "ADHD". */
    const t = preserveCase ? raw : (charSnapTag(raw) || raw.toLowerCase());
    if (!tags.some(x => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
    setDraft("");
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: draft,
    placeholder: placeholder || "Add a tag and press Enter",
    list: suggestions && suggestions.length ? listId : undefined,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.preventDefault();
        add();
      }
    },
    /* Typing a tag and then going straight to Save threw it away: it only
       counted once Enter or Add had been pressed, and nothing said so. Leaving
       the box now commits what is in it. Pressing Add blurs first, which is
       harmless — the draft is cleared and the second add finds nothing. */
    onBlur: add
  }), suggestions && suggestions.length > 0 && /*#__PURE__*/React.createElement("datalist", {
    id: listId
  }, suggestions.filter(s => !tags.some(x => x.toLowerCase() === s.toLowerCase())).map(s => /*#__PURE__*/React.createElement("option", {
    key: s,
    value: s
  }))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: add,
    style: {
      flexShrink: 0
    }
  }, "Add")), tags.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 8
    }
  }, tags.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    className: "chip"
  }, t, /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(tags.filter(x => x !== t)),
    "aria-label": "Remove tag " + t,
    title: "Remove " + t,
    /* The cross stays 11px, but an 11px target sitting between two others is a
       fiddly thing to hit. Padding out to the 24px minimum and pulling the same
       amount back in margin grows what you can click without moving anything. */
    style: {
      background: "none",
      color: "inherit",
      padding: 6,
      margin: -6,
      marginLeft: -2,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 24,
      minHeight: 24,
      boxSizing: "border-box"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.x,
    size: 11
  }))))));
}

/* ---------- stats helpers ---------- */
const VARIANT_TEXT_KEYS = ["tagline", "story", "personality", "scenario", "firstMessage", "exampleMessage", "creatorMemo", "systemPrompt", "alwaysActiveSystemPrompt"];
/* Every picture a character owns. This existed in seven places, written out by
   hand each time, and only one of them remembered that a version carries its own
   portrait — so a variant's picture was missing from the backup, from both
   exports, from the pictures zip, from the blur list and from the stats count,
   and was left orphaned in storage when an import overwrote the character. The
   import side already expected it to be there. One list now, so the next place
   that needs it cannot get it wrong. */
function charImgIds(c) {
  if (!c) return [];
  return [c.profileImg, c.banner,
    ...(c.gallery || []).map(g => g.imgId),
    ...(c.variants || []).map(v => v.profileImg)].filter(Boolean);
}
function personaImgIds(p) {
  if (!p) return [];
  return [p.avatar, ...(p.gallery || []).map(g => g.imgId)].filter(Boolean);
}
function picOf(fullCache, imgCache, id) {
  return id ? fullCache && fullCache[id] || imgCache && imgCache[id] : null;
}
function textOfChar(c) {
  const parts = [c.name, ...VARIANT_TEXT_KEYS.map(k => c[k])];
  (c.sections || []).forEach(s => parts.push(s.title, s.content));
  (c.variants || []).forEach(v => {
    parts.push(v.name);
    VARIANT_TEXT_KEYS.forEach(k => parts.push(v[k]));
  });
  return parts.filter(Boolean).join("\n");
}
function textOfPersona(p) {
  const parts = [p.name, p.tagline, p.role, p.pronouns, p.description];
  (p.sections || []).forEach(s => parts.push(s.title, s.content));
  return parts.filter(Boolean).join("\n");
}
function textStats(text) {
  const t = String(text || "");
  const words = (t.match(/\S+/g) || []).length;
  const letters = t.replace(/\s/g, "").length;
  return {
    chars: t.length,
    letters,
    words,
    tokens: estTokens(t)
  };
}
const estTokens = t => Math.ceil(String(t || "").length / 4);

/* What a character costs, grouped the way CharSnap groups it, so the figures
   here line up with the ones shown there rather than telling a second story.

   Permanent  — description, personality, system prompt, always-active system
                prompt. Always in the conversation, so re-sent with every reply.
   Temporary  — first message, scenario, example messages. These may be trimmed
                once the conversation gets long.
   Overrides  — base prompt, NSFW prompt and prefill instruction overrides.
                Counted apart from the other two and capped at 2,000.

   Only one variant is ever in play at a time, so this is measured for a single
   version; a character with six variants does not cost six times as much. */
const OVERRIDE_LIMIT = 2000;
/* CharSnap's published guidance for the permanent fields: "Most bot sites you
   want to keep under 2000 tokens (around 8000 characters)", and "Anything near
   3000 tokens on Charsnap is when you begin to notice large drops in chat
   quality." Worth showing next to the figure rather than leaving you to know it. */
const PERMANENT_GUIDE = 2000;
const PERMANENT_ROUGH = 3000;
const OVERRIDE_LABELS = [["baseSystemOverride", "Base prompt override"], ["nsfwSystemOverride", "NSFW prompt override"], ["prefillInstructionOverride", "Prefill instruction override"]];
function promptBudget(c) {
  const split = splitCharSnapSections(c);
  const part = (label, text) => ({ label, text: String(text || ""), tokens: estTokens(text), chars: String(text || "").length });
  const group = parts => {
    const kept = parts.filter(p => p.tokens);
    return {
      total: parts.reduce((a, p) => a + p.tokens, 0),
      chars: parts.reduce((a, p) => a + p.chars, 0),
      items: kept.map(p => [p.label, p.tokens])
    };
  };
  // the description is what CharSnap will actually receive: the story with any
  // custom sections folded into it, exactly as the export builds it
  const permanent = group([
    part("Description" + (split.extras.length ? " (with " + split.extras.length + " section" + (split.extras.length === 1 ? "" : "s") + ")" : ""), split.description),
    part("Personality", c.personality),
    part("System prompt", c.systemPrompt),
    part("Always-active system prompt", c.alwaysActiveSystemPrompt)
  ]);
  const temporary = group([
    part("First message", c.firstMessage),
    part("Scenario", c.scenario),
    part("Example messages", c.exampleMessage),
    part("Additional first messages", split.mapped.__afms)
  ]);
  const overrides = group(OVERRIDE_LABELS.map(([k, l]) => part(l, split.mapped[k])));
  const unsent = group([
    part("Creator memo", c.creatorMemo),
    part("Tagline", c.tagline),
    part("Tags and searchables", [...(c.tags || []), ...(c.searchables || [])].join(" "))
  ]);
  return {
    permanent, temporary, overrides, unsent,
    total: permanent.total + temporary.total,
    totalChars: permanent.chars + temporary.chars,
    overLimit: overrides.total > OVERRIDE_LIMIT
  };
}
function personaBudget(p) {
  const t = estTokens(p.description);
  const empty = { total: 0, chars: 0, items: [] };
  const unsentText = [p.tagline, p.role].filter(Boolean).join(" ");
  return {
    permanent: { total: t, chars: String(p.description || "").length, items: t ? [["Description", t]] : [] },
    temporary: empty,
    overrides: empty,
    unsent: { total: estTokens(unsentText), chars: unsentText.length, items: unsentText.trim() ? [["Tagline and role", estTokens(unsentText)]] : [] },
    total: t,
    totalChars: String(p.description || "").length,
    overLimit: false
  };
}
// drop notes filed against images that no longer exist
const withoutImgMeta = (meta, idSet) => {
  if (!meta) return meta;
  const out = {};
  for (const k of Object.keys(meta)) if (!idSet.has(k)) out[k] = meta[k];
  return out;
};
function dataUrlSize(v) {
  if (!v) return 0;
  const i = v.indexOf(",");
  const b64 = i >= 0 ? v.slice(i + 1) : v;
  return Math.floor(b64.length * 3 / 4);
}
function fmtBytes(n) {
  if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
  return n + " B";
}
/* Grouping was applied to the whole string, so 1234.5678 came out as
   "1,234.5,678". Only the part before the point is grouped now. */
const fmtNum = n => { const s = String(n); const i = s.indexOf("."); const head = i < 0 ? s : s.slice(0, i); const tail = i < 0 ? "" : s.slice(i); return head.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + tail; };
function StatsModal({
  title,
  subtitle,
  rows,
  note,
  loading,
  onClose
}) {
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 72
    },
    onMouseDown: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      maxWidth: 460,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": title
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Stats"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      margin: "2px 0 2px"
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      marginBottom: 6
    }
  }, subtitle), loading ? /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--dim)",
      fontSize: 13.5,
      padding: "16px 0"
    }
  }, "Calculating…") : /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
    /* A third entry marks a row as a heading or as one of the lines making it
       up, so the token breakdown can show what each figure is made of without
       every other stats screen needing to change. */
  }, rows.map(([label, value, kind], i) => {
    const sub = kind === "sub";
    const head = kind === "head";
    const nextKind = rows[i + 1] && rows[i + 1][2];
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        justifyContent: "space-between",
        gap: 14,
        alignItems: "baseline",
        padding: sub ? "3px 0 3px 14px" : head ? "10px 0 4px" : "9px 0",
        borderBottom: i < rows.length - 1 && nextKind !== "sub" ? "1px solid var(--line)" : "none"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: sub ? "var(--dim)" : "var(--mut)",
        fontSize: sub ? 12.5 : 13.5,
        fontWeight: head ? 700 : 400
      }
    }, label), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: sub ? 400 : 700,
        fontSize: sub ? 12.5 : 13.5,
        color: sub ? "var(--dim)" : head ? "var(--brass)" : "var(--text)",
        whiteSpace: "nowrap"
      }
    }, value));
  })), note && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--dim)",
      marginTop: 12,
      lineHeight: 1.55
    }
  }, note), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Close"))));
}

/* ---------- lightweight markdown rendering (bold, italics, headings, links, dividers) ---------- */
function mdInline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;
  let last = 0,
    m,
    k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(/*#__PURE__*/React.createElement("strong", {
      key: "b" + k++
    }, mdInline(t.slice(2, -2))));else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]"));
      const url = t.slice(t.indexOf("](") + 2, -1);
      out.push(/*#__PURE__*/React.createElement("span", {
        key: "l" + k++,
        title: url,
        style: {
          color: "var(--brass)",
          textDecoration: "underline",
          textUnderlineOffset: 3
        }
      }, label));
    } else out.push(/*#__PURE__*/React.createElement("em", {
      key: "i" + k++
    }, mdInline(t.slice(1, -1))));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function MDText({
  text,
  clamp,
  style
}) {
  const paras = String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/).filter(p => p.trim());
  const body = paras.map((p, i) => {
    const t = p.trim();
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(t.replace(/\s/g, ""))) return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        borderTop: "1px solid var(--line2)",
        margin: "4px 0 14px"
      }
    });
    const h = t.match(/^(#{1,6})\s+(.*)$/s);
    if (h) return /*#__PURE__*/React.createElement("p", {
      key: i,
      style: {
        margin: "0 0 12px",
        whiteSpace: "pre-wrap",
        fontWeight: 700,
        fontSize: "1.07em",
        color: "var(--text)"
      }
    }, mdInline(h[2]));
    return /*#__PURE__*/React.createElement("p", {
      key: i,
      style: {
        margin: "0 0 12px",
        whiteSpace: "pre-wrap"
      }
    }, mdInline(p));
  });
  if (clamp) return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "-webkit-box",
      WebkitLineClamp: clamp,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      ...style
    }
  }, body);
  return /*#__PURE__*/React.createElement("div", {
    style: style
  }, body);
}

/* ---------- chips picker (multi-select with filter for long lists) ---------- */
function ChipsPicker({
  options,
  value,
  onChange,
  emptyHint
}) {
  const [q, setQ] = useState("");
  const cur = value || [];
  if (!options || !options.length) return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--dim)",
      padding: "4px 0"
    }
  }, emptyHint || "Nothing to pick from yet.");
  const needle = q.trim().toLowerCase();
  const attached = options.filter(o => cur.includes(o.value));
  /* Books with entries first, then alphabetically. A vault accumulates empty and
     half-named books, and those were crowding out the ones worth attaching. */
  const entriesOf = o => {
    const m = /·\s*(\d+)\s*$/.exec(String(o.label));
    return m ? parseInt(m[1], 10) : 0;
  };
  const rest = options.filter(o => !cur.includes(o.value) && (!needle || String(o.label).toLowerCase().includes(needle)))
    .sort((a, b) => (entriesOf(b) - entriesOf(a)) || String(a.label).localeCompare(String(b.label)));
  const chip = (o, on) => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    className: "chip",
    "aria-pressed": on,
    style: {
      cursor: "pointer",
      display: "inline-flex",
      gap: 6,
      alignItems: "center",
      background: on ? "var(--brass-soft)" : undefined,
      borderColor: on ? "var(--brass)" : undefined,
      color: on ? "var(--brass)" : undefined,
      fontWeight: on ? 700 : undefined
    },
    onClick: () => onChange(on ? cur.filter(x => x !== o.value) : [...cur, o.value])
  }, /*#__PURE__*/React.createElement(Ic, {
    d: on ? icons.check : icons.plus,
    size: 11
  }), o.label, on ? " \u00b7 attached" : "");
  const many = options.length > 8;
  return /*#__PURE__*/React.createElement("div", null, attached.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      flexWrap: "wrap",
      marginBottom: 8
    }
  }, attached.map(o => chip(o, true))),
  /* Past a handful, a wall of chips is unreadable \u2014 and a vault collects empty and
     half-named books that crowd out the real ones. Attached books stay above as
     chips so removing is still one click; the rest go in a dropdown, which browsers
     let you type to search. */
  many && /*#__PURE__*/React.createElement("select", {
    value: "",
    "aria-label": "Attach a lorebook",
    onChange: e => {
      const v = e.target.value;
      if (v) onChange([...cur, v]);
    },
    style: {
      width: "100%",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, rest.length ? "Attach a lorebook\u2026 (" + rest.length + " to choose from)" : "Every lorebook is attached"), rest.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), !many && /*#__PURE__*/React.createElement("div", {
    className: undefined,
    style: {
      display: "flex",
      gap: 7,
      flexWrap: "wrap",
      alignContent: "flex-start",
      ...(many ? {
        maxHeight: 126,
        overflowY: "auto",
        paddingRight: 4
      } : {})
    }
  }, rest.map(o => chip(o, false)), needle && rest.length === 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--dim)",
      alignSelf: "center"
    }
  }, "No lorebooks match “", q.trim(), "”"), !needle && rest.length === 0 && attached.length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--dim)",
      alignSelf: "center"
    }
  }, "All lorebooks attached")));
}

/* ---------- new bucket modal ---------- */
function NewBucketModal({
  onCreate,
  onAssign,
  onClose,
  noun = "character"
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 72
    },
    onMouseDown: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      maxWidth: 440,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": "New bucket"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, noun === "persona" ? "Personas" : "Characters"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 24,
      margin: "2px 0 8px"
    }
  }, "New bucket"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.55,
      marginBottom: 12
    }
  }, "Buckets group ", noun, "s — a series, a world, a commission batch. You can make one now and fill it later."), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block",
      fontSize: 12.5,
      color: "var(--mut)",
      marginBottom: 6
    }
  }, "Bucket name"), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: name,
    onChange: e => setName(e.target.value),
    placeholder: "e.g. Nyvariel, Future plans, Halloween 2026",
    onKeyDown: e => {
      if (e.key === "Enter" && name.trim()) onCreate(name);
    },
    style: {
      width: "100%"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      justifyContent: "flex-end",
      marginTop: 16,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onAssign
  }, "Select ", noun, "s instead"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    disabled: !name.trim(),
    style: {
      opacity: name.trim() ? 1 : .5
    },
    onClick: () => onCreate(name)
  }, "Create empty bucket"))));
}

/* ---------- duplicate import decision modal ---------- */
function DupeImportModal({
  noun,
  nounPlural, // "entry" does not pluralise by adding an s
  softImages, // lore keeps its pictures when the incoming file has none
  names,
  freshCount,
  onOverwrite,
  onSkip,
  onCopies,
  onCancel
}) {
  const [sure, setSure] = useState(false);
  const shown = names.slice(0, 8);
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 74
    },
    onMouseDown: e => {
      if (e.target === e.currentTarget) onCancel();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      maxWidth: 480,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": "Duplicates found"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Import"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 23,
      margin: "2px 0 8px"
    }
  }, names.length, " ", names.length === 1 ? noun : nounPlural || noun + "s", " already in your vault"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--mut)",
      lineHeight: 1.6,
      marginBottom: 10
    }
  }, "This file contains ", nounPlural || noun + "s", " whose names match ones you already have:", " ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text)"
    }
  }, shown.join(", "), names.length > shown.length ? " +" + (names.length - shown.length) + " more" : ""), ".", freshCount > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, " ", freshCount, " new ", freshCount === 1 ? noun : nounPlural || noun + "s", " will import either way.")), sure && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "#e2698a",
      marginBottom: 10
    }
  }, softImages ? /*#__PURE__*/React.createElement(React.Fragment, null, "Are you sure? Overwriting replaces the saved text of the matching ", names.length === 1 ? noun : nounPlural || noun + "s", " with this file's version. This can't be undone. Pictures are kept unless the file brings its own.") : /*#__PURE__*/React.createElement(React.Fragment, null, "Are you sure? Overwriting replaces the saved text ", /*#__PURE__*/React.createElement("b", null, "and images"), " of the matching ", names.length === 1 ? noun : nounPlural || noun + "s", " with this file's version. This can't be undone.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onCancel
  }, "Cancel import"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onSkip
  }, "Skip duplicates"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onCopies
  }, "Import as copies"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => sure ? onOverwrite() : setSure(true)
  }, sure ? "Yes, overwrite " + names.length : "Overwrite existing"))));
}

/* ---------- editable sections list (used by record modals) ---------- */
function SectionsField({
  sections,
  onChange,
  kindOf
}) {
  return /*#__PURE__*/React.createElement("div", null, sections.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--dim)",
      fontSize: 13,
      padding: "2px 0 8px"
    }
  }, "No sections yet."), sections.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    style: {
      border: "1px solid var(--line)",
      borderRadius: 10,
      padding: 12,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: s.title,
    placeholder: "Section title (e.g. Appearance)",
    onChange: e => onChange(sections.map((x, j) => j === i ? {
      ...x,
      title: e.target.value
    } : x))
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    "aria-label": "Remove section",
    style: {
      flexShrink: 0,
      padding: "8px 11px"
    },
    onClick: () => onChange(sections.filter((_, j) => j !== i))
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.trash,
    size: 14
  }))), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: s.content,
    placeholder: "Section content",
    onChange: e => onChange(sections.map((x, j) => j === i ? {
      ...x,
      content: e.target.value
    } : x))
  }), (() => {
    const kind = kindOf ? kindOf(s.title) : sectionKinds(sections)[i];
    const info = MEMORY_KIND[kind] || MEMORY_KIND.permanent;
    return /*#__PURE__*/React.createElement("div", {
      title: info.why,
      style: {
        fontSize: 11,
        fontWeight: 600,
        marginTop: 6,
        textAlign: "right",
        letterSpacing: "normal",
        textTransform: "none",
        color: kind === "permanent" && estTokens(s.content) ? "var(--brass)" : "var(--dim)"
      }
    }, tokenLabel(s.content, kind));
  })())), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onChange([...sections, {
      id: uid(),
      title: "",
      content: ""
    }])
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.plus,
    size: 13
  }), " Add section")));
}

/* ---------- blur toggle corner button ---------- */
function BlurBtn({
  imgId,
  blurred,
  onToggleBlur,
  label
}) {
  if (!onToggleBlur || !imgId) return null;
  const on = !!blurred[imgId];
  return /*#__PURE__*/React.createElement("span", {
    className: "blurbtn" + (on ? " on" : ""),
    role: "button",
    tabIndex: 0,
    "aria-label": (on ? "Unblur " : "Blur ") + (label || "image"),
    onClick: e => {
      e.stopPropagation();
      onToggleBlur(imgId);
    },
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.stopPropagation();
        onToggleBlur(imgId);
      }
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: on ? icons.eyeoff : icons.eye,
    size: 15
  }));
}

/* ---------- immersive slideshow ---------- */
const SS_MS = 8000;
function SlideshowMode({
  items,
  charName,
  imgCache,
  fullCache,
  requestFull,
  blurred,
  onClose
}) {
  const n = items.length;
  const [order, setOrder] = useState(() => items.map((_, i) => i));
  const [shuffled, setShuffled] = useState(false);
  const [pos, setPos] = useState(0);
  const [prevImg, setPrevImg] = useState(null); // { imgId, k }
  const [playing, setPlaying] = useState(true);
  const [hidden, setHidden] = useState(false);
  const hideTimer = useRef(null);
  const item = n ? items[order[pos % n]] : null;
  const src = item ? fullCache[item.imgId] || imgCache[item.imgId] : null;
  const advance = useCallback(d => {
    if (!n) return;
    setPrevImg(item ? {
      imgId: item.imgId,
      k: Date.now()
    } : null);
    setPos(p => (p + d + n) % n);
  }, [item, n]);

  /* auto-advance */
  useEffect(() => {
    if (!playing || n < 2) return;
    const t = setTimeout(() => advance(1), SS_MS);
    return () => clearTimeout(t);
  }, [pos, playing, n, advance]);

  /* clear outgoing slide after its fade */
  useEffect(() => {
    if (!prevImg) return;
    const t = setTimeout(() => setPrevImg(null), 1000);
    return () => clearTimeout(t);
  }, [prevImg]);

  /* preload full-quality current + next two */
  useEffect(() => {
    if (!n) return;
    for (let k = 0; k < Math.min(3, n); k++) requestFull(items[order[(pos + k) % n]].imgId);
  }, [pos, order, items, n, requestFull]);

  /* keys */
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onClose();else if (e.key === "ArrowRight") advance(1);else if (e.key === "ArrowLeft") advance(-1);else if (e.key === " ") {
        e.preventDefault();
        setPlaying(p => !p);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [advance, onClose]);

  /* auto-hide controls while playing */
  const wake = useCallback(() => {
    setHidden(false);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHidden(true), 2800);
  }, []);
  useEffect(() => {
    wake();
    return () => clearTimeout(hideTimer.current);
  }, [wake]);
  useEffect(() => {
    if (!playing) setHidden(false);
  }, [playing]);
  const toggleShuffle = () => {
    if (!n) return;
    const currentIdx = order[pos % n];
    if (!shuffled) {
      const rest = items.map((_, i) => i).filter(i => i !== currentIdx);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      setOrder([currentIdx, ...rest]);
      setPos(0);
      setShuffled(true);
    } else {
      setOrder(items.map((_, i) => i));
      setPos(currentIdx);
      setShuffled(false);
    }
  };
  const swipe = useSwipeNav(d => {
    if (n > 1) advance(d);
  });
  if (!item) return null;
  const prevSrc = prevImg ? fullCache[prevImg.imgId] || imgCache[prevImg.imgId] : null;
  return /*#__PURE__*/React.createElement("div", {
    className: "ss-root" + (hidden && playing ? " ss-hide" : "") + (playing ? "" : " ss-paused"),
    onMouseMove: wake,
    onClick: wake,
    onPointerDown: e => {
      wake();
      swipe.onPointerDown(e);
    },
    onPointerUp: swipe.onPointerUp,
    onPointerCancel: swipe.onPointerCancel
  }, src && /*#__PURE__*/React.createElement("div", {
    className: "ss-back",
    style: {
      backgroundImage: "url(" + src + ")"
    }
  }), prevSrc && /*#__PURE__*/React.createElement("div", {
    className: "ss-slide ss-out",
    key: "p" + prevImg.k
  }, /*#__PURE__*/React.createElement("img", {
    src: prevSrc,
    alt: "",
    className: blurred && blurred[prevImg.imgId] ? "blur-img" : undefined
  })), /*#__PURE__*/React.createElement("div", {
    className: "ss-slide ss-in kb" + pos % 4,
    key: "s" + pos + (n ? order[pos % n] : "x")
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: item.caption || "slide",
    className: blurred && blurred[item.imgId] ? "blur-img" : undefined
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--dim)"
    }
  }, "Loading…")), /*#__PURE__*/React.createElement("div", {
    className: "ss-ui",
    style: {
      top: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      letterSpacing: ".2em",
      textTransform: "uppercase",
      color: "#d9b25c",
      fontWeight: 700,
      textShadow: "0 1px 8px rgba(0,0,0,.8)"
    }
  }, charName || "Slideshow"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      fontSize: 12.5,
      color: "rgba(231,235,247,.75)",
      textShadow: "0 1px 8px rgba(0,0,0,.8)"
    }
  }, n ? pos % n + 1 : 0, " / ", n), /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    "aria-label": "Close slideshow",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.x,
    size: 15
  }))), /*#__PURE__*/React.createElement("div", {
    className: "ss-ui",
    style: {
      bottom: 10,
      justifyContent: "center"
    }
  }, item.caption && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 20,
      maxWidth: "34vw",
      fontSize: 13,
      color: "rgba(231,235,247,.85)",
      textShadow: "0 1px 8px rgba(0,0,0,.9)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, item.caption), /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    "aria-label": "Previous",
    onClick: () => advance(-1)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.left,
    size: 15
  })), /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    "aria-label": playing ? "Pause" : "Play",
    onClick: () => setPlaying(p => !p),
    style: {
      padding: "9px 16px"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: playing ? icons.pause : icons.play,
    size: 16
  })), /*#__PURE__*/React.createElement("button", {
    className: "ss-btn",
    "aria-label": "Next",
    onClick: () => advance(1)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.right,
    size: 15
  })), /*#__PURE__*/React.createElement("button", {
    className: "ss-btn" + (shuffled ? " on" : ""),
    "aria-label": "Shuffle",
    onClick: toggleShuffle,
    style: {
      position: "absolute",
      right: 20
    }
  }, "Shuffle")), playing && n > 1 && /*#__PURE__*/React.createElement("div", {
    className: "ss-progress"
  }, /*#__PURE__*/React.createElement("span", {
    key: "pr" + pos
  })));
}

/* ---------- image grid: browse, multi-select, download originals ---------- */
function ImageGridView({
  title,
  items,
  imgCache,
  fullCache,
  requestFull,
  blurred,
  onToggleBlur,
  onSetProfile,
  onRename,
  onMoveImage,
  onDownloadSelected,
  onDeleteSelected,
  onSetAlbum,
  onCreateAlbum,
  onDeleteAlbum,
  albums,
  variantOptions,
  onSetVariant,
  onClose,
  toast
}) {
  const [sel, setSel] = useState({});
  const [vFilter, setVFilter] = useState(null); // null = every variant
  const [album, setAlbum] = useState(null); // null = all albums
  const [albumDraft, setAlbumDraft] = useState("");
  const [confirmAlbumDel, setConfirmAlbumDel] = useState(false);
  useEffect(() => {
    setConfirmAlbumDel(false); // an armed delete must not follow you to another album
  }, [album]);
  const [confirmDel, setConfirmDel] = useState(false);
  const [lb, setLb] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const commitRename = () => {
    if (editId && onRename) onRename(editId, editVal.trim());
    setEditId(null);
  };
  const albumNames = (() => {
    const names = [];
    items.forEach(it => {
      const a = (it.album || "").trim();
      if (a && names.indexOf(a) < 0) names.push(a);
    });
    (albums || []).forEach(a => {
      const t = (a || "").trim();
      if (t && names.indexOf(t) < 0) names.push(t);
    });
    return names.sort((a, b) => a.localeCompare(b));
  })();
  const albumCount = a => items.filter(it => ((it.album || "").trim() || null) === a).length;
  const vOpts = variantOptions || [];
  const variantNameOf = id => {
    if (id === "__default__") return "Default";
    const hit = vOpts.find(v => v.id === id);
    return hit ? hit.name : "";
  };
  const vCount = id => items.filter(it => ((it.variantId || "").trim() || null) === id).length;
  const shownItems = items.filter(it => {
    const albumOk = album === null || ((it.album || "").trim() || "") === (album || "");
    const vid = (it.variantId || "").trim();
    const variantOk = vFilter === null || (vFilter === "" ? !vid : vid === vFilter);
    return albumOk && variantOk;
  });
  const selCount = Object.keys(sel).length;
  const selectedItems = () => items.filter(it => sel[it.imgId]);
  useEffect(() => {
    setConfirmDel(false);
  }, [sel]);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape" && lb === null) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, lb]);
  const toggle = id => setSel(p => {
    const n = {
      ...p
    };
    if (n[id]) delete n[id];else n[id] = true;
    return n;
  });
  const lbItems = shownItems.map(it => ({
    imgId: it.imgId,
    caption: it.label || ""
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--ink)",
      zIndex: 70,
      overflowY: "auto"
    },
    className: "scrollbody"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 3,
      borderBottom: "1px solid var(--line)",
      background: "var(--ink)",
      padding: "16px 26px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 2280,
      margin: "0 auto",
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginRight: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Image grid"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 22
    }
  }, title, " · ", album === null ? items.length : shownItems.length + " of " + items.length)), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => {
      const allShown = shownItems.length > 0 && shownItems.every(it => sel[it.imgId]);
      if (allShown) setSel({});else {
        const all = {};
        shownItems.forEach(it => all[it.imgId] = true);
        setSel(all);
      }
    }
  }, shownItems.length > 0 && shownItems.every(it => sel[it.imgId]) ? "Clear selection" : album === null ? "Select all" : "Select all in album"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    disabled: !selCount,
    style: {
      opacity: selCount ? 1 : .5
    },
    onClick: () => onDownloadSelected(selectedItems())
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.down,
    size: 14
  }), " Download selected", selCount ? " (" + selCount + ")" : "", " · original quality")), onDeleteSelected && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    disabled: !selCount,
    style: {
      opacity: selCount ? 1 : .5
    },
    onClick: () => {
      if (!selCount) return;
      if (!confirmDel) {
        setConfirmDel(true);
        return;
      }
      onDeleteSelected(selectedItems().map(it => it.imgId));
      setSel({});
      setConfirmDel(false);
    }
  }, confirmDel ? "Really delete " + selCount + "? This can't be undone" : /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.x,
    size: 14
  }), " Delete selected", selCount ? " (" + selCount + ")" : "")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Close")), onSetVariant && vOpts.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 2280,
      margin: "12px auto 0",
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      marginRight: 2
    }
  }, "Variant"), /*#__PURE__*/React.createElement("button", {
    className: "chip" + (vFilter === null ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setVFilter(null)
  }, "Every variant \u00b7 " + items.length), /*#__PURE__*/React.createElement("button", {
    className: "chip" + (vFilter === "" ? " on" : ""),
    style: {
      cursor: "pointer",
      borderStyle: "dashed"
    },
    onClick: () => setVFilter(vFilter === "" ? null : "")
  }, "Shared \u00b7 " + vCount(null)), /*#__PURE__*/React.createElement("button", {
    className: "chip" + (vFilter === "__default__" ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setVFilter(vFilter === "__default__" ? null : "__default__")
  }, "Default only \u00b7 " + vCount("__default__")), vOpts.map(v => /*#__PURE__*/React.createElement("button", {
    key: v.id,
    className: "chip" + (vFilter === v.id ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setVFilter(vFilter === v.id ? null : v.id)
  }, v.name + " \u00b7 " + vCount(v.id))), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "inline-flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: "",
    disabled: !selCount,
    style: {
      width: 200,
      opacity: selCount ? 1 : .5
    },
    onChange: e => {
      const val = e.target.value;
      if (!val) return;
      onSetVariant(selectedItems().map(it => it.imgId), val === "__shared__" ? "" : val);
      setSel({});
      e.target.value = "";
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, selCount ? "Assign " + selCount + " to variant\u2026" : "Select images first\u2026"), /*#__PURE__*/React.createElement("option", {
    value: "__shared__"
  }, "Shared (all variants)"), /*#__PURE__*/React.createElement("option", {
    value: "__default__"
  }, "Default only"), vOpts.map(v => /*#__PURE__*/React.createElement("option", {
    key: v.id,
    value: v.id
  }, v.name))), onSetProfile && /*#__PURE__*/React.createElement("select", {
    value: "",
    disabled: selCount !== 1,
    title: selCount === 1 ? "Make the selected image a portrait" : "Select exactly one image",
    style: {
      width: 205,
      opacity: selCount === 1 ? 1 : .5
    },
    onChange: e => {
      const val = e.target.value;
      if (!val) return;
      const one = selectedItems()[0];
      if (one) onSetProfile(one.imgId, val === "__base__" ? null : val);
      setSel({});
      e.target.value = "";
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, selCount === 1 ? "Use as portrait for\u2026" : "Portrait: pick 1 image"), /*#__PURE__*/React.createElement("option", {
    value: "__base__"
  }, "Default (main portrait)"), vOpts.map(v => /*#__PURE__*/React.createElement("option", {
    key: v.id,
    value: v.id
  }, v.name + " portrait"))))), onSetAlbum && /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 2280,
      margin: "12px auto 0",
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      marginRight: 2
    }
  }, "Albums"), /*#__PURE__*/React.createElement("button", {
    className: "chip" + (album === null ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setAlbum(null)
  }, "All · " + items.length), albumNames.map(a => /*#__PURE__*/React.createElement("button", {
    key: a,
    className: "chip" + (album === a ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setAlbum(album === a ? null : a)
  }, a + " · " + albumCount(a))), albumCount(null) > 0 && /*#__PURE__*/React.createElement("button", {
    className: "chip" + (album === "" ? " on" : ""),
    style: {
      cursor: "pointer",
      borderStyle: "dashed"
    },
    onClick: () => setAlbum(album === "" ? null : "")
  }, "Unsorted · " + albumCount(null)), album !== null && album !== "" && shownItems.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    style: {
      padding: "4px 10px",
      fontSize: 12.5
    },
    onClick: () => onDownloadSelected(shownItems, album)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.down,
    size: 12
  }), " Download “" + album + "” (" + shownItems.length + ")")), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      display: "inline-flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("input", {
    list: "rcv-album-names",
    value: albumDraft,
    onChange: e => setAlbumDraft(e.target.value),
    placeholder: selCount ? "Album for " + selCount + " selected…" : "New album name…",
    onKeyDown: e => {
      if (e.key !== "Enter" || !albumDraft.trim()) return;
      e.preventDefault();
      if (selCount) {
        onSetAlbum(selectedItems().map(it => it.imgId), albumDraft.trim());
        setSel({});
      } else if (onCreateAlbum) {
        onCreateAlbum(albumDraft.trim());
      }
      setAlbumDraft("");
    },
    style: {
      width: 190
    }
  }), /*#__PURE__*/React.createElement("datalist", {
    id: "rcv-album-names"
  }, albumNames.map(a => /*#__PURE__*/React.createElement("option", {
    key: a,
    value: a
  }))), /*#__PURE__*/React.createElement("button", {
    className: selCount ? "btn btn-brass" : "btn btn-ghost",
    disabled: !albumDraft.trim(),
    style: {
      opacity: albumDraft.trim() ? 1 : .5
    },
    onClick: () => {
      const name = albumDraft.trim();
      if (!name) return;
      if (selCount) {
        onSetAlbum(selectedItems().map(it => it.imgId), name);
        setSel({});
      } else if (onCreateAlbum) {
        onCreateAlbum(name);
      }
      setAlbumDraft("");
    }
  }, selCount ? "Add " + selCount + " to album" : "Create album"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !selCount,
    style: {
      opacity: selCount ? 1 : .5
    },
    onClick: () => {
      onSetAlbum(selectedItems().map(it => it.imgId), "");
      setSel({});
    }
  }, "Remove from album"), /* An album could be made but never got rid of. Once
     created it sat in this bar for the life of the vault, so a typo or a change
     of mind was permanent — while buckets and lorebooks have always been
     deletable. Only offered while looking inside one, and it lets the pictures
     out rather than taking them with it. */
  album && onDeleteAlbum && /*#__PURE__*/React.createElement("button", {
    className: confirmAlbumDel ? "btn btn-danger" : "btn btn-ghost",
    title: "Removes the album. The pictures in it stay, unfiled.",
    onClick: () => {
      if (!confirmAlbumDel) {
        setConfirmAlbumDel(true);
        return;
      }
      onDeleteAlbum(album);
      setConfirmAlbumDel(false);
      setAlbum(null);
      setSel({});
    }
  }, confirmAlbumDel ? "Click again — “" + album + "” goes, pictures stay" : "Delete album")))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 2280,
      margin: "0 auto",
      padding: "22px 26px 80px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
      gap: 14
    }
  }, album !== null && shownItems.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: "1 / -1",
      padding: "34px 20px",
      textAlign: "center",
      color: "var(--dim)",
      fontSize: 13.5
    }
  }, album === "" ? "Every image is filed into an album." : "\u201c" + album + "\u201d is empty \u2014 switch to All, tick some images, then add them to this album."), shownItems.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: it.imgId,
    className: "tile" + (overId === it.imgId && dragId && dragId !== it.imgId ? " drag-over" : "") + (dragId === it.imgId ? " dragging" : ""),
    role: "button",
    tabIndex: 0,
    "aria-pressed": !!sel[it.imgId],
    draggable: !!(onMoveImage && it.movable),
    onDragStart: e => {
      if (!onMoveImage || !it.movable) return;
      setDragId(it.imgId);
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", it.imgId);
      } catch (err) {}
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
    onDragOver: e => {
      if (!dragId || !it.movable) return;
      e.preventDefault();
      if (overId !== it.imgId) setOverId(it.imgId);
    },
    onDragLeave: () => {
      if (overId === it.imgId) setOverId(null);
    },
    onDrop: e => {
      e.preventDefault();
      if (dragId && it.movable && dragId !== it.imgId) onMoveImage(dragId, it.imgId);
      setDragId(null);
      setOverId(null);
    },
    style: {
      aspectRatio: "1",
      cursor: "zoom-in",
      borderColor: sel[it.imgId] ? "var(--brass)" : undefined,
      boxShadow: sel[it.imgId] ? "0 0 0 2px var(--brass-line)" : undefined
    },
    onClick: () => setLb(i),
    onKeyDown: e => e.key === "Enter" && setLb(i)
  }, /*#__PURE__*/React.createElement("span", {
    role: "checkbox",
    "aria-checked": !!sel[it.imgId],
    "aria-label": "Select " + (it.label || "image"),
    tabIndex: 0,
    onClick: e => {
      e.stopPropagation();
      toggle(it.imgId);
    },
    onKeyDown: e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        toggle(it.imgId);
      }
    },
    style: {
      position: "absolute",
      top: 8,
      left: 8,
      zIndex: 2,
      width: 26,
      height: 26,
      borderRadius: 99,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      background: sel[it.imgId] ? "var(--brass)" : "rgba(10,14,26,.6)",
      color: sel[it.imgId] ? "#141414" : "rgba(231,235,247,.8)",
      border: "1px solid " + (sel[it.imgId] ? "var(--brass)" : "rgba(180,195,235,.4)")
    }
  }, sel[it.imgId] && /*#__PURE__*/React.createElement(Ic, {
    d: icons.check,
    size: 14
  })), /*#__PURE__*/React.createElement("span", {
    className: "blurbtn on",
    role: "button",
    tabIndex: 0,
    "aria-label": "Open " + (it.label || "image"),
    style: {
      opacity: 1,
      right: 44
    },
    onClick: e => {
      e.stopPropagation();
      setLb(i);
    },
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.stopPropagation();
        setLb(i);
      }
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.expand,
    size: 14
  })), /*#__PURE__*/React.createElement(BlurBtn, {
    imgId: it.imgId,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    label: it.label
  }), onMoveImage && it.movable && shownItems.length > 1 && /*#__PURE__*/React.createElement(React.Fragment, null, i > 0 && /*#__PURE__*/React.createElement("span", {
    className: "blurbtn on movebtn",
    role: "button",
    tabIndex: 0,
    "aria-label": "Move " + (it.label || "this picture") + " earlier",
    title: "Move earlier",
    style: {
      left: 8,
      right: "auto"
    },
    onClick: e => {
      e.stopPropagation();
      onMoveImage(it.imgId, shownItems[i - 1].imgId);
    },
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.stopPropagation();
        onMoveImage(it.imgId, shownItems[i - 1].imgId);
      }
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.left,
    size: 14
  })), i < shownItems.length - 1 && /*#__PURE__*/React.createElement("span", {
    className: "blurbtn on movebtn",
    role: "button",
    tabIndex: 0,
    "aria-label": "Move " + (it.label || "this picture") + " later",
    title: "Move later",
    style: {
      right: 8
    },
    onClick: e => {
      e.stopPropagation();
      onMoveImage(it.imgId, shownItems[i + 1].imgId);
    },
    onKeyDown: e => {
      if (e.key === "Enter") {
        e.stopPropagation();
        onMoveImage(it.imgId, shownItems[i + 1].imgId);
      }
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.right,
    size: 14
  }))), onSetAlbum && (it.album || "").trim() && /*#__PURE__*/React.createElement("span", {
    title: "Album: " + it.album,
    style: {
      position: "absolute",
      left: 8,
      top: 8,
      zIndex: 3,
      fontSize: 11,
      fontWeight: 700,
      padding: "3px 8px",
      borderRadius: 999,
      background: "rgba(8,11,22,.82)",
      color: "var(--brass)",
      border: "1px solid var(--brass-line)",
      maxWidth: "70%",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      pointerEvents: "none"
    }
  }, it.album), onSetVariant && (it.variantId || "").trim() && variantNameOf(it.variantId) && /*#__PURE__*/React.createElement("span", {
    title: "Variant: " + variantNameOf(it.variantId),
    style: {
      position: "absolute",
      left: 8,
      top: (it.album || "").trim() ? 34 : 8,
      zIndex: 3,
      fontSize: 11,
      fontWeight: 700,
      padding: "3px 8px",
      borderRadius: 999,
      background: "rgba(8,11,22,.82)",
      color: "#c7b3ff",
      border: "1px solid rgba(150,120,255,.55)",
      maxWidth: "70%",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      pointerEvents: "none"
    }
  }, variantNameOf(it.variantId)), picOf(fullCache, imgCache, it.imgId) ? /*#__PURE__*/React.createElement("img", {
    src: picOf(fullCache, imgCache, it.imgId),
    alt: it.label || "image",
    className: blurred[it.imgId] ? "blur-img" : undefined
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%"
    }
  }), editId === it.imgId ? /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: editVal,
    style: {
      position: "absolute",
      bottom: 6,
      left: 6,
      right: 6,
      zIndex: 3,
      fontSize: 12,
      padding: "6px 8px"
    },
    onClick: e => e.stopPropagation(),
    onChange: e => setEditVal(e.target.value),
    onKeyDown: e => {
      e.stopPropagation();
      if (e.key === "Enter") commitRename();
      if (e.key === "Escape") setEditId(null);
    },
    onBlur: commitRename
  }) : (it.label || onRename && it.renamable) && /*#__PURE__*/React.createElement("span", {
    className: "tlab",
    style: {
      opacity: 1,
      cursor: onRename && it.renamable ? "text" : undefined
    },
    title: onRename && it.renamable ? "Click to rename" : undefined,
    onClick: e => {
      if (!onRename || !it.renamable) return;
      e.stopPropagation();
      setEditId(it.imgId);
      setEditVal(it.caption != null ? it.caption : it.label || "");
    }
  }, it.label || "Add a name…"))))), lb !== null && /*#__PURE__*/React.createElement(Lightbox, {
    items: lbItems,
    index: lb,
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    onClose: () => setLb(null),
    onNav: d => setLb(p => {
      const len = lbItems.length;
      if (len <= 0) return null;
      return (p + d + len) % len;
    }),
    onRemove: onDeleteSelected ? i => {
      const removedId = lbItems[i] && lbItems[i].imgId;
      if (removedId) onDeleteSelected([removedId]);
      setLb(p => {
        const remaining = lbItems.length - 1;
        if (remaining <= 0) return null;
        return Math.min(p, remaining - 1);
      });
    } : undefined,
    onSetProfile: onSetProfile ? imgId => {
      const it = lbItems[lb];
      onSetProfile(imgId, it && it.variantId);
      toast && toast("Profile image updated");
    } : undefined
  }));
}

/* ---------- lore entry viewer (read-only popup) ---------- */
function LoreEntryView({
  entry: e,
  imgCache,
  fullCache,
  requestFull,
  blurred,
  onToggleBlur,
  kicker,
  onCopy,
  onExportCharSnap,
  onEdit,
  onClose,
  onAddImages,
  onRemoveImage,
  onDownloadOne,
  onDownloadAll
}) {
  const [lb, setLb] = useState(null);
  const addRef = useRef(null);
  const images = e.images || [];
  useEffect(() => {
    const h = ev => {
      if (ev.key === "Escape" && lb === null) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, lb]);
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 58
    },
    onMouseDown: ev => {
      if (ev.target === ev.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      position: "relative",
      maxWidth: 760,
      width: "94vw",
      maxHeight: "88vh",
      overflowY: "auto",
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": e.title || "Lore entry"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, kicker != null ? kicker : e.world || "Unfiled"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 26,
      margin: "2px 0 4px"
    }
  }, e.title || "Untitled"), e.entryType && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "chip on"
  }, e.entryType)), (e.triggers || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, e.triggers.slice(0, 8).map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    className: "chip"
  }, t)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      display: "flex",
      gap: 8,
      flexShrink: 0,
      // leave the corner clear so the buttons do not run under the X
      paddingRight: 40
    }
  }, onCopy && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    onClick: onCopy
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.copy,
    size: 13
  }), " Copy")), onExportCharSnap && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    title: "Just this entry, as a CharSnap lorebook file with one entry in it.",
    onClick: onExportCharSnap
  }, "Export for CharSnap"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: onEdit
  }, "Edit")), /*#__PURE__*/React.createElement(CloseX, {
    onClose: onClose,
    label: "Close entry"
  })), /*#__PURE__*/React.createElement(MDText, {
    text: e.content,
    style: {
      fontSize: "var(--prose-size, 14.5px)",
      lineHeight: 1.75,
      color: "var(--text)",
      margin: "14px 0 4px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--line)",
      marginTop: 16,
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: images.length ? 12 : 0,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Images", images.length ? " \u00b7 " + images.length : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto",
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: "6px 11px",
      fontSize: 12.5
    },
    onClick: () => addRef.current.click()
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.plus,
    size: 12
  }), " Add images")), images.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: "6px 11px",
      fontSize: 12.5
    },
    onClick: onDownloadAll
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.down,
    size: 12
  }), " Download all")))), /*#__PURE__*/React.createElement("input", {
    ref: addRef,
    type: "file",
    accept: "image/*",
    multiple: true,
    hidden: true,
    onChange: ev => {
      if (ev.target.files && ev.target.files.length) onAddImages(ev.target.files);
      ev.target.value = "";
    }
  }), images.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--dim)",
      fontSize: 13,
      padding: "6px 0"
    }
  }, "No images on this entry yet."), images.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gap: 10
    }
  }, images.map((im, i) => /*#__PURE__*/React.createElement("div", {
    key: im.imgId,
    className: "tile",
    role: "button",
    tabIndex: 0,
    style: {
      aspectRatio: "1",
      cursor: "zoom-in"
    },
    onClick: () => setLb(i),
    onKeyDown: ev => ev.key === "Enter" && setLb(i),
    "aria-label": "Open image " + (i + 1)
  }, /*#__PURE__*/React.createElement(BlurBtn, {
    imgId: im.imgId,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    label: "image " + (i + 1)
  }), /*#__PURE__*/React.createElement("span", {
    className: "blurbtn on",
    role: "button",
    tabIndex: 0,
    "aria-label": "Download image " + (i + 1),
    style: {
      opacity: 1,
      right: 44
    },
    onClick: ev => {
      ev.stopPropagation();
      onDownloadOne(im.imgId, i);
    },
    onKeyDown: ev => {
      if (ev.key === "Enter") {
        ev.stopPropagation();
        onDownloadOne(im.imgId, i);
      }
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.down,
    size: 13
  })), /*#__PURE__*/React.createElement(DangerButton, {
    el: "span",
    className: "blurbtn on",
    role: "button",
    tabIndex: 0,
    style: {
      opacity: 1,
      right: 80
    },
    stop: true,
    icon: icons.x,
    iconSize: 13,
    title: "Remove image " + (i + 1),
    label: "Remove image " + (i + 1),
    armedLabel: "Click again — this picture is gone",
    onConfirm: () => onRemoveImage(i)
  }), imgCache[im.imgId] ? /*#__PURE__*/React.createElement("img", {
    src: imgCache[im.imgId],
    alt: "entry image " + (i + 1),
    className: blurred[im.imgId] ? "blur-img" : undefined
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%"
    }
  })))))), lb !== null && /*#__PURE__*/React.createElement(Lightbox, {
    items: images.map(im => ({
      imgId: im.imgId,
      caption: e.title || ""
    })),
    index: lb,
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    onClose: () => setLb(null),
    onNav: d => setLb(p => (p + d + images.length) % images.length)
  }));
}

/* ---------- lorebook page (all entries of one book) ---------- */
function LorebookPage({
  world,
  entries,
  cover,
  imgCache,
  fullCache,
  blurred,
  escOff,
  eyebrow = "Lorebook",
  entryNoun = "entry",
  entriesNoun = "entries",
  bookNoun = "book",
  inLabel = "in this world",
  onSetCover,
  onRemoveCover,
  onDownloadBookImages,
  onClose,
  onOpenEntry,
  onNewEntry,
  onImportEntry,
  // the same page serves lorebooks and prompt collections, so the template it
  // hands out has to follow whichever it is showing
  sampleJson,
  sampleName,
  onRename,
  onDeleteBook,
  onExportBook,
  onExportBookText,
  onExportCharSnap,
  onStats
}) {
  const coverRef = useRef(null);
  const coverSrc = cover ? fullCache && fullCache[cover] || imgCache && imgCache[cover] : null;
  const anyImages = entries.some(e => (e.images || []).length);
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(world);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape" && !escOff) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, escOff]);
  useEffect(() => {
    setConfirmDel(false);
  }, [entries.length]);
  const label = world || "Unfiled";
  const needle = q.trim().toLowerCase();
  const [typeFilter, setTypeFilter] = useState(null);
  const types = [...new Set(entries.map(e => (e.entryType || "").trim()).filter(Boolean))].sort();
  const zTop = 54; // above character/persona pages (50) so attached books open on top
  const shown = entries.filter(e => !typeFilter || (e.entryType || "").trim() === typeFilter).filter(e => !needle || (e.title || "").toLowerCase().includes(needle) || (e.content || "").toLowerCase().includes(needle) || (e.entryType || "").toLowerCase().includes(needle) || (e.triggers || []).some(t => t.toLowerCase().includes(needle))).slice().sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--ink)",
      zIndex: zTop,
      overflowY: "auto"
    },
    className: "scrollbody"
  }, /*#__PURE__*/React.createElement(CloseX, {
    onClose: onClose,
    fixed: true,
    label: "Close lorebook"
  }), /*#__PURE__*/React.createElement("div", {
    className: "hero",
    style: {
      position: "relative",
      overflow: "hidden",
      borderBottom: "1px solid var(--line)",
      background: "linear-gradient(180deg, var(--panel), var(--ink))"
    }
  }, coverSrc && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: coverSrc,
    alt: "",
    className: blurred && blurred[cover] ? "blur-img" : undefined,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(180deg, rgba(5,7,14,.82), rgba(5,7,14,.92) 97%)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: 2280,
      margin: "0 auto",
      padding: "30px 30px 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, eyebrow), !renaming ? /*#__PURE__*/React.createElement("h1", {
    className: "serif",
    style: {
      fontSize: "clamp(28px, 4vw, 46px)",
      margin: "4px 0 6px"
    }
  }, label) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      margin: "10px 0",
      maxWidth: 480
    }
  }, /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: newName,
    onChange: e => setNewName(e.target.value),
    onKeyDown: e => e.key === "Enter" && newName.trim() && (onRename(newName.trim()), setRenaming(false))
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => {
      if (newName.trim()) {
        onRename(newName.trim());
        setRenaming(false);
      }
    }
  }, "Save"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => {
      setRenaming(false);
      setNewName(world);
    }
  }, "Cancel")), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--mut)",
      fontSize: 14,
      marginBottom: 16
    }
  }, entries.length, " ", entries.length === 1 ? entryNoun : entriesNoun, " ", inLabel, ".", (() => {
    const tok = entries.reduce((n, e) => n + estTokens([e.title, e.content, (e.triggers || []).join(" ")].filter(Boolean).join("\n")), 0);
    if (!tok) return null;
    return /*#__PURE__*/React.createElement("span", {
      title: bookNoun === "collection"
        ? "Prompts are yours to copy out, so what they cost depends on where you paste them."
        : "An entry only uses context while one of its triggers is being matched, so this is the whole book rather than what you are paying at any moment.",
      style: {
        color: "var(--dim)",
        marginLeft: 8
      }
    }, "~", fmtNum(tok), " tokens ", bookNoun === "collection" ? "in total" : "if every entry fired at once");
  })()), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: onNewEntry
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.plus,
    size: 14
  }), " New ", entryNoun)), /*#__PURE__*/React.createElement(FilesMenu, {
    title: "This " + bookNoun,
    note: "Importing here always lands in this " + bookNoun + ", whatever the file itself says.",
    groups: [{
      heading: "Bring in",
      items: [onImportEntry && {
        label: "Import " + entriesNoun,
        hint: "From a JSON file, straight into this " + bookNoun + ". One " + entryNoun + " on its own is fine, and so is a whole lorebook file.",
        onClick: onImportEntry
      }, onImportEntry && {
        label: "Download a sample file",
        hint: "A blank file showing every field one " + entryNoun + " accepts.",
        onClick: () => downloadJSON(sampleJson || SAMPLE_LORE_ENTRY_JSON, sampleName || "rolecraft-lore-entry-template.json")
      }]
    }, {
      heading: "Send out",
      items: [{
        label: "Export JSON",
        hint: "The whole " + bookNoun + " with its pictures, in this app’s own format. Import it back here or on another machine.",
        onClick: onExportBook
      }, onExportBookText && {
        label: "Export text only",
        hint: "No pictures — small enough to read or paste elsewhere.",
        onClick: onExportBookText
      }, onExportCharSnap && {
        label: "Export for CharSnap",
        hint: "A Chub-compatible file, ready to upload. No pictures — CharSnap cannot take them from a file at all, so add them there afterwards.",
        onClick: onExportCharSnap
      }]
    }]
  }), world && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => {
      setRenaming(true);
      setNewName(world);
    }
  }, "Rename ", bookNoun), onStats && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onStats
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.chart,
    size: 13
  }), " Stats")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => coverRef.current.click()
  }, cover ? "Replace cover" : "Set cover"), cover && /*#__PURE__*/React.createElement(DangerButton, {
    className: "btn btn-ghost",
    label: "Remove cover",
    armedLabel: "Click again — the cover is gone",
    onConfirm: onRemoveCover
  }), anyImages && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onDownloadBookImages
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.down,
    size: 13
  }), " Download images")), /*#__PURE__*/React.createElement("input", {
    ref: coverRef,
    type: "file",
    accept: "image/*",
    hidden: true,
    onChange: e => {
      if (e.target.files && e.target.files[0]) onSetCover(e.target.files);
      e.target.value = "";
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => confirmDel ? onDeleteBook() : setConfirmDel(true)
  }, confirmDel ? "Really delete all " + entries.length + "?" : "Delete " + bookNoun), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Search " + label + "…",
    style: {
      width: 240,
      marginLeft: "auto"
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 2280,
      margin: "0 auto",
      padding: "24px 30px 80px"
    }
  }, types.length > 1 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "chip" + (typeFilter === null ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setTypeFilter(null)
  }, "All · ", entries.length), types.map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    className: "chip" + (typeFilter === t ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setTypeFilter(typeFilter === t ? null : t)
  }, t, " · ", entries.filter(e => (e.entryType || "").trim() === t).length))), shown.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 30,
      color: "var(--dim)",
      fontSize: 14
    }
  }, needle ? "No " + entriesNoun + " match that search." : "This " + bookNoun + " is empty — add your first " + entryNoun + "."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 14
    }
  }, shown.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.id,
    className: "card",
    role: "button",
    tabIndex: 0,
    style: {
      padding: 18,
      cursor: "pointer"
    },
    onClick: () => onOpenEntry(e),
    onKeyDown: ev => ev.key === "Enter" && onOpenEntry(e)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "baseline",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 17,
      minWidth: 0
    }
  }, e.title || "Untitled"), e.entryType && /*#__PURE__*/React.createElement("span", {
    className: "chip",
    style: {
      marginLeft: "auto",
      flexShrink: 0
    }
  }, e.entryType)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.55,
      display: "-webkit-box",
      WebkitLineClamp: 4,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    }
  }, e.content), (e.triggers || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--brass)",
      marginTop: 8,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, e.triggers.slice(0, 6).join(" · "), e.triggers.length > 6 ? " · …" : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--dim)",
      marginTop: 8,
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", null, "Updated ", timeAgo(e.updatedAt)), (e.images || []).length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 4,
      alignItems: "center",
      color: "var(--mut)"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.img,
    size: 11
  }), e.images.length)))))));
}

/* ---------- character page (view mode) ---------- */
function CharacterPage({
  char: c,
  imgCache,
  fullCache,
  loadImage,
  requestFull,
  warmFull,
  blurred,
  onToggleBlur,
  escOff,
  onEdit,
  onClose,
  onSetProfile,
  onCaption,
  onDeleteImages,
  onSetAlbum,
  onCreateAlbum,
  onDeleteAlbum,
  onSetVariant,
  onReorder,
  onReorderImages,
  onDownloadImages,
  onDownloadSelected,
  onExportJson,
  onExportText,
  onExportCharSnap,
  onExportCharSnapVariant,
  onOpenLorebook,
  onTagClick,
  onStats,
  toast
}) {
  const [lb, setLb] = useState(null); // { index, autoPlay }
  const [ss, setSs] = useState(false);
  const [grid, setGrid] = useState(false);
  const [railDrag, setRailDrag] = useState(null);
  const [railOver, setRailOver] = useState(null);
  const gridItems = (() => {
    const seen = new Set();
    const out = [];
    const push = (imgId, label, extra) => {
      if (!imgId || seen.has(imgId)) return;
      seen.add(imgId);
      out.push({
        imgId,
        label,
        ...(extra || {})
      });
    };
    const meta = c.imgMeta || {};
    const metaOf = (id, fallbackVid) => ({
      album: (meta[id] && meta[id].album) || "",
      variantId: meta[id] && meta[id].variantId !== undefined ? meta[id].variantId : fallbackVid || ""
    });
    push(c.profileImg, "Portrait \u00b7 Default", metaOf(c.profileImg, DEFAULT_VID));
    push(c.banner, "Banner", metaOf(c.banner, ""));
    (c.variants || []).forEach(v => {
      if (v.profileImg) push(v.profileImg, "Portrait \u00b7 " + (v.name || "Variant"), metaOf(v.profileImg, v.id));
    });
    (c.gallery || []).forEach((g, i) => push(g.imgId, g.caption || "Image " + (i + 1), {
      renamable: true,
      movable: true,
      caption: g.caption || "",
      album: g.album || "",
      variantId: g.variantId || ""
    }));
    return out;
  })();
  const warmKey = charImgIds(c).join("\n");
  useEffect(() => {
    const ids = warmKey ? warmKey.split("\n") : [];
    ids.forEach(id => loadImage(id));
    return warmFull(ids);
  }, [warmKey, loadImage, warmFull]);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape" && lb === null && !ss && !grid && !escOff) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, lb, ss, grid, escOff]);
  let activeProfileId = c.profileImg;
  let profile = activeProfileId ? fullCache[activeProfileId] || imgCache[activeProfileId] : null;
  const [activeVar, setActiveVar] = useState(null); // variant id or null = Default
  /* A well-tagged character can carry dozens of each of these, which pushed the
     writing off the screen entirely. Show a first row's worth and keep the rest
     behind a count. */
  const CHIP_PREVIEW = 10;
  const MEMO_MAX_H = 260; // the memo scrolls past this rather than growing the page
  const [tagsAll, setTagsAll] = useState(false);
  const [termsAll, setTermsAll] = useState(false);
  const moreChip = (n, onClick, label) => /*#__PURE__*/React.createElement("button", {
    className: "chip",
    style: {
      cursor: "pointer",
      background: "none",
      color: "var(--dim)",
      borderStyle: "dashed"
    },
    onClick: onClick
  }, label || "+" + n + " more");
  const variants = c.variants || [];
  /* Images with no variantId are shared (shown everywhere); tagged ones only appear
     under their variant. A tag naming a variant that no longer exists — a restore
     can remove one, and rule 2 forbids a restore from editing the gallery — would
     otherwise match nothing and the picture would silently stop rendering. Treat
     those as shared so the image stays reachable without rewriting its record. */
  /* What CharSnap would refuse about the version on screen. name and tagline are
     character-level, so they matter to the whole-character file and not to a
     variant-only one — the two exports are checked separately. */
  const csGaps = charSnapMissing(c, activeVar);
  const csVariantGaps = csGaps.filter(g => g !== "name" && g !== "tagline");
  /* Each CharSnap export is offered twice, plain and hidden, so what a pair has
     in common is written once here rather than four times below. */
  const charSnapWhole = "For CharSnap's “Import JSON” button, on the Basics tab — this file is a whole character. No pictures — CharSnap cannot take them from a file at all, so add them there afterwards. " + (c.nsfw || c.nsfwPicture ? "Marked " + [c.nsfw ? "NSFW" : "", c.nsfwPicture ? "NSFW picture" : ""].filter(Boolean).join(" and ") + ", as set on this character." : "Marked not adult — set that on the character if it should be.");
  const charSnapVariantWhy = "For CharSnap's “Import Variant” button, on the Details tab — it drops this version into the variant slot you have open there. A whole-character file will not work with that button, which is why this one is separate.";
  const everyVersionWhy = variants.length + 1 > 5 ? "The first five of your " + (variants.length + 1) + " versions — CharSnap does not take more than five versions of a character." : "All " + (variants.length + 1) + " versions in one file, rather than just the one on screen.";
  const hiddenWhy = "The backstory and personality go out wrapped in CharSnap's |~ ~| marks, so readers there see only the name, tagline and pictures. The AI still reads every word, and so do you.";
  const refuses = list => list.length ? "CharSnap will refuse this until " + list.join(", ") + (list.length === 1 ? " is filled in. " : " are filled in. ") : "";
  const liveVid = id => id === DEFAULT_VID || variants.some(v => v.id === id);
  const visGallery = (c.gallery || []).map((g, oi) => ({ g, oi })).filter(x => {
    const vid = (x.g.variantId || "").trim();
    if (!vid || !liveVid(vid)) return true; // untagged, or orphaned by a restore = shared
    if (vid === DEFAULT_VID) return activeVar === null;
    return vid === activeVar;
  });
  const av = activeVar !== null ? variants.find(v => v.id === activeVar) : null;
  activeProfileId = (av && av.profileImg) || c.profileImg;
  profile = activeProfileId ? fullCache[activeProfileId] || imgCache[activeProfileId] : null;
  const F = k => av && (av[k] || "").trim() ? av[k] : c[k] || ""; // variant field with Default fallback
  /* These three read straight off the character, so an open variant with its own
     age still showed the Default's. Bucket is shared and stays as it is. */
  /* The figures for the version being looked at, not the character as a whole —
     only one version is ever in play at a time. Permanent is the one that is
     re-sent with every reply, so it leads. */
  const shownBudget = promptBudget(Object.assign({}, c, av ? Object.fromEntries(VARIANT_FIELDS.map(k => [k, F(k)])) : {}));
  const details = [["Age", F("age")], ["Gender", F("gender")], ["Pronouns", F("pronouns")], ["Bucket", c.bucket],
    ["Tokens", "~" + fmtNum(shownBudget.permanent.total) + " permanent \u00b7 ~" + fmtNum(shownBudget.temporary.total) + " temporary"]].filter(x => x[1]);
  const memo = (F("creatorMemo") || "").trim(); // shown in the header, not with the prose
  const blocks = [{
    key: "story",
    title: "Backstory",
    body: F("story")
  }, {
    key: "personality",
    title: "Personality",
    body: F("personality")
  }, {
    key: "scenario",
    title: "Scenario",
    body: F("scenario")
  }, {
    key: "firstMessage",
    title: "First message",
    body: F("firstMessage")
  }, {
    key: "exampleMessage",
    title: "Example messages",
    body: F("exampleMessage")
  }, {
    key: "systemPrompt",
    title: "System prompt",
    body: F("systemPrompt")
  }, {
    key: "aasp",
    title: "Always-active system prompt",
    body: F("alwaysActiveSystemPrompt")
    /* Guarded like every other list on this page. Unguarded, a character that
       arrived without a sections field — an old vault, or a record copied over
       from a device running an older build — did not merely fail to show its
       sections: it threw while rendering and took the entire interface down to
       a blank window, with no way back to it. */
  }, ...(c.sections || []).map(s => ({
    key: "sec:" + s.id,
    title: s.title || "Untitled section",
    body: s.content
  }))].filter(x => x.body);
  const savedOrder = c.sectionOrder || [];
  const prose = [...blocks].sort((a, b) => {
    const ia = savedOrder.indexOf(a.key),
      ib = savedOrder.indexOf(b.key);
    return (ia < 0 ? blocks.indexOf(a) + 1000 : ia) - (ib < 0 ? blocks.indexOf(b) + 1000 : ib);
  });
  const moveBlock = (i, d) => {
    const keys = prose.map(b => b.key);
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const t = keys[i];
    keys[i] = keys[j];
    keys[j] = t;
    onReorder(keys);
  };
  const [collapsed, setCollapsed] = useState({});
  const toggleCollapse = key => setCollapsed(p => ({
    ...p,
    [key]: !p[key]
  }));
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const dropTo = i => {
    if (dragIdx === null || dragIdx === i) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const keys = prose.map(b => b.key);
    const [moved] = keys.splice(dragIdx, 1);
    keys.splice(i, 0, moved);
    setDragIdx(null);
    setOverIdx(null);
    onReorder(keys);
  };
  const hasAside = (c.gallery || []).length > 0 || !!c.profileImg || !!c.banner;
  useEffect(() => {
    if (c.banner) {
      loadImage(c.banner);
      requestFull(c.banner);
    }
  }, [c.banner]);
  const bannerSrc = c.banner ? fullCache[c.banner] || imgCache[c.banner] : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--ink)",
      zIndex: 50,
      overflowY: "auto"
    },
    className: "scrollbody sheet"
  }, /*#__PURE__*/React.createElement(CloseX, {
    onClose: onClose,
    fixed: true,
    label: "Close character"
  }), /*#__PURE__*/React.createElement("div", {
    className: "hero",
    style: {
      position: "relative",
      overflow: "hidden",
      borderBottom: "1px solid var(--line)"
    }
  }, bannerSrc ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: bannerSrc,
    alt: "",
    className: blurred[c.banner] ? "blur-img" : undefined,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(180deg, rgba(5,7,14,.82), rgba(5,7,14,.92) 96%)"
    }
  })) : profile && /*#__PURE__*/React.createElement("div", {
    className: "hero-back",
    style: {
      backgroundImage: "url(" + profile + ")"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: 2280,
      margin: "0 auto",
      padding: "36px 30px 32px",
      display: "flex",
      gap: 32,
      flexWrap: "wrap",
      alignItems: "flex-start" // portrait stays put while the memo grows the column beside it
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tile",
    style: {
      width: "clamp(220px, 22vw, 320px)",
      aspectRatio: "3/4",
      borderRadius: 18,
      overflow: "hidden",
      flexShrink: 0,
      border: "1px solid var(--line2)",
      background: "var(--placeholder)",
      boxShadow: "var(--shadow)",
      cursor: "default"
    }
  }, /*#__PURE__*/React.createElement(BlurBtn, {
    imgId: c.profileImg,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    label: "portrait"
  }), profile ? /*#__PURE__*/React.createElement("img", {
    src: profile,
    alt: c.name,
    className: blurred[c.profileImg] ? "blur-img" : undefined,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "serif",
    style: {
      fontSize: 64,
      color: "var(--brass-line)"
    }
  }, (c.name || "?").charAt(0).toUpperCase()))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 280,
      paddingBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Character"), /*#__PURE__*/React.createElement("h1", {
    className: "serif",
    style: {
      fontSize: "clamp(30px, 4.4vw, 52px)",
      margin: "4px 0 6px"
    }
  }, c.name || "Untitled"), F("tagline") && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: "var(--brass)",
      marginBottom: 12,
      fontWeight: 500
    }
  }, F("tagline")), variants.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      flexWrap: "wrap",
      marginBottom: 14,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: "var(--dim)",
      letterSpacing: ".14em",
      textTransform: "uppercase",
      fontWeight: 700
    }
  }, "Variant"), // a chip each past a handful buries the rest of the page, as in the editor
  variants.length > 5 ? /*#__PURE__*/React.createElement("select", {
    value: activeVar === null ? "" : activeVar,
    onChange: e => setActiveVar(e.target.value || null),
    "aria-label": "Variant being shown",
    style: {
      width: "auto",
      minWidth: 190,
      padding: "5px 8px",
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Default"), variants.map((v, i) => /*#__PURE__*/React.createElement("option", {
    key: v.id,
    value: v.id
  }, v.name || "Variant " + (i + 2)))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "chip" + (activeVar === null ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setActiveVar(null)
  }, "Default"), variants.map((v, i) => /*#__PURE__*/React.createElement("button", {
    key: v.id,
    className: "chip" + (activeVar === v.id ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setActiveVar(activeVar === v.id ? null : v.id)
  }, v.name || "Variant " + (i + 2))))), details.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      flexWrap: "wrap",
      marginBottom: 10,
      fontSize: 14,
      color: "var(--mut)"
    }
  }, details.map(([k, v]) => /*#__PURE__*/React.createElement("span", {
    key: k
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--dim)"
    }
  }, k, ":"), " ", v))), memo && /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--line)",
      background: "var(--panel)",
      borderRadius: 12,
      padding: "12px 14px",
      marginBottom: 16,
      /* 760 left the top of a wide screen looking half finished: the memo stopped
         short and nothing followed it, so the band it sits in read as empty. It
         still stops short of a very wide screen, because a memo is read like
         anything else, but it now uses what is actually there. */
      maxWidth: 1180
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "var(--dim)",
      letterSpacing: ".14em",
      textTransform: "uppercase",
      fontWeight: 700,
      marginBottom: 6
    }
  }, "Creator memo"), /*#__PURE__*/React.createElement("div", {
    className: "scrollbody",
    style: {
      fontSize: 13.5,
      color: "var(--mut)",
      lineHeight: 1.6,
      // a long memo scrolls inside its own box rather than pushing the page around
      maxHeight: MEMO_MAX_H,
      overflowY: "auto"
    }
    // through MDText like every other block: memos are written with headings,
    // bold and links, and rendering them raw was a regression when the memo
    // moved out of the prose column
  }, /*#__PURE__*/React.createElement(MDText, {
    text: memo
  }))),(c.tags || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 10
    }
  }, (tagsAll ? c.tags : c.tags.slice(0, CHIP_PREVIEW)).map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    className: "chip",
    style: {
      cursor: "pointer"
    },
    title: "Show everything tagged \u201c" + t + "\u201d",
    onClick: () => onTagClick && onTagClick(t)
  }, t)), c.tags.length > CHIP_PREVIEW && moreChip(c.tags.length - CHIP_PREVIEW, () => setTagsAll(v => !v), tagsAll ? "Show fewer" : null)), (c.searchables || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 12,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: "var(--dim)",
      letterSpacing: ".14em",
      textTransform: "uppercase",
      fontWeight: 700
    },
    title: "Extra words this character can be found by, here and on CharSnap"
  }, "Searchable"), (termsAll ? c.searchables : c.searchables.slice(0, CHIP_PREVIEW)).map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      fontSize: 11.5,
      padding: "3px 9px",
      borderRadius: 99,
      color: "var(--mut)",
      border: "1px solid var(--line2)"
    }
  }, t)), c.searchables.length > CHIP_PREVIEW && moreChip(c.searchables.length - CHIP_PREVIEW, () => setTermsAll(v => !v), termsAll ? "Show fewer" : null)), (c.lorebooks || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      flexWrap: "wrap",
      marginBottom: 16,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: "var(--dim)",
      letterSpacing: ".14em",
      textTransform: "uppercase",
      fontWeight: 700
    }
  }, "Lorebooks"), c.lorebooks.map(w => /*#__PURE__*/React.createElement("button", {
    key: w,
    className: "chip",
    style: {
      cursor: "pointer",
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    },
    onClick: () => onOpenLorebook(w),
    "aria-label": "Open lorebook " + w
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.lore,
    size: 12
  }), w))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: onEdit
  }, "Edit character"), visGallery.length > 1 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    onClick: () => setSs(true)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.play,
    size: 13
  }), " Slideshow")), hasAside && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setGrid(true)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.expand,
    size: 13
  }), " Grid")), ((c.gallery || []).length > 0 || c.profileImg) && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onDownloadImages
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.down,
    size: 13
  }), " Download images")), /*#__PURE__*/React.createElement(FilesMenu, {
    label: "Export",
    title: c.name || "This character",
    note: "These export the version you are looking at — " + (av ? av.name || "Variant" : "Default") + ". Switch versions on the page behind to export a different one.",
    groups: [{
      heading: "Send out",
      items: [{
        label: "Export JSON",
        hint: "This app’s own format, pictures included. Import it back here or on another machine.",
        onClick: () => onExportJson(activeVar)
      }, onExportText && {
        label: "Export text only",
        hint: "Just the writing — small enough to read or paste elsewhere.",
        onClick: () => onExportText(activeVar)
      }, {
        label: "Export for CharSnap",
        hint: refuses(csGaps) + charSnapWhole + " Readers on CharSnap can see the backstory and personality.",
        onClick: () => onExportCharSnap(activeVar)
      }, {
        label: "Export for CharSnap, guts hidden",
        hint: refuses(csGaps) + charSnapWhole + " " + hiddenWhy,
        onClick: () => onExportCharSnap(activeVar, true)
      }, onExportCharSnapVariant && {
        label: "Export as a CharSnap variant file",
        hint: refuses(csVariantGaps) + charSnapVariantWhy,
        onClick: () => onExportCharSnapVariant(activeVar)
      }, onExportCharSnapVariant && {
        label: "Export as a CharSnap variant file, guts hidden",
        hint: refuses(csVariantGaps) + charSnapVariantWhy + " " + hiddenWhy,
        onClick: () => onExportCharSnapVariant(activeVar, true)
      }, variants.length > 0 && {
        label: "Export every version for CharSnap",
        hint: everyVersionWhy,
        onClick: () => onExportCharSnap("all")
      }, variants.length > 0 && {
        label: "Export every version for CharSnap, guts hidden",
        hint: everyVersionWhy + " " + hiddenWhy,
        onClick: () => onExportCharSnap("all", true)
      }]
    }]
  }), (c.sectionOrder || []).length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    title: "Put the sections back in their original order",
    onClick: () => onReorder(null)
  }, "Reset layout"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    // measured for the version on screen: only one is ever in play at a time
    onClick: () => onStats(activeVar),
    title: "Words, pictures and what this version costs in tokens"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.chart,
    size: 13
  }), " Stats")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 2280,
      margin: "0 auto",
      padding: "28px 30px 80px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: hasAside ? "cpage-grid" : undefined
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minWidth: 0,
      ...(hasAside ? {} : {
        maxWidth: 1180,
        margin: "0 auto",
        width: "100%"
      })
    }
  }, prose.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 30,
      color: "var(--dim)",
      fontSize: 14
    }
  }, "Nothing written yet — hit \"Edit character\" to add a story, personality and custom sections."), prose.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.key,
    className: "card" + (overIdx === i && dragIdx !== null && dragIdx !== i ? " drag-over" : "") + (dragIdx === i ? " dragging" : ""),
    style: {
      padding: "18px 22px"
    },
    onDragOver: e => {
      if (dragIdx === null) return;
      e.preventDefault();
      if (overIdx !== i) setOverIdx(i);
    },
    onDragLeave: () => {
      if (overIdx === i) setOverIdx(null);
    },
    onDrop: e => {
      e.preventDefault();
      dropTo(i);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-head",
    onClick: () => toggleCollapse(s.key),
    role: "button",
    tabIndex: 0,
    "aria-expanded": !collapsed[s.key],
    onKeyDown: e => e.key === "Enter" && toggleCollapse(s.key)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: collapsed[s.key] ? icons.right : icons.cdown,
    size: 14
  }), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginRight: "auto"
    }
  }, s.title), prose.length > 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "draghandle",
    draggable: true,
    "aria-label": "Drag to move " + s.title,
    onClick: e => e.stopPropagation(),
    onDragStart: e => {
      setDragIdx(i);
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", s.key);
      } catch (err) {}
    },
    onDragEnd: () => {
      setDragIdx(null);
      setOverIdx(null);
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.grip,
    size: 15
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    "aria-label": "Move " + s.title + " up",
    disabled: i === 0,
    onClick: e => {
      e.stopPropagation();
      moveBlock(i, -1);
    },
    style: {
      padding: "4px 8px",
      opacity: i === 0 ? .35 : 1
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.cup,
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    "aria-label": "Move " + s.title + " down",
    disabled: i === prose.length - 1,
    onClick: e => {
      e.stopPropagation();
      moveBlock(i, 1);
    },
    style: {
      padding: "4px 8px",
      opacity: i === prose.length - 1 ? .35 : 1
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.cdown,
    size: 14
  })))), !collapsed[s.key] && /*#__PURE__*/React.createElement(MDText, {
    text: s.body,
    style: {
      fontSize: "var(--prose-size, 14.5px)",
      lineHeight: 1.75,
      color: "var(--text)",
      maxWidth: 860,
      marginTop: 10
    }
  })))), hasAside && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      margin: "2px 0 12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Gallery · ", (c.gallery || []).length), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: "5px 10px",
      fontSize: 12
    },
    onClick: () => setGrid(true)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.expand,
    size: 12
  }), " Grid view"))), /*#__PURE__*/React.createElement("div", {
    className: "cpage-aside",
    style: {
      position: undefined
    }
  }, visGallery.map(({ g, oi: i }, vi) => /*#__PURE__*/React.createElement("button", {
    key: g.imgId,
    className: "tile" + (vi === 0 ? " full" : "") + (railOver === i && railDrag !== null && railDrag !== i ? " drag-over" : "") + (railDrag === i ? " dragging" : ""),
    draggable: true,
    onDragStart: e => {
      setRailDrag(i);
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", g.imgId);
      } catch (err) {}
    },
    onDragEnd: () => {
      setRailDrag(null);
      setRailOver(null);
    },
    onDragOver: e => {
      if (railDrag === null) return;
      e.preventDefault();
      if (railOver !== i) setRailOver(i);
    },
    onDragLeave: () => {
      if (railOver === i) setRailOver(null);
    },
    onDrop: e => {
      e.preventDefault();
      if (railDrag !== null && railDrag !== i) {
        const next = (c.gallery || []).slice();
        const [m] = next.splice(railDrag, 1);
        next.splice(i, 0, m);
        onReorderImages(next);
      }
      setRailDrag(null);
      setRailOver(null);
    },
    onClick: () => setLb({
      index: vi
    }),
    "aria-label": "Open " + (g.caption || "image " + (i + 1)),
    title: "Open this picture full screen · drag to reorder"
  }, /*#__PURE__*/React.createElement(BlurBtn, {
    imgId: g.imgId,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    label: "image " + (i + 1)
  }), picOf(fullCache, imgCache, g.imgId) ? /*#__PURE__*/React.createElement("img", {
    src: picOf(fullCache, imgCache, g.imgId),
    className: blurred[g.imgId] ? "blur-img" : undefined,
    alt: g.caption || "gallery image " + (i + 1)
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%"
    }
  }), g.caption && /*#__PURE__*/React.createElement("span", {
    className: "tlab"
  }, g.caption))))))), grid && /*#__PURE__*/React.createElement(ImageGridView, {
    title: c.name || "Untitled",
    items: gridItems,
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    onSetProfile: onSetProfile,
    onDeleteSelected: onDeleteImages,
    onSetAlbum: onSetAlbum,
    onCreateAlbum: onCreateAlbum,
    onDeleteAlbum: onDeleteAlbum,
    albums: c.albums || [],
    variantOptions: (c.variants || []).map(v => ({ id: v.id, name: v.name || "Variant" })),
    onSetVariant: onSetVariant,
    onRename: (imgId, text) => {
      const idx = (c.gallery || []).findIndex(g => g.imgId === imgId);
      if (idx >= 0) onCaption(idx, text);
    },
    onMoveImage: (fromId, toId) => {
      const from = (c.gallery || []).findIndex(g => g.imgId === fromId),
        to = (c.gallery || []).findIndex(g => g.imgId === toId);
      if (from < 0 || to < 0) return;
      const next = (c.gallery || []).slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      onReorderImages(next);
    },
    onDownloadSelected: onDownloadSelected,
    onClose: () => setGrid(false),
    toast: toast
  }), ss && /*#__PURE__*/React.createElement(SlideshowMode, {
    items: visGallery.map(x => x.g),
    charName: c.name + (av ? " \u00b7 " + (av.name || "variant") : ""),
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onClose: () => setSs(false)
  }), lb !== null && /*#__PURE__*/React.createElement(Lightbox, {
    items: visGallery.map(x => x.g),
    index: lb.index,
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    autoPlay: lb.autoPlay,
    onClose: () => setLb(null),
    onNav: d => setLb(p => {
      const len = visGallery.length;
      if (!p || len <= 0) return null;
      return {
        ...p,
        index: (p.index + d + len) % len
      };
    }),
    onSetProfile: imgId => {
      onSetProfile(imgId, activeVar);
      toast("Profile image updated");
    },
    onCaption: (i, text) => {
      const oi = visGallery[i] && visGallery[i].oi;
      if (oi != null) onCaption(oi, text);
    },
    onRemove: onDeleteImages ? i => {
      const removedId = visGallery[i] && visGallery[i].g && visGallery[i].g.imgId;
      onDeleteImages(removedId ? [removedId] : []);
      setLb(p => {
        const remaining = visGallery.length - 1;
        if (remaining <= 0) return null;
        return {
          ...p,
          index: Math.min(p.index, remaining - 1)
        };
      });
    } : undefined
  }));
}

/* ---------- persona page (view mode) ---------- */
function PersonaPage({
  persona: p,
  onExportJson,
  onExportText,
  imgCache,
  fullCache,
  loadImage,
  requestFull,
  warmFull,
  blurred,
  onToggleBlur,
  escOff,
  onEdit,
  onClose,
  onSetAvatar,
  onCaption,
  onAddImages,
  onDeleteImages,
  onSetAlbum,
  onCreateAlbum,
  onDeleteAlbum,
  onReorder,
  onReorderImages,
  onDownloadImages,
  onDownloadSelected,
  onStats,
  onOpenLorebook,
  toast
}) {
  const [lb, setLb] = useState(null);
  const [ss, setSs] = useState(false);
  const [grid, setGrid] = useState(false);
  const blocks = [{
    key: "description",
    title: "Description",
    body: p.description
  }, ...(p.sections || []).map(s => ({
    key: "sec:" + s.id,
    title: s.title || "Untitled section",
    body: s.content
  }))].filter(x => x.body);
  const savedOrder = p.sectionOrder || [];
  const prose = [...blocks].sort((a, b) => {
    const ia = savedOrder.indexOf(a.key),
      ib = savedOrder.indexOf(b.key);
    return (ia < 0 ? blocks.indexOf(a) + 1000 : ia) - (ib < 0 ? blocks.indexOf(b) + 1000 : ib);
  });
  const moveBlock = (i, d) => {
    const keys = prose.map(b => b.key);
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const t = keys[i];
    keys[i] = keys[j];
    keys[j] = t;
    onReorder(keys);
  };
  const [collapsed, setCollapsed] = useState({});
  const toggleCollapse = key => setCollapsed(prev => ({
    ...prev,
    [key]: !prev[key]
  }));
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const dropTo = i => {
    if (dragIdx === null || dragIdx === i) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const keys = prose.map(b => b.key);
    const [moved] = keys.splice(dragIdx, 1);
    keys.splice(i, 0, moved);
    setDragIdx(null);
    setOverIdx(null);
    onReorder(keys);
  };
  const addRef = useRef(null);
  const gallery = p.gallery || [];
  const [railDrag, setRailDrag] = useState(null);
  const [railOver, setRailOver] = useState(null);
  const gridItems = (() => {
    const seen = new Set();
    const out = [];
    const push = (imgId, label, extra) => {
      if (!imgId || seen.has(imgId)) return;
      seen.add(imgId);
      out.push({
        imgId,
        label,
        ...(extra || {})
      });
    };
    push(p.avatar, "Portrait");
    gallery.forEach((g, i) => push(g.imgId, g.caption || "Image " + (i + 1), {
      renamable: true,
      movable: true,
      caption: g.caption || "",
      album: g.album || ""
    }));
    return out;
  })();
  const warmKey = personaImgIds(p).join("\n");
  useEffect(() => {
    const ids = warmKey ? warmKey.split("\n") : [];
    ids.forEach(id => loadImage(id));
    return warmFull(ids);
  }, [warmKey, loadImage, warmFull]);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape" && lb === null && !ss && !grid && !escOff) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, lb, ss, grid, escOff]);
  const portrait = p.avatar ? fullCache[p.avatar] || imgCache[p.avatar] : null;
  /* Every word of a persona is sent with every message, so there is no
     temporary half to report here. */
  const pBudget = personaBudget(p);
  const details = [["Role", p.role], ["Pronouns", p.pronouns], ["Tokens", "~" + fmtNum(pBudget.permanent.total) + " permanent"]].filter(x => x[1]);
  const pTagline = p.tagline || "";
  const pBooks = p.lorebooks || [];
  const hasAside = gallery.length > 0 || !!p.avatar;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--ink)",
      zIndex: 50,
      overflowY: "auto"
    },
    className: "scrollbody sheet"
  }, /*#__PURE__*/React.createElement(CloseX, {
    onClose: onClose,
    fixed: true,
    label: "Close persona"
  }), /*#__PURE__*/React.createElement("div", {
    className: "hero",
    style: {
      position: "relative",
      overflow: "hidden",
      borderBottom: "1px solid var(--line)"
    }
  }, portrait && /*#__PURE__*/React.createElement("div", {
    className: "hero-back",
    style: {
      backgroundImage: "url(" + portrait + ")"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: 2280,
      margin: "0 auto",
      padding: "36px 30px 32px",
      display: "flex",
      gap: 32,
      flexWrap: "wrap",
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tile",
    style: {
      width: "clamp(220px, 22vw, 320px)",
      aspectRatio: "3/4",
      borderRadius: 18,
      overflow: "hidden",
      flexShrink: 0,
      border: "1px solid var(--line2)",
      background: "var(--placeholder)",
      boxShadow: "var(--shadow)",
      cursor: "default"
    }
  }, /*#__PURE__*/React.createElement(BlurBtn, {
    imgId: p.avatar,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    label: "portrait"
  }), portrait ? /*#__PURE__*/React.createElement("img", {
    src: portrait,
    alt: p.name,
    className: blurred[p.avatar] ? "blur-img" : undefined,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "serif",
    style: {
      fontSize: 64,
      color: "var(--brass-line)"
    }
  }, (p.name || "?").charAt(0).toUpperCase()))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 280,
      paddingBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Persona"), /*#__PURE__*/React.createElement("h1", {
    className: "serif",
    style: {
      fontSize: "clamp(30px, 4.4vw, 52px)",
      margin: "4px 0 " + (pTagline ? "2px" : "12px")
    }
  }, p.name || "Untitled"), pTagline && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14.5,
      color: "var(--brass)",
      margin: "0 0 12px"
    }
  }, pTagline), pBooks.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      marginRight: 2
    }
  }, "Lorebooks"), pBooks.map(w => /*#__PURE__*/React.createElement("button", {
    key: w,
    className: "chip",
    style: {
      cursor: "pointer",
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    },
    title: "Open \u201c" + w + "\u201d",
    onClick: () => onOpenLorebook && onOpenLorebook(w)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.lore,
    size: 11
  }), w))), details.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 16,
      flexWrap: "wrap",
      marginBottom: 16,
      fontSize: 14,
      color: "var(--mut)"
    }
  }, details.map(([k, v]) => /*#__PURE__*/React.createElement("span", {
    key: k
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--dim)"
    }
  }, k, ":"), " ", v))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: onEdit
  }, "Edit persona"), (p.sectionOrder || []).length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    title: "Put the sections back in their original order",
    onClick: () => onReorder(null)
  }, "Reset layout"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    onClick: () => addRef.current.click()
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.plus,
    size: 13
  }), " Add images")), gallery.length > 1 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    onClick: () => setSs(true)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.play,
    size: 13
  }), " Slideshow")), hasAside && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setGrid(true)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.expand,
    size: 13
  }), " Grid")), (gallery.length > 0 || p.avatar) && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onDownloadImages
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.down,
    size: 13
  }), " Download images")), /*#__PURE__*/React.createElement(FilesMenu, {
    label: "Export",
    title: p.name || "This persona",
    note: "Export JSON keeps this persona’s pictures; the text export does not.",
    groups: [{
      heading: "Send out",
      items: [onExportJson && {
        label: "Export JSON",
        hint: "This app’s own format, pictures included. Import it back here or on another machine.",
        onClick: onExportJson
      }, onExportText && {
        label: "Export text only",
        hint: "Just the writing — small enough to read or paste elsewhere.",
        onClick: onExportText
      }]
    }]
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onStats
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.chart,
    size: 13
  }), " Stats"))), /*#__PURE__*/React.createElement("input", {
    ref: addRef,
    type: "file",
    accept: "image/*",
    multiple: true,
    hidden: true,
    onChange: e => {
      if (e.target.files && e.target.files.length) onAddImages(e.target.files);
      e.target.value = "";
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 2280,
      margin: "0 auto",
      padding: "28px 30px 80px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: hasAside ? "cpage-grid" : undefined
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      minWidth: 0,
      ...(hasAside ? {} : {
        maxWidth: 1180,
        margin: "0 auto",
        width: "100%"
      })
    }
  }, prose.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 30,
      color: "var(--dim)",
      fontSize: 14
    }
  }, "Nothing written yet — hit \"Edit persona\" to add a description and sections."), prose.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.key,
    className: "card" + (overIdx === i && dragIdx !== null && dragIdx !== i ? " drag-over" : "") + (dragIdx === i ? " dragging" : ""),
    style: {
      padding: "18px 22px"
    },
    onDragOver: e => {
      if (dragIdx === null) return;
      e.preventDefault();
      if (overIdx !== i) setOverIdx(i);
    },
    onDragLeave: () => {
      if (overIdx === i) setOverIdx(null);
    },
    onDrop: e => {
      e.preventDefault();
      dropTo(i);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-head",
    onClick: () => toggleCollapse(s.key),
    role: "button",
    tabIndex: 0,
    "aria-expanded": !collapsed[s.key],
    onKeyDown: e => e.key === "Enter" && toggleCollapse(s.key)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: collapsed[s.key] ? icons.right : icons.cdown,
    size: 14
  }), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginRight: "auto"
    }
  }, s.title), prose.length > 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "draghandle",
    draggable: true,
    "aria-label": "Drag to move " + s.title,
    onClick: e => e.stopPropagation(),
    onDragStart: e => {
      setDragIdx(i);
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", s.key);
      } catch (err) {}
    },
    onDragEnd: () => {
      setDragIdx(null);
      setOverIdx(null);
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.grip,
    size: 15
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    "aria-label": "Move " + s.title + " up",
    disabled: i === 0,
    onClick: e => {
      e.stopPropagation();
      moveBlock(i, -1);
    },
    style: {
      padding: "4px 8px",
      opacity: i === 0 ? .35 : 1
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.cup,
    size: 14
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    "aria-label": "Move " + s.title + " down",
    disabled: i === prose.length - 1,
    onClick: e => {
      e.stopPropagation();
      moveBlock(i, 1);
    },
    style: {
      padding: "4px 8px",
      opacity: i === prose.length - 1 ? .35 : 1
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.cdown,
    size: 14
  })))), !collapsed[s.key] && /*#__PURE__*/React.createElement(MDText, {
    text: s.body,
    style: {
      fontSize: "var(--prose-size, 14.5px)",
      lineHeight: 1.75,
      color: "var(--text)",
      maxWidth: 860,
      marginTop: 10
    }
  })))), hasAside && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      margin: "2px 0 12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Gallery · ", gallery.length), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: "5px 10px",
      fontSize: 12
    },
    onClick: () => setGrid(true)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.expand,
    size: 12
  }), " Grid view"))), /*#__PURE__*/React.createElement("div", {
    className: "cpage-aside",
    style: {
      position: undefined
    }
  }, gallery.map((g, i) => /*#__PURE__*/React.createElement("button", {
    key: g.imgId,
    className: "tile" + (i === 0 ? " full" : "") + (railOver === i && railDrag !== null && railDrag !== i ? " drag-over" : "") + (railDrag === i ? " dragging" : ""),
    draggable: true,
    onDragStart: e => {
      setRailDrag(i);
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", g.imgId);
      } catch (err) {}
    },
    onDragEnd: () => {
      setRailDrag(null);
      setRailOver(null);
    },
    onDragOver: e => {
      if (railDrag === null) return;
      e.preventDefault();
      if (railOver !== i) setRailOver(i);
    },
    onDragLeave: () => {
      if (railOver === i) setRailOver(null);
    },
    onDrop: e => {
      e.preventDefault();
      if (railDrag !== null && railDrag !== i) {
        const next = gallery.slice();
        const [m] = next.splice(railDrag, 1);
        next.splice(i, 0, m);
        onReorderImages(next);
      }
      setRailDrag(null);
      setRailOver(null);
    },
    onClick: () => setLb(i),
    "aria-label": "Open " + (g.caption || "image " + (i + 1)),
    title: "Open this picture full screen · drag to reorder"
  }, /*#__PURE__*/React.createElement(BlurBtn, {
    imgId: g.imgId,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    label: "image " + (i + 1)
  }), picOf(fullCache, imgCache, g.imgId) ? /*#__PURE__*/React.createElement("img", {
    src: picOf(fullCache, imgCache, g.imgId),
    className: blurred[g.imgId] ? "blur-img" : undefined,
    alt: g.caption || "gallery image " + (i + 1)
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%"
    }
  }), g.caption && /*#__PURE__*/React.createElement("span", {
    className: "tlab"
  }, g.caption))))))), grid && /*#__PURE__*/React.createElement(ImageGridView, {
    title: p.name || "Untitled",
    items: gridItems,
    imgCache: imgCache,
    fullCache: fullCache,
    onDeleteSelected: onDeleteImages,
    onSetAlbum: onSetAlbum,
    onCreateAlbum: onCreateAlbum,
    onDeleteAlbum: onDeleteAlbum,
    albums: p.albums || [],
    onRename: (imgId, text) => {
      const idx = gallery.findIndex(g => g.imgId === imgId);
      if (idx >= 0) onCaption(idx, text);
    },
    onMoveImage: (fromId, toId) => {
      const from = gallery.findIndex(g => g.imgId === fromId),
        to = gallery.findIndex(g => g.imgId === toId);
      if (from < 0 || to < 0) return;
      const next = gallery.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      onReorderImages(next);
    },
    requestFull: requestFull,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    onSetProfile: onSetAvatar,
    onDownloadSelected: onDownloadSelected,
    onClose: () => setGrid(false),
    toast: toast
  }), ss && /*#__PURE__*/React.createElement(SlideshowMode, {
    items: gallery,
    charName: p.name,
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onClose: () => setSs(false)
  }), lb !== null && /*#__PURE__*/React.createElement(Lightbox, {
    items: gallery,
    index: lb,
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    onClose: () => setLb(null),
    onNav: d => setLb(prev => {
      const len = gallery.length;
      if (len <= 0) return null;
      return (prev + d + len) % len;
    }),
    onSetProfile: imgId => {
      onSetAvatar(imgId);
      toast("Portrait updated");
    },
    onCaption: onCaption,
    onRemove: onDeleteImages ? i => {
      const removedId = gallery[i] && gallery[i].imgId;
      onDeleteImages(removedId ? [removedId] : []);
      setLb(prev => {
        const remaining = gallery.length - 1;
        if (remaining <= 0) return null;
        return Math.min(prev, remaining - 1);
      });
    } : undefined
  }));
}

/* ---------- update-from-JSON target picker ---------- */
function UpdateFromJsonModal({
  incoming,
  variants,
  currentVIdx,
  onApply,
  onClose
}) {
  const [choice, setChoice] = useState(currentVIdx >= 0 ? "variant" : "default");
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const filled = VARIANT_FIELDS.filter(k => (incoming[k] || "").trim()).length;
  const opt = (val, title, sub, disabled) => /*#__PURE__*/React.createElement("button", {
    key: val,
    className: "card",
    disabled: disabled,
    style: {
      textAlign: "left",
      padding: "12px 14px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? .45 : 1,
      border: choice === val ? "1px solid var(--brass)" : "1px solid var(--line)",
      boxShadow: choice === val ? "0 0 0 2px var(--brass-line)" : "none",
      background: "transparent",
      width: "100%",
      marginBottom: 8
    },
    onClick: () => !disabled && setChoice(val)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13.5
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--mut)",
      marginTop: 3,
      lineHeight: 1.5
    }
  }, sub));
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 76
    },
    onMouseDown: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      maxWidth: 520,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": "Update from JSON"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Update from JSON"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 23,
      margin: "2px 0 8px"
    }
  }, incoming.name || "Imported character"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.55,
      marginBottom: 12
    }
  }, "This file has ", filled, " written ", filled === 1 ? "field" : "fields", ". Choose where it goes \u2014 your portrait, banner and gallery are kept either way, and the current text is saved to version history first."), opt("default", "Update the Default variant", "Replaces the base written fields. Variants you\u2019ve made are left alone."), opt("variant", currentVIdx >= 0 ? "Update \u201c" + (variants[currentVIdx] && variants[currentVIdx].name || "this variant") + "\u201d" : "Update the selected variant", currentVIdx >= 0 ? "Replaces just this variant\u2019s fields." : "Pick a variant chip first to enable this.", currentVIdx < 0), opt("new", "Add as a new variant", "Keeps everything you have and files this JSON as an extra variant."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      justifyContent: "flex-end",
      marginTop: 6,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => onApply(choice)
  }, "Apply update"))));
}

/* ---------- version history ---------- */
function HistoryModal({
  history,
  onRestore,
  onClose
}) {
  const [confirmId, setConfirmId] = useState(null);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 76
    },
    onMouseDown: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      maxWidth: 560,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": "Version history"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Version history"), /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 23,
      margin: "2px 0 8px"
    }
  }, history.length, " saved ", history.length === 1 ? "version" : "versions"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.55,
      marginBottom: 12
    }
  }, "Restoring brings back the written content from that point. Your images are never changed by a restore."), history.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--dim)",
      padding: "10px 0"
    }
  }, "No earlier versions yet \u2014 they\u2019re saved automatically whenever you apply a JSON update or save changes.") : /*#__PURE__*/React.createElement("div", {
    className: "scrollbody",
    style: {
      maxHeight: 320,
      overflowY: "auto",
      paddingRight: 4
    }
  }, history.map(h => /*#__PURE__*/React.createElement("div", {
    key: h.id,
    style: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      padding: "10px 0",
      borderBottom: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13.5,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, h.fields && h.fields.name || "Untitled"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--dim)",
      marginTop: 2
    }
  }, h.label, " \u00b7 ", historyWhen(h.at), (h.variants || []).length ? " \u00b7 " + h.variants.length + " variant" + (h.variants.length === 1 ? "" : "s") : "")), /*#__PURE__*/React.createElement("button", {
    className: confirmId === h.id ? "btn btn-danger" : "btn btn-ghost",
    style: {
      flexShrink: 0
    },
    onClick: () => {
      if (confirmId === h.id) onRestore(h);else setConfirmId(h.id);
    }
  }, confirmId === h.id ? "Confirm restore" : "Restore")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Close"))));
}

/* ---------- character editor (full-screen) ---------- */
/* A variant used to share the Default's age, gender and pronouns with no way to
   differ, while the Sample JSON told you to write an age inside variants[] — a
   field the app then dropped on the floor. They are variant fields now, with the
   same rule as the rest: empty falls back to the Default. Tags, bucket, sections
   and the gallery stay shared. */
const VARIANT_FIELDS = ["tagline", "story", "personality", "scenario", "firstMessage", "exampleMessage", "creatorMemo", "systemPrompt", "alwaysActiveSystemPrompt", "age", "gender", "pronouns"];
const DEFAULT_VID = "__default__"; // image belongs to the Default variant only
/* version history: text only — images (profileImg/banner/gallery) are never captured or restored,
   so photos always survive an update or a rollback */
const VERSION_BASE_KEYS = ["name"].concat(VARIANT_FIELDS);
const HISTORY_LIMIT = 20;
function snapshotChar(c, label) {
  return {
    id: uid(),
    at: Date.now(),
    label: label || "Edit",
    fields: Object.fromEntries(VERSION_BASE_KEYS.map(k => [k, c[k] || ""])),
    tags: (c.tags || []).slice(),
    searchables: (c.searchables || []).slice(),
    bucket: c.bucket || "",
    nsfw: !!c.nsfw,
    nsfwPicture: !!c.nsfwPicture,
    lorebooks: (c.lorebooks || []).slice(),
    sections: (c.sections || []).map(s => ({
      id: s.id, // kept so a restore can still resolve sectionOrder's "sec:<id>" keys
      title: s.title || "",
      content: s.content || ""
    })),
    sectionOrder: c.sectionOrder || null,
    variants: (c.variants || []).map(v => Object.assign({
      id: v.id,
      name: v.name || ""
    }, Object.fromEntries(VARIANT_FIELDS.map(k => [k, v[k] || ""]))))
  };
}
function pushHistory(c, label) {
  const snap = snapshotChar(c, label);
  const prev = Array.isArray(c.history) ? c.history : [];
  return [snap].concat(prev).slice(0, HISTORY_LIMIT);
}
function applySnapshot(c, snap) {
  // restores written content only; profileImg, banner and gallery are deliberately left as they are
  const snapSections = snap.sections || [];
  /* sectionOrder addresses sections as "sec:<id>". Restoring used to mint fresh ids
     while copying sectionOrder through untouched, so every key was stale on arrival
     and custom sections silently sank to the bottom of the reading order. Reuse the
     recorded ids so the order still resolves. Snapshots taken before ids were stored
     cannot be reconciled at all, so their order is dropped — falling back to the
     default beats an order that points at nothing. */
  const haveIds = snapSections.every(s => s && s.id);
  const sections = snapSections.map(s => ({
    id: haveIds ? s.id : uid(),
    title: s.title || "",
    content: s.content || ""
  }));
  const live = new Set(sections.map(s => "sec:" + s.id));
  const isSectionKey = k => String(k).indexOf("sec:") === 0;
  // also drops keys for sections deleted after the order was last set
  const order = haveIds && Array.isArray(snap.sectionOrder)
    ? snap.sectionOrder.filter(k => !isSectionKey(k) || live.has(k))
    : null;
  return Object.assign({}, c, snap.fields, {
    tags: (snap.tags || []).slice(),
    searchables: (snap.searchables || []).slice(),
    bucket: snap.bucket || "",
    nsfw: !!snap.nsfw,
    nsfwPicture: !!snap.nsfwPicture,
    lorebooks: (snap.lorebooks || []).slice(),
    sections,
    sectionOrder: order && order.length ? order : null,
    /* A snapshot holds a variant's words and nothing else — VARIANT_FIELDS has no
       profileImg — so writing the snapshot's variants straight back used to erase
       every variant portrait. Restoring some old wording is not meant to cost you
       the artwork, and the JSON update path beside this one already gets it right.
       The snapshot is laid over the variant that is still there, so its text wins
       and everything else the variant carries is left alone. */
    variants: (snap.variants || []).map(v => {
      const liveV = v.id && (c.variants || []).find(x => x.id === v.id);
      return Object.assign({}, liveV || {}, v, {
        id: v.id || uid()
      });
    })
  });
}
function historyWhen(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return "";
  }
}
function CharacterEditor({
  initial,
  imgCache,
  fullCache,
  requestFull,
  loadImage,
  saveImage,
  dropImage,
  blurred,
  onToggleBlur,
  buckets,
  loreBooks,
  allTags,
  onSave,
  onDelete,
  onClose,
  toast
}) {
  const [c, setC] = useState({
    variants: [],
    ...initial
  });
  const [lightbox, setLightbox] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const cRef = useRef(null);
  cRef.current = c;
  const [confirmVar, setConfirmVar] = useState(false); // deleting a variant asks twice
  /* Cancel threw away everything typed without a word. The persona, lore and
     prompt editor has guarded against this for a while; the character editor —
     the screen people write the most in — never did, and Cancel sits right
     beside Save. Compared against what was opened, so undoing an edit by hand
     counts as unchanged and closes without nagging. */
  const [confirmLeave, setConfirmLeave] = useState(false);
  /* Compared against the state as the editor first built it, not against the
     record it was handed: the editor fills in a missing variants list on open,
     which reorders the keys and made an untouched character look edited. */
  const openedAs = useRef(null);
  if (openedAs.current === null) openedAs.current = JSON.stringify(c);
  const editorDirty = () => JSON.stringify(c) !== openedAs.current;
  const tryClose = () => {
    if (editorDirty()) setConfirmLeave(true);else onClose();
  };
  const [advOpen, setAdvOpenRaw] = useState(false);
  useEffect(() => {
    sGet("ui:advopen").then(v => {
      if (v === "1") setAdvOpenRaw(true);
    }).catch(() => {});
  }, []);
  const setAdvOpen = updater => setAdvOpenRaw(prev => {
    const next = typeof updater === "function" ? updater(prev) : updater;
    sSet("ui:advopen", next ? "1" : "0").catch(() => {}); // cosmetic; not worth a banner
    return next;
  });
  const [vIdx, setVIdx] = useState(-1); // -1 = Default (base fields), otherwise index into c.variants
  // an armed delete must not follow you to another variant
  useEffect(() => {
    setConfirmVar(false);
  }, [vIdx]);
  const [jsonIncoming, setJsonIncoming] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const jsonRef = useRef(null);
  const profileRef = useRef(null);
  const galleryRef = useRef(null);
  const bannerRef = useRef(null);
  const set = (k, v) => setC(p => ({
    ...p,
    [k]: v
  }));
  const variants = c.variants || [];
  const getF = k => vIdx < 0 ? c[k] || "" : (variants[vIdx] || {})[k] || "";
  /* What the field is worth when actually sent: a version that has left one
     blank is using the Default's words, and those cost the same. */
  const effF = k => vIdx < 0 ? c[k] || "" : (variants[vIdx] || {})[k] || c[k] || "";
  const inhF = k => vIdx >= 0 && !((variants[vIdx] || {})[k] || "").trim() && !!(c[k] || "").trim();
  const setF = (k, v) => {
    if (vIdx < 0) set(k, v);else set("variants", variants.map((x, j) => j === vIdx ? {
      ...x,
      [k]: v
    } : x));
  };
  const addVariant = () => {
    /* Named by the first number nothing else is using rather than by how many
       versions there are. Counting meant that deleting one and adding another
       handed out a name already taken, leaving two versions called the same
       thing — which then travelled to CharSnap as two identical variant names. */
    const taken = new Set(variants.map(v => (v.name || "").trim().toLowerCase()));
    let n = 2, name;
    do { name = "Variant " + n++; } while (taken.has(name.toLowerCase()));
    const nv = {
      id: uid(),
      name
    };
    set("variants", [...variants, nv]);
    setVIdx(variants.length);
    setAdvOpen(true);
  };
  /* Every other destructive button in the app asks twice; this one threw away a
     whole variant's writing on a single click. It also left the gallery images
     that were tagged to that variant pointing at something that no longer
     existed, which the viewer then treated as "shared by everyone" — so those
     pictures quietly reappeared on every other variant. Untag them instead, so
     being shared is a fact rather than a side effect of a dangling id. */
  const removeVariant = i => {
    const gone = variants[i];
    const orphan = gone && gone.profileImg;
    const stillUsed = orphan && (c.profileImg === orphan || c.banner === orphan
      || (c.gallery || []).some(g => g.imgId === orphan)
      || variants.some((v, j) => j !== i && v.profileImg === orphan));
    if (orphan && !stillUsed) dropImage(orphan);
    setC(p => ({
      ...p,
      variants: (p.variants || []).filter((_, j) => j !== i),
      gallery: (p.gallery || []).map(g => gone && g.variantId === gone.id ? { ...g, variantId: "" } : g),
      imgMeta: orphan && !stillUsed ? withoutImgMeta(p.imgMeta, new Set([orphan])) : p.imgMeta
    }));
    setVIdx(-1);
    setConfirmVar(false);
  };
  const copyFromDefault = () => {
    set("variants", variants.map((x, j) => j === vIdx ? {
      ...x,
      ...Object.fromEntries(VARIANT_FIELDS.map(k => [k, c[k] || ""]))
    } : x));
    toast("Copied content from Default");
  };
  const loadJsonUpdate = async files => {
    const f = files && files[0];
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      const results = normalizeCharacterImport(parsed);
      if (!results.length) {
        toast("No character found in that file. Accepts this app’s own character export, a CharSnap full-character or variant-only file, or a Tavern v1/v2 character card.");
        return;
      }
      setJsonIncoming(Object.assign({}, results[0].char, { __vname: results[0].variantName || "" }));
    } catch (e) {
      toast("Couldn't read that JSON file. Accepts this app’s own character export, a CharSnap full-character or variant-only file, or a Tavern v1/v2 character card.");
    }
  };
  const applyJsonUpdate = mode => {
    const inc = jsonIncoming;
    if (!inc) return;
    const history = pushHistory(c, mode === "default" ? "Before JSON update (Default)" : mode === "variant" ? "Before JSON update (variant)" : "Before adding variant from JSON");
    if (mode === "default") {
      const patch = {};
      VARIANT_FIELDS.forEach(k => {
        if ((inc[k] || "").trim()) patch[k] = inc[k];
      });
      if ((inc.name || "").trim()) patch.name = inc.name;
      /* The file is the source of truth for the lists it actually carries: they
         replace rather than merge. Union-ing tags meant one that had been removed
         upstream could never be got rid of here, and searchables were not applied
         at all, so a file full of them left the character's own list untouched —
         which read as the terms not importing. A file that carries neither leaves
         both alone. */
      if ((inc.tags || []).length) patch.tags = [...inc.tags];
      if ((inc.searchables || []).length) patch.searchables = [...inc.searchables];
      if ((inc.sections || []).length) patch.sections = inc.sections.map(s => ({
        id: uid(),
        title: s.title || "",
        content: s.content || ""
      }));
      setC(p => ({ ...p, ...patch, history, __historyPushed: true }));
      setVIdx(-1);
      toast("Default updated from JSON — tags and terms replaced, images kept");
    } else if (mode === "variant" && vIdx >= 0) {
      const nextVariants = variants.map((x, j) => {
        if (j !== vIdx) return x;
        const merged = { ...x };
        VARIANT_FIELDS.forEach(k => {
          if ((inc[k] || "").trim()) merged[k] = inc[k];
        });
        /* The file could never rename the variant: only VARIANT_FIELDS were
           applied and name was not one of them. A full-character file carries
           the character's own name, which is not a rename — so it is taken only
           when it differs, the same test used when adding a new variant. */
        const wanted = (inc.__vname || "").trim() || ((inc.name || "").trim() && inc.name !== c.name ? inc.name : "");
        if (wanted) merged.name = wanted;
        return merged;
      });
      /* Sections are shared across variants, so a file that carries them applies
         them whichever variant is selected. Updating a variant used to ignore
         them entirely, which read as sections never importing. */
      const vPatch = { variants: nextVariants, history, __historyPushed: true };
      if ((inc.sections || []).length) vPatch.sections = inc.sections.map(sec => ({
        id: uid(),
        title: sec.title || "",
        content: sec.content || ""
      }));
      setC(p => ({ ...p, ...vPatch }));
      toast(vPatch.sections ? "Variant updated from JSON — sections replaced, images kept" : "Variant updated from JSON — images kept");
    } else {
      const nv = Object.assign({
        id: uid(),
        name: (inc.__vname || "").trim() || ((inc.name || "").trim() && inc.name !== c.name ? inc.name : "Variant " + (variants.length + 2))
      }, Object.fromEntries(VARIANT_FIELDS.map(k => [k, inc[k] || ""])));
      setC(p => ({ ...p, variants: [...variants, nv], history, __historyPushed: true }));
      setVIdx(variants.length);
      setAdvOpen(true);
      toast("Added as a new variant — images kept");
    }
    setJsonIncoming(null);
  };
  const restoreVersion = snap => {
    const history = pushHistory(c, "Before restore");
    setC(p => Object.assign({}, applySnapshot(p, snap), { history, __historyPushed: true }));
    setVIdx(-1);
    setShowHistory(false);
    toast("Restored — images untouched");
  };
  useEffect(() => {
    if (c.profileImg) loadImage(c.profileImg);
    (c.gallery || []).forEach(g => loadImage(g.imgId));
  }, []);
  const uploadBanner = async files => {
    if (!files || !files[0]) return;
    /* Read and save reported the same way, and the old banner is only let go
       once the new one is safely written — losing the old one to a failed save
       would leave the character with no banner at all. */
    let orig;
    try {
      orig = await fileToDataUrl(files[0]);
    } catch (e) {
      toast("Couldn't read that image");
      return;
    }
    const thumb = await makeThumb(orig).catch(() => null);
    const imgId = uid();
    try {
      await saveImage(imgId, orig, thumb);
    } catch (e) {
      toast("Couldn't save that image — the vault may be out of room");
      return;
    }
    if (c.banner) {
      dropImage(c.banner);
      set("imgMeta", withoutImgMeta(c.imgMeta, new Set([c.banner])));
    }
    set("banner", imgId);
    toast("Banner updated");
  };
  const doSave = () => {
    // as in RecordModal: Save must see a tag typed but not yet entered
    const c = cRef.current;
    if (!c.name.trim()) {
      toast("Give your character a name first");
      return;
    }
    const before = snapshotChar(initial, "Before edit");
    const after = snapshotChar(c, "x");
    const changed = JSON.stringify(before.fields) !== JSON.stringify(after.fields) || JSON.stringify(before.sections) !== JSON.stringify(after.sections) || JSON.stringify(before.variants) !== JSON.stringify(after.variants) || JSON.stringify(before.tags) !== JSON.stringify(after.tags);
    const history = initial.createdAt && changed && !c.__historyPushed ? [before].concat(Array.isArray(c.history) ? c.history : []).slice(0, HISTORY_LIMIT) : c.history || [];
    const out = {
      ...c,
      history,
      updatedAt: Date.now(),
      createdAt: c.createdAt || Date.now()
    };
    delete out.__historyPushed;
    onSave(out);
  };
  const setPortraitFor = imgId => {
    if (vIdx >= 0 && variants[vIdx]) {
      set("variants", variants.map((x, j) => j === vIdx ? { ...x, profileImg: imgId } : x));
    } else {
      set("profileImg", imgId);
    }
  };
  const activeVariantName = vIdx >= 0 && variants[vIdx] ? variants[vIdx].name || "variant" : "Default";
  const editorPortraitId = vIdx >= 0 && variants[vIdx] ? variants[vIdx].profileImg || null : c.profileImg;
  const uploadProfile = async files => {
    if (!files || !files[0]) return;
    const orig = await fileToDataUrl(files[0]);
    const thumb = await makeThumb(orig).catch(() => null);
    const imgId = uid();
    await saveImage(imgId, orig, thumb);
    setPortraitFor(imgId);
    toast("Portrait set for \u201c" + activeVariantName + "\u201d");
  };
  const uploadGallery = async files => {
    if (!files) return;
    const added = [];
    for (const f of Array.from(files)) {
      const orig = await fileToDataUrl(f);
      const thumb = await makeThumb(orig).catch(() => null);
      const imgId = uid();
      await saveImage(imgId, orig, thumb);
      added.push({
        imgId,
        caption: "",
        variantId: vIdx >= 0 && variants[vIdx] ? variants[vIdx].id : DEFAULT_VID
      });
    }
    setC(p => ({
      ...p,
      gallery: [...(p.gallery || []), ...added]
    }));
    const vName = vIdx >= 0 && variants[vIdx] ? variants[vIdx].name || "variant" : "Default";
    toast(added.length + (added.length === 1 ? " image added to \u201c" : " images added to \u201c") + vName + "\u201d");
  };
  /* The gallery grid listed every picture in the character whichever version was
     selected, so editing a variant showed the Default’s pictures and vice versa
     — while the button above it promised new ones would go to this version only.
     Filtered with the same rule the character page uses. oi is carried through
     because the lightbox, captions and removal all address c.gallery by position. */
  const liveVid = id => id === DEFAULT_VID || variants.some(v => v.id === id);
  const activeVid = vIdx >= 0 && variants[vIdx] ? variants[vIdx].id : DEFAULT_VID;
  const shownGallery = (c.gallery || []).map((g, oi) => ({ g, oi })).filter(x => {
    const vid = (x.g.variantId || "").trim();
    if (!vid || !liveVid(vid)) return true; // untagged, or orphaned by a restore = shared
    return vid === activeVid;
  });
  const profileSrc = editorPortraitId ? imgCache[editorPortraitId] : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--ink)",
      zIndex: 50,
      overflowY: "auto"
    },
    className: "scrollbody sheet"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1080,
      margin: "0 auto",
      padding: "28px 24px 80px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 24,
      flexWrap: "wrap",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, initial.createdAt ? "Edit character" : "New character"), /*#__PURE__*/React.createElement("h1", {
    className: "serif",
    style: {
      fontSize: "clamp(23px, 2.8vw, 34px)",
      margin: "4px 0 0",
      fontWeight: 600
    }
  }, c.name || "Untitled character")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, initial.createdAt && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => {
      if (confirmDel) onDelete(c);else {
        setConfirmDel(true);
        setTimeout(() => setConfirmDel(false), 3500);
      }
    }
  }, confirmDel ? "Click again — it goes to the bin for 30 days" : "Delete"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: tryClose
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: doSave
  }, "Save character"))), confirmLeave && /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--brass-line)",
      background: "var(--brass-soft)",
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 4
    }
  }, "You have unsaved changes"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.55,
      marginBottom: 12
    }
  }, "Closing now throws away what you have written here."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => setConfirmLeave(false)
  }, "Keep editing"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Discard changes"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 20,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 18,
      width: 260,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginBottom: 10
    }
  }, "Portrait \u00b7 " + activeVariantName), /*#__PURE__*/React.createElement("button", {
    onClick: () => profileRef.current.click(),
    "aria-label": "Upload portrait for " + activeVariantName,
    style: {
      width: "100%",
      aspectRatio: "3/4",
      borderRadius: 12,
      overflow: "hidden",
      background: "rgba(8,12,26,.6)",
      border: "1px dashed var(--line2)",
      color: "var(--dim)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 0
    }
  }, profileSrc ? /*#__PURE__*/React.createElement("img", {
    src: profileSrc,
    alt: "portrait",
    className: blurred[editorPortraitId] ? "blur-img" : undefined,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Ic, {
    d: icons.img,
    size: 26
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      textAlign: "center",
      padding: "0 10px"
    }
  }, vIdx >= 0 ? "Add a portrait just for \u201c" + activeVariantName + "\u201d" : "Add portrait"))), /*#__PURE__*/React.createElement("input", {
    ref: profileRef,
    type: "file",
    accept: "image/*",
    hidden: true,
    onChange: e => uploadProfile(e.target.files)
  }), editorPortraitId && /*#__PURE__*/React.createElement(DangerButton, {
    className: "btn btn-ghost",
    style: {
      width: "100%",
      marginTop: 10
    },
    label: "Remove “" + activeVariantName + "” portrait",
    armedLabel: "Click again — this portrait is gone",
    onConfirm: () => setPortraitFor(null)
  }), vIdx >= 0 && !editorPortraitId && c.profileImg && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--dim)",
      marginTop: 8,
      lineHeight: 1.5
    }
  }, "No portrait of its own \u2014 this variant currently shows the Default portrait."), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      margin: "16px 0 8px"
    }
  }, "Banner"), /*#__PURE__*/React.createElement("button", {
    onClick: () => bannerRef.current.click(),
    "aria-label": "Upload banner",
    style: {
      width: "100%",
      aspectRatio: "16/6",
      borderRadius: 10,
      overflow: "hidden",
      background: "rgba(8,12,26,.6)",
      border: "1px dashed var(--line2)",
      color: "var(--dim)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      padding: 0
    }
  }, c.banner && imgCache[c.banner] ? /*#__PURE__*/React.createElement("img", {
    src: imgCache[c.banner],
    alt: "banner",
    className: blurred[c.banner] ? "blur-img" : undefined,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Ic, {
    d: icons.img,
    size: 18
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12
    }
  }, "Add page banner"))), /*#__PURE__*/React.createElement("input", {
    ref: bannerRef,
    type: "file",
    accept: "image/*",
    hidden: true,
    onChange: e => {
      uploadBanner(e.target.files);
      e.target.value = "";
    }
  }), c.banner && /*#__PURE__*/React.createElement(DangerButton, {
    className: "btn btn-ghost",
    style: {
      width: "100%",
      marginTop: 8,
      fontSize: 12.5,
      padding: "7px 10px"
    },
    label: "Remove banner",
    armedLabel: "Click again — the banner is gone",
    onConfirm: () => {
      dropImage(c.banner);
      setC(p => ({ ...p, banner: null, imgMeta: withoutImgMeta(p.imgMeta, new Set([c.banner])) }));
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 20,
      flex: 1,
      minWidth: 300
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginBottom: 12
    }
  }, "Core details"), /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Name"), /*#__PURE__*/React.createElement("input", {
    value: c.name,
    onChange: e => set("name", e.target.value),
    placeholder: "Character name",
    style: {
      fontSize: 17,
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "row",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Age"), /*#__PURE__*/React.createElement("input", {
    value: getF("age"),
    onChange: e => setF("age", e.target.value),
    placeholder: vIdx < 0 ? "24" : c.age || "24"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Gender"), /*#__PURE__*/React.createElement("input", {
    value: getF("gender"),
    onChange: e => setF("gender", e.target.value),
    placeholder: vIdx < 0 ? "Woman, man, nonbinary…" : c.gender || "Woman, man, nonbinary…"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Pronouns"), /*#__PURE__*/React.createElement("input", {
    value: getF("pronouns"),
    onChange: e => setF("pronouns", e.target.value),
    placeholder: vIdx < 0 ? "she/her, they/them…" : c.pronouns || "she/her, they/them…"
  }))), /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Tagline — short line shown under the name (like \"OC | The Maid\")"), /*#__PURE__*/React.createElement("input", {
    value: c.tagline || "",
    onChange: e => set("tagline", e.target.value),
    placeholder: "OC | The Woodland Elf",
    style: {
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Adult content — both of these travel to CharSnap"), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "flex-start",
      fontSize: 13,
      color: "var(--mut)",
      marginBottom: 8,
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    style: { marginTop: 2 },
    checked: !!c.nsfw,
    onChange: e => set("nsfw", e.target.checked)
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", { style: { color: "var(--text)" } }, "NSFW"), " — ", "the writing is adult. CharSnap asks for this on any bot that needs it.")), /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "flex-start",
      fontSize: 13,
      color: "var(--mut)",
      marginBottom: 8,
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    style: { marginTop: 2 },
    checked: !!c.nsfwPicture,
    onChange: e => set("nsfwPicture", e.target.checked)
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", { style: { color: "var(--text)" } }, "NSFW picture"), " — ", "blur the pictures on CharSnap. Their rule is that nudity is fine but must be blurred.")), /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Tags — filter and find characters by these"), /*#__PURE__*/React.createElement(TagInput, {
    tags: c.tags,
    onChange: t => set("tags", t),
    placeholder: "fantasy, villain, sci-fi…",
    // tags already in the vault first, then the rest of CharSnap's vocabulary
    suggestions: allTags.concat(CHARSNAP_TAGS.filter(t => !allTags.some(a => a.toLowerCase() === t.toLowerCase())))
  }), /*#__PURE__*/React.createElement("label", {
    className: "lbl",
    style: {
      marginTop: 14
    }
  }, "Searchable terms — other words people might look this character up by on CharSnap"), /*#__PURE__*/React.createElement(TagInput, {
    tags: c.searchables || [],
    onChange: t => set("searchables", t),
    placeholder: "nicknames, titles, the series they're from…",
    preserveCase: true
  }), /*#__PURE__*/React.createElement("label", {
    className: "lbl",
    style: {
      marginTop: 14
    }
  }, "Bucket — group characters into collections (like worlds or kingdoms)"), /*#__PURE__*/React.createElement("input", {
    value: c.bucket || "",
    onChange: e => set("bucket", e.target.value),
    list: "rcv-buckets",
    placeholder: "e.g. Aelyndor, Mórenthra, Villains…"
  }), /*#__PURE__*/React.createElement("datalist", {
    id: "rcv-buckets"
  }, (buckets || []).map(b => /*#__PURE__*/React.createElement("option", {
    key: b,
    value: b
  }))), /*#__PURE__*/React.createElement("label", {
    className: "lbl",
    style: {
      marginTop: 14
    }
  }, "Lorebooks — worlds this character uses (click to attach)"), /*#__PURE__*/React.createElement(ChipsPicker, {
    options: (loreBooks || []).map(b => ({
      value: b.name,
      label: b.name + " \u00b7 " + b.count
    })),
    value: c.lorebooks || [],
    onChange: v => set("lorebooks", v),
    emptyHint: "No lorebooks in your vault yet — create one on the Lorebooks page."
  }), (c.lorebooks || []).length > 3 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--brass)",
      marginTop: 8,
      lineHeight: 1.5
    }
    /* CharSnap: "Each bot can have up to three Lorebooks attached natively."
       The vault never capped this and nothing said the fourth would not travel. */
  }, "CharSnap attaches at most three lorebooks to a bot. You have ", (c.lorebooks || []).length, " here — keep them if you like, but only three will travel."))), /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: "16px 20px",
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginRight: 6
    }
  }, "Variant"), /* A chip each is fine for a handful and unusable for thirty — past
     that the strip becomes a wall that buries the rest of the row, so it turns
     into a single dropdown instead. */
  variants.length > 5 ? /*#__PURE__*/React.createElement("select", {
    value: String(vIdx),
    onChange: e => setVIdx(parseInt(e.target.value, 10)),
    "aria-label": "Variant being edited",
    style: {
      width: "auto",
      minWidth: 190,
      padding: "5px 8px",
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "-1"
  }, "Default"), variants.map((v, i) => /*#__PURE__*/React.createElement("option", {
    key: v.id,
    value: String(i)
  }, v.name || "Variant " + (i + 2)))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "chip" + (vIdx === -1 ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setVIdx(-1)
  }, "Default"), variants.map((v, i) => /*#__PURE__*/React.createElement("button", {
    key: v.id,
    className: "chip" + (vIdx === i ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setVIdx(i)
  }, v.name || "Variant " + (i + 2)))), variants.length > 4 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--dim)"
    },
    title: "CharSnap imports the first five variants and ignores the rest"
  }, variants.length + 1 + " variants · CharSnap takes 5"), /*#__PURE__*/React.createElement("button", {
    className: "chip",
    style: {
      cursor: "pointer",
      borderStyle: "dashed"
    },
    onClick: addVariant
  }, "+ Add variant"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: "4px 10px",
      fontSize: 12.5
    },
    title: "Accepts this app’s own character export, a CharSnap full-character or variant-only file, or a Tavern v1/v2 character card.",
    onClick: () => jsonRef.current && jsonRef.current.click()
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.up || icons.down,
    size: 12
  }), " Update from JSON")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: "4px 10px",
      fontSize: 12.5
    },
    title: "Downloads a blank file showing every field this accepts",
    onClick: () => downloadJSON(SAMPLE_CHARACTER_JSON, "rolecraft-character-template.json")
  }, "Sample JSON"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: "4px 10px",
      fontSize: 12.5
    },
    onClick: () => setShowHistory(true)
  }, "History", (c.history || []).length ? " (" + c.history.length + ")" : ""), /*#__PURE__*/React.createElement("input", {
    ref: jsonRef,
    type: "file",
    accept: ".json,application/json",
    hidden: true,
    onChange: e => {
      loadJsonUpdate(e.target.files);
      e.target.value = "";
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--dim)",
      marginLeft: "auto"
    }
  }, vIdx < 0 ? "Editing the default variant" : "Editing \u201c" + (variants[vIdx] && variants[vIdx].name || "variant") + "\u201d")), vIdx >= 0 && variants[vIdx] && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 14,
      flexWrap: "wrap",
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 200
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Variant name"), /*#__PURE__*/React.createElement("input", {
    value: variants[vIdx].name || "",
    onChange: e => setF("name", e.target.value),
    placeholder: "e.g. Goth, Royal, Modern AU"
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: copyFromDefault
  }, "Copy from Default"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => {
      if (!confirmVar) {
        setConfirmVar(true);
        return;
      }
      removeVariant(vIdx);
    }
  }, confirmVar ? "Click again — this variant's writing goes" : "Delete variant")), vIdx >= 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--mut)",
      marginTop: 10
    }
  }, "Variant fields left empty fall back to the Default variant on the character page — including age, gender and pronouns, so a variant can be its own person. Tags, bucket, sections and the gallery are shared across all variants.")), vIdx >= 0 && /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 20,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Variant tagline"), /*#__PURE__*/React.createElement("input", {
    value: getF("tagline"),
    onChange: e => setF("tagline", e.target.value),
    placeholder: "Shown under the name when this variant is active"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 20,
      flexWrap: "wrap",
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 20,
      flex: 1,
      minWidth: 300
    }
  }, /*#__PURE__*/React.createElement("div", {
  }, /*#__PURE__*/React.createElement(FieldMeter, {
    label: "Backstory",
    text: effF("story"),
    kind: "permanent",
    inherited: inhF("story")
  })), /*#__PURE__*/React.createElement("textarea", {
    rows: 9,
    value: getF("story"),
    onChange: e => setF("story", e.target.value),
    placeholder: "History, secrets, important events, relationships, and where they come from"
  })), /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 20,
      flex: 1,
      minWidth: 300
    }
  }, /*#__PURE__*/React.createElement("div", {
  }, /*#__PURE__*/React.createElement(FieldMeter, {
    label: "Personality",
    text: effF("personality"),
    kind: "permanent",
    inherited: inhF("personality")
  })), /*#__PURE__*/React.createElement("textarea", {
    rows: 9,
    value: getF("personality"),
    onChange: e => setF("personality", e.target.value),
    placeholder: "Traits, habits, fears, flaws, strengths, speech style, and roleplay behavior"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 20,
      flexWrap: "wrap",
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 20,
      flex: 1,
      minWidth: 300
    }
  }, /*#__PURE__*/React.createElement("div", {
  }, /*#__PURE__*/React.createElement(FieldMeter, {
    label: "Scenario",
    text: effF("scenario"),
    kind: "temporary",
    inherited: inhF("scenario")
  })), /*#__PURE__*/React.createElement("textarea", {
    rows: 6,
    value: getF("scenario"),
    onChange: e => setF("scenario", e.target.value),
    placeholder: "The situation the roleplay starts in — where, when, and what's happening"
  })), /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 20,
      flex: 1,
      minWidth: 300
    }
  }, /*#__PURE__*/React.createElement("div", {
  }, /*#__PURE__*/React.createElement(FieldMeter, {
    label: "First message",
    text: effF("firstMessage"),
    kind: "temporary",
    inherited: inhF("firstMessage")
  })), /*#__PURE__*/React.createElement("textarea", {
    rows: 6,
    value: getF("firstMessage"),
    onChange: e => setF("firstMessage", e.target.value),
    placeholder: "The opening message the character sends — sets tone, formatting and writing style"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: "16px 20px",
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sec-head",
    onClick: () => setAdvOpen(o => !o),
    role: "button",
    tabIndex: 0,
    "aria-expanded": advOpen,
    onKeyDown: e => e.key === "Enter" && setAdvOpen(o => !o)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: advOpen ? icons.cdown : icons.right,
    size: 14
  }), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Advanced settings"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--dim)",
      marginLeft: "auto"
    }
  }, "Example messages · creator memo · system prompts")), advOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Example messages — how the character should respond; use ", "{{user}}", " and ", "{{char}}"), /*#__PURE__*/React.createElement("textarea", {
    rows: 6,
    value: getF("exampleMessage"),
    onChange: e => setF("exampleMessage", e.target.value),
    placeholder: "Example exchanges the AI treats as a style reference",
    style: {
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement(FieldMeter, {
    as: "lbl",
    label: "Creator memo",
    text: effF("creatorMemo"),
    kind: "unsent",
    inherited: inhF("creatorMemo")
  }), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: getF("creatorMemo"),
    onChange: e => setF("creatorMemo", e.target.value),
    placeholder: "What to expect, content warnings, tips for the best experience",
    style: {
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(FieldMeter, {
    as: "lbl",
    label: "System prompt",
    text: effF("systemPrompt"),
    kind: "permanent",
    inherited: inhF("systemPrompt")
  }), /*#__PURE__*/React.createElement("textarea", {
    rows: 6,
    value: getF("systemPrompt"),
    onChange: e => setF("systemPrompt", e.target.value),
    placeholder: "How the bot is set up behind the scenes"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(FieldMeter, {
    as: "lbl",
    label: "Always-active system prompt",
    text: effF("alwaysActiveSystemPrompt"),
    kind: "permanent",
    inherited: inhF("alwaysActiveSystemPrompt")
  }), /*#__PURE__*/React.createElement("textarea", {
    rows: 6,
    value: getF("alwaysActiveSystemPrompt"),
    onChange: e => setF("alwaysActiveSystemPrompt", e.target.value),
    placeholder: "Powerful, persistent instruction (CharSnap limits this to 768 characters)"
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 20,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Sections"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      marginTop: 3
    }
  }, "Anything extra — appearance, abilities, inventory, scenario notes.")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => set("sections", [...c.sections, {
      id: uid(),
      title: "",
      content: ""
    }])
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.plus,
    size: 14
  }), " Add section"))), (c.sections || []).length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--dim)",
      fontSize: 13.5,
      padding: "8px 2px"
    }
  }, "No custom sections yet."), (c.sections || []).map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.id,
    style: {
      border: "1px solid var(--line)",
      borderRadius: 10,
      padding: 14,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: s.title,
    placeholder: "Section title (e.g. Appearance)",
    onChange: e => set("sections", (c.sections || []).map((x, j) => j === i ? {
      ...x,
      title: e.target.value
    } : x))
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    "aria-label": "Remove section",
    style: {
      flexShrink: 0,
      padding: "8px 11px"
    },
    onClick: () => set("sections", (c.sections || []).filter((_, j) => j !== i))
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.trash,
    size: 15
  }))), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: s.content,
    placeholder: "Section content",
    onChange: e => set("sections", (c.sections || []).map((x, j) => j === i ? {
      ...x,
      content: e.target.value
    } : x))
  }), (() => {
    const kind = sectionKinds(c.sections)[i];
    const info = MEMORY_KIND[kind] || MEMORY_KIND.permanent;
    return /*#__PURE__*/React.createElement("div", {
      title: info.why,
      style: {
        fontSize: 11,
        fontWeight: 600,
        marginTop: 6,
        textAlign: "right",
        letterSpacing: "normal",
        textTransform: "none",
        color: kind === "permanent" && estTokens(s.content) ? "var(--brass)" : "var(--dim)"
      }
    }, tokenLabel(s.content, kind));
  })()))), /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 20,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Gallery"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      marginTop: 3
    }
  }, "New images go to \u201c" + (vIdx >= 0 && variants[vIdx] ? variants[vIdx].name || "this variant" : "Default") + "\u201d only. Switch tabs above to add images to another variant, or use Grid view to make an image shared.")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    onClick: () => galleryRef.current.click()
  }, "Add images to \u201c" + (vIdx >= 0 && variants[vIdx] ? variants[vIdx].name || "variant" : "Default") + "\u201d"), /*#__PURE__*/React.createElement("input", {
    ref: galleryRef,
    type: "file",
    accept: "image/*",
    multiple: true,
    hidden: true,
    onChange: e => {
      uploadGallery(e.target.files);
      e.target.value = "";
    }
  })), shownGallery.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px dashed var(--line2)",
      borderRadius: 10,
      padding: "26px 16px",
      textAlign: "center",
      color: "var(--dim)",
      fontSize: 13.5
    }
  }, (c.gallery || []).length ? "No pictures on this version yet. The others have some — switch tabs above to see them." : "No gallery images yet. Add reference art, outfits, expressions — anything.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
      gap: 12
    }
  }, shownGallery.map(({ g, oi: i }, vi) => /*#__PURE__*/React.createElement("button", {
    key: g.imgId,
    onClick: () => setLightbox(i),
    // the label counts what is on screen; the lightbox still needs the real position
    "aria-label": "Open image " + (vi + 1),
    style: {
      position: "relative",
      aspectRatio: "1",
      borderRadius: 10,
      overflow: "hidden",
      padding: 0,
      border: "1px solid var(--line)",
      background: "rgba(8,12,26,.6)"
    }
  }, imgCache[g.imgId] ? /*#__PURE__*/React.createElement("img", {
    src: imgCache[g.imgId],
    alt: g.caption || "gallery",
    className: blurred[g.imgId] ? "blur-img" : undefined,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--dim)",
      fontSize: 12,
      paddingTop: "42%"
    }
  }, "Loading…"), g.caption && /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      fontSize: 11,
      color: "#dfe5f5",
      background: "linear-gradient(transparent, rgba(5,8,17,.9))",
      padding: "14px 8px 6px",
      textAlign: "left",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, g.caption)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
      margin: "26px 0 10px",
      paddingTop: 18,
      borderTop: "1px solid var(--line)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: "var(--dim)",
      marginRight: "auto"
    }
  }, c.name.trim() ? "Editing \u201c" + c.name.trim() + "\u201d" : "Unnamed character"), initial.createdAt && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => {
      if (confirmDel) onDelete(c);else {
        setConfirmDel(true);
        setTimeout(() => setConfirmDel(false), 3500);
      }
    }
  }, confirmDel ? "Click again — it goes to the bin for 30 days" : "Delete"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: doSave
  }, "Save character")), jsonIncoming && /*#__PURE__*/React.createElement(UpdateFromJsonModal, {
    incoming: jsonIncoming,
    variants: variants,
    currentVIdx: vIdx,
    onApply: applyJsonUpdate,
    onClose: () => setJsonIncoming(null)
  }), showHistory && /*#__PURE__*/React.createElement(HistoryModal, {
    history: c.history || [],
    onRestore: restoreVersion,
    onClose: () => setShowHistory(false)
  }), lightbox !== null && /*#__PURE__*/React.createElement(Lightbox, {
    items: c.gallery || [], // the lightbox maps over this
    index: lightbox,
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    onClose: () => setLightbox(null),
    onNav: d => setLightbox(i => {
      const len = (c.gallery || []).length;
      if (len <= 0) return null;
      return (i + d + len) % len;
    }),
    onSetProfile: imgId => {
      set("profileImg", imgId);
      toast("Portrait updated");
    },
    onCaption: (i, cap) => set("gallery", (c.gallery || []).map((g, j) => j === i ? {
      ...g,
      caption: cap
    } : g)),
    onRemove: i => {
      const next = (c.gallery || []).filter((_, j) => j !== i);
      set("gallery", next);
      if (next.length === 0) setLightbox(null);else setLightbox(Math.min(i, next.length - 1));
    }
  }));
}

/* ---------- small portrait upload field (used for personas) ---------- */
function ImageField({
  value,
  onChange,
  imgCtx
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (value) imgCtx.loadImage(value);
  }, [value]);
  const src = value ? imgCtx.imgCache[value] : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => ref.current.click(),
    "aria-label": "Upload portrait",
    style: {
      width: 84,
      height: 84,
      borderRadius: 14,
      overflow: "hidden",
      flexShrink: 0,
      padding: 0,
      border: "1px dashed var(--line2)",
      background: "var(--field)",
      color: "var(--dim)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "portrait",
    className: imgCtx.blurred && imgCtx.blurred[value] ? "blur-img" : undefined,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : /*#__PURE__*/React.createElement(Ic, {
    d: icons.img,
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => ref.current.click()
  }, src ? "Replace image" : "Add image"), value && imgCtx.onToggleBlur && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => imgCtx.onToggleBlur(value)
  }, imgCtx.blurred && imgCtx.blurred[value] ? "Unblur" : "Blur"), value && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => onChange(null)
  }, "Remove")), /*#__PURE__*/React.createElement("input", {
    ref: ref,
    type: "file",
    accept: "image/*",
    hidden: true,
    onChange: async e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      /* This was the last upload with no failure handling: a picture that could
         not be read or could not be saved simply never appeared, with nothing
         said. Same two messages as everywhere else. */
      let orig;
      try {
        orig = await fileToDataUrl(f);
      } catch (err) {
        imgCtx.toast && imgCtx.toast("Couldn't read that image");
        return;
      }
      const thumb = await makeThumb(orig).catch(() => null);
      const imgId = uid();
      try {
        await imgCtx.saveImage(imgId, orig, thumb);
      } catch (err) {
        imgCtx.toast && imgCtx.toast("Couldn't save that image — the vault may be out of room");
        return;
      }
      onChange(imgId);
    }
  }));
}

/* ---------- generic record modal (personas / lore / prompts) ---------- */
function RecordModal({
  title,
  fields,
  initial,
  onSave,
  onDelete,
  onClose,
  imgCtx
}) {
  const [r, setR] = useState(initial);
  /* Committing a half-typed tag when the box loses focus is not enough on its
     own: clicking Save blurs the box and saves in the same gesture, and the
     click handler still holds the record as it was before the blur. Keeping a
     live reference means Save writes what is on screen, not what was there a
     moment earlier. */
  const rRef = useRef(r);
  rRef.current = r;
  const [confirmDel, setConfirmDel] = useState(false);
  /* Clicking the backdrop used to close outright and throw away everything typed.
     Compare against what was opened rather than tracking edits, so undoing a change
     by hand counts as unchanged and closes without nagging. */
  const [confirmLeave, setConfirmLeave] = useState(false);
  const dirty = JSON.stringify(r) !== JSON.stringify(initial);
  const tryClose = () => dirty ? setConfirmLeave(true) : onClose();
  useEffect(() => {
    const h = e => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      tryClose();
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [dirty, r]);
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    onClick: tryClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    onClick: e => e.stopPropagation()
  }, confirmLeave && /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--brass-line)",
      background: "var(--brass-soft)",
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 4
    }
  }, "You have unsaved changes"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.55,
      marginBottom: 12
    }
  }, "Closing now throws away what you have written here."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => setConfirmLeave(false)
  }, "Keep editing"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Discard changes"))),/*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "serif",
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 600
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: "7px 10px"
    },
    "aria-label": "Close",
    onClick: tryClose
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.x,
    size: 15
  }))), fields.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.key,
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, f.label), f.type === "sections" ? /*#__PURE__*/React.createElement(SectionsField, {
    kindOf: f.kindOf,
    sections: r[f.key] || [],
    onChange: s => setR(p => ({
      ...p,
      [f.key]: s
    }))
  }) : f.type === "image" ? /*#__PURE__*/React.createElement(ImageField, {
    value: r[f.key] || null,
    imgCtx: imgCtx,
    onChange: id => setR(p => ({
      ...p,
      [f.key]: id
    }))
  }) : f.type === "textarea" ? /*#__PURE__*/React.createElement("textarea", {
    rows: f.rows || 6,
    value: r[f.key] || "",
    placeholder: f.placeholder,
    onChange: e => setR(p => ({
      ...p,
      [f.key]: e.target.value
    }))
  }) : f.type === "tags" ? /*#__PURE__*/React.createElement(TagInput, {
    tags: r[f.key] || [],
    onChange: t => setR(p => ({
      ...p,
      [f.key]: t
    })),
    placeholder: f.placeholder
  }) : f.type === "chips" ? /*#__PURE__*/React.createElement(ChipsPicker, {
    options: f.options || [],
    value: r[f.key] || [],
    emptyHint: f.emptyHint,
    onChange: v => setR(p => ({
      ...p,
      [f.key]: v
    }))
  }) : /*#__PURE__*/React.createElement("input", {
    value: r[f.key] || "",
    placeholder: f.placeholder,
    list: f.datalist && f.datalist.length ? "dl-" + f.key : undefined,
    onChange: e => setR(p => ({
      ...p,
      [f.key]: e.target.value
    }))
  }), f.datalist && f.datalist.length > 0 && /*#__PURE__*/React.createElement("datalist", {
    id: "dl-" + f.key
  }, f.datalist.map(d => /*#__PURE__*/React.createElement("option", {
    key: d,
    value: d
  })))
  , f.hint && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: f.hintWarn && f.hintWarn(r) ? "var(--brass)" : "var(--dim)",
      marginTop: 5,
      lineHeight: 1.5
    }
  }, f.hint(r)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      justifyContent: "flex-end",
      marginTop: 6
    }
  }, initial.createdAt && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    style: {
      marginRight: "auto"
    },
    onClick: () => {
      if (confirmDel) onDelete(r);else {
        setConfirmDel(true);
        setTimeout(() => setConfirmDel(false), 3500);
      }
    }
  }, confirmDel ? "Click again to delete" : "Delete"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => onSave({
      ...rRef.current,
      updatedAt: Date.now(),
      createdAt: rRef.current.createdAt || Date.now()
    })
  }, "Save"))));
}

/* ---------- list view for personas / lore / prompts ---------- */
function RecordList({
  eyebrow,
  title,
  blurb,
  records,
  columnsOf,
  onNew,
  onOpen,
  extraAction,
  emptyHint,
  avatarOf,
  imgCache,
  blurred,
  actions
}) {
  const [q, setQ] = useState("");
  const filtered = records.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-end",
      flexWrap: "wrap",
      gap: 14,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, eyebrow), /*#__PURE__*/React.createElement("h1", {
    className: "serif",
    style: {
      fontSize: "clamp(24px, 3vw, 36px)",
      margin: "4px 0 4px",
      fontWeight: 600
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--mut)",
      fontSize: 13.5
    }
  }, blurb)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Search…",
    style: {
      width: 220
    }
  }), (actions || []).map(a => /*#__PURE__*/React.createElement("button", {
    key: a.label,
    className: "btn btn-ghost",
    style: {
      flexShrink: 0
    },
    onClick: a.onClick
  }, a.label)), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    style: {
      flexShrink: 0
    },
    onClick: onNew
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.plus,
    size: 14
  }), " New")))), filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 34,
      textAlign: "center",
      color: "var(--dim)"
    }
  }, records.length === 0 ? emptyHint : "Nothing matches that search.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 14
    }
  }, filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(r => {
    const [head, sub, body] = columnsOf(r);
    return /*#__PURE__*/React.createElement("div", {
      key: r.id,
      className: "card",
      style: {
        padding: 18,
        cursor: "pointer",
        transition: "border-color .15s"
      },
      onClick: () => onOpen(r),
      onMouseEnter: e => e.currentTarget.style.borderColor = "rgba(217,178,92,.4)",
      onMouseLeave: e => e.currentTarget.style.borderColor = "var(--line)"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        alignItems: "flex-start"
      }
    }, avatarOf && avatarOf(r) && imgCache && imgCache[avatarOf(r)] && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 46,
        height: 46,
        borderRadius: 12,
        overflow: "hidden",
        flexShrink: 0,
        border: "1px solid var(--line)",
        display: "block"
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: imgCache[avatarOf(r)],
      alt: "",
      className: blurred && blurred[avatarOf(r)] ? "blur-img" : undefined,
      style: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block"
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0,
        marginRight: "auto"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "serif",
      style: {
        fontSize: 18,
        fontWeight: 600,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, head || "Untitled"), sub && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--brass)",
        marginTop: 3
      }
    }, sub)), extraAction && /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      style: {
        padding: "6px 9px",
        flexShrink: 0
      },
      "aria-label": extraAction.label,
      title: extraAction.label,
      onClick: e => {
        e.stopPropagation();
        extraAction.fn(r);
      }
    }, /*#__PURE__*/React.createElement(Ic, {
      d: extraAction.icon,
      size: 14
    }))), body && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "var(--mut)",
        marginTop: 8,
        lineHeight: 1.5,
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden"
      }
    }, body), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--dim)",
        marginTop: 10
      }
    }, "Updated ", timeAgo(r.updatedAt)));
  })));
}

/* ---------- settings modal ---------- */
function AuthForm({
  fields,
  submitLabel,
  onSubmit,
  onCancel
}) {
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const e2 = await onSubmit(vals);
      setBusy(false);
      if (e2) setErr(e2);
    } catch (e) {
      setBusy(false);
      setErr(e && e.message ? e.message : "Something went wrong — try again");
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, fields.map((f, i) => /*#__PURE__*/React.createElement("input", {
    key: f.key,
    type: f.kind === "pin" ? "tel" : "password",
    inputMode: f.kind === "pin" ? "numeric" : undefined,
    pattern: f.kind === "pin" ? "[0-9]*" : undefined,
    autoComplete: f.kind === "pin" ? "one-time-code" : "current-password",
    placeholder: f.label,
    autoFocus: i === 0,
    value: vals[f.key] || "",
    onChange: e => {
      const raw = e.target.value;
      const next = f.kind === "pin" ? raw.replace(/\D/g, "").slice(0, 32) : raw;
      setVals(p => ({
        ...p,
        [f.key]: next
      }));
      setErr("");
    },
    // the lock screen submits on Enter; these dialogs made you reach for the mouse
    onKeyDown: e => {
      if (e.key === "Enter" && !busy) submit();
    }
  })), err && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--danger)",
      fontSize: 13
    }
  }, err), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    disabled: busy,
    onClick: submit
  }, busy ? "Working…" : submitLabel), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onCancel
  }, "Cancel")));
}
function qrMatrix(text) {
  if (typeof qrcode !== "function") return null;
  const str = String(text || "");
  if (!str) return null;
  for (let type = 1; type <= 6; type++) {
    try {
      const qr = qrcode(type, "M");
      qr.addData(str);
      qr.make();
      const n = qr.getModuleCount();
      const m = [];
      for (let y = 0; y < n; y++) {
        const row = [];
        for (let x = 0; x < n; x++) row.push(qr.isDark(y, x) ? 1 : 0);
        m.push(row);
      }
      return m;
    } catch (e) {}
  }
  return null;
}
function TransferQr(props) {
  const m = useMemo(() => qrMatrix(props.text), [props.text]);
  if (!m) return null;
  const n = m.length, q = 4, d = n + q * 2;
  let path = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) path += "M" + (x + q) + " " + (y + q) + "h1v1h-1z";
  }
  const px = props.size || 188;
  return /*#__PURE__*/React.createElement("svg", {
    width: px,
    height: px,
    viewBox: "0 0 " + d + " " + d,
    shapeRendering: "crispEdges",
    "aria-hidden": true,
    style: { display: "block", background: "#fff", borderRadius: 10 }
  }, /*#__PURE__*/React.createElement("rect", { width: d, height: d, fill: "#ffffff" }), /*#__PURE__*/React.createElement("path", { d: path, fill: "#111111" }));
}
function SettingsModal({
  onResetLayout,
  onClose,
  onExport,
  onImport,
  onDownloadImages,
  toast,
  counts,
  theme,
  setTheme,
  textSize,
  setTextSize,
  cardSize,
  setCardSize,
  contrast,
  setContrast,
  trash,
  onRestoreTrash,
  onEmptyTrash,
  authState,
  refreshAuth
}) {
  const [form, setForm] = useState(null); // 'setup' | 'change' | 'removePw' | 'setPin' | 'removePin'
  const [pendingImport, setPendingImport] = useState(null);
  const [xfer, setXfer] = useState(null);
  const [xferBusy, setXferBusy] = useState(false);
  // which half of the panel is working, so the other one does not claim to be
  const [xferSharing, setXferSharing] = useState(false);
  const [xferScan, setXferScan] = useState(false);
  const scanVideoRef = useRef(null);
  const canShare = !(window.transfer && window.transfer.canShare === false);
  const canScan = typeof navigator !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !!window.Capacitor;
  const spinner = label => React.createElement("span", {
    style: { display: "inline-flex", gap: 8, alignItems: "center" }
  }, React.createElement("span", { className: "spin" }), label);
  const [xferCode, setXferCode] = useState("");
  const [xferMsg, setXferMsg] = useState(null);
  /* Mirroring deletes from whichever device is receiving. It used to be on by
     default, which is the wrong way round for a destructive option: merging
     costs nothing to undo, mirroring the wrong way costs a vault. */
  const [xferReplace, setXferReplace] = useState(false);
  const [xferPlan, setXferPlan] = useState(null); // dry run: what a sync would do here
  const [thisDevice, setThisDevice] = useState(null);
  const [xferProg, setXferProg] = useState(null);
  /* The other device is asking to mirror from this one. Held in state rather
     than answered straight away, because a person has to read it. */
  const [mirrorAsk, setMirrorAsk] = useState(null);
  const [reverseFrom, setReverseFrom] = useState(null); // their code, once we have said "the other way"
  useEffect(() => {
    if (!window.transfer || !window.transfer.onMirrorRequest) return;
    return window.transfer.onMirrorRequest(a => setMirrorAsk(a));
  }, []);
  /* Saying "mirror the other way" turns this device into the receiving one. It
     runs the ordinary receive against the code they sent, so the preview and
     the red confirm below happen here, on the device that is now at risk. */
  useEffect(() => {
    if (!reverseFrom) return;
    setXferCode(reverseFrom);
    setXferReplace(true);
    setXferPlan(null);
    setXferMsg({ ok: true, text: "You chose to mirror the other way. Press the button below to see what that would do to this device." });
    setReverseFrom(null);
  }, [reverseFrom]);
  useEffect(() => {
    if (window.transfer) window.transfer.status().then(s => {
      if (s && s.active) setXfer(s);
      if (s && s.device) setThisDevice(s.device);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!window.transfer || !window.transfer.onProgress) return;
    return window.transfer.onProgress(p => setXferProg(p && p.phase === "done" ? null : p));
  }, []);
  useEffect(() => {
    if (!xferScan) return;
    const video = scanVideoRef.current;
    if (!video) return;
    let stream = null, raf = 0, dead = false, detector = null;
    if (typeof BarcodeDetector === "function") {
      try { detector = new BarcodeDetector({ formats: ["qr_code"] }); } catch (e) {}
    }
    if (!detector) {
      setXferMsg({ ok: false, text: "This device cannot scan a QR. Type the code instead." });
      setXferScan(false);
      return;
    }
    const stop = () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    const tick = async () => {
      if (dead) return;
      if (video.readyState >= 2 && video.videoWidth) {
        let text = null;
        if (detector) {
          try {
            const codes = await detector.detect(video);
            if (codes && codes[0] && codes[0].rawValue) text = String(codes[0].rawValue);
          } catch (e) {}
        }
        if (text) {
          const cleaned = text.replace(/^RC:/i, "").trim();
          setXferCode(cleaned);
          setXferPlan(null);
          setXferScan(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const start = constraints => navigator.mediaDevices.getUserMedia(constraints);
    start({ video: { facingMode: { ideal: "environment" } }, audio: false }).catch(() => start({ video: true, audio: false }))
      .then(s => {
        if (dead) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        video.srcObject = s;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        return video.play();
      })
      .then(() => { if (!dead) tick(); })
      .catch(() => {
        if (dead) return;
        setXferMsg({ ok: false, text: "Couldn't open the camera. Type the code instead." });
        setXferScan(false);
      });
    return stop;
  }, [xferScan]);
  /* Named steps, because they are not the same length and a bar that sits at
     one number for a minute reads as a hang. The two that know how much is left
     say so; the two that cannot are honest about it and stripe instead. */
  const XFER_STEPS = {
    preparing: "Getting this vault ready to share",
    asking: "Asking the other device what it has",
    comparing: "Working out what is different here",
    packing: xfer ? "Gathering records to send" : "The other device is gathering the records",
    sending: "Sending to the other device",
    receiving: "Copying across",
    unpacking: "Unpacking",
    saving: "Saving into this vault",
    removing: "Removing what the other device no longer has"
  };
  const xferBar = () => {
    if (!xferProg) return null;
    const known = xferProg.total > 0;
    const pct = Math.round((xferProg.pct || 0) * 100);
    const mbOf = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
    const bytePhase = xferProg.phase === "receiving" || xferProg.phase === "sending";
    const detail = bytePhase && known ? mbOf(xferProg.done) + " of " + mbOf(xferProg.total) : known ? xferProg.done + " of " + xferProg.total : (xferProg.phase === "packing" ? "this can take a while on a large library" : "");
    return /*#__PURE__*/React.createElement("div", {
      style: { margin: "10px 0" }
    }, /*#__PURE__*/React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: "var(--mut)", marginBottom: 5 }
    }, /*#__PURE__*/React.createElement("span", null, XFER_STEPS[xferProg.phase] || "Working"), /*#__PURE__*/React.createElement("span", {
      style: { color: "var(--dim)", whiteSpace: "nowrap" }
    }, known ? pct + "%" + (detail ? " · " + detail : "") : detail)), /*#__PURE__*/React.createElement("div", {
      role: "progressbar",
      "aria-valuenow": known ? pct : undefined,
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-label": XFER_STEPS[xferProg.phase] || "Working",
      style: { height: 6, borderRadius: 999, background: "var(--line)", overflow: "hidden" }
    }, /*#__PURE__*/React.createElement("div", {
      style: known ? {
        height: "100%",
        width: pct + "%",
        background: "var(--brass)",
        borderRadius: 999,
        transition: "width .18s linear"
      } : {
        height: "100%",
        width: "35%",
        borderRadius: 999,
        background: "linear-gradient(90deg, transparent, var(--brass), transparent)",
        animation: "rcv-sweep 1.1s linear infinite"
      }
    })));
  };
  const here = thisDevice ? "“" + thisDevice + "”" : "this device";
  const [upd, setUpd] = useState(null);
  const [updMsg, setUpdMsg] = useState(null);
  const updRef = useRef(null);
  useEffect(() => {
    if (window.updater) window.updater.status().then(setUpd).catch(() => {});
  }, []);
  const [enc, setEnc] = useState(null);
  useEffect(() => {
    if (window.vaultInfo) window.vaultInfo.encrypted().then(setEnc).catch(() => {});
  }, [authState]);
  const importRef = useRef(null);
  // version history is collapsed by default — it is reference material, not
  // something to scroll past every time Settings is opened
  const [histOpen, setHistOpen] = useState(false);
  // the bin is collapsed too — with 30 days of deletions it would otherwise
  // push everything below it off the screen
  const [trashOpen, setTrashOpen] = useState(false);
  const [openRel, setOpenRel] = useState(0);
  const desktop = !!window.auth;
  const web = typeof window !== "undefined" && window.vaultPlatform === "web";
  /* The Android app is this same web build inside a WebView, so it reports
     itself as web. window.Capacitor is injected by the native bridge and exists
     in no browser, which is what separates the two. Storage behaves differently
     enough to be worth saying out loud: it is private to the app rather than
     shared with a browser, and it goes away with the app rather than with site
     data. */
  const android = web && typeof window !== "undefined" && !!window.Capacitor;
  const done = async msg => {
    await refreshAuth();
    setForm(null);
    toast(msg);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Rolecraft Vault"), /*#__PURE__*/React.createElement("h2", {
    className: "serif",
    style: {
      margin: "2px 0 0",
      fontSize: 26
    }
  }, "Settings")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Close")), /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 10
    }
  }, "Appearance"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, [["light", "Light", icons.sun], ["dark", "Dark", icons.moon], ["charsnap", "CharSnap", icons.persona]].map(([t, label, ic]) => /*#__PURE__*/React.createElement("button", {
    key: t,
    className: "btn " + (theme === t ? "btn-primary" : "btn-ghost"),
    style: {
      flex: 1
    },
    onClick: () => setTheme(t)
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 8,
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: ic,
    size: 14
  }), label)))), /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 10
    }
  }, "Layout"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      marginBottom: 10,
      lineHeight: 1.55
    }
  }, "Puts the dashboard sections back in their original order and restores the default reading size."), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onResetLayout
  }, "Reset layout to defaults"), /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 10
    }
  }, "Reading text size"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, [["small", "Small"], ["medium", "Medium"], ["large", "Large"]].map(([s, label]) => /*#__PURE__*/React.createElement("button", {
    key: s,
    className: "btn " + (textSize === s ? "btn-primary" : "btn-ghost"),
    style: {
      flex: 1
    },
    onClick: () => setTextSize(s)
  }, label))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      margin: "18px 0 10px"
    }
  }, "Card size"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, [["small", "Small"], ["medium", "Medium"], ["large", "Large"]].map(([v, label]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    className: "btn " + (cardSize === v ? "btn-primary" : "btn-ghost"),
    style: {
      flex: 1
    },
    onClick: () => setCardSize(v)
  }, label))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--dim)",
      marginTop: 8,
      marginBottom: 4,
      lineHeight: 1.5
    }
  }, "How big characters and personas are shown in the library. Smaller cards fit more on screen at once."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--dim)",
      marginTop: 8
    }
  }, "Applies to character, persona, lorebook and prompt text."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginTop: 18,
      marginBottom: 4
    }
  }, "Text contrast"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, [["normal", "Normal"], ["high", "Higher"], ["max", "Maximum"]].map(([v, label]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    className: "btn " + (contrast === v ? "btn-primary" : "btn-ghost"),
    style: {
      flex: 1
    },
    onClick: () => setContrast(v)
  }, label))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--dim)",
      marginTop: 8
    }
  }, "Darkens the smaller grey text — labels, captions and secondary lines. Everything already meets the accessibility standard at Normal; these go further if you want it plainer."), /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Master password"),/*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.5,
      marginBottom: 12
    }
  }, desktop ? web ? (android ? "Your password encrypts every record and photo in an encrypted folder on this phone (AES-256, key derived from your password and never stored). The app only reads a picture when it is on screen; the rest stay on disk. That folder is private to Rolecraft Vault: no other app and no browser can read it, and it is never backed up to Google Drive. There is no recovery if you forget your password — keep an exported backup somewhere safe. Note: uninstalling the app, or clearing its storage in Android settings, erases the vault." : "Your password encrypts every record and photo in this browser's storage (AES-256, key derived from your password and never stored). There is no recovery if you forget it — keep an exported backup somewhere safe. Note: clearing this site's browser data erases the vault.") : "Your password encrypts every record and photo on disk (AES-256), layered on top of Windows account encryption. There is no recovery if you forget it — keep an exported backup somewhere safe." : "Password and PIN protection are available in the Windows desktop app."), desktop && !authState.passwordSet && !form && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    onClick: () => setForm("setup")
  }, "Set master password"), desktop && authState.passwordSet && !form && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "chip on"
  }, "Password on"), /*#__PURE__*/React.createElement("span", {
    className: "chip" + (authState.pinSet ? " on" : "")
  }, authState.pinSet ? "PIN on" : "PIN off"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setForm("change")
  }, "Change password"), authState.pinSet ? /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setForm("removePin")
  }, "Remove PIN") : /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setForm("setPin")
  }, "Add quick-unlock PIN"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => setForm("removePw")
  }, "Remove password")), form === "setup" && /*#__PURE__*/React.createElement(AuthForm, {
    submitLabel: "Encrypt my vault",
    onCancel: () => setForm(null),
    fields: [{
      key: "a",
      label: "New master password (8+ characters)"
    }, {
      key: "b",
      label: "Repeat password"
    }],
    onSubmit: async v => {
      if ((v.a || "").length < 8) return "Use at least 8 characters";
      if (v.a !== v.b) return "Passwords don't match";
      const r = await window.auth.setPassword(v.a);
      if (!r.ok) return r.error;
      await done("Vault encrypted with your password");
    }
  }), form === "change" && /*#__PURE__*/React.createElement(AuthForm, {
    submitLabel: "Change password",
    onCancel: () => setForm(null),
    fields: [{
      key: "o",
      label: "Current password"
    }, {
      key: "a",
      label: "New password (8+ characters)"
    }, {
      key: "b",
      label: "Repeat new password"
    }],
    onSubmit: async v => {
      if ((v.a || "").length < 8) return "Use at least 8 characters";
      if (v.a !== v.b) return "New passwords don't match";
      const r = await window.auth.changePassword(v.o || "", v.a);
      if (!r.ok) return r.error;
      await done("Password changed — set your PIN again if you use one");
    }
  }), form === "removePw" && /*#__PURE__*/React.createElement(AuthForm, {
    submitLabel: "Remove password",
    onCancel: () => setForm(null),
    fields: [{
      key: "o",
      label: "Current password"
    }],
    onSubmit: async v => {
      const r = await window.auth.removePassword(v.o || "");
      if (!r.ok) return r.error;
      await done("Password removed — vault now relies on Windows account encryption only");
    }
  }), form === "setPin" && /*#__PURE__*/React.createElement(AuthForm, {
    submitLabel: "Add PIN",
    onCancel: () => setForm(null),
    fields: [{
      key: "o",
      label: "Master password"
    }, {
      key: "p",
      label: "New PIN (4+ digits)",
      kind: "pin"
    }, {
      key: "q",
      label: "Repeat PIN",
      kind: "pin"
    }],
    onSubmit: async v => {
      if (!/^\d{4,}$/.test(v.p || "")) return "PIN needs at least 4 digits";
      if (v.p !== v.q) return "PINs don't match";
      const r = await window.auth.setPin(v.o || "", v.p);
      if (!r.ok) return r.error;
      await done("Quick-unlock PIN added");
    }
  }), form === "removePin" && /*#__PURE__*/React.createElement(AuthForm, {
    submitLabel: "Remove PIN",
    onCancel: () => setForm(null),
    fields: [{
      key: "o",
      label: "Master password"
    }],
    onSubmit: async v => {
      const r = await window.auth.removePin(v.o || "");
      if (!r.ok) return r.error;
      await done("PIN removed");
    }
  }), desktop && web && enc && !enc.password && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--danger)",
      marginTop: 12,
      lineHeight: 1.5
    }
  }, android ? "Without a master password, pictures still live in an encrypted folder only this app can open. Anyone holding the unlocked phone can still open the app and read them. Setting a password is strongly recommended." : "Without a master password, web data sits unencrypted in this browser's storage. Setting one is strongly recommended."), desktop && web && authState.pinSet && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--mut)",
      marginTop: 12,
      lineHeight: 1.5
    }
  }, android ? "On Android there is no OS key store behind the PIN, so the quick-unlock PIN is only as strong as the digits you pick. Prefer the master password on a shared device." : "On the web there is no OS key store, so the quick-unlock PIN is only as strong as the digits you pick. Prefer the master password on shared devices."), desktop && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      gap: 10,
      marginTop: 14
    }
  }, (web ? [["Password encryption", enc == null ? "…" : enc.password ? "On (AES-256)" : "Off", enc && enc.password], ["Storage", android ? "This app only (private)" : "This browser (IndexedDB)", true]] : [["Windows encryption", enc == null ? "…" : enc.dpapi ? "On (DPAPI)" : "Unavailable", enc && enc.dpapi], ["Password encryption", enc == null ? "…" : enc.password ? "On (AES-256)" : "Off", enc && enc.password]]).map(([k, v, on]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      border: "1px solid var(--line)",
      borderRadius: 10,
      padding: "10px 14px",
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--mut)"
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      color: on ? "var(--brass)" : "var(--dim)",
      fontWeight: 600
    }
  }, v)))), window.updater && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 4
    }
  }, "App updates"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      marginBottom: 10
    }
  }, "Build ", upd ? upd.build : "…", upd && upd.active ? " · update " + upd.active + " active" : " · factory version", ". Updates are signed files — the app only accepts packages signed with your update key, so patches install in place without reinstalling. If an update ever misbehaves, the app auto-reverts to the factory version, and Ctrl+Shift+F12 forces a revert at any time."), updMsg && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: updMsg.ok ? "var(--brass)" : "#e2698a",
      marginBottom: 10
    }
  }, updMsg.text), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => updRef.current.click()
  }, "Install update file…"), upd && upd.active && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: async () => {
      const r = await window.updater.revert();
      setUpdMsg(r.ok ? {
        ok: true,
        text: "Reverted to the factory version — relaunch to apply."
      } : {
        ok: false,
        text: r.error
      });
      window.updater.status().then(setUpd);
    }
  }, "Revert to factory"), updMsg && updMsg.ok && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => window.updater.relaunch()
  }, "Relaunch now")), /*#__PURE__*/React.createElement("input", {
    ref: updRef,
    type: "file",
    accept: ".rcvup,.json",
    hidden: true,
    onChange: async e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        const text = await f.text();
        const r = await window.updater.install(text);
        setUpdMsg(r.ok ? {
          ok: true,
          text: "Update " + r.version + " installed — relaunch to apply."
        } : {
          ok: false,
          text: r.error
        });
        window.updater.status().then(setUpd);
      } catch (err) {
        setUpdMsg({
          ok: false,
          text: "Couldn't read that file"
        });
      }
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setTrashOpen(o => !o),
    "aria-expanded": trashOpen,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
      background: "none",
      border: 0,
      padding: 0,
      cursor: "pointer",
      font: "inherit",
      color: "var(--text)",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      width: 9,
      color: "var(--mut)",
      transform: trashOpen ? "rotate(90deg)" : "none",
      transition: "transform .12s"
    }
  }, "▸"), /*#__PURE__*/React.createElement("span", null, "Recently deleted"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      fontSize: 12,
      color: "var(--dim)"
    }
  }, (trash || []).length === 0 ? "empty" : (trash.length === 1 ? "1 item" : trash.length + " items") + " waiting"))), trashOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.55,
      margin: "10px 0"
    }
  }, "Characters and personas you delete wait here for 30 days, pictures and all, before they go for good."), trashOpen && (trash || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "scrollbody",
    style: {
      maxHeight: 220,
      overflowY: "auto",
      marginBottom: 6
    }
  }, trash.map(t => {
    const days = Math.max(0, 30 - Math.floor((Date.now() - (t.deletedAt || 0)) / 864e5));
    return /*#__PURE__*/React.createElement("div", {
      key: t.tid,
      style: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "8px 0",
        borderBottom: "1px solid var(--line)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 150
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600
      }
    }, t.record.name || "Untitled"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--dim)"
      }
    }, (t.type === "character" ? "Character" : t.type === "persona" ? "Persona" : t.type === "lore" ? "Lore" : t.type === "prompt" ? "Prompt" : t.type) + " · " + (days === 0 ? "goes today" : days === 1 ? "1 day left" : days + " days left"))), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      style: {
        padding: "5px 10px",
        fontSize: 12.5
      },
      onClick: () => onRestoreTrash && onRestoreTrash(t)
    }, "Restore"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      style: {
        padding: "5px 10px",
        fontSize: 12.5,
        color: "var(--danger)",
        borderColor: "var(--danger-line)"
      },
      onClick: () => onEmptyTrash && onEmptyTrash(t)
    }, "Delete now"));
  })), /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setHistOpen(o => !o),
    "aria-expanded": histOpen,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
      background: "none",
      border: 0,
      padding: 0,
      cursor: "pointer",
      font: "inherit",
      color: "var(--text)",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      width: 9,
      color: "var(--mut)",
      transform: histOpen ? "rotate(90deg)" : "none",
      transition: "transform .12s"
    }
  }, "▸"), /*#__PURE__*/React.createElement("span", null, "Version history"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      fontSize: 12,
      color: "var(--dim)"
    }
  }, "v" + APP_VERSION))), histOpen && CHANGELOG.map((rel, ri) => /*#__PURE__*/React.createElement("div", {
    key: ri,
    style: {
      marginTop: ri ? 8 : 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpenRel(o => o === ri ? -1 : ri),
    "aria-expanded": openRel === ri,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
      background: "none",
      border: 0,
      padding: 0,
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 600,
      color: "var(--brass)",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      width: 9,
      opacity: .7,
      transform: openRel === ri ? "rotate(90deg)" : "none",
      transition: "transform .12s"
    }
  }, "▸"), rel.heading), openRel === ri && /*#__PURE__*/React.createElement("div", {
    style: {
      paddingLeft: 17,
      marginTop: 6
    }
  }, rel.reconstructed && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--dim)",
      marginBottom: 6,
      lineHeight: 1.5
    }
  }, "No release notes were kept for these, so the list below was pieced together from the code. The order is right, but the version numbers they shipped under are unknown."), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      paddingLeft: 18,
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.6
    }
  }, rel.notes.map((n, ni) => /*#__PURE__*/React.createElement("li", {
    key: ni,
    style: {
      marginBottom: 4
    }
  }, n)))))), /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Backup & transfer"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.5,
      marginBottom: 12
    }
  }, "Export everything — ", counts.chars, " characters, ", counts.personas, " personas, ", counts.lore, " lore entries, ", counts.prompts, " prompts, and all images — as one file. \"Download all images\" saves just the pictures as a zip, at the original quality they were added in. Import it here later to restore or move devices. The export itself is a plain file, so store it somewhere you trust."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    onClick: onExport
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.down,
    size: 14
  }), " Export backup")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => importRef.current.click()
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.up,
    size: 14
  }), " Import backup")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onDownloadImages
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 7,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.img,
    size: 14
  }), " Download all images")), /*#__PURE__*/React.createElement("input", {
    ref: importRef,
    type: "file",
    accept: "application/json",
    hidden: true,
    onChange: e => {
      if (e.target.files[0]) setPendingImport(e.target.files[0]);
      e.target.value = "";
    }
  })), pendingImport && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      padding: 14,
      border: "1px solid var(--danger-line)",
      borderRadius: 10,
      background: "var(--danger-soft)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      marginBottom: 10
    }
  }, "Restore ", /*#__PURE__*/React.createElement("b", null, pendingImport.name), "? This replaces everything currently in the vault."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => {
      onImport(pendingImport);
      setPendingImport(null);
    }
  }, "Replace and restore"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setPendingImport(null)
  }, "Cancel"))), window.transfer && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: { fontWeight: 700, marginBottom: 4 }
  }, "Transfer to another device"), mirrorAsk && /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: { zIndex: 60 }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: { maxWidth: 520 },
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", { className: "eyebrow" }, "Approve a mirror"),
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 15, fontWeight: 700, margin: "8px 0 10px", color: "var(--text)", lineHeight: 1.5 }
  }, mirrorAsk.device, " wants to make itself match ", mirrorAsk.thisDevice || "this device", "."),
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 13.5, color: "var(--mut)", lineHeight: 1.6, marginBottom: 10 }
  }, "Nothing here changes. On ", /*#__PURE__*/React.createElement("strong", null, mirrorAsk.device), " it would copy ", mirrorAsk.added, " and overwrite ", mirrorAsk.updated, ", and ",
  /*#__PURE__*/React.createElement("strong", { style: { color: "var(--danger)" } }, "delete ", mirrorAsk.removed, " record", mirrorAsk.removed === 1 ? "" : "s"),
  " that this device does not have."),
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6, marginBottom: 14 }
  }, "If that is the wrong way round, turn it around instead. Then ", mirrorAsk.thisDevice || "this device", " is the one that would lose records, and you will be shown exactly what before anything happens."),
  /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: 8, flexWrap: "wrap" }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => { const a = mirrorAsk; setMirrorAsk(null); window.transfer.respondMirror(a.id, "allow"); }
  }, "Allow \u2014 mirror onto " + mirrorAsk.device),
  /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !mirrorAsk.theirCode,
    style: { opacity: mirrorAsk.theirCode ? 1 : .5 },
    onClick: () => {
      const a = mirrorAsk;
      setMirrorAsk(null);
      window.transfer.respondMirror(a.id, "reverse");
      setReverseFrom(a.theirCode);
    }
  }, "The other way \u2014 mirror onto " + (mirrorAsk.thisDevice || "this device")),
  /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => { const a = mirrorAsk; setMirrorAsk(null); window.transfer.respondMirror(a.id, "refuse"); }
  }, "Refuse")))), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 13, color: "var(--mut)", marginBottom: 10, lineHeight: 1.55 }
  }, "Syncs over your local Wi\u2011Fi \u2014 nothing goes to the internet. Only records that actually differ are sent, so after the first sync repeat runs are quick. Both devices must be on the same network. On a phone, scan the QR instead of typing the code."),
  xferScan && /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: { zIndex: 70, background: "rgba(5,8,16,.92)" }
  }, /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, padding: 20 }
  }, /*#__PURE__*/React.createElement("video", {
    ref: scanVideoRef,
    playsInline: true,
    muted: true,
    autoPlay: true,
    style: { width: "min(100%, 420px)", maxHeight: "70vh", borderRadius: 12, background: "#000", objectFit: "cover" }
  }), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 14, color: "var(--mut)", textAlign: "center" }
  }, "Point the camera at the code on the other device"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setXferScan(false)
  }, "Cancel"))),
  /* Which vault you are standing in. A transfer only ever writes to the device
     you are sitting at, and that is the one sentence people needed. */
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 13, color: "var(--text)", marginBottom: 10, lineHeight: 1.55, padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)" }
  }, "You are on ", /*#__PURE__*/React.createElement("strong", null, thisDevice || "this device"), ". Nothing below changes the other device \u2014 sending only offers this vault up, and receiving writes onto ", /*#__PURE__*/React.createElement("strong", null, thisDevice || "this device"), "."),
  xferMsg && /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 13, color: xferMsg.ok ? "var(--brass)" : "#e2698a", marginBottom: 10, lineHeight: 1.5 }
  }, xferMsg.text),
  canShare && /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12.5, color: "var(--mut)", margin: "12px 0 6px", fontWeight: 700 }
  }, "Send ", here, " to another device"),
  canShare && (xfer ? /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: { padding: "14px 16px", marginBottom: 10 }
  }, /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }
  }, /*#__PURE__*/React.createElement("div", {
    style: { flex: "1 1 180px", minWidth: 160 }
  }, /*#__PURE__*/React.createElement("div", { className: "eyebrow" }, "Code for the other device"),
  /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: { fontSize: 22, letterSpacing: 2, margin: "6px 0", wordBreak: "break-all" }
  }, xfer.code), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12.5, color: "var(--dim)", marginBottom: 10, lineHeight: 1.5 }
  }, "On a phone: Settings, Transfer, Scan the code. Or type it. It pulls from ", thisDevice || "this device", "; nothing here is altered. Expires in about ", xfer.minutesLeft != null ? xfer.minutesLeft : 10, " minutes.")),
  /*#__PURE__*/React.createElement("div", { style: { flex: "0 0 auto" } },
    /*#__PURE__*/React.createElement(TransferQr, { text: xfer.code, size: 168 }),
    /*#__PURE__*/React.createElement("div", {
      style: { fontSize: 11.5, color: "var(--dim)", marginTop: 6, textAlign: "center" }
    }, "Scan with the phone"))),
  xferBar(),
  /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: async () => {
      await window.transfer.stop();
      setXfer(null);
      setXferProg(null);
      setXferMsg({ ok: true, text: "Sending stopped." });
    }
  }, "Stop sending")) : /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    disabled: xferBusy,
    style: { marginBottom: 10 },
    onClick: async () => {
      setXferBusy(true);
      setXferSharing(true);
      setXferMsg(null);
      const r = await window.transfer.start();
      setXferBusy(false);
      setXferSharing(false);
      if (r && r.ok) {
        setXfer(r);
        if (r.device) setThisDevice(r.device);
      } else setXferMsg({ ok: false, text: r && r.error || "Couldn't start sending" });
    }
  }, xferBusy ? spinner(xferProg && xferProg.phase === "preparing" ? "Getting ready\u2026" : "Starting\u2026") : "Share this vault")),
  xferProg && xferProg.phase === "preparing" && xferBar(),
  xferProg && xferProg.phase === "preparing" && /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5, marginTop: -4, marginBottom: 8 }
  }, "Reading through the vault so the other device gets an answer straight away. The first time on a large library takes a moment; after that, if nothing has changed, it is almost immediate."),
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12.5, color: "var(--mut)", margin: "12px 0 6px", fontWeight: 700 }
  }, "Receive onto ", here),
  /*#__PURE__*/React.createElement("div", {
    style: { display: "flex", gap: 8, marginBottom: 8, alignItems: "stretch" }
  }, /*#__PURE__*/React.createElement("input", {
    value: xferCode,
    onChange: e => { setXferCode(e.target.value); setXferPlan(null); },
    placeholder: canScan ? "Scan the QR, or type the code" : "Type the code shown on the other device",
    style: { flex: 1, marginBottom: 0, minWidth: 0 }
  }), canScan && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    disabled: xferBusy,
    onClick: () => { setXferMsg(null); setXferScan(true); }
  }, "Scan")),
  /*#__PURE__*/React.createElement("label", {
    style: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "var(--mut)", marginBottom: 10, lineHeight: 1.5 }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    style: { marginTop: 2 },
    checked: xferReplace,
    onChange: e => { setXferReplace(e.target.checked); setXferPlan(null); }
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", { style: { color: "var(--text)" } }, "Mirror onto ", thisDevice || "this device"), ". Makes this device match the other one exactly, which means ", /*#__PURE__*/React.createElement("strong", { style: { color: "var(--danger)" } }, "deleting anything on ", thisDevice || "this device"), " that the other one does not have. The other device is never changed either way. Leave this off to merge, which only ever adds and updates.")),
  /* A dry run first. It reads both manifests and writes nothing, so the numbers
     on the confirm step are the real ones rather than a guess. */
  xferPlan && /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: { padding: "12px 14px", marginBottom: 10, borderColor: xferPlan.removed ? "var(--danger-line)" : "var(--line)" }
  }, /*#__PURE__*/React.createElement("div", { className: "eyebrow" }, "About to happen"),
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 13.5, lineHeight: 1.6, margin: "6px 0 0", color: "var(--text)" }
  }, /*#__PURE__*/React.createElement("strong", null, xferPlan.otherDevice || "The other device"), xferPlan.otherRecords != null ? " (" + xferPlan.otherRecords + " records)" : "", " \u2192 ", /*#__PURE__*/React.createElement("strong", null, xferPlan.thisDevice || "this device"), xferPlan.thisRecords != null ? " (" + xferPlan.thisRecords + " records)" : ""),
  /*#__PURE__*/React.createElement("ul", {
    style: { margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--mut)", lineHeight: 1.6 }
  }, /*#__PURE__*/React.createElement("li", null, xferPlan.added, " to be copied over"),
  /*#__PURE__*/React.createElement("li", null, xferPlan.updated, " to be overwritten with the other device's version"),
  /*#__PURE__*/React.createElement("li", { style: xferPlan.removed ? { color: "var(--danger)", fontWeight: 600 } : null }, xferPlan.removed, " to be deleted from ", xferPlan.thisDevice || "this device", xferPlan.removed ? " \u2014 this cannot be undone from here" : ""),
  /*#__PURE__*/React.createElement("li", null, xferPlan.unchanged, " already the same")),
  xferPlan.otherDevice ? null : /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12, color: "var(--dim)", marginTop: 8, lineHeight: 1.5 }
  }, "The other device is on an older build, so it cannot tell you its name. The counts above are still correct.")),
  /*#__PURE__*/React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
  /*#__PURE__*/React.createElement("button", {
    className: xferPlan ? (xferPlan.removed ? "btn btn-danger" : "btn btn-primary") : "btn btn-ghost",
    disabled: !xferCode.trim() || xferBusy,
    style: { opacity: !xferCode.trim() || xferBusy ? .5 : 1 },
    onClick: async () => {
      if (!xferPlan) {
        setXferBusy(true);
        setXferMsg(null);
        const p = window.transfer.preview
          ? await window.transfer.preview(xferCode.trim(), xferReplace)
          : { ok: false, error: "This build cannot preview a sync \u2014 update both devices." };
        setXferBusy(false);
        if (p && p.ok) {
          if (p.device) setThisDevice(p.device);
          if (p.thisDevice) setThisDevice(p.thisDevice);
          if (p.upToDate) {
            setXferMsg({ ok: true, text: "Already up to date \u2014 nothing needs copying (" + p.unchanged + " records checked)." });
          } else setXferPlan(p);
        } else setXferMsg({ ok: false, text: p && p.error || "Couldn't reach the other device" });
        setXferProg(null);
        return;
      }
      setXferBusy(true);
      // a mirror waits on the other device now, so say so rather than sitting blank
      setXferMsg(xferReplace ? { ok: true, text: "Waiting for the other device to approve this mirror\u2026" } : null);
      let r;
      try {
        r = await window.transfer.receive(xferCode.trim(), xferReplace);
      } catch (e) {
        r = { ok: false, error: e && e.message ? e.message : "Transfer failed" };
      }
      setXferBusy(false);
      setXferProg(null);
      setXferPlan(null);
      if (r && r.ok) {
        if (!r.partial) setXferCode("");
        if (r.upToDate) {
          setXferMsg({ ok: true, text: "Already up to date \u2014 nothing needed copying (" + r.unchanged + " records checked)." });
        } else {
          const bits = [];
          if (r.added) bits.push(r.added + " new");
          if (r.updated) bits.push(r.updated + " updated");
          if (r.removed) bits.push(r.removed + " removed");
          const mb = r.bytes ? " (" + (r.bytes > 1048576 ? (r.bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(r.bytes / 1024)) + " KB") + " transferred)" : "";
          const partial = r.partial && r.failed
            ? " " + r.failed + " could not be saved this time. Copy again \u2014 what already arrived is kept."
            : " Relaunch to see them.";
          setXferMsg({ ok: !r.partial, text: (bits.join(", ") || "No changes") + mb + " onto " + (r.thisDevice || "this device") + ", " + r.unchanged + " already matched." + partial });
        }
      } else setXferMsg({ ok: false, text: r && r.error || "Transfer failed" });
    }
  }, xferBusy && !xferSharing ? spinner(xferPlan ? "Syncing\u2026" : "Checking what would change\u2026") : xferPlan ? (xferReplace ? "Confirm \u2014 mirror onto " + (xferPlan.thisDevice || "this device") : "Confirm \u2014 merge onto " + (xferPlan.thisDevice || "this device")) : "Check what would change"),
  xferPlan && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    disabled: xferBusy,
    onClick: () => setXferPlan(null)
  }, "Cancel")), !xfer && (!xferProg || xferProg.phase !== "preparing") && xferBar()),
  /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--dim)",
      lineHeight: 1.6
    }
  }, "Rolecraft Vault v" + APP_VERSION + " · Everything stays on this device. Nothing is uploaded anywhere.")));
}

/* ---------- main app ---------- */
const blankChar = () => ({
  id: uid(),
  name: "",
  age: "",
  gender: "",
  pronouns: "",
  tags: [],
  story: "",
  personality: "",
  sections: [],
  profileImg: null,
  gallery: [],
  createdAt: null,
  updatedAt: null
});
function VaultBusyScreen({
  title,
  detail,
  done,
  total
}) {
  const known = total > 0;
  const pct = known ? Math.round(100 * done / total) : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "lock-screen",
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--lockbg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 90
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      width: "min(380px, calc(100vw - 40px))"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "0 auto 22px",
      width: 96,
      height: 96
    }
  }, /*#__PURE__*/React.createElement(CrestMark, {
    size: 96
  })), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Rolecraft Vault"), /*#__PURE__*/React.createElement("h1", {
    className: "serif",
    style: {
      fontSize: 26,
      margin: "6px 0 8px"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      marginBottom: 18,
      lineHeight: 1.5
    }
  }, detail), known ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 12.5,
      color: "var(--dim)",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, done, " of ", total), /*#__PURE__*/React.createElement("span", null, pct, "%")), /*#__PURE__*/React.createElement("div", {
    role: "progressbar",
    "aria-valuenow": pct,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    style: {
      height: 6,
      borderRadius: 999,
      background: "var(--line)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: pct + "%",
      background: "var(--brass)",
      borderRadius: 999
    }
  }))) : /*#__PURE__*/React.createElement("div", {
    className: "spin",
    style: {
      width: 18,
      height: 18,
      margin: "0 auto"
    }
  })));
}
function RolecraftVault() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null); // [damaged keys] — the vault refused to open
  const [authState, setAuthState] = useState({
    passwordSet: false,
    pinSet: false,
    locked: false,
    checked: false
  });
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem("rcv-theme") || "dark";
    } catch {
      return "dark";
    }
  });
  const setTheme = t => {
    setThemeState(t);
    try {
      localStorage.setItem("rcv-theme", t);
    } catch {}
  };
  const [view, setView] = useState("dashboard");
  const [viewCharId, setViewCharId] = useState(null);
  const [viewLoreBook, setViewLoreBook] = useState(null); // world name ("" = Unfiled) or null
  const [viewPersonaId, setViewPersonaId] = useState(null);
  const [chars, setChars] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [lore, setLore] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [imgCache, setImgCache] = useState({});
  const [editingChar, setEditingChar] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null); // {type, record}
  const [showSettings, setShowSettings] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  /* Zipping a whole library is not quick — measured at about 27 MB a second
     through reading, decoding and checksumming, so twenty gigabytes is over ten
     minutes. A count that only moves every twenty-five pictures is not enough to
     tell whether it is working or wedged. */
  const [zipProg, setZipProg] = useState(null);
  const [charQ, setCharQ] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  const [bucketFilter, setBucketFilter] = useState(null); // bucket name, "" = Unsorted, null = all
  const [tagsOpen, setTagsOpen] = useState(false);
  const [dupePrompt, setDupePrompt] = useState(null); // { type, fresh:[items], dupes:[{item, existingId}] }
  const commitCharImport = async (freshItems, overwrites, mode) => {
    // freshItems: brand-new; overwrites: [{item, existingId}] replaced in place (mode "overwrite")
    const all = [...freshItems, ...overwrites.map(d => d.item)];
    for (const it of all) {
      await writeImportedImages(it.images, it.thumbs);
      await applyImportedBlur(it.blurred);
    }
    let next = chars;
    if (overwrites.length) {
      const byId = new Map(overwrites.map(d => [d.existingId, d.item]));
      next = next.map(c => {
        const it = byId.get(c.id);
        if (!it) return c;
        charImgIds(c).forEach(id => {
          dropImage(id);
        });
        return {
          ...it.char,
          id: c.id,
          createdAt: c.createdAt,
          updatedAt: Date.now()
        };
      });
    }
    next = [...next, ...freshItems.map(it => it.char)];
    setChars(next);
    await sSet("chars:all", JSON.stringify(next));
    const parts = [];
    if (freshItems.length) parts.push(freshItems.length + " imported");
    if (overwrites.length) parts.push(overwrites.length + " overwritten");
    if (mode === "skip") parts.push("duplicates skipped");
    toast("Characters: " + (parts.join(" \u00b7 ") || "nothing to do"));
  };
  const commitPersonaImport = async (freshItems, overwrites, mode) => {
    const all = [...freshItems, ...overwrites.map(d => d.item)];
    for (const it of all) {
      await writeImportedImages(it.images, it.thumbs);
      await applyImportedBlur(it.blurred);
    }
    let next = personas;
    if (overwrites.length) {
      const byId = new Map(overwrites.map(d => [d.existingId, d.item]));
      next = next.map(p => {
        const it = byId.get(p.id);
        if (!it) return p;
        [p.avatar, ...(p.gallery || []).map(g => g.imgId)].filter(Boolean).forEach(id => {
          dropImage(id);
        });
        return {
          ...it.persona,
          id: p.id,
          createdAt: p.createdAt,
          updatedAt: Date.now()
        };
      });
    }
    next = [...next, ...freshItems.map(it => it.persona)];
    setPersonas(next);
    await sSet("personas:all", JSON.stringify(next));
    const parts = [];
    if (freshItems.length) parts.push(freshItems.length + " imported");
    if (overwrites.length) parts.push(overwrites.length + " overwritten");
    if (mode === "skip") parts.push("duplicates skipped");
    toast("Personas: " + (parts.join(" \u00b7 ") || "nothing to do"));
  };
  /* Two entries are "the same" when they sit in the same book under the same
     title, which is what someone re-importing a lorebook means by it. Ids are no
     use: a Chub or CharSnap file numbers its entries 1, 2, 3, and the vault mints
     fresh ids on the way in regardless. */
  const loreKey = e => String(e.world || "").trim().toLowerCase() + " " + String(e.title || "").trim().toLowerCase();
  const commitLoreImport = async (freshEntries, overwrites, mode, payload) => {
    await writeImportedImages(payload.images, payload.thumbs);
    await applyImportedBlur(payload.blurred);
    let next = lore;
    if (overwrites.length) {
      const byId = new Map(overwrites.map(d => [d.existingId, d.entry]));
      next = next.map(e => {
        const inc = byId.get(e.id);
        if (!inc) return e;
        /* A text-only file carries no pictures. Overwriting with one must not
           strip the entry's existing images — the text is being updated, not the
           artwork — so old images are only discarded when new ones replace them. */
        const bringsImages = (inc.images || []).length > 0;
        if (bringsImages) (e.images || []).forEach(im => {
          dropImage(im.imgId);
        });
        return {
          ...inc,
          id: e.id,
          images: bringsImages ? inc.images : e.images || [],
          createdAt: e.createdAt,
          updatedAt: Date.now()
        };
      });
    }
    next = [...next, ...freshEntries];
    setLore(next);
    await sSet("lore:all", JSON.stringify(next));
    const parts = [];
    if (freshEntries.length) parts.push(freshEntries.length + " imported");
    if (overwrites.length) parts.push(overwrites.length + " updated");
    if (mode === "skip") parts.push("duplicates skipped");
    toast("Lore: " + (parts.join(" · ") || "nothing to do"));
  };
  // same rule as lore: same collection, same title
  const promptKey = p => String(p.collection || "").trim().toLowerCase() + " " + String(p.title || "").trim().toLowerCase();
  const commitPromptImport = async (freshEntries, overwrites, mode, payload) => {
    await writeImportedImages(payload.images, payload.thumbs);
    await applyImportedBlur(payload.blurred);
    let next = prompts;
    if (overwrites.length) {
      const byId = new Map(overwrites.map(d => [d.existingId, d.entry]));
      next = next.map(p => {
        const inc = byId.get(p.id);
        if (!inc) return p;
        // as with lore: a file carrying no pictures updates the words, not the artwork
        const bringsImages = (inc.images || []).length > 0;
        if (bringsImages) (p.images || []).forEach(im => {
          dropImage(im.imgId);
        });
        return {
          ...inc,
          id: p.id,
          images: bringsImages ? inc.images : p.images || [],
          createdAt: p.createdAt,
          updatedAt: Date.now()
        };
      });
    }
    next = [...next, ...freshEntries];
    setPrompts(next);
    await sSet("prompts:all", JSON.stringify(next));
    const parts = [];
    if (freshEntries.length) parts.push(freshEntries.length + " imported");
    if (overwrites.length) parts.push(overwrites.length + " updated");
    if (mode === "skip") parts.push("duplicates skipped");
    toast("Prompts: " + (parts.join(" · ") || "nothing to do"));
  };
  const [selectMode, setSelectMode] = useState(false);
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  /* Deleting one character sends it to the bin and keeps its pictures. Deleting
     a handful at once used to destroy them outright, images and all — so the
     safety net people had learned to rely on disappeared the moment they
     selected more than one, which is exactly when it matters most. */
  const bulkDeleteChars = async ids => {
    const idSet = new Set(ids);
    const going = chars.filter(c => idSet.has(c.id));
    const next = chars.filter(c => !idSet.has(c.id));
    setChars(next);
    await sSet("chars:all", JSON.stringify(next));
    await sendManyToTrash("character", going);
    setSelected({});
    setConfirmBulkDel(false);
    setSelectMode(false);
    toast(going.length + (going.length === 1 ? " character" : " characters") + " moved to the bin — restore from Settings within " + TRASH_DAYS + " days");
  };
  const [selected, setSelected] = useState({});
  useEffect(() => {
    setConfirmBulkDel(false);
  }, [selected, selectMode]);
  const [bulkBucket, setBulkBucket] = useState("");
  const [bucketMeta, setBucketMeta] = useState({}); // { name: { cover: imgId } }
  const [newBucketOpen, setNewBucketOpen] = useState(false);
  const createEmptyBucket = async name => {
    const n = (name || "").trim();
    if (!n) return;
    if (bucketMeta[n] || chars.some(c => (c.bucket || "").trim() === n)) {
      toast("A bucket with that name already exists");
      return;
    }
    const next = {
      ...bucketMeta,
      [n]: {}
    };
    setBucketMeta(next);
    await sSet("buckets:meta", JSON.stringify(next));
    setNewBucketOpen(false);
    toast("Bucket \u201c" + n + "\u201d created — assign characters any time");
  };
  const deleteEmptyBucket = async name => {
    const next = {
      ...bucketMeta
    };
    /* Deleting a lorebook removes its cover; deleting a bucket did not, so the
       picture stayed in the vault forever with nothing pointing at it — and
       travelled in every backup from then on. */
    const cover = next[name] && next[name].cover;
    if (cover) {
      forgetBlur([cover]);
      dropImage(cover);
    }
    delete next[name];
    setBucketMeta(next);
    await sSet("buckets:meta", JSON.stringify(next));
    if (bucketFilter === name) setBucketFilter(null);
    toast("Bucket deleted");
  };
  const [loreMeta, setLoreMeta] = useState({}); // { world: { cover: imgId } } — presence also keeps empty books alive
  const persistLoreMeta = async next => {
    setLoreMeta(next);
    await sSet("lore:meta", JSON.stringify(next));
  };
  const [viewLoreEntryId, setViewLoreEntryId] = useState(null);
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [newBookName, setNewBookName] = useState("");
  const [promptMeta, setPromptMeta] = useState({}); // { collection: { cover: imgId } }
  const persistPromptMeta = async next => {
    setPromptMeta(next);
    await sSet("prompts:meta", JSON.stringify(next));
  };
  const [viewPromptBook, setViewPromptBook] = useState(null);
  const [viewPromptEntryId, setViewPromptEntryId] = useState(null);
  const [newPBookOpen, setNewPBookOpen] = useState(false);
  const [newPBookName, setNewPBookName] = useState("");
  const copyText = (txt, msg) => {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast(msg);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast(msg)).catch(fallback);else fallback();
  };
  const bucketCoverRef = useRef(null);
  const [coverTarget, setCoverTarget] = useState(null);
  /* Everything here used to happen inside a setState updater: deleting the old
     picture and saving to storage both. React may run an updater more than
     once, which would delete twice and save twice, and a failed save had
     nowhere to go. Worked out first, then applied. */
  const setBucketCover = async (name, imgId) => {
    const old = bucketMeta[name] && bucketMeta[name].cover;
    const next = { ...bucketMeta };
    /* An empty {} entry is what keeps an empty bucket alive, so dropping the
       entry once the cover was gone deleted the bucket along with its picture.
       Buckets with characters in them survived, because those live on the
       characters — it was only ever the empty ones that vanished. Removing a
       bucket is deleteEmptyBucket's job, not this one's. */
    if (imgId) next[name] = { ...(next[name] || {}), cover: imgId };else if (next[name]) {
      const m = { ...next[name] };
      delete m.cover;
      next[name] = m;
    }
    setBucketMeta(next);
    await sSet("buckets:meta", JSON.stringify(next));
    if (old && old !== imgId) dropImage(old); // only once the new one is safely recorded
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelected({});
    setBulkBucket("");
  };
  useEffect(() => {
    if (view !== "characters") exitSelect();
  }, [view]);
  const toggleSelect = id => setSelected(p => {
    const n = {
      ...p
    };
    if (n[id]) delete n[id];else n[id] = true;
    return n;
  });
  const bulkAssign = async bucket => {
    const ids = Object.keys(selected);
    if (!ids.length) return;
    const next = chars.map(c => selected[c.id] ? {
      ...c,
      bucket,
      updatedAt: Date.now()
    } : c);
    setChars(next);
    await sSet("chars:all", JSON.stringify(next));
    toast(ids.length + (ids.length === 1 ? " character" : " characters") + (bucket ? " moved to \u201c" + bucket + "\u201d" : " removed from their buckets"));
    exitSelect();
  };
  const [sort, setSortRaw] = useState("newest");
  useEffect(() => {
    if (!authState.checked || authState.locked) return; // storage is unreadable while locked
    sGet("ui:charsort").then(v => {
      if (v) setSortRaw(v);
    }).catch(() => {});
  }, [authState.checked, authState.locked]);
  const setSort = v => {
    setSortRaw(v);
    sSet("ui:charsort", v).catch(() => {}); // cosmetic; not worth a banner
  };
  const toast = useCallback(m => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(null), 2400);
  }, []);
  /* Drives the bar for anything that walks a list of pictures. Repainting on
     every file would cost more than the work itself on a small library, so it
     paints at most eight times a second — but always on the last one, so it
     never stops short of full. The estimate waits for a few files to go by,
     because the first one carries the cost of opening the store. */
  const zipTracker = useCallback((label, total) => {
    const start = Date.now();
    let done = 0, painted = 0;
    setZipProg({ label, done: 0, total, left: "" });
    return {
      step() {
        done++;
        const now = Date.now();
        if (now - painted < 120 && done < total) return;
        painted = now;
        const secs = (now - start) / 1000;
        let left = "";
        if (done > 3 && secs > 2 && total > done) {
          const rem = Math.round(secs / done * (total - done));
          /* "nearly done" belongs at the end, not wherever the running average
             happens to dip — it read that way at 58% on a library that sped up
             as the store warmed. Seconds are shown right down to one. */
          left = rem > 90 ? "about " + Math.ceil(rem / 60) + " minutes left" : rem >= 1 ? "about " + rem + " second" + (rem === 1 ? "" : "s") + " left" : "nearly done";
        }
        setZipProg({ label, done, total, left });
      },
      packing() {
        setZipProg({ label: "Packing the zip", done: total, total, left: "" });
      },
      clear() {
        setZipProg(null);
      }
    };
  }, []);

  /* Last line of defence for a failed write. sSet throws, which stops the caller
     before it announces success, but most callers have nowhere sensible to report
     it — so anything that gets away is surfaced here rather than vanishing into
     the console. Silence after a failed save is the one outcome worth ruling out. */
  useEffect(() => {
    const onReject = e => {
      const err = e && e.reason;
      const msg = err && err.message || String(err || "");
      if (/locked/i.test(msg)) toast("The vault is locked — nothing was saved");
      else toast("Couldn't save — your last change may not be stored");
      console.error("unhandled rejection", err);
    };
    window.addEventListener("unhandledrejection", onReject);
    return () => window.removeEventListener("unhandledrejection", onReject);
  }, [toast]);

  /* --- auth status --- */
  const refreshAuth = useCallback(async () => {
    let st = {
      passwordSet: false,
      pinSet: false,
      locked: false
    };
    if (window.auth) {
      try {
        st = await window.auth.status();
      } catch {}
    }
    setAuthState({
      ...st,
      checked: true
    });
    return st;
  }, []);
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  /* --- data load (only once unlocked) --- */
  useEffect(() => {
    if (!authState.checked || authState.locked) return;
    (async () => {
      /* A record that won't parse must never quietly become an empty list: the app
         would open looking wiped, and the next save would write that emptiness back
         over the real data. Collect the damage instead and refuse to open. */
      const damaged = [];
      const parse = (raw, key, fallback) => {
        if (!raw) return fallback;
        try {
          return JSON.parse(raw);
        } catch (e) {
          damaged.push(key);
          return fallback;
        }
      };
      try {
        const [c, p, l, pr] = await Promise.all([sGet("chars:all"), sGet("personas:all"), sGet("lore:all"), sGet("prompts:all")]);
        const charList = parse(c, "chars:all", []);
        const personaList = parse(p, "personas:all", []);
        const loreList = parse(l, "lore:all", []);
        const promptList = parse(pr, "prompts:all", []);
        const bucketM = parse(await sGet("buckets:meta"), "buckets:meta", {});
        const loreM = parse(await sGet("lore:meta"), "lore:meta", {});
        const promptM = parse(await sGet("prompts:meta"), "prompts:meta", {});
        const pbucketM = parse(await sGet("pbuckets:meta"), "pbuckets:meta", {});
        const blurList = parse(await sGet("blurset"), "blurset", []);
        const ts = await sGet("ui:textsize");
    const cds = await sGet("ui:cardsize");
        const ctr = await sGet("ui:contrast");
        const trashRaw = parse(await sGet("trash:all"), "trash:all", []);
        if (damaged.length) {
          setLoadError(damaged);
          return; // nothing is loaded, so nothing can be written back over it
        }
        setChars(charList);
        setPersonas(personaList);
        setLore(loreList);
        setPrompts(promptList);
        setBucketMeta(bucketM);
        setLoreMeta(loreM);
        setPromptMeta(promptM);
        setPBucketMeta(pbucketM); // always set: a stale one would survive a lock
        setTextSize(ts || "medium");
    setCardSize(cds || "medium");
        setContrast(ctr || "normal");
        setTrash(Array.isArray(trashRaw) ? trashRaw : []);
        const blObj = {};
        blurList.forEach(id => blObj[id] = true);
        setBlurred(blObj);
        setLoadError(null);
        setReady(true);
        charList.forEach(ch => {
          if (ch.profileImg) loadImage(ch.profileImg);
        });
      } catch (e) {
        setLoadError([]); // storage itself failed; damaged list is unknown
      }
    })();
  }, [authState.checked, authState.locked]);

  /* Previews (thumbs) for the library. On a phone every picture preview is
     queued after unlock so cards, the dashboard wall and galleries are not
     blank. Originals stay on disk until a record is opened. On Windows only
     portraits and covers load up front — pulling every gallery at once is
     what made the desktop app hitch. */
  useEffect(() => {
    if (!ready) return;
    const onPhone = typeof window !== "undefined" && !!window.Capacitor;
    chars.forEach(c => {
      if (c.profileImg) loadImage(c.profileImg);
      if (onPhone) charImgIds(c).forEach(id => loadImage(id));
    });
    personas.forEach(p => {
      if (p.avatar) loadImage(p.avatar);
      if (onPhone) personaImgIds(p).forEach(id => loadImage(id));
    });
    Object.values(bucketMeta).forEach(m => {
      if (m && m.cover) loadImage(m.cover);
    });
    if (!onPhone) return;
    lore.forEach(e => (e.images || []).forEach(im => im && im.imgId && loadImage(im.imgId)));
    Object.values(loreMeta).forEach(m => {
      if (m && m.cover) loadImage(m.cover);
    });
    prompts.forEach(p => (p.images || []).forEach(im => im && im.imgId && loadImage(im.imgId)));
    Object.values(promptMeta).forEach(m => {
      if (m && m.cover) loadImage(m.cover);
    });
  }, [ready, chars, personas, bucketMeta, lore, loreMeta, prompts, promptMeta]);

  /* --- one-time thumbnail upgrade: regenerate crisp 1000px thumbs from originals --- */
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        if ((await sGet("thumbver")) === "2") return;
        const ids = new Set();
        chars.forEach(c => {
          if (c.profileImg) ids.add(c.profileImg);
          (c.gallery || []).forEach(g => ids.add(g.imgId));
        });
        personas.forEach(p => {
          if (p.avatar) ids.add(p.avatar);
        });
        for (const id of ids) {
          try {
            const orig = await sGet("img:" + id);
            if (!orig) continue;
            const th = await makeThumb(orig);
            if (th) {
              await sSet("th:" + id, th);
              setImgCache(p => ({
                ...p,
                [id]: th
              }));
            } else {
              await sDel("th:" + id);
              setImgCache(p => ({
                ...p,
                [id]: orig
              }));
            }
          } catch {}
        }
        await sSet("thumbver", "2");
      } catch {}
    })();
  }, [ready]);
  const [blurred, setBlurred] = useState({});
  /* Saving from inside a setState updater is not safe: React may run an updater
     more than once, which wrote the same thing twice, and a write that failed
     had nowhere to report. The list is mirrored in a ref so the new value can
     be worked out and stored outside the updater. */
  const blurredRef = useRef(blurred);
  blurredRef.current = blurred;
  const persistBlur = useCallback(next => {
    blurredRef.current = next;
    setBlurred(next);
    return sSet("blurset", JSON.stringify(Object.keys(next))).catch(() => {});
  }, []);
  const toggleBlur = useCallback(imgId => {
    if (!imgId) return;
    const next = { ...blurredRef.current };
    if (next[imgId]) delete next[imgId];else next[imgId] = true;
    persistBlur(next);
  }, [persistBlur]);
  /* Deleting a picture removed the picture and nothing else, so its id stayed on
     the blur list for the life of the vault. Nothing cleans that list, so it only
     ever grew — and it travels in every backup. */
  const forgetBlur = useCallback(ids => {
    const idSet = new Set([...ids].filter(Boolean));
    if (!idSet.size) return;
    const next = { ...blurredRef.current };
    let touched = false;
    idSet.forEach(id => {
      if (next[id]) {
        delete next[id];
        touched = true;
      }
    });
    if (touched) persistBlur(next);
  }, [persistBlur]);
  /* Every place that removed a picture had to remember to also take it off the
     blur list, and most of them did not — so the list only ever grew, and it
     travels in every backup. One helper now does both, so forgetting is no
     longer possible. */
  const dropImage = useCallback(id => {
    if (!id) return;
    forgetBlur([id]);
    sDel("img:" + id);
    sDel("th:" + id);
    sDel("sz:" + id);
    imgLoading.current.delete(id);
    fullLoading.current.delete(id);
    delete imgBuf.current[id];
    delete fullMem.current[id];
    delete fullBuf.current[id];
    fullPinned.current.delete(id);
    fullShow.current.delete(id);
    imgQueue.current = imgQueue.current.filter(x => x !== id);
    fullUrgent.current = fullUrgent.current.filter(x => x !== id);
    fullIdle.current = fullIdle.current.filter(x => x !== id);
    fullOrder.current = fullOrder.current.filter(x => x !== id);
    fullShowOrder.current = fullShowOrder.current.filter(x => x !== id);
    setImgCache(p => {
      if (!p[id]) return p;
      const n = { ...p };
      delete n[id];
      return n;
    });
    setFullCache(p => {
      if (!p[id]) return p;
      const n = { ...p };
      delete n[id];
      return n;
    });
  }, [forgetBlur]);

  /* --- one-time: lift known character sections into first-class fields --- */
  useEffect(() => {
    if (!ready || !chars.length) return;
    (async () => {
      try {
        if ((await sGet("charfields")) === "1") return;
        const liftMap = {
          "scenario": "scenario",
          "first message": "firstMessage",
          "example dialogue": "exampleMessage",
          "example messages": "exampleMessage",
          "creator notes": "creatorMemo",
          "creator memo": "creatorMemo",
          "system prompt": "systemPrompt",
          "super system prompt": "alwaysActiveSystemPrompt",
          "always-active system prompt": "alwaysActiveSystemPrompt"
        };
        let changed = false;
        const next = chars.map(c => {
          const out = {
            ...c
          };
          let touched = false;
          const remaining = [];
          (c.sections || []).forEach(s => {
            const f = liftMap[(s.title || "").trim().toLowerCase()];
            if (f && !out[f] && (s.content || "").trim()) {
              out[f] = s.content;
              touched = true;
            } else remaining.push(s);
          });
          if (touched) {
            out.sections = remaining;
            out.sectionOrder = null;
          }
          if (!out.tagline && (out.tags || []).length) {
            out.tagline = out.tags.join(" | ");
            touched = true;
          }
          if (touched) changed = true;
          return touched ? out : c;
        });
        if (changed) {
          setChars(next);
          await sSet("chars:all", JSON.stringify(next));
        }
        await sSet("charfields", "1");
      } catch {}
    })();
  }, [ready]);

  /* --- one-time: lift legacy "— Type/Triggers" footers into real fields --- */
  useEffect(() => {
    if (!ready || !lore.length) return;
    (async () => {
      try {
        if ((await sGet("lorefields")) === "1") return;
        let changed = false;
        const next = lore.map(e => {
          if (e.entryType || e.triggers && e.triggers.length) return e;
          const m = /\n\n— (?:Type: ([^·\n]+?))?(?: · )?(?:Triggers: ([^\n]+))?$/.exec(e.content || "");
          if (!m || !m[1] && !m[2]) return e;
          changed = true;
          return {
            ...e,
            content: e.content.slice(0, m.index),
            entryType: (m[1] || "").trim(),
            triggers: m[2] ? m[2].split(",").map(s => s.trim()).filter(Boolean) : []
          };
        });
        if (changed) {
          setLore(next);
          await sSet("lore:all", JSON.stringify(next));
        }
        await sSet("lorefields", "1");
      } catch {}
    })();
  }, [ready]);
  const [dashSeed, setDashSeed] = useState(() => Date.now() & 0x7fffffff || 1);
  const [wallLb, setWallLb] = useState(null); // { items, index } for the dashboard gallery lightbox
  const [wallTick, setWallTick] = useState(0);
  const wallHoverRef = useRef(false);
  const wallRef = useRef(null);
  const [wallCols, setWallCols] = useState(4);
  useEffect(() => {
    const measure = () => {
      const el = wallRef.current;
      if (!el) return;
      let cols = 0;
      try {
        const tpl = window.getComputedStyle(el).gridTemplateColumns || "";
        cols = tpl.split(" ").filter(x => x && x !== "0px").length;
      } catch (e) {}
      if (!cols) {
        const w = el.clientWidth || 0;
        cols = Math.max(1, Math.floor(w / 240));
      }
      setWallCols(prev => prev === cols ? prev : cols);
    };
    measure();
    let ro = null;
    if (typeof ResizeObserver !== "undefined" && wallRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(wallRef.current);
    }
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      if (ro) ro.disconnect();
    };
  }, [view]);
  const DASH_KEYS = ["quick", "spotlight", "recent", "wall"];
  const [dashOrder, setDashOrderRaw] = useState(DASH_KEYS);
  useEffect(() => {
    if (!authState.checked || authState.locked) return;
    sGet("ui:dashorder").then(v => {
      if (!v) return;
      try {
        const arr = JSON.parse(v).filter(k => DASH_KEYS.includes(k));
        DASH_KEYS.forEach(k => {
          if (!arr.includes(k)) arr.push(k);
        });
        setDashOrderRaw(arr);
      } catch (e) {}
    }).catch(() => {});
  }, [authState.checked, authState.locked]);
  const setDashOrder = arr => {
    setDashOrderRaw(arr);
    sSet("ui:dashorder", JSON.stringify(arr)).catch(() => {}); // cosmetic; not worth a banner
  };
  const dashOrderChanged = JSON.stringify(dashOrder) !== JSON.stringify(DASH_KEYS);
  const resetDashLayout = async () => {
    setDashOrderRaw(DASH_KEYS.slice());
    await sDel("ui:dashorder");
    toast("Dashboard layout reset to default");
  };
  const [dashDrag, setDashDrag] = useState(null);
  const [dashOver, setDashOver] = useState(null);
  const moveDash = (key, dir) => {
    const i = dashOrder.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= dashOrder.length) return;
    const next = dashOrder.slice();
    const t = next[i];
    next[i] = next[j];
    next[j] = t;
    setDashOrder(next);
  };
  const [showGuide, setShowGuide] = useState(false);
  const [statsOpen, setStatsOpen] = useState(null); // null | { title, subtitle?, rows, note?, loading }
  /* Adds up what a set of pictures takes on disk. Sizes recorded at save time
     cost a few bytes each to read; anything from before that (or from an
     import) is measured once and then recorded, so the slow path happens at
     most once per picture. The reads run eight at a time rather than one after
     another — the round trip is the cost, not the arithmetic. */
  const measureImages = useCallback(async ids => {
    const want = [...new Set(ids.filter(Boolean))];
    let bytes = 0;
    const missing = [];
    const CONC = 8;
    for (let i = 0; i < want.length; i += CONC) {
      const slice = want.slice(i, i + CONC);
      const got = await Promise.all(slice.map(id => sGet("sz:" + id).catch(() => null)));
      got.forEach((v, j) => {
        const n = v == null ? NaN : Number(v);
        if (Number.isFinite(n)) bytes += n;else missing.push(slice[j]);
      });
    }
    for (let i = 0; i < missing.length; i += CONC) {
      const slice = missing.slice(i, i + CONC);
      const got = await Promise.all(slice.map(id => sGet("img:" + id).catch(() => null)));
      await Promise.all(got.map((v, j) => {
        const n = dataUrlSize(v);
        bytes += n;
        return v ? sSet("sz:" + slice[j], String(n)).catch(() => {}) : Promise.resolve();
      }));
    }
    return { bytes, count: want.length };
  }, []);
  const openVaultStats = async () => {
    setStatsOpen({
      title: "Your vault",
      loading: true,
      rows: []
    });
    try {
      const allText = chars.map(textOfChar).join("\n") + "\n" + personas.map(textOfPersona).join("\n") + "\n" + lore.map(e => [e.title, e.content, (e.triggers || []).join(" ")].join("\n")).join("\n") + "\n" + prompts.map(p => [p.title, p.content].join("\n")).join("\n");
      const ts = textStats(allText);
      const {
        keys
      } = await sList();
      const imgKeys = keys.filter(k => k.startsWith("img:"));
      const measured = await measureImages(imgKeys.map(k => k.slice(4)));
      const bytes = measured.bytes;
      setStatsOpen({
        title: "Your vault",
        subtitle: chars.length + " characters · " + personas.length + " personas · " + lore.length + " lore · " + prompts.length + " prompts",
        rows: [["Images stored", fmtNum(imgKeys.length)], ["Total image size (originals)", fmtBytes(bytes)], ["Words written", fmtNum(ts.words)], ["Letters (excl. spaces)", fmtNum(ts.letters)], ["Characters (incl. spaces)", fmtNum(ts.chars)], ["Est. AI tokens", "~" + fmtNum(ts.tokens)]],
        note: "Token estimate uses the common ~4 characters per token heuristic; actual usage varies by model and tokenizer."
      });
    } catch (e) {
      setStatsOpen(null);
      toast("Couldn't compute stats");
    }
  };
  const openRecordStats = async (title, text, imgIds, budget, budgetNote) => {
    setStatsOpen({
      title,
      loading: true,
      rows: []
    });
    try {
      const ts = textStats(text);
      const ids = [...new Set(imgIds.filter(Boolean))];
      const bytes = (await measureImages(ids)).bytes;
      const rows = [];
      if (budget) {
        const tilde = n => "~" + fmtNum(n);
        const withChars = g => tilde(g.total) + "  ·  " + fmtNum(g.chars) + " chars";
        const section = (head, g, emptyText) => {
          rows.push([head, withChars(g), "head"]);
          if (g.items.length) g.items.forEach(([l, n]) => rows.push([l, tilde(n), "sub"]));else rows.push([emptyText, "—", "sub"]);
        };
        section("Permanent", budget.permanent, "Nothing written yet");
        section("Temporary", budget.temporary, "Nothing here");
        rows.push(["Total", withChars({ total: budget.total, chars: budget.totalChars })]);
        /* Permanent is the figure CharSnap gives a number for, so say where this
           character sits against it instead of leaving it to be guessed. */
        const perm = budget.permanent.total;
        rows.push(["Permanent vs CharSnap's guide", perm >= PERMANENT_ROUGH ? tilde(perm) + " — past 3,000, expect quality to drop" : perm > PERMANENT_GUIDE ? tilde(perm) + " — over the 2,000 they suggest" : tilde(perm) + " of 2,000 suggested"]);
        if (budget.unsent.total) {
          rows.push(["Never sent", tilde(budget.unsent.total), "head"]);
          budget.unsent.items.forEach(([l, n]) => rows.push([l, tilde(n), "sub"]));
        }
      }
      rows.push(["Pictures", fmtNum(ids.length)], ["Picture size (originals)", fmtBytes(bytes)], ["Words", fmtNum(ts.words)], ["Letters (excl. spaces)", fmtNum(ts.letters)], ["Characters (incl. spaces)", fmtNum(ts.chars)], ["Est. AI tokens, everything", "~" + fmtNum(ts.tokens)]);
      setStatsOpen({
        title,
        subtitle: budgetNote,
        rows,
        note: (budget ? "Permanent is always in the conversation, so it is spent again on every reply — that is the figure worth keeping down. Temporary goes in at the start and may be trimmed once the chat gets long. Custom sections are folded into the description, which is where they end up on CharSnap. " + (budget.overrides.total ? "Your prompt overrides come to about " + fmtNum(budget.overrides.total) + " tokens; CharSnap counts those against their own separate allowance, so they are not in the figures above. " : "") + "The bottom rows count every written field, including all variants. " : "Text counts every written field (including variants and sections). ") + "Tokens are an estimate at roughly 4 characters each, which is CharSnap's own rule of thumb; every model counts them slightly differently. Text in Cyrillic, Chinese, Japanese or Korean is often counted a token per character, so for those this figure reads low."
      });
    } catch (e) {
      setStatsOpen(null);
      toast("Couldn't compute stats");
    }
  };
  const [textSize, setTextSize] = useState("medium"); // reading size for prose: small | medium | large
  const [cardSize, setCardSize] = useState("medium"); // character and persona cards: small | medium | large
  const [contrast, setContrast] = useState("normal"); // text contrast boost: normal | high | max
  const [trash, setTrash] = useState([]); // [{tid, type, record, deletedAt}] — restorable deletes
  const proseSizePx = textSize === "small" ? "13px" : textSize === "large" ? "16px" : "14.5px";
  const cardMinPx = cardSize === "small" ? "132px" : cardSize === "large" ? "268px" : "180px";
  const applyTextSize = async s => {
    setTextSize(s);
    await sSet("ui:textsize", s);
  };
  const applyCardSize = async s => {
    setCardSize(s);
    await sSet("ui:cardsize", s);
  };
  const applyContrast = async v => {
    setContrast(v);
    await sSet("ui:contrast", v);
  };
  useEffect(() => {
    if (view !== "dashboard") return;
    const t = setInterval(() => {
      if (!wallHoverRef.current) setWallTick(x => x + 1);
    }, 10000);
    return () => clearInterval(t);
  }, [view]);
  const [personaQ, setPersonaQ] = useState("");
  const [pSelMode, setPSelMode] = useState(false);
  const [pSelected, setPSelected] = useState({});
  const [pConfirmDel, setPConfirmDel] = useState(false);
  const [pBucketFilter, setPBucketFilter] = useState(null);
  const [pBucketMeta, setPBucketMeta] = useState({});
  const [pBulkBucket, setPBulkBucket] = useState("");
  const [pNewBucketOpen, setPNewBucketOpen] = useState(false);
  const createEmptyPersonaBucket = async name => {
    const n = (name || "").trim();
    if (!n) return;
    if (pBucketMeta[n] || personas.some(p => (p.bucket || "").trim() === n)) {
      toast("A bucket with that name already exists");
      return;
    }
    const next = {
      ...pBucketMeta,
      [n]: {}
    };
    setPBucketMeta(next);
    await sSet("pbuckets:meta", JSON.stringify(next));
    setPNewBucketOpen(false);
    toast("Bucket \u201c" + n + "\u201d created — assign personas any time");
  };
  const deleteEmptyPersonaBucket = async name => {
    const next = {
      ...pBucketMeta
    };
    const cover = next[name] && next[name].cover; // same leak as character buckets
    if (cover) {
      forgetBlur([cover]);
      dropImage(cover);
    }
    delete next[name];
    setPBucketMeta(next);
    await sSet("pbuckets:meta", JSON.stringify(next));
    if (pBucketFilter === name) setPBucketFilter(null);
    toast("Bucket deleted");
  };
  const pBulkAssign = async name => {
    const ids = new Set(Object.keys(pSelected));
    if (!ids.size) return;
    const next = personas.map(p => ids.has(p.id) ? {
      ...p,
      bucket: (name || "").trim(),
      updatedAt: Date.now()
    } : p);
    setPersonas(next);
    await sSet("personas:all", JSON.stringify(next));
    setPSelected({});
    setPSelMode(false);
    setPBulkBucket("");
    toast(name.trim() ? "Assigned to \u201c" + name.trim() + "\u201d" : "Removed from bucket");
  };
  useEffect(() => {
    setPConfirmDel(false);
  }, [pSelected, pSelMode]);
  // same as characters: the bin applies however many you delete at once
  const bulkDeletePersonas = async ids => {
    const idSet = new Set(ids);
    const going = personas.filter(p => idSet.has(p.id));
    const next = personas.filter(p => !idSet.has(p.id));
    setPersonas(next);
    await sSet("personas:all", JSON.stringify(next));
    await sendManyToTrash("persona", going);
    setPSelected({});
    setPConfirmDel(false);
    setPSelMode(false);
    toast(going.length + (going.length === 1 ? " persona" : " personas") + " moved to the bin — restore from Settings within " + TRASH_DAYS + " days");
  };
  useEffect(() => {
    if (view === "dashboard") setDashSeed(Date.now() & 0x7fffffff || 1);
  }, [view]);
  /* Dropping a file anywhere the app is not itself handling the drop makes the
     browser open that file in place of the app — the interface vanishes and the
     window is showing raw JSON until it is restarted. Given the whole point of
     this app is importing JSON files, that is a drop people will make. The
     app's own drag handlers cancel the event themselves and are unaffected;
     this only catches what would otherwise have navigated. */
  useEffect(() => {
    const swallow = e => e.preventDefault();
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);
  const lockVault = async () => {
    if (window.auth) await window.auth.lock();
    setReady(false);
    setChars([]);
    setPersonas([]);
    setLore([]);
    setPrompts([]);
    setTrash([]); // deleted records are still whole records — locking must drop them too
    setImgCache({});
    setFullCache({});
    /* The caches are gone, so what has been loaded must be forgotten too.
       Left behind, every picture would count as already handled and none of
       them would ever load again after unlocking. */
    imgLoading.current.clear();
    imgBuf.current = {};
    imgQueue.current = [];
    imgBusy.current = 0;
    fullLoading.current.clear();
    fullOrder.current = [];
    fullUrgent.current = [];
    fullIdle.current = [];
    fullBusy.current = 0;
    fullPinned.current.clear();
    fullMem.current = {};
    fullBuf.current = {};
    fullEvict.current = [];
    if (fullFlush.current) {
      clearTimeout(fullFlush.current);
      fullFlush.current = null;
    }
    if (imgFlush.current) {
      clearTimeout(imgFlush.current);
      imgFlush.current = null;
    }
    if (fullPumpTimer.current) {
      clearTimeout(fullPumpTimer.current);
      fullPumpTimer.current = null;
    }
    fullGen.current++;
    fullShow.current.clear();
    fullShowOrder.current = [];
    setBlurred({});
    setEditingChar(null);
    setEditingRecord(null);
    setShowSettings(false);
    setViewCharId(null);
    setViewLoreBook(null);
    setPersonaGrid(false);
    setBucketMeta({});
    setViewPersonaId(null);
    setLoreMeta({});
    setViewLoreEntryId(null);
    setNewBookOpen(false);
    setWallLb(null);
    setPromptMeta({});
    setViewPromptBook(null);
    setViewPromptEntryId(null);
    setNewPBookOpen(false);
    setAuthState(a => ({
      ...a,
      locked: true
    }));
  };
  const lockVaultRef = useRef(lockVault);
  lockVaultRef.current = lockVault;
  const authRef = useRef(authState);
  authRef.current = authState;
  /* Home, Recents, or switching apps on a phone must lock. FLAG_SECURE hides
     the preview; this asks for the PIN again. A file picker also pauses the
     activity, so those clicks get a short pass. A copy in flight keeps the
     keys so it can finish with the screen off. */
  useEffect(() => {
    if (typeof window === "undefined" || !window.Capacitor) return;
    let deferUntil = 0;
    let t = 0;
    const defer = () => {
      deferUntil = Date.now() + 2500;
    };
    const hide = () => {
      const a = authRef.current;
      if (!a || a.locked || !a.checked) return;
      if (!a.passwordSet && !a.pinSet) return;
      if (Date.now() < deferUntil) return;
      const run = () => {
        if (lockVaultRef.current) lockVaultRef.current();
      };
      if (window.transfer && typeof window.transfer.status === "function") {
        window.transfer.status().then(s => {
          if (s && s.active) return;
          run();
        }).catch(run);
        return;
      }
      run();
    };
    window.__rcvOnBackground = hide;
    window.__rcvDeferLock = defer;
    const onVis = () => {
      if (!document.hidden) return;
      clearTimeout(t);
      t = setTimeout(hide, 200);
    };
    const onFile = e => {
      const el = e.target;
      if (el && el.closest && el.closest('input[type="file"]')) defer();
    };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("click", onFile, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("click", onFile, true);
      try {
        delete window.__rcvOnBackground;
        delete window.__rcvDeferLock;
      } catch (e) {}
    };
  }, []);
  /* Every thumbnail used to arrive as its own state update, each one copying
     the whole cache and re-rendering the app. That is quadratic: at 4,000
     pictures the copying alone measured 1,224ms against 28ms batched, before
     counting 4,000 renders. Arrivals are now collected and flushed together.

     The in-flight set also stops the same picture being read several times
     over — the old guard only skipped ones that had already finished loading,
     so a burst asked for the same file repeatedly. A read that fails or finds
     nothing is taken back out, so it can still be retried later. */
  const imgLoading = useRef(new Set());
  const imgBuf = useRef({});
  const imgFlush = useRef(null);
  const imgOrder = useRef([]);
  const imgBytes = useRef({});
  const imgTotal = useRef(0);
  const ON_PHONE = typeof window !== "undefined" && !!window.Capacitor;
  /* ON_PHONE only means "running on Android", and a twelve inch tablet with
     eight gigabytes was being given a budget phone's limits. Android's own
     definition of a large screen is a shortest edge of 600dp, and the shortest
     edge is used because it does not change when the device is turned over.
     deviceMemory is reported in gigabytes and capped at 8 by the browser; when
     it is missing, assume modest rather than generous. */
  const SHORT_EDGE = typeof window !== "undefined" && window.screen
    ? Math.min(window.screen.width || 0, window.screen.height || 0) : 0;
  const ON_TABLET = ON_PHONE && SHORT_EDGE >= 600;
  const DEVICE_GB = (typeof navigator !== "undefined" && Number(navigator.deviceMemory)) || (ON_TABLET ? 4 : 3);
  /* A picture with no thumbnail may still be drawn on a card from its
     original, but only on a phone if it is small. */
  const PHONE_CARD_MAX = 1000000;
  /* A data URL is a JavaScript string, so it costs about two bytes of memory
     per character. The budget below is that memory cost, not the file size. */
  const IMG_CACHE_BYTES = ON_PHONE
    ? Math.round(Math.max(2, Math.min(8, DEVICE_GB)) * 55) * 1024 * 1024
    : 0;
  const queueImg = useCallback((id, v) => {
    imgBuf.current[id] = v;
    if (imgFlush.current) return;
    imgFlush.current = setTimeout(() => {
      const batch = imgBuf.current;
      imgBuf.current = {};
      imgFlush.current = null;
      const ids = Object.keys(batch);
      if (!ids.length) return;
      setImgCache(p => {
        const next = { ...p, ...batch };
        if (!IMG_CACHE_BYTES) return next;
        ids.forEach(i => {
          const had = imgBytes.current[i] || 0;
          imgBytes.current[i] = String(batch[i] || "").length * 2;
          imgTotal.current += imgBytes.current[i] - had;
          imgOrder.current = imgOrder.current.filter(x => x !== i).concat(i);
        });
        const evict = [];
        /* Never drop what is on screen right now, however long the queue gets. */
        while (imgTotal.current > IMG_CACHE_BYTES && imgOrder.current.length > 1) {
          const eid = imgOrder.current.shift();
          if (fullPinned.current.has(eid)) {
            imgOrder.current.push(eid);
            if (imgOrder.current.every(x => fullPinned.current.has(x))) break;
            continue;
          }
          evict.push(eid);
          imgTotal.current -= imgBytes.current[eid] || 0;
          delete imgBytes.current[eid];
        }
        evict.forEach(eid => {
          delete next[eid];
          imgLoading.current.delete(eid);
        });
        return next;
      });
    }, 16);
  }, []);
  const imgQueue = useRef([]);
  const imgBusy = useRef(0);
  const IMG_INFLIGHT = ON_TABLET ? 4 : ON_PHONE ? 3 : 4;
  const quietRef = useRef(false);
  const pumpImg = useCallback(() => {
    if (quietRef.current) return;
    while (imgBusy.current < IMG_INFLIGHT && imgQueue.current.length) {
      const imgId = imgQueue.current.shift();
      imgBusy.current++;
      Promise.resolve().then(async () => {
        try {
          const v = await sGet("th:" + imgId);
          if (v) {
            queueImg(imgId, v);
            return;
          }
          /* Full originals stay on disk on a phone unless there is no
             thumbnail and the original is small enough for a card. Loading
             every gallery original is what closed the app. */
          let allowFull = !ON_PHONE;
          let sizeKnown = true;
          if (ON_PHONE) {
            try {
              const n = Number(await sGet("sz:" + imgId));
              sizeKnown = Number.isFinite(n) && n > 0;
              allowFull = sizeKnown ? n < PHONE_CARD_MAX : true;
            } catch (e) {
              allowFull = false;
              sizeKnown = false;
            }
          }
          if (allowFull) {
            const full = await sGet("img:" + imgId);
            if (full) {
              const size = dataUrlSize(full);
              if (ON_PHONE && !sizeKnown) sSet("sz:" + imgId, String(size)).catch(() => {});
              if (!ON_PHONE || size < PHONE_CARD_MAX) {
                queueImg(imgId, full);
                return;
              }
            }
          }
          imgLoading.current.delete(imgId);
        } catch (e) {
          imgLoading.current.delete(imgId); // a picture that will not load shows as blank, not as a save failure
        } finally {
          imgBusy.current--;
          pumpImg();
        }
      });
    }
  }, [queueImg]);
  const loadImage = useCallback(async imgId => {
    if (!imgId || imgLoading.current.has(imgId)) return;
    imgLoading.current.add(imgId);
    imgQueue.current.push(imgId);
    pumpImg();
  }, [pumpImg]);
  const [fullCache, setFullCache] = useState({});
  /* Full originals live in a side store so background loading after unlock
     does not redraw the window. React state only gets the pictures the open
     character (or the current swipe) actually needs. One file at a time when
     idle; the open record jumps the queue. */
  /* A tablet shows far more pictures at once than a phone, so holding only
     eight ready meant the rest were fetched again as they scrolled into view. */
  const FULL_CACHE_MAX = ON_TABLET ? 24 : ON_PHONE ? 8 : 48;
  const FULL_MEM_MAX = ON_TABLET ? 48 : ON_PHONE ? 24 : 64;
  const fullMem = useRef({});
  const fullLoading = useRef(new Set());
  const fullOrder = useRef([]);
  const fullUrgent = useRef([]);
  const fullIdle = useRef([]);
  const fullBusy = useRef(0);
  const fullPinned = useRef(new Set());
  const fullShow = useRef(new Set());
  const fullShowOrder = useRef([]);
  const fullBuf = useRef({});
  const fullEvict = useRef([]);
  const fullFlush = useRef(null);
  const fullPumpTimer = useRef(null);
  const fullGen = useRef(0);
  const flushFull = useCallback(() => {
    fullFlush.current = null;
    if (quietRef.current) return;
    const raw = fullBuf.current;
    fullBuf.current = {};
    const evict = fullEvict.current;
    fullEvict.current = [];
    if (!Object.keys(raw).length && !evict.length) return;
    setFullCache(p => {
      const next = { ...p, ...raw };
      evict.forEach(id => delete next[id]);
      return next;
    });
  }, []);
  const markShow = useCallback(imgId => {
    if (!imgId) return;
    fullShow.current.add(imgId);
    fullShowOrder.current = fullShowOrder.current.filter(x => x !== imgId).concat(imgId);
    while (fullShowOrder.current.length > FULL_CACHE_MAX) {
      const eid = fullShowOrder.current.shift();
      /* Pinned means the open character or persona: those are already in
         memory, and the cache holds the same string rather than a copy, so
         keeping them on screen costs nothing and saves reading them again. */
      if (fullPinned.current.has(eid)) {
        fullShowOrder.current.push(eid);
        if (fullShowOrder.current.every(x => fullPinned.current.has(x))) break;
        continue;
      }
      fullShow.current.delete(eid);
      if (eid !== imgId) fullEvict.current.push(eid);
    }
  }, []);
  const trimFullMem = useCallback(() => {
    const pinned = fullPinned.current;
    let extra = 0;
    fullOrder.current.forEach(id => {
      if (!pinned.has(id)) extra++;
    });
    if (extra <= FULL_MEM_MAX) return;
    const keep = [];
    let drop = extra - FULL_MEM_MAX;
    fullOrder.current.forEach(id => {
      if (!pinned.has(id) && drop > 0) {
        delete fullMem.current[id];
        fullEvict.current.push(id);
        drop--;
      } else keep.push(id);
    });
    fullOrder.current = keep;
  }, []);
  const pumpFull = useCallback(() => {
    if (quietRef.current) return;
    const inflight = fullUrgent.current.length ? 2 : 1;
    while (fullBusy.current < inflight && (fullUrgent.current.length || fullIdle.current.length)) {
      const imgId = fullUrgent.current.shift() || fullIdle.current.shift();
      if (!imgId) continue;
      if (fullMem.current[imgId]) {
        fullLoading.current.delete(imgId);
        if (fullShow.current.has(imgId)) {
          fullBuf.current[imgId] = fullMem.current[imgId];
          if (!fullFlush.current) fullFlush.current = setTimeout(flushFull, 50);
        }
        continue;
      }
      fullBusy.current++;
      const gen = fullGen.current;
      const show = fullShow.current.has(imgId);
      sGet("img:" + imgId).then(v => {
        if (gen !== fullGen.current) return;
        fullLoading.current.delete(imgId);
        if (!v) return;
        fullMem.current[imgId] = v;
        fullOrder.current = fullOrder.current.filter(x => x !== imgId).concat(imgId);
        trimFullMem();
        if (fullShow.current.has(imgId) || show) fullBuf.current[imgId] = v;
        if (!fullFlush.current) fullFlush.current = setTimeout(flushFull, 50);
      }).catch(() => {
        if (gen !== fullGen.current) return;
        fullLoading.current.delete(imgId);
      }).finally(() => {
        if (gen !== fullGen.current) return;
        fullBusy.current--;
        if (fullPumpTimer.current) return;
        fullPumpTimer.current = setTimeout(() => {
          fullPumpTimer.current = null;
          pumpFull();
        }, show ? 0 : 30);
      });
    }
  }, [flushFull, trimFullMem]);
  const queueFull = useCallback((imgId, urgent) => {
    if (!imgId) return;
    if (fullMem.current[imgId]) {
      fullLoading.current.delete(imgId);
      return;
    }
    if (fullLoading.current.has(imgId)) {
      if (urgent) {
        const i = fullIdle.current.indexOf(imgId);
        if (i >= 0) {
          fullIdle.current.splice(i, 1);
          fullUrgent.current.unshift(imgId);
          pumpFull();
        }
      }
      return;
    }
    fullLoading.current.add(imgId);
    if (urgent) fullUrgent.current.unshift(imgId);else fullIdle.current.push(imgId);
    pumpFull();
  }, [pumpFull]);
  const requestFull = useCallback((imgId, urgent) => {
    if (!imgId) return;
    markShow(imgId);
    if (fullMem.current[imgId]) {
      fullBuf.current[imgId] = fullMem.current[imgId];
      if (!fullFlush.current) fullFlush.current = setTimeout(flushFull, 0);
      return;
    }
    queueFull(imgId, urgent !== false);
  }, [queueFull, flushFull, markShow]);
  const warmFull = useCallback(ids => {
    const list = [];
    const seen = new Set();
    (ids || []).forEach(id => {
      if (id && !seen.has(id)) {
        seen.add(id);
        list.push(id);
      }
    });
    list.forEach(id => fullPinned.current.add(id));
    list.forEach((id, i) => {
      if (i < FULL_CACHE_MAX) requestFull(id, true);
      else queueFull(id, true);
    });
    return () => {
      list.forEach(id => fullPinned.current.delete(id));
    };
  }, [requestFull, queueFull]);
  useEffect(() => {
    quietRef.current = !!(showSettings || showGuide);
    if (quietRef.current) return;
    pumpImg();
    pumpFull();
    flushFull();
  }, [showSettings, showGuide, pumpImg, pumpFull, flushFull]);
  /* After unlock, walk every picture once and pull the original in the
     background — one file at a time, no redraw until that picture is on
     screen. Opening a character jumps its files to the front of the line. */
  useEffect(() => {
    if (!ready) return;
    const ids = [];
    const add = id => {
      if (id) ids.push(id);
    };
    chars.forEach(c => charImgIds(c).forEach(add));
    personas.forEach(p => personaImgIds(p).forEach(add));
    lore.forEach(e => (e.images || []).forEach(im => add(im && im.imgId)));
    prompts.forEach(p => (p.images || []).forEach(im => add(im && im.imgId)));
    [bucketMeta, loreMeta, promptMeta].forEach(meta => {
      Object.values(meta || {}).forEach(m => add(m && m.cover));
    });
    ids.forEach(id => queueFull(id, false));
  }, [ready, chars, personas, lore, prompts, bucketMeta, loreMeta, promptMeta, queueFull]);
  /* Write first, show second. Filling the caches up front meant a picture that
     failed to save — a full disk, a browser storage limit — appeared on screen
     as though it had worked, and only revealed itself as missing after a
     restart. sSet was fixed to throw for exactly this reason; doing the display
     before the write put the same lie back one level up. */
  const saveImage = useCallback(async (imgId, dataUrl, thumb) => {
    await sSet("img:" + imgId, dataUrl);
    if (thumb) await sSet("th:" + imgId, thumb);
    /* Stats used to read every original back in full just to measure it — the
       whole vault, one picture at a time, to work out a byte count from the
       length of a string. An image never changes once written (a replacement
       gets a new id), so its size is recorded here, once, and read from a few
       bytes instead of a few megabytes. A failure here is not worth losing the
       picture over; a missing size is filled in the next time stats runs. */
    try {
      await sSet("sz:" + imgId, String(dataUrlSize(dataUrl)));
    } catch (e) {}
    fullMem.current[imgId] = dataUrl;
    fullOrder.current = fullOrder.current.filter(x => x !== imgId).concat(imgId);
    markShow(imgId);
    setImgCache(p => ({
      ...p,
      [imgId]: thumb || dataUrl
    }));
    setFullCache(p => ({
      ...p,
      [imgId]: dataUrl
    }));
  }, [markShow]);
  /* Read failures and save failures need different words: one means check the
     file, the other means the vault could not keep it. Saying "couldn't read
     those images" when the disk is full sends you looking in the wrong place. */
  /* One picture, same distinction the multi-image adders make: a file that
     cannot be read is your file's problem, a picture that cannot be written is
     the vault running out of room, and telling you the first when it is the
     second sends you looking in the wrong place. */
  const readThenSave = async file => {
    let orig;
    try {
      orig = await fileToDataUrl(file);
    } catch (e) {
      const err = new Error("unreadable");
      err.rcvUnreadable = true;
      throw err;
    }
    const thumb = await makeThumb(orig).catch(() => null);
    const imgId = uid();
    await saveImage(imgId, orig, thumb);
    return imgId;
  };
  const imageFailMessage = e => e && e.rcvUnreadable ? "Couldn't read that image" : "Couldn't save that image — the vault may be out of room";
  const imageAddResult = (added, unreadable, unsaved) => {
    const bits = [];
    if (added) bits.push(added + (added === 1 ? " image added" : " images added"));
    if (unreadable) bits.push(unreadable + " couldn't be read");
    if (unsaved) bits.push(unsaved + " couldn't be saved — the vault may be out of room");
    return bits.join(" · ") || "Nothing was added";
  };

  /* --- character CRUD --- */
  const charsRef = useRef(chars);
  charsRef.current = chars;
  const persistChar = async c => {
    const list = charsRef.current;
    const next = list.some(x => x.id === c.id) ? list.map(x => x.id === c.id ? c : x) : [...list, c];
    charsRef.current = next;
    setChars(next);
    await sSet("chars:all", JSON.stringify(next));
  };
  const patchChar = async (id, fn) => {
    const cur = charsRef.current.find(x => x.id === id);
    if (!cur) return;
    return persistChar(fn(cur));
  };
  const saveChar = async c => {
    await persistChar(c);
    setEditingChar(null);
    toast("Character saved");
  };
  /* Deleting moves the record to the bin instead of destroying it, and deliberately
     leaves its pictures in storage — a restore that came back without the artwork
     would not be a restore. The pictures are only removed when the entry is emptied
     from the bin, by hand or by the 30-day sweep. */
  const TRASH_DAYS = 30;
  const imageIdsOf = (type, r) => {
    if (type === "character") return charImgIds(r);
    if (type === "persona") return personaImgIds(r);
    return (r.images || []).map(im => im.imgId).filter(Boolean);
  };
  /* Several at once has to be one write. Calling the single version in a loop
     would have each call build its list from the same closed-over trash, so
     every write but the last would be thrown away and only one of the records
     would actually reach the bin. */
  const sendManyToTrash = async (type, records) => {
    if (!records.length) return;
    const at = Date.now();
    const entries = records.map(record => ({ tid: uid(), type, record, deletedAt: at }));
    const next = [...entries, ...trash];
    setTrash(next);
    await sSet("trash:all", JSON.stringify(next));
  };
  const sendToTrash = (type, record) => sendManyToTrash(type, [record]);
  const purgeTrashEntry = async entry => {
    forgetBlur(imageIdsOf(entry.type, entry.record));
    imageIdsOf(entry.type, entry.record).forEach(id => {
      dropImage(id);
    });
  };
  const restoreFromTrash = async entry => {
    const rest = trash.filter(t => t.tid !== entry.tid);
    const rec0 = entry.record || {};
    const bump = list => list.some(x => x.id === rec0.id) ? { ...rec0, id: uid() } : rec0;
    if (entry.type === "character") {
      const rec = bump(chars);
      const next = [...chars, rec];
      charsRef.current = next;
      setChars(next);
      await sSet("chars:all", JSON.stringify(next));
    } else if (entry.type === "persona") {
      const rec = bump(personas);
      const next = [...personas, rec];
      setPersonas(next);
      await sSet("personas:all", JSON.stringify(next));
    } else if (entry.type === "lore") {
      const rec = bump(lore);
      const next = [...lore, rec];
      setLore(next);
      await sSet("lore:all", JSON.stringify(next));
    } else if (entry.type === "prompt") {
      const rec = bump(prompts);
      const next = [...prompts, rec];
      setPrompts(next);
      await sSet("prompts:all", JSON.stringify(next));
    } else {
      toast("Couldn't restore that record");
      return;
    }
    setTrash(rest);
    await sSet("trash:all", JSON.stringify(rest));
    toast((entry.record.name || entry.record.title || "Record") + " restored");
  };
  const emptyFromTrash = async entry => {
    await purgeTrashEntry(entry);
    const rest = trash.filter(t => t.tid !== entry.tid);
    setTrash(rest);
    await sSet("trash:all", JSON.stringify(rest));
    toast("Deleted for good");
  };
  /* Sweep anything past its 30 days, once the vault is open. Runs off the stored
     timestamp rather than a timer, so it catches up however long the app was shut. */
  useEffect(() => {
    if (!ready || !trash.length) return;
    const cutoff = Date.now() - TRASH_DAYS * 864e5;
    const stale = trash.filter(t => (t.deletedAt || 0) < cutoff);
    if (!stale.length) return;
    (async () => {
      for (const e of stale) await purgeTrashEntry(e);
      const rest = trash.filter(t => (t.deletedAt || 0) >= cutoff);
      setTrash(rest);
      await sSet("trash:all", JSON.stringify(rest));
    })();
  }, [ready, trash]);
  const deleteChar = async c => {
    const next = chars.filter(x => x.id !== c.id);
    setChars(next);
    await sSet("chars:all", JSON.stringify(next));
    await sendToTrash("character", c);
    setEditingChar(null);
    setViewCharId(null);
    toast("Character moved to the bin — restore it from Settings within " + TRASH_DAYS + " days");
  };

  /* --- simple collection CRUD --- */
  const collections = {
    persona: {
      list: personas,
      set: setPersonas,
      key: "personas:all"
    },
    lore: {
      list: lore,
      set: setLore,
      key: "lore:all"
    },
    prompt: {
      list: prompts,
      set: setPrompts,
      key: "prompts:all"
    }
  };
  const saveRecord = async (type, r) => {
    const col = collections[type];
    const next = col.list.some(x => x.id === r.id) ? col.list.map(x => x.id === r.id ? r : x) : [...col.list, r];
    col.set(next);
    await sSet(col.key, JSON.stringify(next));
    setEditingRecord(null);
    toast("Saved");
  };
  const persistLore = async next => {
    setLore(next);
    await sSet("lore:all", JSON.stringify(next));
  };
  const persistPrompts = async next => {
    setPrompts(next);
    await sSet("prompts:all", JSON.stringify(next));
  };
  const personasRef = useRef(personas);
  personasRef.current = personas;
  const persistPersona = async p => {
    const list = personasRef.current;
    const next = list.some(x => x.id === p.id) ? list.map(x => x.id === p.id ? p : x) : [...list, p];
    personasRef.current = next;
    setPersonas(next);
    await sSet("personas:all", JSON.stringify(next));
  };
  /* Move every character and persona that had the old book attached onto the new
     name. Returns how many moved, so the toast can say so — a rename that
     silently reaches into other records should tell you it did. */
  const renameAttachedBook = async (from, to) => {
    const was = String(from || "").trim();
    if (!was || was === to) return 0;
    let moved = 0;
    const swap = list => list.map(r => {
      const books = r.lorebooks || [];
      if (!books.some(w => String(w).trim() === was)) return r;
      moved++;
      const next = [];
      for (const w of books) {
        const name = String(w).trim() === was ? to : w;
        if (!next.includes(name)) next.push(name); // already attached to the new name: do not double it
      }
      return { ...r, lorebooks: next, updatedAt: Date.now() };
    });
    const nextChars = swap(chars);
    const nextPersonas = swap(personas);
    if (!moved) return 0;
    setChars(nextChars);
    setPersonas(nextPersonas);
    await Promise.all([sSet("chars:all", JSON.stringify(nextChars)), sSet("personas:all", JSON.stringify(nextPersonas))]);
    return moved;
  };
  const deleteRecord = async (type, r) => {
    if (type === "prompt" || type === "lore") {
      // the blur list kept the ids of pictures that no longer exist
      forgetBlur((r.images || []).map(im => im.imgId));
      (r.images || []).forEach(im => {
        dropImage(im.imgId);
      });
      if (type === "prompt") setViewPromptEntryId(null);else setViewLoreEntryId(null);
    }
    if (type === "persona") {
      await sendToTrash("persona", r); // keeps its pictures until the bin is emptied
      setViewPersonaId(null);
    }
    const col = collections[type];
    const next = col.list.filter(x => x.id !== r.id);
    col.set(next);
    await sSet(col.key, JSON.stringify(next));
    setEditingRecord(null);
    // a persona is recoverable and a lore entry is not; saying "Deleted" for both
    // hid the bin from the one place it applies
    toast(type === "persona" ? "Persona moved to the bin — restore it from Settings within " + TRASH_DAYS + " days" : "Deleted");
  };

  /* --- backup --- */
  const [exportConfirm, setExportConfirm] = useState(null); // { what, fn }
  const askExport = (what, fn, warning) => setExportConfirm({
    what,
    fn,
    warning
  });
  /* Tags CharSnap does not know are dropped silently at their end, so say so
     while the export can still be cancelled. Never blocks: the list is recovered
     from their published PDF, not a live feed, so it can be out of date. */
  const unknownTagWarning = c => {
    const bad = (c.tags || []).filter(t => String(t).trim() && !charSnapTag(t));
    if (!bad.length) return null;
    return "CharSnap will not recognise " + (bad.length === 1 ? "this tag" : "these " + bad.length + " tags") +
      ", and will drop " + (bad.length === 1 ? "it" : "them") + " on import: " + bad.join(", ") +
      ". Everything else exports normally.";
  };
  const [jsonImportType, setJsonImportType] = useState(null);
  const jsonImportRef = useRef(null);
  /* Importing from inside a lorebook files everything into that book, whatever
     world the file itself claims. A ref, not state: the file picker's change
     event fires long after the click and would read a stale value. */
  const loreImportWorld = useRef(null);
  const triggerJsonImport = (type, intoWorld) => {
    loreImportWorld.current = typeof intoWorld === "string" ? intoWorld : null;
    setJsonImportType(type);
    setTimeout(() => jsonImportRef.current && jsonImportRef.current.click(), 0);
  };
  const applyImportedBlur = async ids => {
    if (!ids || !ids.length) return;
    const next = { ...blurredRef.current };
    ids.forEach(id => next[id] = true);
    await persistBlur(next);
  };
  /* This wrote both caches once per picture, each time copying the whole
     cache and redrawing — the same quadratic that loading had until 1.129,
     left behind in the import path. Importing a backup of a few thousand
     pictures paid it in full. Collected and applied once. */
  const writeImportedImages = async (images, thumbs) => {
    const thumbBatch = {};
    const fullBatch = {};
    for (const [id, v] of Object.entries(images || {})) {
      if (!v) continue;
      await sSet("img:" + id, v);
      fullBatch[id] = v;
      thumbBatch[id] = thumbs && thumbs[id] || v;
    }
    for (const [id, v] of Object.entries(thumbs || {})) {
      if (v) await sSet("th:" + id, v);
    }
    if (Object.keys(fullBatch).length) {
      setFullCache(prev => ({ ...prev, ...fullBatch }));
      setImgCache(prev => ({ ...prev, ...thumbBatch }));
      // they are in the cache now, so loading must not fetch them all again
      Object.keys(thumbBatch).forEach(id => imgLoading.current.add(id));
    }
  };
  const handleJsonImportFile = async file => {
    const type = jsonImportType;
    const intoWorld = loreImportWorld.current;
    setJsonImportType(null);
    loreImportWorld.current = null;
    try {
      const data = JSON.parse(await file.text());
      if (type === "characters") {
        const items = normalizeCharacterImport(data);
        if (!items.length) {
          toast("No characters found in that file");
          return;
        }
        const byName = new Map(chars.map(c => [(c.name || "").trim().toLowerCase(), c]).filter(([k]) => k));
        const dupes = [],
          fresh = [];
        items.forEach(it => {
          const key = (it.char.name || "").trim().toLowerCase();
          const existing = key && byName.get(key);
          if (existing) dupes.push({
            item: it,
            existingId: existing.id
          });else fresh.push(it);
        });
        if (dupes.length) {
          setDupePrompt({
            type: "characters",
            fresh,
            dupes
          });
          return;
        }
        await commitCharImport(fresh, [], "copies");
      } else if (type === "personas") {
        const items = normalizePersonaImport(data);
        if (!items.length) {
          toast("No personas found in that file");
          return;
        }
        const byName = new Map(personas.map(p => [(p.name || "").trim().toLowerCase(), p]).filter(([k]) => k));
        const dupes = [],
          fresh = [];
        items.forEach(it => {
          const key = (it.persona.name || "").trim().toLowerCase();
          const existing = key && byName.get(key);
          if (existing) dupes.push({
            item: it,
            existingId: existing.id
          });else fresh.push(it);
        });
        if (dupes.length) {
          setDupePrompt({
            type: "personas",
            fresh,
            dupes
          });
          return;
        }
        await commitPersonaImport(fresh, [], "copies");
      } else if (type === "lore") {
        const res = normalizeLoreImport(data, intoWorld === null ? file.name.replace(/\.json$/i, "") : intoWorld);
        if (!res.entries.length) {
          toast("No lore entries found in that file");
          return;
        }
        // imported from inside a book: every entry belongs to that book, even if
        // the file names a world of its own
        if (intoWorld !== null) res.entries.forEach(e => {
          e.world = intoWorld;
        });
        // re-importing a lorebook used to append the lot a second time
        const byKey = new Map(lore.map(e => [loreKey(e), e]));
        const freshEntries = [],
          dupeEntries = [];
        res.entries.forEach(e => {
          const existing = byKey.get(loreKey(e));
          if (existing) dupeEntries.push({
            entry: e,
            existingId: existing.id
          });else freshEntries.push(e);
        });
        if (dupeEntries.length) {
          setDupePrompt({
            type: "lore",
            fresh: freshEntries,
            dupes: dupeEntries,
            payload: res
          });
          return;
        }
        await commitLoreImport(freshEntries, [], "copies", res);
      } else if (type === "prompts") {
        const res = normalizePromptImport(data, intoWorld === null ? file.name.replace(/\.json$/i, "") : intoWorld);
        if (!res.entries.length) {
          toast("No prompts found in that file");
          return;
        }
        // imported from inside a collection: everything lands in that collection
        if (intoWorld !== null) res.entries.forEach(p => {
          p.collection = intoWorld;
        });
        const byKey = new Map(prompts.map(p => [promptKey(p), p]));
        const freshEntries = [],
          dupeEntries = [];
        res.entries.forEach(p => {
          const existing = byKey.get(promptKey(p));
          if (existing) dupeEntries.push({
            entry: p,
            existingId: existing.id
          });else freshEntries.push(p);
        });
        if (dupeEntries.length) {
          setDupePrompt({
            type: "prompts",
            fresh: freshEntries,
            dupes: dupeEntries,
            payload: res
          });
          return;
        }
        await commitPromptImport(freshEntries, [], "copies", res);
      }
    } catch (e) {
      toast("Couldn't read that file — is it valid JSON?");
    }
  };
  const collectImagesFor = async (charList, personaList) => {
    const images = {},
      thumbs = {};
    const ids = [];
    for (const c of charList || []) ids.push(...charImgIds(c));
    for (const p of personaList || []) ids.push(...personaImgIds(p));
    for (const id of ids.filter(Boolean)) {
      images[id] = (await sGet("img:" + id)) || imgCache[id] || null;
      const t = await sGet("th:" + id);
      if (t) thumbs[id] = t;
    }
    return {
      images,
      thumbs
    };
  };
  const scopeLabel = (c, scope) => {
    if (scope === undefined || scope === "all") return "";
    if (scope === null) return "Default";
    const v = (c.variants || []).find(x => x.id === scope);
    return v && v.name || "Variant";
  };
  // narrow a character to one variant: its fields win, images limited to shared + that variant's
  const scopedChar = (c, scope) => {
    if (scope === undefined || scope === "all") return c;
    const keep = g => {
      const vid = (g.variantId || "").trim();
      // a tag whose variant no longer exists counts as shared, as in the viewer,
      // so an orphaned image is not quietly dropped from every scoped export
      const orphan = vid && vid !== DEFAULT_VID && !(c.variants || []).some(v => v.id === vid);
      /* A picture marked as the Default's own was dropped from the Default's own
         export: it is tagged, it is not orphaned, and it matches no variant id.
         The viewer has always shown it there, so the export lost exactly the
         pictures that most belonged to it. Match the viewer. */
      if (!vid || orphan) return true;
      return scope === null ? vid === DEFAULT_VID : vid === scope;
    };
    if (scope === null) return {
      ...c,
      variants: [],
      gallery: (c.gallery || []).filter(keep)
    };
    const v = (c.variants || []).find(x => x.id === scope);
    if (!v) return c;
    const out = { ...c };
    VARIANT_FIELDS.forEach(k => {
      if ((v[k] || "").trim()) out[k] = v[k];
    });
    out.variants = [];
    out.gallery = (c.gallery || []).filter(keep);
    if (v.profileImg) out.profileImg = v.profileImg;
    out.__scopeName = v.name || "Variant";
    return out;
  };
  /* Whether the guts are hidden belongs to the file being written, not to the
     character it came from: CharSnap has no flag for it, only marks in the text.
     So it is chosen here, and the two files are named differently so one does
     not quietly replace the other in the Downloads folder. */
  const exportCharSnap = (c, scope, hide) => {
    const out = charToCharSnap(c, scope, hide);
    const label = scopeLabel(c, scope);
    downloadJSON(out.main, sanitizeName(c.name) + (label ? "-" + sanitizeName(label) : "") + "-charsnap" + (hide ? "-hidden" : "") + ".json");
    toast("CharSnap file exported" + (label ? " \u2014 " + label + " only" : " (" + out.main.variants.length + " variants)") + (hide ? ", guts hidden" : "") + "; images upload separately");
  };
  /* For CharSnap's "Import Variant" button, which takes a variant on its own
     rather than a character containing one. */
  const exportCharSnapVariant = (c, scope, hide) => {
    const label = scopeLabel(c, scope) || "Default";
    downloadJSON(charToCharSnapVariant(c, scope, hide), sanitizeName(c.name) + "-" + sanitizeName(label) + "-variant" + (hide ? "-hidden" : "") + ".json");
    toast("Variant file exported — " + label + (hide ? ", guts hidden" : "") + "; use “Import Variant” on CharSnap");
  };
  const exportCharJson = async (c, scope) => {
    const sc = scopedChar(c, scope);
    const label = scopeLabel(c, scope);
    delete sc.__scopeName;
    const {
      images,
      thumbs
    } = await collectImagesFor([sc], []);
    // banner belongs here too — leaving it out meant a blurred banner came back
    // unblurred, and the same was true of a version's own portrait
    const ids = charImgIds(sc);
    /* One file, two readers. CharSnap looks for name/gender/tagline/variants at the
       top level and ignores what it does not recognise; this app keys off `app` and
       reads `char`, so the full-fidelity record rides along underneath without
       either side seeing the other's fields. The dedicated "Export for CharSnap"
       button still exists for a small file with no image payload. */
    const forCharSnap = charToCharSnap(c, scope).main;
    downloadJSON({
      ...forCharSnap,
      app: "rolecraft-vault",
      type: "character",
      version: 4,
      exportedAt: new Date().toISOString(),
      scope: label || "all variants",
      char: sc,
      images,
      thumbs,
      blurred: ids.filter(id => blurred[id])
    }, sanitizeName(c.name) + (label ? "-" + sanitizeName(label) : "") + ".json");
    toast("Character exported" + (label ? " \u2014 " + label + " only" : " with all variants"));
  };
  const exportCharsJson = async () => {
    const {
      images,
      thumbs
    } = await collectImagesFor(chars, []);
    downloadJSON({
      app: "rolecraft-vault",
      type: "characters",
      version: 3,
      exportedAt: new Date().toISOString(),
      chars,
      images,
      thumbs,
      blurred: Object.keys(blurred)
    }, "rolecraft-characters.json");
    toast("Characters exported");
  };
  /* Text-only exports: the same records with everything image-shaped removed, so
     the file is small enough to read, paste into something else, or hand to an AI.
     "Text only" already means exactly this elsewhere in the app — rule 2 defines
     version history and JSON updates the same way — so an import of one of these
     brings the writing across and simply has no pictures to bring with it.
     history goes too: it is undo, not content, and it dwarfs everything else. */
  const textOnlyChar = c => {
    const out = { ...c };
    ["profileImg", "banner", "gallery", "albums", "imgMeta", "history"].forEach(k => delete out[k]);
    // a variant keeps a portrait of its own, and it was the one image reference
    // a "text only" file still carried out with it
    out.variants = (c.variants || []).map(v => {
      const nv = { ...v };
      delete nv.profileImg;
      return nv;
    });
    return out;
  };
  const textOnlyLore = e => {
    const out = { ...e };
    delete out.images;
    return out;
  };
  const exportCharsTextJson = async () => {
    // the books these characters point at travel with them, so their wording can be
    // checked against the lore without needing a second file
    const linked = new Set();
    chars.forEach(c => (c.lorebooks || []).forEach(w => linked.add(String(w).trim())));
    const books = lore.filter(e => linked.has(String(e.world || "").trim()));
    downloadJSON({
      app: "rolecraft-vault",
      type: "characters",
      version: 4,
      exportedAt: new Date().toISOString(),
      textOnly: true,
      chars: chars.map(textOnlyChar),
      lore: books.map(textOnlyLore)
    }, "rolecraft-characters-text.json");
    toast("Characters exported as text" + (books.length ? " with " + books.length + " linked lore " + (books.length === 1 ? "entry" : "entries") : ""));
  };
  const textOnlyPersona = p => {
    const out = { ...p };
    ["avatar", "gallery", "albums", "imgMeta"].forEach(k => delete out[k]);
    return out;
  };
  // the books a record points at travel with it, so its wording can be checked
  // against the lore from the one file
  const linkedBooks = rec => {
    const linked = new Set((rec.lorebooks || []).map(w => String(w).trim()));
    return lore.filter(e => linked.has(String(e.world || "").trim())).map(textOnlyLore);
  };
  const exportCharTextJson = async (c, scope) => {
    const sc = scopedChar(c, scope);
    const label = scopeLabel(c, scope);
    delete sc.__scopeName;
    const books = linkedBooks(sc);
    downloadJSON({
      app: "rolecraft-vault",
      type: "character",
      version: 4,
      exportedAt: new Date().toISOString(),
      scope: label || "all variants",
      textOnly: true,
      char: textOnlyChar(sc),
      lore: books
    }, sanitizeName(c.name) + (label ? "-" + sanitizeName(label) : "") + "-text.json");
    toast("Exported as text" + (label ? " — " + label + " only" : ""));
  };
  const exportPersonaJson = async p => {
    const { images, thumbs } = await collectImagesFor([], [p]);
    const ids = [p.avatar, ...(p.gallery || []).map(g => g.imgId)].filter(Boolean);
    downloadJSON({
      app: "rolecraft-vault",
      type: "persona",
      version: 4,
      exportedAt: new Date().toISOString(),
      persona: p,
      images,
      thumbs,
      blurred: ids.filter(id => blurred[id])
    }, sanitizeName(p.name) + ".json");
    toast("Persona exported");
  };
  const exportPersonaTextJson = async p => {
    downloadJSON({
      app: "rolecraft-vault",
      type: "persona",
      version: 4,
      exportedAt: new Date().toISOString(),
      textOnly: true,
      persona: textOnlyPersona(p),
      lore: linkedBooks(p)
    }, sanitizeName(p.name) + "-text.json");
    toast("Persona exported as text");
  };
  const exportPersonasJson = async () => {
    const {
      images,
      thumbs
    } = await collectImagesFor([], personas);
    downloadJSON({
      app: "rolecraft-vault",
      type: "personas",
      version: 3,
      exportedAt: new Date().toISOString(),
      personas,
      images,
      thumbs,
      blurred: Object.keys(blurred)
    }, "rolecraft-personas.json");
    toast("Personas exported");
  };
  const exportPersonasTextJson = async () => {
    downloadJSON({
      app: "rolecraft-vault",
      type: "personas",
      version: 4,
      exportedAt: new Date().toISOString(),
      textOnly: true,
      personas: personas.map(textOnlyPersona)
    }, "rolecraft-personas-text.json");
    toast("Personas exported as text");
  };
  const exportPromptsJson = async () => {
    downloadJSON({
      app: "rolecraft-vault",
      type: "prompts",
      version: 3,
      exportedAt: new Date().toISOString(),
      prompts
    }, "rolecraft-prompts.json");
    toast("Prompts exported");
  };
  const exportLoreJson = async () => {
    downloadJSON({
      app: "rolecraft-vault",
      type: "lore",
      version: 3,
      exportedAt: new Date().toISOString(),
      lore
    }, "rolecraft-lorebooks.json");
    toast("Lorebooks exported");
  };
  const zipSelectedImages = async (items, zipName) => {
    // items: [{imgId, label}]
    const z = zipWriter();
    const track = zipTracker("Preparing images", items.length);
    let n = 1;
    try {
      for (const it of items) {
        const v = await sGet("img:" + it.imgId);
        if (v) {
          z.add(String(n).padStart(2, "0") + (it.label ? "-" + sanitizeName(it.label) : "") + "." + extOf(v), dataUrlBytes(v));
          n++;
        }
        track.step();
      }
      if (!z.count) {
        toast("Nothing to download");
        return;
      }
      track.packing();
      await new Promise(r => setTimeout(r, 0));
      downloadBlob(z.finish(), zipName);
      toast(z.count + (z.count === 1 ? " image" : " images") + " exported at original quality");
    } finally {
      track.clear();
    }
  };
  const [personaGrid, setPersonaGrid] = useState(false);
  /* One picture on its own. Reads the same record the zip reads, so what lands
     on disk is the original rather than the thumbnail shown on the card. */
  const downloadOneImage = async (imgId, name) => {
    if (!imgId) return;
    const v = await sGet("img:" + imgId);
    if (!v) {
      toast("That picture is no longer in the vault");
      return;
    }
    downloadBlob(new Blob([dataUrlBytes(v)]), safeFileName(name) + "." + extOf(v));
    toast("Picture saved");
  };
  const downloadImagesZip = async (scopeChars, scopePersonas, zipName, extras) => {
    /* Which pictures to fetch is worked out first. It touches no storage, so
       the total is known before the slow part starts and the bar can be honest
       about how far along it is. */
    const plan = [];
    const seen = new Set();
    const push = (id, base, n) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      plan.push({ id, base, n });
    };
    /* A cover belongs to a bucket or a book rather than to a record, so it is
       named after the thing it covers instead of numbered within a folder. Two
       buckets whose names reduce to the same safe filename would otherwise write
       to the same path and the zip would keep only the last. */
    const usedPaths = new Set();
    const pushAt = (id, path) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      let out = path, i = 2;
      while (usedPaths.has(out.toLowerCase())) out = path + "-" + i++;
      usedPaths.add(out.toLowerCase());
      plan.push({ id, path: out });
    };
    /* Two characters called the same thing shared one folder and restarted
       numbering, so the zip held duplicate paths and unpacking silently kept
       only the last. Folder names are made unique here. c.gallery was also read
       without a guard, unlike the persona line below it. */
    const usedFolders = new Set();
    const folderFor = name => {
      const base = safeFileName(name);
      let out = base, i = 2;
      while (usedFolders.has(out.toLowerCase())) out = base + "-" + i++;
      usedFolders.add(out.toLowerCase());
      return out;
    };
    for (const c of scopeChars) {
      const base = folderFor(c.name);
      let n = 1;
      push(c.profileImg, base, n++);
      push(c.banner, base, n++);
      for (const v of c.variants || []) push(v.profileImg, base, n++);
      for (const g of c.gallery || []) push(g.imgId, base, n++);
    }
    for (const p of scopePersonas || []) {
      const base = "personas/" + folderFor(p.name);
      let n = 1;
      push(p.avatar, base, n++);
      for (const g of p.gallery || []) push(g.imgId, base, n++);
    }
    for (const e of extras || []) pushAt(e.id, e.path);
    if (!plan.length) {
      toast("No images to download");
      return;
    }
    /* Images go into blob storage as they are read and the data url is dropped
       straight after, so a whole library no longer has to fit in memory. */
    const z = zipWriter();
    const track = zipTracker("Collecting images", plan.length);
    try {
      for (const it of plan) {
        const v = await sGet("img:" + it.id);
        // always the original: sGet("img:") never the smaller "th:" thumbnail
        if (v) z.add((it.path || it.base + "/" + String(it.n).padStart(2, "0")) + "." + extOf(v), dataUrlBytes(v));
        track.step();
      }
      if (!z.count) {
        toast("No images to download");
        return;
      }
      track.packing();
      await new Promise(r => setTimeout(r, 0)); // let the phase paint before the archive is assembled
      downloadBlob(z.finish(), zipName);
      toast(z.count + (z.count === 1 ? " image exported" : " images exported"));
    } finally {
      track.clear();
    }
  };
  const exportAll = async () => {
    toast("Preparing backup…");
    const images = {};
    const imgIds = [];
    for (const c of chars) imgIds.push(...charImgIds(c));
    for (const p of personas) imgIds.push(...personaImgIds(p));
    const thumbs = {};
    Object.values(bucketMeta).forEach(m => {
      if (m && m.cover) imgIds.push(m.cover);
    });
    lore.forEach(e => (e.images || []).forEach(im => imgIds.push(im.imgId)));
    Object.values(loreMeta).forEach(m => {
      if (m && m.cover) imgIds.push(m.cover);
    });
    prompts.forEach(p => (p.images || []).forEach(im => imgIds.push(im.imgId)));
    Object.values(promptMeta).forEach(m => {
      if (m && m.cover) imgIds.push(m.cover);
    });
    /* Persona buckets were the one grouping the backup did not carry, so a
       restore lost the empty ones and their covers. The bin was missing too —
       and a bin without its pictures is not a bin, since the whole point of it
       is that a restore brings the artwork back with the record. */
    Object.values(pBucketMeta).forEach(m => {
      if (m && m.cover) imgIds.push(m.cover);
    });
    trash.forEach(t => imageIdsOf(t.type, t.record).forEach(id => imgIds.push(id)));
    for (const id of imgIds.filter(Boolean)) {
      images[id] = (await sGet("img:" + id)) || imgCache[id] || null;
      const t = await sGet("th:" + id);
      if (t) thumbs[id] = t;
    }
    downloadJSON({
      app: "rolecraft-vault",
      version: 4,
      exportedAt: new Date().toISOString(),
      chars,
      personas,
      lore,
      prompts,
      images,
      thumbs,
      blurred: Object.keys(blurred),
      buckets: bucketMeta,
      personaBuckets: pBucketMeta,
      loreBooks: loreMeta,
      promptBooks: promptMeta,
      trash
    }, "rolecraft-backup-" + new Date().toISOString().slice(0, 10) + ".json");
  };
  const importAll = async file => {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "rolecraft-vault") {
        toast("That file isn't a Rolecraft Vault backup");
        return;
      }
      setChars(data.chars || []);
      setPersonas(data.personas || []);
      setLore(data.lore || []);
      setPrompts(data.prompts || []);
      await Promise.all([sSet("chars:all", JSON.stringify(data.chars || [])), sSet("personas:all", JSON.stringify(data.personas || [])), sSet("lore:all", JSON.stringify(data.lore || [])), sSet("prompts:all", JSON.stringify(data.prompts || []))]);
      const imgs = data.images || {};
      const thumbs = data.thumbs || {};
      setImgCache({
        ...imgs,
        ...thumbs
      });
      setFullCache({});
      // the restored vault's pictures are a different set; forget what was loaded
      imgLoading.current = new Set(Object.keys(imgs).concat(Object.keys(thumbs)));
      imgBuf.current = {};
      fullLoading.current.clear();
      fullOrder.current = [];
      for (const [id, v] of Object.entries(imgs)) {
        if (v) await sSet("img:" + id, v);
      }
      for (const [id, v] of Object.entries(thumbs)) {
        if (v) await sSet("th:" + id, v);
      }
      const blObj = {};
      (data.blurred || []).forEach(id => blObj[id] = true);
      setBlurred(blObj);
      await sSet("blurset", JSON.stringify(Object.keys(blObj)));
      setBucketMeta(data.buckets || {});
      await sSet("buckets:meta", JSON.stringify(data.buckets || {}));
      setLoreMeta(data.loreBooks || {});
      await sSet("lore:meta", JSON.stringify(data.loreBooks || {}));
      setPromptMeta(data.promptBooks || {});
      await sSet("prompts:meta", JSON.stringify(data.promptBooks || {}));
      /* Set even when the file does not carry them, so a restore replaces the
         vault rather than blending into it. Left alone, persona buckets and the
         bin survived from whatever was here before, and a backup from another
         machine came back with a stranger's groupings and a bin full of records
         that had nothing to do with it. */
      const pb = data.personaBuckets || {};
      setPBucketMeta(pb);
      await sSet("pbuckets:meta", JSON.stringify(pb));
      const tr = Array.isArray(data.trash) ? data.trash : [];
      setTrash(tr);
      await sSet("trash:all", JSON.stringify(tr));
      setShowSettings(false);
      toast("Backup restored");
    } catch {
      toast("Couldn't read that file");
    }
  };

  /* --- derived --- */
  const allTags = useMemo(() => [...new Set(chars.flatMap(c => c.tags || []))].sort(), [chars]);
  const filteredChars = chars.filter(c => bucketFilter === null || (c.bucket || "").trim() === bucketFilter).filter(c => !tagFilter || (c.tags || []).includes(tagFilter))/* Every other list guards its fields; this one concatenated name, story and
   personality raw, so a character missing any of them had the literal word
   "undefined" folded into what gets searched — and typing it matched them. */
.filter(c => !charQ || [c.name, (c.tags || []).join(" "), (c.searchables || []).join(" "), c.tagline, c.story, c.personality].map(v => v || "").join(" ").toLowerCase().includes(charQ.toLowerCase())).sort((a, b) => sort === "name" ? (a.name || "").localeCompare(b.name || "") : sort === "updated" ? (b.updatedAt || 0) - (a.updatedAt || 0) : sort === "oldest" ? (a.createdAt || 0) - (b.createdAt || 0) : (b.createdAt || 0) - (a.createdAt || 0));
  /* This copied every character, persona, lore entry and prompt in the vault
     into a new object, sorted the lot, and threw all but six away — and it ran
     on every render, including while typing in a search box on a completely
     different screen. It now sorts light references and copies only the six it
     keeps, and only when the records themselves change. */
  const recent = useMemo(() => {
    const refs = [];
    const add = (list, t) => (list || []).forEach(r => {
      if (r.updatedAt) refs.push({ r, t, u: r.updatedAt });
    });
    add(chars, "Character");
    add(personas, "Persona");
    add(lore, "Lore");
    add(prompts, "Prompt");
    return refs.sort((a, b) => b.u - a.u).slice(0, 6).map(x => ({ ...x.r, _t: x.t }));
  }, [chars, personas, lore, prompts]);
  const nav = [{
    id: "dashboard",
    label: "Dashboard",
    icon: icons.dash
  }, {
    id: "characters",
    label: "Characters",
    icon: icons.char
  }, {
    id: "personas",
    label: "Personas",
    icon: icons.persona
  }, {
    id: "lorebooks",
    label: "Lorebooks",
    icon: icons.lore
  }, {
    id: "prompts",
    label: "Prompt Vault",
    icon: icons.prompt
  }];
  const vp = useViewSize();
  const navIcon = vp.w > 1700 ? 20 : vp.w <= 760 ? 18 : 17;
  const rootClass = "rcv" + (theme === "light" ? " light" : theme === "charsnap" ? " charsnap" : "") + (contrast === "normal" ? "" : " contrast-" + contrast);
  const sheetOpen = !!(viewCharId || viewPersonaId);
  const overlayOpen = !!(showSettings || showGuide);
  quietRef.current = overlayOpen;
  if (authState.checked && authState.locked) return /*#__PURE__*/React.createElement("div", {
    className: rootClass,
    "data-rcv-state": "locked",
    style: {
      "--prose-size": proseSizePx,
      "--card-min": cardMinPx
    }
  }, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement(LockScreen, {
    authState: authState,
    onUnlocked: () => setAuthState(a => ({
      ...a,
      locked: false
    }))
  }));
  if (loadError) return /*#__PURE__*/React.createElement("div", {
    className: rootClass,
    "data-rcv-state": "error",
    style: {
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      boxSizing: "border-box" // .rcv itself is content-box; padding would add to its 100vh
    }
  }, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 560,
      border: "1px solid var(--danger-line)",
      background: "var(--danger-soft)",
      borderRadius: 14,
      padding: "22px 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--danger)",
      fontSize: 17,
      fontWeight: 600,
      marginBottom: 10
    }
  }, "The vault didn't open cleanly"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text)",
      lineHeight: 1.55,
      marginBottom: loadError.length ? 14 : 0
    }
  }, loadError.length ? "Some of your saved records couldn't be read, so nothing has been loaded. Your files have not been changed — the vault stays closed on purpose, because opening it half-empty would let the next save overwrite what's still there." : "Storage couldn't be reached, so nothing has been loaded. Your files have not been changed."), loadError.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--mut)",
      fontSize: 13,
      fontFamily: "ui-monospace, Consolas, monospace",
      lineHeight: 1.7
    }
  }, loadError.join("\n")) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--mut)",
      fontSize: 13,
      marginTop: 16,
      lineHeight: 1.6
    }
  }, "Restore your most recent export, or reopen the app to try again. Don't add or edit anything until it opens normally.")));
  /* First paint must not mount extra screens. 1.178 did, and on a phone that
     threw before auth had been read, so the lock screen never appeared. */
  if (!authState.checked) return /*#__PURE__*/React.createElement("div", {
    className: rootClass,
    "data-rcv-state": "loading",
    style: {
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--mut)"
    }
  }, "Opening the vault\u2026"));
  if (!ready) return /*#__PURE__*/React.createElement("div", {
    className: rootClass,
    "data-rcv-state": "loading",
    style: {
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement(VaultBusyScreen, {
    title: "Opening the vault",
    detail: "Reading your library from this device."
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: rootClass,
    "data-rcv-state": "ready",
    style: {
      "--prose-size": proseSizePx,
      "--card-min": cardMinPx
    }
  }, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement(AmbientLayer, {
    dust: 40,
    paused: overlayOpen || sheetOpen
  }), /*#__PURE__*/React.createElement("div", {
    className: "sidebar",
    style: {
      width: 230,
      flexShrink: 0,
      borderRight: "1px solid var(--line)",
      padding: "22px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      background: "var(--sidebg)",
      /* A short window — or the same window zoomed in, which amounts to the same
         thing — makes this column taller than the screen, and Settings is the
         last item in it. Without a ceiling the column simply grew past the
         bottom of the window and the end of the menu could not be reached: no
         scrollbar, no way down. The cap is what gives the overflow something to
         work against; in the narrow layout the bar turns into a short row and
         never comes near it. */
      maxHeight: "100vh",
      overflowY: "auto",
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: "2px 8px 20px"
    }
  }, /*#__PURE__*/React.createElement(CrestMark, {
    size: vp.w <= 1020 && vp.w > 760 ? 34 : vp.w > 1700 ? 46 : 40
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 18,
      fontWeight: 700,
      lineHeight: 1
    }
  }, "Rolecraft"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: "var(--dim)",
      letterSpacing: ".08em",
      marginTop: 3
    }
  }, "PRIVATE VAULT"))), nav.map(n => /*#__PURE__*/React.createElement("button", {
    key: n.id,
    className: "navitem" + (view === n.id ? " active" : ""),
    /* Below 1020px wide the labels are hidden and these become bare icons, which
       left them with no name at all — nothing on hover, and nothing for a screen
       reader to read out but eight identical buttons. */
    title: n.label,
    "aria-label": n.label,
    onClick: () => setView(n.id)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: n.icon,
    size: navIcon
  }), /*#__PURE__*/React.createElement("span", {
    className: "navlabel"
  }, n.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      display: "flex",
      flexDirection: "column",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "navitem",
    title: "Stats",
    "aria-label": "Stats",
    onClick: openVaultStats
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.chart,
    size: navIcon
  }), /*#__PURE__*/React.createElement("span", {
    className: "navlabel"
  }, "Stats")), (() => {
    const themeLabel = theme === "dark" ? "Theme · Dark" : theme === "light" ? "Theme · Light" : "Theme · CharSnap";
    return /*#__PURE__*/React.createElement("button", {
      className: "navitem",
      title: themeLabel,
      "aria-label": themeLabel,
      onClick: () => setTheme(theme === "dark" ? "light" : theme === "light" ? "charsnap" : "dark")
    }, /*#__PURE__*/React.createElement(Ic, {
      d: theme === "dark" ? icons.moon : theme === "light" ? icons.sun : icons.persona,
      size: navIcon
    }), /*#__PURE__*/React.createElement("span", {
      className: "navlabel"
    }, themeLabel));
  })(), authState.passwordSet && /*#__PURE__*/React.createElement("button", {
    className: "navitem",
    title: "Lock vault",
    "aria-label": "Lock vault",
    onClick: lockVault
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.lock,
    size: navIcon
  }), /*#__PURE__*/React.createElement("span", {
    className: "navlabel"
  }, "Lock vault")), /*#__PURE__*/React.createElement("button", {
    className: "navitem",
    title: "Guide",
    "aria-label": "Guide",
    onClick: () => setShowGuide(true)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.help,
    size: navIcon
  }), /*#__PURE__*/React.createElement("span", {
    className: "navlabel"
  }, "Guide")), /*#__PURE__*/React.createElement("button", {
    className: "navitem",
    title: "Settings",
    "aria-label": "Settings",
    onClick: () => setShowSettings(true)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.gear,
    size: navIcon
  }), /*#__PURE__*/React.createElement("span", {
    className: "navlabel"
  }, "Settings")))), /*#__PURE__*/React.createElement("div", {
    className: "scrollbody",
    style: {
      flex: 1,
      overflowY: "auto",
      height: "100vh",
      padding: "30px 34px 70px"
    }
  }, view === "dashboard" && !sheetOpen && !overlayOpen && (() => {
    const rng = mulberry32(dashSeed);
    const withProfile = chars.filter(c => c.profileImg);
    const spotlight = withProfile.length ? withProfile[Math.floor(rng() * withProfile.length)] : null;
    const wall = [];
    chars.forEach(c => (c.gallery || []).forEach(g => wall.push({
      imgId: g.imgId,
      label: c.name || "Untitled",
      kind: "character",
      open: () => setViewCharId(c.id)
    })));
    personas.forEach(p => {
      const openP = () => setViewPersonaId(p.id);
      if (p.avatar) wall.push({
        imgId: p.avatar,
        label: (p.name || "Persona") + " \u00b7 persona",
        kind: "persona",
        open: openP
      });
      (p.gallery || []).forEach(g => wall.push({
        imgId: g.imgId,
        label: (p.name || "Persona") + " \u00b7 persona",
        kind: "persona",
        open: openP
      }));
    });
    for (let i = wall.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = wall[i];
      wall[i] = wall[j];
      wall[j] = t;
    }
    const off = wall.length > 1 ? wallTick % wall.length : 0;
    const wallShow = wall.slice(off).concat(wall.slice(0, off)).slice(0, 18);
    const wallVisible = wallShow.slice(0, Math.max(1, wallCols) * 2);
    wallVisible.forEach(w => w.imgId && loadImage(w.imgId));
    if (spotlight && spotlight.profileImg) requestFull(spotlight.profileImg, true);
    const reshuffle = () => setDashSeed(Date.now() & 0x7fffffff || 1);
    const quick = [{
      label: "New character",
      sub: "Profile, story & gallery",
      icon: icons.char,
      fn: () => setEditingChar(blankChar())
    }, {
      label: "New persona",
      sub: "Who you play as",
      icon: icons.persona,
      fn: () => setEditingRecord({
        type: "persona",
        record: {
          id: uid()
        }
      })
    }, {
      label: "New lore entry",
      sub: "World rules & places",
      icon: icons.lore,
      fn: () => setEditingRecord({
        type: "lore",
        record: {
          id: uid()
        }
      })
    }, {
      label: "New prompt",
      sub: "Reusable scene starters",
      icon: icons.prompt,
      fn: () => setEditingRecord({
        type: "prompt",
        record: {
          id: uid()
        }
      })
    }];
    const visibleKeys = dashOrder.filter(k => k === "spotlight" ? !!spotlight : k === "wall" ? wallShow.length > 0 : true);
    const dashHead = (id, label) => {
      const vi = visibleKeys.indexOf(id);
      const first = vi === 0,
        last = vi === visibleKeys.length - 1;
      return /*#__PURE__*/React.createElement("div", {
        style: {
          margin: "26px 0 12px",
          display: "flex",
          alignItems: "center",
          gap: 6
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "eyebrow",
        style: {
          marginRight: "auto"
        }
      }, label), /*#__PURE__*/React.createElement("span", {
        className: "draghandle",
        draggable: true,
        "aria-label": "Drag to move " + label,
        title: "Drag to reorder",
        onDragStart: e => {
          setDashDrag(id);
          try {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", id);
          } catch (err) {}
        },
        onDragEnd: () => {
          setDashDrag(null);
          setDashOver(null);
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: icons.grip,
        size: 14
      })), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-ghost",
        "aria-label": "Move " + label + " up",
        disabled: first,
        onClick: () => moveDash(id, -1),
        style: {
          padding: "3px 7px",
          opacity: first ? .35 : 1
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: icons.cup,
        size: 13
      })), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-ghost",
        "aria-label": "Move " + label + " down",
        disabled: last,
        onClick: () => moveDash(id, 1),
        style: {
          padding: "3px 7px",
          opacity: last ? .35 : 1
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: icons.cdown,
        size: 13
      })));
    };
    const dashSection = (id, label, children) => /*#__PURE__*/React.createElement("div", {
      key: id,
      className: dashOver === id && dashDrag && dashDrag !== id ? "drag-over" : undefined,
      style: {
        borderRadius: 14
      },
      onDragOver: e => {
        if (!dashDrag || dashDrag === id) return;
        e.preventDefault();
        if (dashOver !== id) setDashOver(id);
      },
      onDragLeave: () => {
        if (dashOver === id) setDashOver(null);
      },
      onDrop: e => {
        e.preventDefault();
        if (!dashDrag || dashDrag === id) return;
        const next = dashOrder.filter(k => k !== dashDrag);
        const from = dashOrder.indexOf(dashDrag),
          to = dashOrder.indexOf(id);
        next.splice(from < to ? next.indexOf(id) + 1 : next.indexOf(id), 0, dashDrag);
        setDashOrder(next);
        setDashDrag(null);
        setDashOver(null);
      }
    }, dashHead(id, label), children);
    const dashSections = {
      spotlight: spotlight ? dashSection("spotlight", "Spotlight", /*#__PURE__*/React.createElement(React.Fragment, null, spotlight && /*#__PURE__*/React.createElement("div", {
        className: "card",
        style: {
          display: "flex",
          overflow: "hidden",
          flexWrap: "nowrap",
          height: 460
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "tile",
        style: {
          width: "min(280px, 34%)",
          minWidth: 210,
          height: "100%",
          flexShrink: 0,
          background: "var(--placeholder)",
          border: "none",
          borderRadius: 0,
          cursor: "default"
        }
      }, /*#__PURE__*/React.createElement(BlurBtn, {
        imgId: spotlight.profileImg,
        blurred: blurred,
        onToggleBlur: toggleBlur,
        label: spotlight.name
      }), picOf(fullCache, imgCache, spotlight.profileImg) && /*#__PURE__*/React.createElement("img", {
        src: picOf(fullCache, imgCache, spotlight.profileImg),
        alt: spotlight.name,
        className: blurred[spotlight.profileImg] ? "blur-img" : undefined,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block"
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 3,
          padding: "22px 26px",
          minWidth: 260,
          display: "flex",
          flexDirection: "column"
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "serif",
        style: {
          fontSize: "clamp(22px, 2.6vw, 30px)",
          margin: "0 0 4px"
        }
      }, spotlight.name || "Untitled"), (spotlight.tagline || "") && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13.5,
          color: "var(--brass)",
          marginBottom: 8
        }
      }, spotlight.tagline), (spotlight.tags || []).length > 0 && /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 10
        }
      }, spotlight.tags.slice(0, 5).map(t => /*#__PURE__*/React.createElement("span", {
        key: t,
        className: "chip"
      }, t))), /*#__PURE__*/React.createElement("div", {
        className: "scrollbody",
        style: {
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          paddingRight: 8
        }
      }, /*#__PURE__*/React.createElement(MDText, {
        style: {
          fontSize: 13.5,
          color: "var(--mut)",
          lineHeight: 1.6
        },
        text: spotlight.creatorMemo || spotlight.story || spotlight.personality || "No backstory written yet — open the character to add one."
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 10,
          marginTop: "auto",
          paddingTop: 16,
          flexWrap: "wrap"
        }
      }, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        onClick: () => setViewCharId(spotlight.id)
      }, "Open character"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-ghost",
        onClick: reshuffle
      }, "Shuffle"), /*#__PURE__*/React.createElement("div", {
        style: {
          alignSelf: "center",
          fontSize: 12,
          color: "var(--dim)"
        }
      }, "Updated ", timeAgo(spotlight.updatedAt), (spotlight.gallery || []).length > 0 ? " \u00b7 " + (spotlight.gallery || []).length + ((spotlight.gallery || []).length === 1 ? " gallery image" : " gallery images") : "")))))) : null,
      quick: dashSection("quick", "Start from anywhere", /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12
        }
      }, quick.map(q => /*#__PURE__*/React.createElement("button", {
        key: q.label,
        className: "card",
        onClick: q.fn,
        style: {
          padding: "14px 16px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          textAlign: "left",
          color: "var(--text)"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 38,
          height: 38,
          borderRadius: 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--chip-bg)",
          color: "var(--blue)"
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: q.icon,
        size: 17
      })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        style: {
          fontWeight: 600,
          fontSize: 13.5
        }
      }, q.label), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11.5,
          color: "var(--dim)"
        }
      }, q.sub))))))),
      recent: dashSection("recent", "Recent work", /*#__PURE__*/React.createElement(React.Fragment, null, recent.length === 0 ? /*#__PURE__*/React.createElement("div", {
        className: "card",
        style: {
          padding: 30,
          color: "var(--dim)",
          fontSize: 14
        }
      }, "Nothing here yet. Create your first character to begin building your library.") : /*#__PURE__*/React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12
        }
      }, recent.map(r => /*#__PURE__*/React.createElement("div", {
        key: r._t + r.id,
        className: "card",
        style: {
          padding: 12,
          cursor: "pointer",
          display: "flex",
          gap: 12,
          alignItems: "center"
        },
        onClick: () => {
          if (r._t === "Character") setViewCharId(r.id);else if (r._t === "Persona") setViewPersonaId(r.id);else if (r._t === "Lore") setEditingRecord({
            type: "lore",
            record: lore.find(x => x.id === r.id)
          });else setEditingRecord({
            type: "prompt",
            record: prompts.find(x => x.id === r.id)
          });
        }
      }, (() => {
        const tid = r._t === "Character" ? r.profileImg : r._t === "Persona" ? r.avatar : null;
        return /*#__PURE__*/React.createElement("div", {
          style: {
            width: 52,
            height: 64,
            borderRadius: 10,
            overflow: "hidden",
            flexShrink: 0,
            background: "var(--placeholder)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }
        }, tid && picOf(fullCache, imgCache, tid) ? /*#__PURE__*/React.createElement("img", {
          src: picOf(fullCache, imgCache, tid),
          alt: "",
          className: blurred[tid] ? "blur-img" : undefined,
          style: {
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block"
          }
        }) : /*#__PURE__*/React.createElement(Ic, {
          d: r._t === "Lore" ? icons.lore : r._t === "Prompt" ? icons.prompt : r._t === "Persona" ? icons.persona : icons.char,
          size: 18
        }));
      })(), /*#__PURE__*/React.createElement("div", {
        style: {
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          color: "var(--brass)",
          letterSpacing: ".12em",
          textTransform: "uppercase"
        }
      }, r._t), /*#__PURE__*/React.createElement("div", {
        className: "serif",
        style: {
          fontSize: 17,
          marginTop: 3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }
      }, r.name || r.title || "Untitled"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--dim)",
          marginTop: 4
        }
      }, "Updated ", timeAgo(r.updatedAt)))))))),
      wall: wallShow.length > 0 ? dashSection("wall", "From your galleries", /*#__PURE__*/React.createElement(React.Fragment, null, wallShow.length > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
        onMouseEnter: () => {
          wallHoverRef.current = true;
        },
        onMouseLeave: () => {
          wallHoverRef.current = false;
        },
        ref: wallRef,
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(clamp(200px, 16vw, 280px), 1fr))",
          gap: 14,
          rowGap: 14,
          overflow: "hidden"
        }
      }, wallVisible.map((w, i) => /*#__PURE__*/React.createElement("div", {
        key: w.imgId + i,
        className: "wtile",
        tabIndex: 0,
        "aria-label": w.label,
        role: "button",
        onClick: () => setWallLb({
          items: wallVisible.map(x => ({
            imgId: x.imgId,
            caption: x.label
          })),
          index: i
        }),
        onKeyDown: e => e.key === "Enter" && setWallLb({
          items: wallVisible.map(x => ({
            imgId: x.imgId,
            caption: x.label
          })),
          index: i
        })
      }, /*#__PURE__*/React.createElement(BlurBtn, {
        imgId: w.imgId,
        blurred: blurred,
        onToggleBlur: toggleBlur,
        label: w.label
      }), picOf(fullCache, imgCache, w.imgId) ? /*#__PURE__*/React.createElement("img", {
        src: picOf(fullCache, imgCache, w.imgId),
        alt: w.label,
        className: blurred[w.imgId] ? "blur-img" : undefined
      }) : /*#__PURE__*/React.createElement("div", {
        style: {
          height: "100%"
        }
      }), /*#__PURE__*/React.createElement("span", {
        className: "tlab",
        style: {
          zIndex: 2
        }
      }, w.label), /*#__PURE__*/React.createElement("div", {
        className: "wacts"
      }, /*#__PURE__*/React.createElement("button", {
        className: "btn btn-brass",
        style: {
          minWidth: 150
        },
        onClick: e => {
          e.stopPropagation();
          setWallLb({
            items: wallVisible.map(x => ({
              imgId: x.imgId,
              caption: x.label
            })),
            index: i
          });
        }
      }, "View image"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        style: {
          minWidth: 150
        },
        onClick: e => {
          e.stopPropagation();
          w.open();
        }
      }, w.kind === "persona" ? "Open persona" : "Open character")))))))) : null
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "dashwrap"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        flexWrap: "wrap",
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "eyebrow"
    }, "Dashboard"), /*#__PURE__*/React.createElement("h1", {
      className: "serif",
      style: {
        fontSize: "clamp(26px, 3.6vw, 40px)",
        margin: "4px 0 4px"
      }
    }, "Your worlds, kept."), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--mut)",
        fontSize: 14
      }
    }, "Build, organise and refine your roleplay library.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(4, auto)",
        gap: 10
      }
    }, [["Characters", chars.length, "characters"], ["Personas", personas.length, "personas"], ["Lore", lore.length, "lorebooks"], ["Prompts", prompts.length, "prompts"]].map(([label, n, target]) => /*#__PURE__*/React.createElement("button", {
      key: label,
      className: "card",
      onClick: () => setView(target),
      style: {
        padding: "10px 16px",
        textAlign: "center",
        color: "var(--text)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "serif",
      style: {
        fontSize: 22,
        color: n ? "var(--text)" : "var(--dim)"
      }
    }, n), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "var(--mut)",
        marginTop: 1
      }
    }, label))))), dashOrderChanged && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: "4px 10px",
      fontSize: 12.5
    },
    title: "Put the dashboard sections back in their original order",
    onClick: resetDashLayout
  }, "Reset layout")), dashOrder.map(k => dashSections[k]), wallLb && /*#__PURE__*/React.createElement(Lightbox, {
      items: wallLb.items,
      index: wallLb.index,
      imgCache: imgCache,
      fullCache: fullCache,
      requestFull: requestFull,
      blurred: blurred,
      onToggleBlur: toggleBlur,
      onClose: () => setWallLb(null),
      onNav: d => setWallLb(p => {
        if (!p || !p.items || !p.items.length) return null;
        return {
          ...p,
          index: (p.index + d + p.items.length) % p.items.length
        };
      })
    }));
  })(), view === "characters" && !overlayOpen && /*#__PURE__*/React.createElement("div", {
    style: sheetOpen ? {
      display: "none"
    } : undefined
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-end",
      flexWrap: "wrap",
      gap: 14,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Library"), /*#__PURE__*/React.createElement("h1", {
    className: "serif",
    style: {
      fontSize: "clamp(24px, 3vw, 36px)",
      margin: "4px 0 4px",
      fontWeight: 600
    }
  }, "Characters"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--mut)",
      fontSize: 13.5
    }
  }, chars.length, " ", chars.length === 1 ? "character" : "characters", " in the vault")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: charQ,
    onChange: e => setCharQ(e.target.value),
    placeholder: "Search names, tags, terms, story…",
    style: {
      width: 240
    }
  }), /*#__PURE__*/React.createElement("select", {
    value: sort,
    onChange: e => setSort(e.target.value),
    style: {
      width: 190
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "newest"
  }, "Newest first"), /*#__PURE__*/React.createElement("option", {
    value: "oldest"
  }, "Oldest first"), /*#__PURE__*/React.createElement("option", {
    value: "updated"
  }, "Recently updated"), /*#__PURE__*/React.createElement("option", {
    value: "name"
  }, "Name A–Z")), /*#__PURE__*/React.createElement("button", {
    className: "btn " + (selectMode ? "btn-brass" : "btn-ghost"),
    style: {
      flexShrink: 0
    },
    onClick: () => selectMode ? exitSelect() : (setBucketFilter(null), setSelectMode(true))
  }, selectMode ? "Cancel selection" : "Select"), /*#__PURE__*/React.createElement(FilesMenu, {
    title: "All characters",
    note: "These cover every character in the vault. To export just one, open it and use Export there.",
    groups: [{
      heading: "Bring in",
      items: [{
        label: "Import JSON",
        hint: "This app's own export, a CharSnap file, or a Tavern v1/v2 card.",
        onClick: () => triggerJsonImport("characters")
      }, {
        label: "Download a sample file",
        hint: "A blank file showing every field an import accepts.",
        onClick: () => downloadJSON(SAMPLE_CHARACTER_JSON, "rolecraft-character-template.json")
      }]
    }, {
      heading: "Send out",
      items: [{
        label: "Export JSON",
        hint: "Every character, pictures included. This is the one to keep as a backup.",
        onClick: () => askExport("your characters (including images)", exportCharsJson)
      }, {
        label: "Export text only",
        hint: "No pictures — small enough to read or paste elsewhere. Linked lore travels with it.",
        onClick: () => askExport("your characters as text, with no pictures", exportCharsTextJson)
      }]
    }]
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    style: {
      flexShrink: 0
    },
    onClick: () => setEditingChar(blankChar())
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.plus,
    size: 14
  }), " New character")))), selectMode && /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: "12px 16px",
      margin: "0 0 16px",
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
      position: "sticky",
      top: 0,
      zIndex: 6
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 14
    }
  }, Object.keys(selected).length, " selected"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => {
      const all = {};
      filteredChars.forEach(c => all[c.id] = true);
      setSelected(all);
    }
  }, "Select all shown (", filteredChars.length, ")"), /*#__PURE__*/React.createElement("input", {
    list: "rcv-buckets-bulk",
    value: bulkBucket,
    onChange: e => setBulkBucket(e.target.value),
    placeholder: "Bucket name…",
    style: {
      width: 200
    }
  }), /*#__PURE__*/React.createElement("datalist", {
    id: "rcv-buckets-bulk"
  }, [...new Set([...chars.map(c => (c.bucket || "").trim()).filter(Boolean), ...Object.keys(bucketMeta)])].sort().map(b => /*#__PURE__*/React.createElement("option", {
    key: b,
    value: b
  }))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    disabled: !Object.keys(selected).length || !bulkBucket.trim(),
    style: {
      opacity: !Object.keys(selected).length || !bulkBucket.trim() ? .5 : 1
    },
    onClick: () => bulkAssign(bulkBucket.trim())
  }, "Assign to bucket"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !Object.keys(selected).length,
    style: {
      opacity: !Object.keys(selected).length ? .5 : 1
    },
    onClick: () => bulkAssign("")
  }, "Remove from bucket"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    disabled: !Object.keys(selected).length,
    style: {
      opacity: !Object.keys(selected).length ? .5 : 1,
      marginLeft: "auto"
    },
    onClick: () => {
      const n = Object.keys(selected).length;
      if (!n) return;
      if (!confirmBulkDel) {
        setConfirmBulkDel(true);
        return;
      }
      bulkDeleteChars(Object.keys(selected));
    }
  }, confirmBulkDel ? "Click again — " + Object.keys(selected).length + " to the bin for " + TRASH_DAYS + " days" : "Delete selected")), (() => {
    const buckets = {};
    chars.forEach(c => {
      const b = (c.bucket || "").trim();
      if (!b) return;
      (buckets[b] = buckets[b] || []).push(c);
    });
    Object.keys(bucketMeta).forEach(n => {
      if (n && !buckets[n]) buckets[n] = [];
    });
    const names = Object.keys(buckets).sort((a, b) => a.localeCompare(b));
    if (!chars.length && !names.length) return null;
    const unsorted = chars.filter(c => !(c.bucket || "").trim());
    const startBucket = () => setNewBucketOpen(true);
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "eyebrow",
      style: {
        margin: "6px 0 10px"
      }
    }, "Buckets"), /*#__PURE__*/React.createElement("div", {
      className: "strip",
      style: {
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: startBucket,
      "aria-label": "Create a new bucket",
      className: "stile",
      style: {
        height: 160,
        width: 190,
        flexShrink: 0,
        border: "1px dashed var(--brass-line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: "center",
        color: "var(--brass)"
      }
    }, /*#__PURE__*/React.createElement(Ic, {
      d: icons.plus,
      size: 18
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        fontWeight: 600,
        fontSize: 13,
        marginTop: 4
      }
    }, "New bucket"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10.5,
        color: "var(--dim)",
        display: "block",
        marginTop: 2
      }
    }, "empty or assign"))), names.map(b => {
      const cs = buckets[b];
      const customCover = bucketMeta[b] && bucketMeta[b].cover;
      const coverId = customCover && picOf(fullCache, imgCache, customCover) ? customCover : (cs.find(c => picOf(fullCache, imgCache, c.profileImg)) || {}).profileImg;
      const active = bucketFilter === b;
      return /*#__PURE__*/React.createElement("button", {
        key: b,
        onClick: () => setBucketFilter(active ? null : b),
        "aria-label": "Bucket " + b,
        className: "stile",
        style: {
          height: 160,
          width: 280,
          flexShrink: 0,
          border: active ? "1px solid var(--brass)" : undefined
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "blurbtn",
        role: "button",
        tabIndex: 0,
        "aria-label": "Set cover for " + b,
        onClick: e => {
          e.stopPropagation();
          setCoverTarget(b);
          setTimeout(() => bucketCoverRef.current && bucketCoverRef.current.click(), 0);
        },
        onKeyDown: e => {
          if (e.key === "Enter") {
            e.stopPropagation();
            setCoverTarget(b);
            setTimeout(() => bucketCoverRef.current && bucketCoverRef.current.click(), 0);
          }
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: icons.img,
        size: 14
      })), customCover && /*#__PURE__*/React.createElement("span", {
        className: "blurbtn",
        role: "button",
        tabIndex: 0,
        "aria-label": "Remove cover for " + b,
        style: {
          right: 44
        },
        onClick: e => {
          e.stopPropagation();
          setBucketCover(b, null);
        },
        onKeyDown: e => {
          if (e.key === "Enter") {
            e.stopPropagation();
            setBucketCover(b, null);
          }
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: icons.x,
        size: 14
      })), customCover && /*#__PURE__*/React.createElement("span", {
        className: "blurbtn",
        role: "button",
        tabIndex: 0,
        "aria-label": "Download the cover for " + b,
        title: "Save this picture at full size",
        style: {
          right: 80
        },
        onClick: e => {
          e.stopPropagation();
          downloadOneImage(customCover, b + "-cover");
        },
        onKeyDown: e => {
          if (e.key === "Enter") {
            e.stopPropagation();
            downloadOneImage(customCover, b + "-cover");
          }
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: icons.down,
        size: 14
      })), coverId ? /*#__PURE__*/React.createElement("img", {
        src: picOf(fullCache, imgCache, coverId),
        alt: "",
        style: {
          width: "100%",
          maxWidth: "none",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(.6)"
        },
        className: blurred[coverId] ? "blur-img" : undefined
      }) : /*#__PURE__*/React.createElement("div", {
        style: {
          width: "100%",
          height: "100%",
          background: "var(--placeholder)"
        }
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 12,
          textAlign: "left",
          zIndex: 1
        }
      }, /*#__PURE__*/React.createElement("span", {
        className: "serif",
        style: {
          display: "block",
          fontSize: 19,
          color: "#f2f4fc",
          textShadow: "0 1px 8px rgba(0,0,0,.9)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }
      }, b), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12.5,
          color: "var(--brass)",
          textShadow: "0 1px 6px rgba(0,0,0,.9)"
        }
      }, cs.length, " ", cs.length === 1 ? "character" : "characters", active ? " · showing" : "")));
    }), names.length > 0 && unsorted.length > 0 && /*#__PURE__*/React.createElement("button", {
      onClick: () => setBucketFilter(bucketFilter === "" ? null : ""),
      "aria-label": "Unsorted characters",
      className: "stile",
      style: {
        height: 160,
        width: 190,
        flexShrink: 0,
        border: bucketFilter === "" ? "1px solid var(--brass)" : "1px dashed var(--line2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "block",
        fontWeight: 600,
        fontSize: 14,
        color: "var(--mut)"
      }
    }, "Unsorted"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        color: "var(--dim)"
      }
    }, unsorted.length, " ", unsorted.length === 1 ? "character" : "characters")))), bucketFilter !== null && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 14,
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "chip on",
      style: {
        cursor: "pointer"
      },
      onClick: () => setBucketFilter(null)
    }, bucketFilter === "" ? "Unsorted" : bucketFilter, " ✕ — show all"), bucketFilter && /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      style: {
        padding: "4px 10px",
        fontSize: 12.5
      },
      onClick: () => {
        setBucketFilter(null);
        setSelectMode(true);
        setBulkBucket(bucketFilter);
        toast("Pick more characters, then hit Assign to bucket");
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: 6,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(Ic, {
      d: icons.plus,
      size: 12
    }), " Add characters"))));
  })(), allTags.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setTagsOpen(o => !o),
    "aria-expanded": tagsOpen,
    style: {
      background: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "2px 0",
      color: tagFilter ? "var(--brass)" : "var(--mut)",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: ".18em",
      textTransform: "uppercase"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: tagsOpen ? icons.cdown : icons.right,
    size: 13
  }), "Tags · ", allTags.length, tagFilter ? " · filtering: " + tagFilter : ""), tagsOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "chip" + (!tagFilter ? " on" : ""),
    onClick: () => setTagFilter(null),
    style: {
      cursor: "pointer"
    }
  }, "all"), allTags.map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    className: "chip" + (tagFilter === t ? " on" : ""),
    style: {
      cursor: "pointer"
    },
    onClick: () => setTagFilter(tagFilter === t ? null : t)
  }, t)))), filteredChars.length === 0 ? bucketFilter && bucketMeta[bucketFilter] !== undefined && !chars.some(c => (c.bucket || "").trim() === bucketFilter) ? /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 40,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 21,
      fontWeight: 600
    }
  }, "“", bucketFilter, "” is empty"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--mut)",
      fontSize: 13.5,
      margin: "8px 0 16px"
    }
  }, "This bucket is waiting for characters — use Select to assign some, or set the bucket in a character's editor."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    onClick: () => {
      setSelectMode(true);
      setBulkBucket(bucketFilter);
      setBucketFilter(null);
    }
  }, "Select characters to add"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => deleteEmptyBucket(bucketFilter)
  }, "Delete bucket"))) : /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 40,
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 21,
      fontWeight: 600
    }
  }, chars.length === 0 ? "No characters yet" : "No matches"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--mut)",
      fontSize: 13.5,
      margin: "8px 0 16px"
    }
  }, chars.length === 0 ? "Create your first character to begin building your roleplay library." : "Try a different search or tag."), chars.length === 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => setEditingChar(blankChar())
  }, "New character")) : /*#__PURE__*/React.createElement("div", {
    className: "grid-cards"
  }, filteredChars.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    className: "char-card",
    role: "button",
    tabIndex: 0,
    "aria-pressed": selectMode ? !!selected[c.id] : undefined,
    style: selectMode && selected[c.id] ? {
      borderColor: "var(--brass)",
      boxShadow: "0 0 0 2px var(--brass-line)"
    } : undefined,
    onClick: () => selectMode ? toggleSelect(c.id) : setViewCharId(c.id),
    onKeyDown: e => e.key === "Enter" && (selectMode ? toggleSelect(c.id) : setViewCharId(c.id))
  }, selectMode && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 8,
      left: 8,
      zIndex: 2,
      width: 26,
      height: 26,
      borderRadius: 99,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: selected[c.id] ? "var(--brass)" : "rgba(10,14,26,.6)",
      color: selected[c.id] ? "#141414" : "rgba(231,235,247,.8)",
      border: "1px solid " + (selected[c.id] ? "var(--brass)" : "rgba(180,195,235,.4)")
    }
  }, selected[c.id] && /*#__PURE__*/React.createElement(Ic, {
    d: icons.check,
    size: 14
  })), (c.profileImg && loadImage(c.profileImg), picOf(fullCache, imgCache, c.profileImg)) ? /*#__PURE__*/React.createElement("img", {
    src: picOf(fullCache, imgCache, c.profileImg),
    alt: c.name,
    className: blurred[c.profileImg] ? "blur-img" : undefined
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--placeholder)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "serif",
    style: {
      fontSize: 52,
      color: "var(--brass-line)",
      fontWeight: 700
    }
  }, (c.name || "?").charAt(0).toUpperCase())), (c.gallery || []).length > 0 && /*#__PURE__*/React.createElement("span", {
    className: "shots",
    title: (c.gallery || []).length + ((c.gallery || []).length === 1 ? " picture" : " pictures")
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.img,
    size: 11
  }), (c.gallery || []).length), /*#__PURE__*/React.createElement("div", {
    className: "veil"
  }), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 17,
      fontWeight: 700,
      color: "#f2f4fc", // fixed: the veil is dark in every theme, so --text would vanish in light
      textShadow: "0 1px 8px rgba(0,0,0,.6)"
    }
  }, c.name || "Untitled"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "#aeb8d6",
      marginTop: 2,
      display: "flex",
      gap: 8,
      flexWrap: "nowrap"
    }
  }, (c.tagline || (c.tags || []).join(" | ")) && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#d9b25c", // fixed for the same reason; --brass goes dark in the light theme
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: 170
    }
  }, c.tagline || (c.tags || []).join(" | ")))))))), view === "personas" && !overlayOpen && (() => {
    const needle = personaQ.trim().toLowerCase();
    const shown = personas.filter(p => pBucketFilter === null || (p.bucket || "").trim() === pBucketFilter).filter(p => !needle || [p.name, p.tagline, p.role, p.description].some(v => (v || "").toLowerCase().includes(needle))).slice().sort((a, b) => sort === "name" ? (a.name || "").localeCompare(b.name || "") : sort === "updated" ? (b.updatedAt || 0) - (a.updatedAt || 0) : sort === "oldest" ? (a.createdAt || 0) - (b.createdAt || 0) : (b.createdAt || 0) - (a.createdAt || 0));
    return /*#__PURE__*/React.createElement("div", {
      style: sheetOpen ? {
        display: "none"
      } : undefined
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 22
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "eyebrow"
    }, "Library"), /*#__PURE__*/React.createElement("h1", {
      className: "serif",
      style: {
        fontSize: "clamp(24px, 3vw, 36px)",
        margin: "4px 0 4px"
      }
    }, "Personas"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--mut)",
        fontSize: 14
      }
    }, "Who you are in the story — identities, roles and writing preferences.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: personaQ,
      onChange: e => setPersonaQ(e.target.value),
      placeholder: "Search personas…",
      style: {
        width: 220
      }
    }), /*#__PURE__*/React.createElement("select", {
      value: sort,
      onChange: e => setSort(e.target.value),
      style: { width: 190 },
      "aria-label": "Sort personas"
    }, /*#__PURE__*/React.createElement("option", { value: "newest" }, "Newest first"),
    /*#__PURE__*/React.createElement("option", { value: "oldest" }, "Oldest first"),
    /*#__PURE__*/React.createElement("option", { value: "updated" }, "Recently updated"),
    /*#__PURE__*/React.createElement("option", { value: "name" }, "Name A\u2013Z")),
    /*#__PURE__*/React.createElement("button", {
      className: "btn " + (pSelMode ? "btn-brass" : "btn-ghost"),
      onClick: () => {
        if (pSelMode) {
          setPSelMode(false);
          setPSelected({});
        } else {
          setPBucketFilter(null);
          setPSelMode(true);
        }
      }
    }, pSelMode ? "Cancel selection" : "Select"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => personas.some(p => p.avatar || (p.gallery || []).length) ? setPersonaGrid(true) : toast("No persona images yet")
    }, "Image grid"), /*#__PURE__*/React.createElement(FilesMenu, {
      title: "All personas",
      note: "These cover every persona in the vault. To export just one, open it and use Export there.",
      groups: [{
        heading: "Bring in",
        items: [{
          label: "Import JSON",
          hint: "A personas file exported from this app, here or on another machine.",
          onClick: () => triggerJsonImport("personas")
        }, {
          label: "Download a sample file",
          hint: "A blank file showing every field an import accepts.",
          onClick: () => downloadJSON(SAMPLE_PERSONA_JSON, "rolecraft-persona-template.json")
        }]
      }, {
        heading: "Send out",
        items: [{
          label: "Export JSON",
          hint: "Every persona, with their portraits and gallery pictures. This is the one to keep as a backup.",
          onClick: () => askExport("your personas (including portraits)", exportPersonasJson)
        }, {
          label: "Export text only",
          hint: "No pictures — small enough to read or paste elsewhere.",
          onClick: () => askExport("your personas as text, with no pictures", exportPersonasTextJson)
        }]
      }]
    }), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: () => setEditingRecord({
        type: "persona",
        record: {
          id: uid()
        }
      })
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: 6,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(Ic, {
      d: icons.plus,
      size: 14
    }), " New persona")))), (() => {
      const pbuckets = {};
      personas.forEach(p => {
        const b = (p.bucket || "").trim();
        if (!b) return;
        (pbuckets[b] = pbuckets[b] || []).push(p);
      });
      Object.keys(pBucketMeta).forEach(n => {
        if (n && !pbuckets[n]) pbuckets[n] = [];
      });
      const pnames = Object.keys(pbuckets).sort((a, b) => a.localeCompare(b));
      const punsorted = personas.filter(p => !(p.bucket || "").trim());
      if (!personas.length && !pnames.length) return null;
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
        className: "eyebrow",
        style: {
          margin: "6px 0 10px"
        }
      }, "Buckets"), /*#__PURE__*/React.createElement("div", {
        className: "strip",
        style: {
          marginBottom: 16
        }
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => setPNewBucketOpen(true),
        "aria-label": "Create a new persona bucket",
        className: "stile",
        style: {
          height: 160,
          width: 190,
          flexShrink: 0,
          border: "1px dashed var(--brass-line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          cursor: "pointer"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          textAlign: "center",
          color: "var(--brass)"
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: icons.plus,
        size: 18
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          display: "block",
          fontWeight: 600,
          fontSize: 13,
          marginTop: 4
        }
      }, "New bucket"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10.5,
          color: "var(--dim)",
          display: "block",
          marginTop: 2
        }
      }, "empty or assign"))), pnames.map(b => {
        const ps = pbuckets[b];
        const withAv = ps.find(p => p.avatar && imgCache[p.avatar]);
        const active = pBucketFilter === b;
        return /*#__PURE__*/React.createElement("button", {
          key: b,
          onClick: () => setPBucketFilter(active ? null : b),
          "aria-pressed": active,
          className: "stile",
          style: {
            height: 160,
            width: 240,
            flexShrink: 0,
            cursor: "pointer",
            position: "relative",
            border: active ? "1px solid var(--brass)" : undefined,
            boxShadow: active ? "0 0 0 2px var(--brass-line)" : undefined,
            padding: 0,
            overflow: "hidden"
          }
        }, withAv ? /*#__PURE__*/React.createElement("img", {
          src: imgCache[withAv.avatar],
          alt: "",
          className: blurred[withAv.avatar] ? "blur-img" : undefined,
          style: {
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            filter: "brightness(.75)"
          }
        }) : /*#__PURE__*/React.createElement("div", {
          style: {
            width: "100%",
            height: "100%",
            background: "var(--placeholder)"
          }
        }), /*#__PURE__*/React.createElement("span", {
          style: {
            position: "absolute",
            left: 12,
            bottom: 10,
            textAlign: "left"
          }
        }, /*#__PURE__*/React.createElement("span", {
          className: "serif",
          style: {
            display: "block",
            fontSize: 19,
            color: "#f2f4fc",
            textShadow: "0 1px 8px rgba(0,0,0,.9)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }
        }, b), /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 12.5,
            color: "var(--brass)",
            textShadow: "0 1px 6px rgba(0,0,0,.9)"
          }
        }, ps.length, " ", ps.length === 1 ? "persona" : "personas", active ? " · showing" : "")));
      }), pnames.length > 0 && punsorted.length > 0 && /*#__PURE__*/React.createElement("button", {
        onClick: () => setPBucketFilter(pBucketFilter === "" ? null : ""),
        "aria-label": "Unsorted personas",
        className: "stile",
        style: {
          height: 160,
          width: 190,
          flexShrink: 0,
          cursor: "pointer",
          border: pBucketFilter === "" ? "1px solid var(--brass)" : "1px dashed var(--line2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          textAlign: "center",
          color: "var(--mut)"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          display: "block",
          fontWeight: 600,
          fontSize: 13
        }
      }, "Unsorted"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11,
          color: "var(--dim)",
          display: "block",
          marginTop: 2
        }
      }, punsorted.length, " ", punsorted.length === 1 ? "persona" : "personas")))));
    })(), pBucketFilter && !pSelMode && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      style: {
        padding: "4px 10px",
        fontSize: 12.5
      },
      onClick: () => {
        setPBucketFilter(null);
        setPSelMode(true);
        setPBulkBucket(pBucketFilter);
        toast("Pick more personas, then hit Assign to bucket");
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: 6,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(Ic, {
      d: icons.plus,
      size: 12
    }), " Add personas"))), pSelMode && /*#__PURE__*/React.createElement("div", {
      className: "card",
      style: {
        padding: "12px 16px",
        margin: "0 0 16px",
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontSize: 14
      }
    }, Object.keys(pSelected).length, " selected"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => {
        const all = {};
        shown.forEach(p => all[p.id] = true);
        setPSelected(all);
      }
    }, "Select all shown (", shown.length, ")"), /*#__PURE__*/React.createElement("input", {
      list: "rcv-pbuckets-bulk",
      value: pBulkBucket,
      onChange: e => setPBulkBucket(e.target.value),
      placeholder: "Bucket name…",
      style: {
        width: 180
      }
    }), /*#__PURE__*/React.createElement("datalist", {
      id: "rcv-pbuckets-bulk"
    }, [...new Set([...personas.map(p => (p.bucket || "").trim()).filter(Boolean), ...Object.keys(pBucketMeta)])].sort().map(b => /*#__PURE__*/React.createElement("option", {
      key: b,
      value: b
    }))), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      disabled: !Object.keys(pSelected).length || !pBulkBucket.trim(),
      style: {
        opacity: !Object.keys(pSelected).length || !pBulkBucket.trim() ? .5 : 1
      },
      onClick: () => pBulkAssign(pBulkBucket)
    }, "Assign"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      disabled: !Object.keys(pSelected).length,
      style: {
        opacity: !Object.keys(pSelected).length ? .5 : 1
      },
      onClick: () => pBulkAssign("")
    }, "Remove from bucket"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-danger",
      disabled: !Object.keys(pSelected).length,
      style: {
        opacity: !Object.keys(pSelected).length ? .5 : 1,
        marginLeft: "auto"
      },
      onClick: () => {
        if (!Object.keys(pSelected).length) return;
        if (!pConfirmDel) {
          setPConfirmDel(true);
          return;
        }
        bulkDeletePersonas(Object.keys(pSelected));
      }
    }, pConfirmDel ? "Click again — " + Object.keys(pSelected).length + " to the bin for " + TRASH_DAYS + " days" : "Delete selected")), shown.length === 0 && (pBucketFilter && pBucketMeta[pBucketFilter] !== undefined && !personas.some(p => (p.bucket || "").trim() === pBucketFilter) ? /*#__PURE__*/React.createElement("div", {
      className: "card",
      style: {
        padding: 40,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "serif",
      style: {
        fontSize: 21,
        fontWeight: 600
      }
    }, "“", pBucketFilter, "” is empty"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--mut)",
        fontSize: 13.5,
        margin: "8px 0 16px"
      }
    }, "This bucket is waiting for personas — use Select to assign some, or set the bucket in a persona's editor."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-brass",
      onClick: () => {
        setPSelMode(true);
        setPBulkBucket(pBucketFilter);
        setPBucketFilter(null);
      }
    }, "Select personas to add"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-danger",
      onClick: () => deleteEmptyPersonaBucket(pBucketFilter)
    }, "Delete bucket"))) : /*#__PURE__*/React.createElement("div", {
      className: "card",
      style: {
        padding: 34,
        color: "var(--dim)",
        fontSize: 14
      }
    }, needle ? "No personas match that search." : pBucketFilter !== null ? "No personas in this bucket." : "No personas yet. Add one to describe who you play as.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 16
      }
    }, shown.map(p => /*#__PURE__*/React.createElement("div", {
      key: p.id,
      className: "char-card",
      role: "button",
      tabIndex: 0,
      "aria-pressed": pSelMode ? !!pSelected[p.id] : undefined,
      style: pSelMode && pSelected[p.id] ? {
        borderColor: "var(--brass)",
        boxShadow: "0 0 0 2px var(--brass-line)"
      } : undefined,
      onClick: () => pSelMode ? setPSelected(s => {
        const n = {
          ...s
        };
        if (n[p.id]) delete n[p.id];else n[p.id] = true;
        return n;
      }) : setViewPersonaId(p.id),
      onKeyDown: e => e.key === "Enter" && (pSelMode ? setPSelected(s => {
        const n = {
          ...s
        };
        if (n[p.id]) delete n[p.id];else n[p.id] = true;
        return n;
      }) : setViewPersonaId(p.id))
    }, (p.avatar && loadImage(p.avatar), picOf(fullCache, imgCache, p.avatar)) ? /*#__PURE__*/React.createElement("img", {
      src: picOf(fullCache, imgCache, p.avatar),
      alt: p.name,
      className: blurred[p.avatar] ? "blur-img" : undefined
    }) : /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--placeholder)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "serif",
      style: {
        fontSize: 52,
        color: "var(--brass-line)"
      }
    }, (p.name || "?").charAt(0).toUpperCase())), (p.gallery || []).length > 0 && /*#__PURE__*/React.createElement("span", {
      className: "shots",
      title: (p.gallery || []).length + ((p.gallery || []).length === 1 ? " picture" : " pictures")
    }, /*#__PURE__*/React.createElement(Ic, {
      d: icons.img,
      size: 11
    }), (p.gallery || []).length), /*#__PURE__*/React.createElement("div", {
      className: "veil"
    }), /*#__PURE__*/React.createElement("div", {
      className: "meta"
    }, /*#__PURE__*/React.createElement("div", {
      className: "serif",
      style: {
        fontSize: 18,
        color: "#f2f4fc"
      }
    }, p.name || "Untitled"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: "var(--brass)",
        display: "flex",
        gap: 8,
        marginTop: 3,
        alignItems: "center"
      }
    }, (p.tagline || p.role) && /*#__PURE__*/React.createElement("span", {
      style: {
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 170
      }
    }, p.tagline || p.role)))))));
  })(), view === "lorebooks" && !overlayOpen && (() => {
    const books = {};
    lore.forEach(e => {
      const w = (e.world || "").trim();
      (books[w] = books[w] || []).push(e);
    });
    Object.keys(loreMeta).forEach(w => {
      if (!books[w]) books[w] = [];
    });
    const names = Object.keys(books).sort((a, b) => (a || "\uffff").localeCompare(b || "\uffff"));
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 22
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "eyebrow"
    }, "Library"), /*#__PURE__*/React.createElement("h1", {
      className: "serif",
      style: {
        fontSize: "clamp(24px, 3vw, 36px)",
        margin: "4px 0 4px"
      }
    }, "Lorebooks"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--mut)",
        fontSize: 14
      }
    }, "Each world is a book — open one to browse and edit its entries.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(FilesMenu, {
      title: "All lorebooks",
      note: "Importing here files entries by the world named in the file. To put everything into one book instead, open that book and import from inside it.",
      groups: [{
        heading: "Bring in",
        items: [{
          label: "Import JSON",
          hint: "A lorebook file from this app, or a Chub-style lorebook.",
          onClick: () => triggerJsonImport("lore")
        }, {
          label: "Download a sample file",
          hint: "A blank file showing every field an import accepts. Every entry needs at least one trigger.",
          onClick: () => downloadJSON(SAMPLE_LOREBOOK_JSON, "rolecraft-lorebook-template.json")
        }]
      }, {
        heading: "Send out",
        items: [{
          label: "Export JSON",
          hint: "Every lorebook in the vault — but without their pictures. To keep those, open a single book and export it from there.",
          onClick: () => askExport("your lorebooks", exportLoreJson)
        }]
      }]
    }), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: () => {
        setNewBookName("");
        setNewBookOpen(true);
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: 6,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(Ic, {
      d: icons.plus,
      size: 14
    }), " New lorebook")))), names.length === 0 && /*#__PURE__*/React.createElement("div", {
      className: "card",
      style: {
        padding: 34,
        color: "var(--dim)",
        fontSize: 14
      }
    }, "No lorebooks yet. Create one, or import a lorebook JSON — entries group into books by their world."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16
      }
    }, names.map(w => {
      const es = books[w];
      const latest = es.length ? Math.max.apply(null, es.map(e => e.updatedAt || 0)) : null;
      const sample = es.slice().sort((a, b) => (a.title || "").localeCompare(b.title || "")).slice(0, 4).map(e => e.title || "Untitled");
      const cover = loreMeta[w] && loreMeta[w].cover;
      return /*#__PURE__*/React.createElement("div", {
        key: w || "__unfiled",
        className: "card",
        role: "button",
        tabIndex: 0,
        style: {
          padding: 0,
          cursor: "pointer",
          overflow: "hidden"
        },
        onClick: () => setViewLoreBook(w),
        onKeyDown: ev => ev.key === "Enter" && setViewLoreBook(w)
      }, cover && imgCache[cover] && /*#__PURE__*/React.createElement("div", {
        style: {
          height: 110,
          overflow: "hidden"
        }
      }, /*#__PURE__*/React.createElement("img", {
        src: imgCache[cover],
        alt: "",
        className: blurred[cover] ? "blur-img" : undefined,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          filter: "brightness(.8)"
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          padding: 20
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 42,
          height: 42,
          borderRadius: 11,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--brass-soft)",
          color: "var(--brass)",
          border: "1px solid var(--brass-line)"
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: icons.lore,
        size: 19
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "serif",
        style: {
          fontSize: 19,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }
      }, w || "Unfiled"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--brass)"
        }
      }, es.length, " ", es.length === 1 ? "entry" : "entries"))), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12.5,
          color: "var(--mut)",
          lineHeight: 1.6,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden"
        }
      }, es.length ? sample.join(" · ") + (es.length > 4 ? " · …" : "") : "Empty book — open it to add entries."), latest && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11.5,
          color: "var(--dim)",
          marginTop: 10
        }
      }, "Updated ", timeAgo(latest))));
    })));
  })(), view === "prompts" && !overlayOpen && (() => {
    const books = {};
    prompts.forEach(p => {
      const w = (p.collection || "").trim();
      (books[w] = books[w] || []).push(p);
    });
    Object.keys(promptMeta).forEach(w => {
      if (!books[w]) books[w] = [];
    });
    const names = Object.keys(books).sort((a, b) => (a || "\uffff").localeCompare(b || "\uffff"));
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 22
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "eyebrow"
    }, "Library"), /*#__PURE__*/React.createElement("h1", {
      className: "serif",
      style: {
        fontSize: "clamp(24px, 3vw, 36px)",
        margin: "4px 0 4px"
      }
    }, "Prompt Vault"), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--mut)",
        fontSize: 14
      }
    }, "Reusable prompts in collections — open one to browse, copy and edit.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: () => {
        setNewPBookName("");
        setNewPBookOpen(true);
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: 6,
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement(Ic, {
      d: icons.plus,
      size: 14
    }), " New collection")), /*#__PURE__*/React.createElement(FilesMenu, {
      title: "All prompts",
      note: "To export prompts, open a collection — the export lives inside it.",
      groups: [{
        heading: "Bring in",
        items: [{
          label: "Import JSON",
          hint: "A prompts file exported from this app, here or on another machine.",
          onClick: () => triggerJsonImport("prompts")
        }, {
          label: "Download a sample file",
          hint: "A blank file showing every field an import accepts.",
          onClick: () => downloadJSON(SAMPLE_PROMPT_JSON, "rolecraft-prompt-template.json")
        }]
      }, {
        heading: "Send out",
        items: [{
          label: "Export JSON",
          hint: "Every prompt in the vault, in this app's own format. Import it back here or on another machine.",
          onClick: () => askExport("your prompts", exportPromptsJson)
        }]
      }]
    }))), names.length === 0 && /*#__PURE__*/React.createElement("div", {
      className: "card",
      style: {
        padding: 34,
        color: "var(--dim)",
        fontSize: 14
      }
    }, "No prompt collections yet. Create one to keep your best openers and templates."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16
      }
    }, names.map(w => {
      const es = books[w];
      const latest = es.length ? Math.max.apply(null, es.map(e => e.updatedAt || 0)) : null;
      const sample = es.slice().sort((a, b) => (a.title || "").localeCompare(b.title || "")).slice(0, 4).map(e => e.title || "Untitled");
      const cover = promptMeta[w] && promptMeta[w].cover;
      return /*#__PURE__*/React.createElement("div", {
        key: w || "__unfiled",
        className: "card",
        role: "button",
        tabIndex: 0,
        style: {
          padding: 0,
          cursor: "pointer",
          overflow: "hidden"
        },
        onClick: () => setViewPromptBook(w),
        onKeyDown: ev => ev.key === "Enter" && setViewPromptBook(w)
      }, cover && imgCache[cover] && /*#__PURE__*/React.createElement("div", {
        style: {
          height: 110,
          overflow: "hidden"
        }
      }, /*#__PURE__*/React.createElement("img", {
        src: imgCache[cover],
        alt: "",
        className: blurred[cover] ? "blur-img" : undefined,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          filter: "brightness(.8)"
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          padding: 20
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 10
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 42,
          height: 42,
          borderRadius: 11,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--brass-soft)",
          color: "var(--brass)",
          border: "1px solid var(--brass-line)"
        }
      }, /*#__PURE__*/React.createElement(Ic, {
        d: icons.prompt,
        size: 19
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        className: "serif",
        style: {
          fontSize: 19,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }
      }, w || "Unfiled"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          color: "var(--brass)"
        }
      }, es.length, " ", es.length === 1 ? "prompt" : "prompts"))), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12.5,
          color: "var(--mut)",
          lineHeight: 1.6,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden"
        }
      }, es.length ? sample.join(" · ") + (es.length > 4 ? " · …" : "") : "Empty collection — open it to add prompts."), latest && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11.5,
          color: "var(--dim)",
          marginTop: 10
        }
      }, "Updated ", timeAgo(latest))));
    })));
  })()), viewPersonaId && personas.find(x => x.id === viewPersonaId) && (() => {
    const vp = personas.find(x => x.id === viewPersonaId);
    return /*#__PURE__*/React.createElement(PersonaPage, {
      persona: vp,
      imgCache: imgCache,
      fullCache: fullCache,
      loadImage: loadImage,
      requestFull: requestFull,
      warmFull: warmFull,
      blurred: blurred,
      onToggleBlur: toggleBlur,
      toast: toast,
      escOff: viewLoreBook !== null || viewLoreEntryId !== null || !!editingRecord,
      onClose: () => setViewPersonaId(null),
      onEdit: () => setEditingRecord({
        type: "persona",
        record: vp
      }),
      onOpenLorebook: w => setViewLoreBook(w),
      onStats: () => openRecordStats(vp.name || "Untitled", textOfPersona(vp), [vp.avatar, ...(vp.gallery || []).map(g => g.imgId)], personaBudget(vp), "A persona goes in with every message, so all of it is permanent"),
      onReorder: keys => {
        if (keys === null) toast("Section layout reset");
        return persistPersona({
          ...vp,
          sectionOrder: keys
        });
      },
      onSetAvatar: imgId => persistPersona({
        ...vp,
        avatar: imgId,
        updatedAt: Date.now()
      }),
      onCaption: (idx, text) => persistPersona({
        ...vp,
        gallery: (vp.gallery || []).map((g, j) => j === idx ? {
          ...g,
          caption: text
        } : g),
        updatedAt: Date.now()
      }),
      onReorderImages: g => {
        persistPersona({
          ...vp,
          gallery: g,
          updatedAt: Date.now()
        });
        toast("Gallery order updated");
      },
      onAddImages: async files => {
        const added = [];
        let unreadable = 0,
          unsaved = 0;
        for (const f of Array.from(files)) {
          let orig;
          try {
            orig = await fileToDataUrl(f);
          } catch (e) {
            unreadable++;
            continue;
          }
          const thumb = await makeThumb(orig).catch(() => null);
          const imgId = uid();
          try {
            await saveImage(imgId, orig, thumb);
          } catch (e) {
            unsaved++;
            continue;
          }
          added.push({
            imgId,
            caption: ""
          });
        }
        if (added.length) await persistPersona({
          ...vp,
          gallery: [...(vp.gallery || []), ...added],
          updatedAt: Date.now()
        });
        toast(imageAddResult(added.length, unreadable, unsaved));
      },
      onDeleteImages: async imgIds => {
        const idSet = new Set(imgIds);
        idSet.forEach(id => {
          dropImage(id);
        });
        forgetBlur(idSet);
        const patch = {
          ...vp,
          gallery: (vp.gallery || []).filter(g => !idSet.has(g.imgId)),
          imgMeta: withoutImgMeta(vp.imgMeta, idSet),
          updatedAt: Date.now()
        };
        if (idSet.has(vp.avatar)) patch.avatar = null;
        await persistPersona(patch);
        toast(imgIds.length + (imgIds.length === 1 ? " image deleted" : " images deleted"));
      },
      onCreateAlbum: async name => {
        const n = (name || "").trim();
        if (!n) return;
        const known = (vp.albums || []).slice();
        const exists = known.indexOf(n) >= 0 || (vp.gallery || []).some(g => (g.album || "").trim() === n);
        if (exists) {
          toast("That album already exists");
          return;
        }
        known.push(n);
        await persistPersona({ ...vp, albums: known, updatedAt: Date.now() });
        toast("Album \u201c" + n + "\u201d created \u2014 tick images and add them any time");
      },
      onDeleteAlbum: async name => {
        const gallery = (vp.gallery || []).map(g => (g.album || "") === name ? { ...g, album: "" } : g);
        const imgMeta = { ...(vp.imgMeta || {}) };
        Object.keys(imgMeta).forEach(id => {
          if (imgMeta[id] && imgMeta[id].album === name) imgMeta[id] = { ...imgMeta[id], album: "" };
        });
        await persistPersona({ ...vp, gallery, imgMeta, albums: (vp.albums || []).filter(a => a !== name), updatedAt: Date.now() });
        toast("Album “" + name + "” removed — its pictures are still here");
      },
      onSetAlbum: async (imgIds, albumName) => {
        const idSet = new Set(imgIds);
        const gallery = (vp.gallery || []).map(g => idSet.has(g.imgId) ? { ...g, album: albumName } : g);
        /* A character's portrait can be filed in an album because the character
           side records it in imgMeta; the persona side only looked at the
           gallery, so the same action on a persona said it was impossible. */
        const galleryIds = new Set((vp.gallery || []).map(g => g.imgId));
        const imgMeta = { ...(vp.imgMeta || {}) };
        imgIds.filter(id => !galleryIds.has(id)).forEach(id => {
          imgMeta[id] = { ...(imgMeta[id] || {}), album: albumName };
        });
        const touched = imgIds.length;
        const known = (vp.albums || []).slice();
        if (albumName && known.indexOf(albumName) < 0) known.push(albumName);
        await persistPersona({ ...vp, gallery, imgMeta, albums: known, updatedAt: Date.now() });
        if (!touched) {
          return;
        }
        toast(albumName ? touched + (touched === 1 ? " image added to " : " images added to ") + "\u201c" + albumName + "\u201d"
          : touched + (touched === 1 ? " image removed from its album" : " images removed from their albums"));
      },
      onDownloadImages: () => askExport("this persona's images", () => downloadImagesZip([], [vp], sanitizeName(vp.name) + "-images.zip")),
      onExportJson: () => askExport("this persona (including images)", () => exportPersonaJson(vp)),
      onExportText: () => askExport("this persona as text, with no pictures", () => exportPersonaTextJson(vp)),
      onDownloadSelected: (items, albumName) => askExport(albumName ? "the \u201c" + albumName + "\u201d album" : "the selected images", () => zipSelectedImages(items, sanitizeName(vp.name) + "-" + sanitizeName(albumName || "selected") + ".zip"))
    });
  })(), personaGrid && /*#__PURE__*/React.createElement(ImageGridView, {
    title: "Persona images",
    items: (() => {
      const seen = new Set();
      const out = [];
      personas.forEach(p => {
        [p.avatar, ...(p.gallery || []).map(g => g.imgId)].filter(Boolean).forEach(id => {
          if (seen.has(id)) return;
          seen.add(id);
          out.push({
            imgId: id,
            label: p.name || "Persona"
          });
        });
      });
      return out;
    })(),
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onToggleBlur: toggleBlur,
    onDownloadSelected: items => askExport("the selected portraits", () => zipSelectedImages(items, "persona-portraits.zip")),
    onDeleteSelected: async imgIds => {
      const idSet = new Set(imgIds);
      idSet.forEach(id => {
        dropImage(id);
      });
      forgetBlur(idSet);
      const next = personas.map(p => {
        const hitAvatar = idSet.has(p.avatar);
        const hitGallery = (p.gallery || []).some(g => idSet.has(g.imgId));
        if (!hitAvatar && !hitGallery) return p;
        return {
          ...p,
          avatar: hitAvatar ? null : p.avatar,
          gallery: (p.gallery || []).filter(g => !idSet.has(g.imgId)),
          imgMeta: withoutImgMeta(p.imgMeta, idSet),
          updatedAt: Date.now()
        };
      });
      setPersonas(next);
      await sSet("personas:all", JSON.stringify(next));
      toast(imgIds.length + (imgIds.length === 1 ? " image deleted" : " images deleted"));
    },
    onClose: () => setPersonaGrid(false),
    toast: toast
  }), viewLoreBook !== null && (() => {
    const entries = lore.filter(e => (e.world || "").trim() === viewLoreBook);
    const meta = loreMeta[viewLoreBook] || {};
    const bookImageItems = () => entries.flatMap(e => (e.images || []).map((im, i) => ({
      imgId: im.imgId,
      label: sanitizeName(e.title || "entry") + ((e.images || []).length > 1 ? "-" + (i + 1) : "")
    })));
    return /*#__PURE__*/React.createElement(LorebookPage, {
      world: viewLoreBook,
      entries: entries,
      escOff: viewLoreEntryId !== null || !!editingRecord,
      cover: meta.cover || null,
      imgCache: imgCache,
      fullCache: fullCache,
      blurred: blurred,
      onSetCover: async files => {
        try {
          const imgId = await readThenSave(files[0]);
          if (meta.cover) {
            dropImage(meta.cover);
          }
          await persistLoreMeta({
            ...loreMeta,
            [viewLoreBook]: {
              ...meta,
              cover: imgId
            }
          });
          requestFull(imgId);
          toast("Cover updated");
        } catch (e) {
          toast(imageFailMessage(e));
        }
      },
      onRemoveCover: async () => {
        if (meta.cover) {
          dropImage(meta.cover);
        }
        const nm = {
          ...loreMeta
        };
        const m2 = {
          ...meta
        };
        delete m2.cover;
        if (Object.keys(m2).length) nm[viewLoreBook] = m2;else if (entries.length) delete nm[viewLoreBook];else nm[viewLoreBook] = {};
        await persistLoreMeta(nm);
      },
      onDownloadBookImages: () => askExport("this lorebook's images", () => zipSelectedImages(bookImageItems(), sanitizeName(viewLoreBook || "unfiled") + "-images.zip")),
      onClose: () => setViewLoreBook(null),
      onOpenEntry: r => setViewLoreEntryId(r.id),
      onNewEntry: () => setEditingRecord({
        type: "lore",
        record: {
          id: uid(),
          world: viewLoreBook
        }
      }),
      onImportEntry: () => triggerJsonImport("lore", viewLoreBook || ""),
      onRename: async name => {
        const nm = name.trim();
        /* Renaming onto a book that already exists merged the two without a
           word and, worse, handed the target this book's cover — losing the
           cover it had, with the picture left behind in the vault. */
        const clash = [...new Set(lore.map(e => (e.world || "").trim()).concat(Object.keys(loreMeta || {})))]
          .find(w => w && w !== viewLoreBook && w.toLowerCase() === nm.toLowerCase());
        if (clash) {
          toast("There is already a lorebook called “" + clash + "” — pick another name, or move the entries across instead");
          return;
        }
        const next = lore.map(e => (e.world || "").trim() === viewLoreBook ? {
          ...e,
          world: nm
        } : e);
        await persistLore(next);
        if (loreMeta[viewLoreBook]) {
          const metaNext = {
            ...loreMeta
          };
          metaNext[nm] = metaNext[viewLoreBook];
          delete metaNext[viewLoreBook];
          await persistLoreMeta(metaNext);
        }
        /* Characters and personas attach a book by its name. Renaming moved the
           entries and the cover but left every record still pointing at the old
           name, so the book quietly detached itself from everyone who had it —
           the link stayed on the page and opened nothing. */
        const moved = await renameAttachedBook(viewLoreBook, nm);
        setViewLoreBook(nm);
        toast("Book renamed" + (moved ? " · " + moved + (moved === 1 ? " record follows it" : " records follow it") : ""));
      },
      onDeleteBook: async () => {
        entries.forEach(e => (e.images || []).forEach(im => {
          dropImage(im.imgId);
        }));
        if (meta.cover) {
          dropImage(meta.cover);
        }
        const metaNext = {
          ...loreMeta
        };
        delete metaNext[viewLoreBook];
        await persistLoreMeta(metaNext);
        await persistLore(lore.filter(e => (e.world || "").trim() !== viewLoreBook));
        setViewLoreBook(null);
        toast("Lorebook deleted");
      },
      onStats: () => openRecordStats(viewLoreBook || "Lorebook", entries.map(e => [e.title, e.content, (e.triggers || []).join(" ")].filter(Boolean).join("\n")).join("\n"), entries.flatMap(e => (e.images || []).map(im => im.imgId))),
      onExportCharSnap: () => askExport("this lorebook (CharSnap format)", () => {
        downloadJSON(loreToCharSnap(viewLoreBook, entries), sanitizeName(viewLoreBook || "lorebook") + "-charsnap.json");
        toast("Lorebook exported for CharSnap (Chub-compatible)");
      }),
      onExportBook: () => askExport("this lorebook (including images)", async () => {
        const images = {},
          thumbs = {};
        for (const e of entries) for (const im of e.images || []) {
          images[im.imgId] = (await sGet("img:" + im.imgId)) || null;
          const t = await sGet("th:" + im.imgId);
          if (t) thumbs[im.imgId] = t;
        }
        downloadJSON({
          app: "rolecraft-vault",
          type: "lore",
          version: 3,
          exportedAt: new Date().toISOString(),
          lore: entries,
          images,
          thumbs,
          blurred: Object.keys(blurred).filter(id => entries.some(e => (e.images || []).some(im => im.imgId === id)))
        }, sanitizeName(viewLoreBook || "unfiled") + "-lorebook.json");
        toast("Lorebook exported");
      }),
      onExportBookText: () => askExport("this lorebook as text, with no pictures", () => {
        downloadJSON({
          app: "rolecraft-vault",
          type: "lore",
          version: 4,
          exportedAt: new Date().toISOString(),
          textOnly: true,
          lore: entries.map(textOnlyLore)
        }, sanitizeName(viewLoreBook || "unfiled") + "-lorebook-text.json");
        toast("Lorebook exported as text");
      })
    });
  })(), viewLoreEntryId && lore.find(e => e.id === viewLoreEntryId) && (() => {
    const ve = lore.find(e => e.id === viewLoreEntryId);
    return /*#__PURE__*/React.createElement(LoreEntryView, {
      entry: ve,
      imgCache: imgCache,
      fullCache: fullCache,
      requestFull: requestFull,
      blurred: blurred,
      onToggleBlur: toggleBlur,
      // prompts have always had this; lore entries are just as worth copying out
      onCopy: () => copyText(ve.content || "", "Lore entry copied"),
      onClose: () => setViewLoreEntryId(null),
      onExportCharSnap: () => askExport("this entry (CharSnap format)", () => {
        downloadJSON(loreToCharSnap(ve.world, [ve]), sanitizeName(ve.title || "entry") + "-charsnap.json");
        toast("Entry exported for CharSnap (Chub-compatible)");
      }),
      onEdit: () => {
        setViewLoreEntryId(null);
        setEditingRecord({
          type: "lore",
          record: ve
        });
      },
      onAddImages: async files => {
        const added = [];
        let unreadable = 0,
          unsaved = 0;
        for (const f of Array.from(files)) {
          let orig;
          try {
            orig = await fileToDataUrl(f);
          } catch (e) {
            unreadable++;
            continue;
          }
          const thumb = await makeThumb(orig).catch(() => null);
          const imgId = uid();
          try {
            await saveImage(imgId, orig, thumb);
          } catch (e) {
            unsaved++;
            continue;
          }
          added.push({
            imgId
          });
        }
        if (added.length) await persistLore(lore.map(e => e.id === ve.id ? {
          ...e,
          images: [...(e.images || []), ...added],
          updatedAt: Date.now()
        } : e));
        toast(imageAddResult(added.length, unreadable, unsaved));
      },
      onRemoveImage: async idx => {
        const im = (ve.images || [])[idx];
        if (im) {
          forgetBlur([im.imgId]); // the last two places still leaving dead ids on the blur list
          dropImage(im.imgId);
        }
        await persistLore(lore.map(e => e.id === ve.id ? {
          ...e,
          images: (e.images || []).filter((_, j) => j !== idx),
          updatedAt: Date.now()
        } : e));
      },
      onDownloadOne: (imgId, i) => askExport("this image", async () => {
        const v = await sGet("img:" + imgId);
        if (!v) {
          toast("Image not found");
          return;
        }
        downloadBlob(new Blob([dataUrlBytes(v)], {
          type: "application/octet-stream"
        }), sanitizeName(ve.title || "entry") + "-" + (i + 1) + "." + extOf(v));
        toast("Image exported at original quality");
      }),
      onDownloadAll: () => askExport("this entry's images", () => zipSelectedImages((ve.images || []).map((im, i) => ({
        imgId: im.imgId,
        label: sanitizeName(ve.title || "entry") + "-" + (i + 1)
      })), sanitizeName(ve.title || "entry") + "-images.zip"))
    });
  })(), viewPromptBook !== null && (() => {
    const entries = prompts.filter(p => (p.collection || "").trim() === viewPromptBook);
    const meta = promptMeta[viewPromptBook] || {};
    const bookImageItems = () => entries.flatMap(e => (e.images || []).map((im, i) => ({
      imgId: im.imgId,
      label: sanitizeName(e.title || "prompt") + ((e.images || []).length > 1 ? "-" + (i + 1) : "")
    })));
    return /*#__PURE__*/React.createElement(LorebookPage, {
      world: viewPromptBook,
      entries: entries,
      eyebrow: "Prompt collection",
      entryNoun: "prompt",
      entriesNoun: "prompts",
      bookNoun: "collection",
      inLabel: "in this collection",
      escOff: viewPromptEntryId !== null || !!editingRecord,
      cover: meta.cover || null,
      imgCache: imgCache,
      fullCache: fullCache,
      blurred: blurred,
      onSetCover: async files => {
        try {
          const imgId = await readThenSave(files[0]);
          if (meta.cover) {
            dropImage(meta.cover);
          }
          await persistPromptMeta({
            ...promptMeta,
            [viewPromptBook]: {
              ...meta,
              cover: imgId
            }
          });
          requestFull(imgId);
          toast("Cover updated");
        } catch (e) {
          toast(imageFailMessage(e));
        }
      },
      onRemoveCover: async () => {
        if (meta.cover) {
          dropImage(meta.cover);
        }
        const nm = {
          ...promptMeta
        };
        const m2 = {
          ...meta
        };
        delete m2.cover;
        if (Object.keys(m2).length) nm[viewPromptBook] = m2;else if (entries.length) delete nm[viewPromptBook];else nm[viewPromptBook] = {};
        await persistPromptMeta(nm);
      },
      onDownloadBookImages: () => askExport("this collection's images", () => zipSelectedImages(bookImageItems(), sanitizeName(viewPromptBook || "unfiled") + "-images.zip")),
      onClose: () => setViewPromptBook(null),
      onOpenEntry: r => setViewPromptEntryId(r.id),
      onNewEntry: () => setEditingRecord({
        type: "prompt",
        record: {
          id: uid(),
          collection: viewPromptBook
        }
      }),
      onImportEntry: () => triggerJsonImport("prompts", viewPromptBook || ""),
      onStats: () => openRecordStats(viewPromptBook || "Prompts", entries.map(e => [e.title, e.content].filter(Boolean).join("\n")).join("\n"), entries.flatMap(e => (e.images || []).map(im => im.imgId))),
      onExportBookText: () => askExport("this collection as text, with no pictures", () => {
        downloadJSON({
          app: "rolecraft-vault",
          type: "prompts",
          version: 4,
          exportedAt: new Date().toISOString(),
          textOnly: true,
          prompts: entries.map(e => ({ title: e.title || "", content: e.content || "", collection: e.collection || "" }))
        }, sanitizeName(viewPromptBook || "unfiled") + "-collection-text.json");
        toast("Collection exported as text");
      }),
      sampleJson: SAMPLE_PROMPT_JSON,
      sampleName: "rolecraft-prompt-template.json",
      onRename: async name => {
        const nm = name.trim();
        // same as lorebooks: renaming onto an existing collection merged them silently
        const clash = [...new Set(prompts.map(x => (x.collection || "").trim()).concat(Object.keys(promptMeta || {})))]
          .find(w => w && w !== viewPromptBook && w.toLowerCase() === nm.toLowerCase());
        if (clash) {
          toast("There is already a collection called “" + clash + "” — pick another name, or move the prompts across instead");
          return;
        }
        await persistPrompts(prompts.map(p => (p.collection || "").trim() === viewPromptBook ? {
          ...p,
          collection: nm
        } : p));
        if (promptMeta[viewPromptBook]) {
          const metaNext = {
            ...promptMeta
          };
          metaNext[nm] = metaNext[viewPromptBook];
          delete metaNext[viewPromptBook];
          await persistPromptMeta(metaNext);
        }
        setViewPromptBook(nm);
        toast("Collection renamed");
      },
      onDeleteBook: async () => {
        entries.forEach(p => (p.images || []).forEach(im => {
          dropImage(im.imgId);
        }));
        if (meta.cover) {
          dropImage(meta.cover);
        }
        const metaNext = {
          ...promptMeta
        };
        delete metaNext[viewPromptBook];
        await persistPromptMeta(metaNext);
        await persistPrompts(prompts.filter(p => (p.collection || "").trim() !== viewPromptBook));
        setViewPromptBook(null);
        toast("Collection deleted");
      },
      onExportBook: () => askExport("this prompt collection (including images)", async () => {
        const images = {},
          thumbs = {};
        for (const e of entries) for (const im of e.images || []) {
          images[im.imgId] = (await sGet("img:" + im.imgId)) || null;
          const t = await sGet("th:" + im.imgId);
          if (t) thumbs[im.imgId] = t;
        }
        downloadJSON({
          app: "rolecraft-vault",
          type: "prompts",
          version: 3,
          exportedAt: new Date().toISOString(),
          prompts: entries,
          images,
          thumbs,
          blurred: Object.keys(blurred).filter(id => entries.some(e => (e.images || []).some(im => im.imgId === id)))
        }, sanitizeName(viewPromptBook || "unfiled") + "-prompts.json");
        toast("Collection exported");
      })
    });
  })(), viewPromptEntryId && prompts.find(p => p.id === viewPromptEntryId) && (() => {
    const ve = prompts.find(p => p.id === viewPromptEntryId);
    return /*#__PURE__*/React.createElement(LoreEntryView, {
      entry: ve,
      kicker: ve.collection || "Unfiled",
      imgCache: imgCache,
      fullCache: fullCache,
      requestFull: requestFull,
      blurred: blurred,
      onToggleBlur: toggleBlur,
      onCopy: () => copyText(ve.content || "", "Prompt copied"),
      onClose: () => setViewPromptEntryId(null),
      onEdit: () => {
        setViewPromptEntryId(null);
        setEditingRecord({
          type: "prompt",
          record: ve
        });
      },
      onAddImages: async files => {
        const added = [];
        let unreadable = 0,
          unsaved = 0;
        for (const f of Array.from(files)) {
          let orig;
          try {
            orig = await fileToDataUrl(f);
          } catch (e) {
            unreadable++;
            continue;
          }
          const thumb = await makeThumb(orig).catch(() => null);
          const imgId = uid();
          try {
            await saveImage(imgId, orig, thumb);
          } catch (e) {
            unsaved++;
            continue;
          }
          added.push({
            imgId
          });
        }
        if (added.length) await persistPrompts(prompts.map(p => p.id === ve.id ? {
          ...p,
          images: [...(p.images || []), ...added],
          updatedAt: Date.now()
        } : p));
        toast(imageAddResult(added.length, unreadable, unsaved));
      },
      onRemoveImage: async idx => {
        const im = (ve.images || [])[idx];
        if (im) {
          forgetBlur([im.imgId]); // the last two places still leaving dead ids on the blur list
          dropImage(im.imgId);
        }
        await persistPrompts(prompts.map(p => p.id === ve.id ? {
          ...p,
          images: (p.images || []).filter((_, j) => j !== idx),
          updatedAt: Date.now()
        } : p));
      },
      onDownloadOne: (imgId, i) => askExport("this image", async () => {
        const v = await sGet("img:" + imgId);
        if (!v) {
          toast("Image not found");
          return;
        }
        downloadBlob(new Blob([dataUrlBytes(v)], {
          type: "application/octet-stream"
        }), sanitizeName(ve.title || "prompt") + "-" + (i + 1) + "." + extOf(v));
        toast("Image exported at original quality");
      }),
      onDownloadAll: () => askExport("this prompt's images", () => zipSelectedImages((ve.images || []).map((im, i) => ({
        imgId: im.imgId,
        label: sanitizeName(ve.title || "prompt") + "-" + (i + 1)
      })), sanitizeName(ve.title || "prompt") + "-images.zip"))
    });
  })(), newPBookOpen && /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 62
    },
    onMouseDown: e => {
      if (e.target === e.currentTarget) setNewPBookOpen(false);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      maxWidth: 420,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": "New prompt collection"
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 22,
      marginBottom: 6
    }
  }, "New prompt collection"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--mut)",
      marginBottom: 14
    }
  }, "Name the collection — prompts you add inside will file under it."), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: newPBookName,
    onChange: e => setNewPBookName(e.target.value),
    placeholder: "e.g. Scene openers",
    onKeyDown: e => {
      if (e.key === "Enter" && newPBookName.trim()) {
        const n = newPBookName.trim();
        (async () => {
          if (!promptMeta[n]) await persistPromptMeta({
            ...promptMeta,
            [n]: {}
          });
          setNewPBookOpen(false);
          setViewPromptBook(n);
        })();
      }
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      justifyContent: "flex-end",
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setNewPBookOpen(false)
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    disabled: !newPBookName.trim(),
    style: {
      opacity: newPBookName.trim() ? 1 : .5
    },
    onClick: async () => {
      const n = newPBookName.trim();
      if (!n) return;
      if (!promptMeta[n]) await persistPromptMeta({
        ...promptMeta,
        [n]: {}
      });
      setNewPBookOpen(false);
      setViewPromptBook(n);
    }
  }, "Create collection")))), dupePrompt && (() => {
    const dp = dupePrompt;
    const isLore = dp.type === "lore";
    const isPrompt = dp.type === "prompts";
    // lore and prompts both arrive as entries; characters and personas as items
    const byEntry = isLore || isPrompt;
    const noun = dp.type === "characters" ? "character" : isLore ? "lore entry" : isPrompt ? "prompt" : "persona";
    const names = dp.dupes.map(d => (byEntry ? d.entry.title : dp.type === "characters" ? d.item.char.name : d.item.persona.name) || "Untitled");
    // entries arrive as one payload for the whole file, not one per entry
    const commit = isLore ? (fresh, over, mode) => commitLoreImport(fresh, over, mode, dp.payload) : isPrompt ? (fresh, over, mode) => commitPromptImport(fresh, over, mode, dp.payload) : dp.type === "characters" ? commitCharImport : commitPersonaImport;
    return /*#__PURE__*/React.createElement(DupeImportModal, {
      noun: noun,
      nounPlural: isLore ? "lore entries" : undefined,
      softImages: byEntry,
      names: names,
      freshCount: dp.fresh.length,
      onOverwrite: async () => {
        setDupePrompt(null);
        await commit(dp.fresh, dp.dupes, "overwrite");
      },
      onSkip: async () => {
        setDupePrompt(null);
        await commit(dp.fresh, [], "skip");
      },
      onCopies: async () => {
        setDupePrompt(null);
        await commit([...dp.fresh, ...dp.dupes.map(d => byEntry ? d.entry : d.item)], [], "copies");
      },
      onCancel: () => {
        setDupePrompt(null);
        toast("Import cancelled — nothing was changed");
      }
    });
  })(), newBookOpen && /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 62
    },
    onMouseDown: e => {
      if (e.target === e.currentTarget) setNewBookOpen(false);
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      maxWidth: 420,
      background: "var(--panel)",
      boxShadow: "var(--shadow)"
    },
    role: "dialog",
    "aria-label": "New lorebook"
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 22,
      marginBottom: 6
    }
  }, "New lorebook"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--mut)",
      marginBottom: 14
    }
  }, "Name the world this book describes — entries you add inside will file under it."), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: newBookName,
    onChange: e => setNewBookName(e.target.value),
    placeholder: "e.g. Nyvariel",
    onKeyDown: e => {
      if (e.key === "Enter" && newBookName.trim()) {
        const n = newBookName.trim();
        (async () => {
          if (!loreMeta[n]) await persistLoreMeta({
            ...loreMeta,
            [n]: {}
          });
          setNewBookOpen(false);
          setViewLoreBook(n);
        })();
      }
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      justifyContent: "flex-end",
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setNewBookOpen(false)
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    disabled: !newBookName.trim(),
    style: {
      opacity: newBookName.trim() ? 1 : .5
    },
    onClick: async () => {
      const n = newBookName.trim();
      if (!n) return;
      if (!loreMeta[n]) await persistLoreMeta({
        ...loreMeta,
        [n]: {}
      });
      setNewBookOpen(false);
      setViewLoreBook(n);
    }
  }, "Create book")))), viewCharId && chars.find(c => c.id === viewCharId) && (() => {
    const vc = chars.find(c => c.id === viewCharId);
    return /*#__PURE__*/React.createElement(CharacterPage, {
      char: vc,
      imgCache: imgCache,
      fullCache: fullCache,
      loadImage: loadImage,
      requestFull: requestFull,
      warmFull: warmFull,
      blurred: blurred,
      onToggleBlur: toggleBlur,
      toast: toast,
      escOff: viewLoreBook !== null || viewLoreEntryId !== null || !!editingChar || !!editingRecord,
      onOpenLorebook: w => setViewLoreBook(w),
      onTagClick: t => {
        setViewCharId(null);
        setView("characters");
        setCharQ(t);
        toast("Showing everything tagged \u201c" + t + "\u201d");
      },
      onStats: scope => {
        // the token budget is for the version being viewed; the word and picture
        // counts below it still cover the whole character
        const sc = scopedChar(vc, scope === undefined ? null : scope);
        const label = scopeLabel(vc, scope === undefined ? null : scope) || "Default";
        return openRecordStats(vc.name || "Untitled", textOfChar(vc), charImgIds(vc), promptBudget(sc), "Token cost measured for “" + label + "”" + ((vc.variants || []).length ? " · one version is in play at a time" : ""));
      },
      onClose: () => setViewCharId(null),
      onEdit: () => {
        setEditingChar(vc);
      },
      onDownloadImages: () => askExport("this character's images", () => downloadImagesZip([vc], [], sanitizeName(vc.name) + "-images.zip")),
      onDownloadSelected: (items, albumName) => askExport(albumName ? "the \u201c" + albumName + "\u201d album" : "the selected images", () => zipSelectedImages(items, sanitizeName(vc.name) + "-" + sanitizeName(albumName || "selected") + ".zip")),
      onExportJson: scope => askExport(scope === "all" || scope === undefined ? "this character (including images)" : "the \u201c" + (scope === null ? "Default" : (((vc.variants || []).find(v => v.id === scope) || {}).name || "variant")) + "\u201d version (including its images)", () => exportCharJson(vc, scope)), // no tag warning: this export is not necessarily bound for CharSnap
      onExportText: scope => askExport("this character as text, with no pictures", () => exportCharTextJson(vc, scope)),
      onExportCharSnapVariant: (scope, hide) => askExport("this version as a CharSnap variant file" + (hide ? ", with its guts hidden" : ""), () => exportCharSnapVariant(vc, scope, hide)),
    onExportCharSnap: (scope, hide) => askExport((scope === "all" ? "every variant in CharSnap format" : "the \u201c" + (scope === null ? "Default" : (((vc.variants || []).find(v => v.id === scope) || {}).name || "variant")) + "\u201d version in CharSnap format") + (hide ? ", with its guts hidden" : ""), () => exportCharSnap(vc, scope, hide), unknownTagWarning(vc)),
      onReorder: keys => {
        if (keys === null) toast("Section layout reset");
        return patchChar(vc.id, cur => ({
          ...cur,
          sectionOrder: keys
        }));
      },
      onSetProfile: (imgId, variantId) => variantId ? patchChar(vc.id, cur => ({
        ...cur,
        variants: (cur.variants || []).map(v => v.id === variantId ? { ...v, profileImg: imgId } : v),
        updatedAt: Date.now()
      })).then(() => toast("Portrait set for \u201c" + (((vc.variants || []).find(v => v.id === variantId) || {}).name || "variant") + "\u201d")) : patchChar(vc.id, cur => ({
        ...cur,
        profileImg: imgId,
        updatedAt: Date.now()
      })),
      onCaption: (idx, text) => patchChar(vc.id, cur => ({
        ...cur,
        gallery: (cur.gallery || []).map((g, j) => j === idx ? {
          ...g,
          caption: text
        } : g),
        updatedAt: Date.now()
      })),
      onDeleteImages: async imgIds => {
        const idSet = new Set(imgIds);
        idSet.forEach(id => {
          dropImage(id);
        });
        forgetBlur(idSet);
        await patchChar(vc.id, cur => {
          const patch = {
            ...cur,
            gallery: (cur.gallery || []).filter(g => !idSet.has(g.imgId)),
            imgMeta: withoutImgMeta(cur.imgMeta, idSet),
            variants: (cur.variants || []).map(v => idSet.has(v.profileImg) ? { ...v, profileImg: null } : v),
            updatedAt: Date.now()
          };
          if (idSet.has(cur.profileImg)) patch.profileImg = null;
          if (idSet.has(cur.banner)) patch.banner = null;
          return patch;
        });
        toast(imgIds.length + (imgIds.length === 1 ? " image deleted" : " images deleted"));
      },
      onCreateAlbum: async name => {
        const n = (name || "").trim();
        if (!n) return;
        let added = false;
        await patchChar(vc.id, cur => {
          const known = (cur.albums || []).slice();
          const exists = known.indexOf(n) >= 0 || (cur.gallery || []).some(g => (g.album || "").trim() === n);
          if (exists) return cur;
          known.push(n);
          added = true;
          return { ...cur, albums: known, updatedAt: Date.now() };
        });
        if (!added) {
          toast("That album already exists");
          return;
        }
        toast("Album \u201c" + n + "\u201d created \u2014 tick images and add them any time");
      },
      onSetVariant: async (imgIds, variantId) => {
        const idSet = new Set(imgIds);
        await patchChar(vc.id, cur => {
          const gallery = (cur.gallery || []).map(g => idSet.has(g.imgId) ? { ...g, variantId: variantId } : g);
          const galleryIds = new Set((cur.gallery || []).map(g => g.imgId));
          const imgMeta = { ...(cur.imgMeta || {}) };
          imgIds.filter(id => !galleryIds.has(id)).forEach(id => {
            imgMeta[id] = { ...(imgMeta[id] || {}), variantId: variantId };
          });
          return { ...cur, gallery, imgMeta, updatedAt: Date.now() };
        });
        const touched = imgIds.length;
        const vName = variantId === DEFAULT_VID ? "Default" : variantId ? ((vc.variants || []).find(v => v.id === variantId) || {}).name || "that variant" : "";
        toast(variantId ? touched + (touched === 1 ? " image assigned to " : " images assigned to ") + "\u201c" + vName + "\u201d"
          : touched + (touched === 1 ? " image is now shared across variants" : " images are now shared across variants"));
      },
      onDeleteAlbum: async name => {
        await patchChar(vc.id, cur => {
          const gallery = (cur.gallery || []).map(g => (g.album || "") === name ? { ...g, album: "" } : g);
          const imgMeta = { ...(cur.imgMeta || {}) };
          Object.keys(imgMeta).forEach(id => {
            if (imgMeta[id] && imgMeta[id].album === name) imgMeta[id] = { ...imgMeta[id], album: "" };
          });
          return { ...cur, gallery, imgMeta, albums: (cur.albums || []).filter(a => a !== name), updatedAt: Date.now() };
        });
        toast("Album “" + name + "” removed — its pictures are still here");
      },
      onSetAlbum: async (imgIds, albumName) => {
        const idSet = new Set(imgIds);
        await patchChar(vc.id, cur => {
          const gallery = (cur.gallery || []).map(g => idSet.has(g.imgId) ? { ...g, album: albumName } : g);
          const galleryIds = new Set((cur.gallery || []).map(g => g.imgId));
          const imgMeta = { ...(cur.imgMeta || {}) };
          imgIds.filter(id => !galleryIds.has(id)).forEach(id => {
            imgMeta[id] = { ...(imgMeta[id] || {}), album: albumName };
          });
          const known = (cur.albums || []).slice();
          if (albumName && known.indexOf(albumName) < 0) known.push(albumName);
          return { ...cur, gallery, imgMeta, albums: known, updatedAt: Date.now() };
        });
        const touched = imgIds.length;
        if (!touched) {
          return;
        }
        toast(albumName ? touched + (touched === 1 ? " image added to " : " images added to ") + "\u201c" + albumName + "\u201d"
          : touched + (touched === 1 ? " image removed from its album" : " images removed from their albums"));
      },
      onReorderImages: g => {
        patchChar(vc.id, cur => ({
          ...cur,
          gallery: g,
          updatedAt: Date.now()
        }));
        toast("Gallery order updated");
      }
    });
  })(), editingChar && /*#__PURE__*/React.createElement(CharacterEditor, {
    initial: editingChar,
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    loadImage: loadImage,
    saveImage: saveImage,
    dropImage: dropImage,
    blurred: blurred,
    onToggleBlur: toggleBlur,
    buckets: [...new Set([...chars.map(c => (c.bucket || "").trim()).filter(Boolean), ...Object.keys(bucketMeta)])].sort(),
    allTags: [...new Set(chars.flatMap(c => c.tags || []))].sort(),
    loreBooks: (() => {
      const bk = {};
      lore.forEach(e => {
        const w = (e.world || "").trim();
        if (w) bk[w] = (bk[w] || 0) + 1;
      });
      Object.keys(loreMeta).forEach(w => {
        if (!(w in bk)) bk[w] = 0;
      });
      return Object.keys(bk).sort().map(name => ({
        name,
        count: bk[name]
      }));
    })(),
    onSave: saveChar,
    onDelete: deleteChar,
    onClose: () => setEditingChar(null),
    toast: toast
  }), editingRecord && editingRecord.type === "persona" && /*#__PURE__*/React.createElement(RecordModal, {
    title: editingRecord.record.createdAt ? "Edit persona" : "New persona",
    initial: editingRecord.record,
    onClose: () => setEditingRecord(null),
    onSave: r => saveRecord("persona", r),
    onDelete: r => deleteRecord("persona", r),
    imgCtx: {
      imgCache,
      saveImage,
      loadImage,
      blurred,
      onToggleBlur: toggleBlur,
      toast // so a portrait that fails to save can say so
    },
    fields: [{
      key: "avatar",
      label: "Portrait",
      type: "image"
    }, {
      key: "name",
      label: "Name",
      placeholder: "Persona name"
    }, {
      key: "tagline",
      label: "Tagline",
      placeholder: "e.g. Timeline Jump AU — shows on the card"
    }, {
      key: "role",
      label: "Role",
      placeholder: "e.g. Adventurer, detective, self-insert"
    }, {
      key: "pronouns",
      label: "Pronouns",
      placeholder: "she/her, he/him, they/them"
    }, {
      key: "bucket",
      label: "Bucket",
      placeholder: "Group personas — e.g. Main, AUs, One-offs",
      datalist: [...new Set([...personas.map(p => (p.bucket || "").trim()).filter(Boolean), ...Object.keys(pBucketMeta)])].sort()
    }, {
      key: "lorebooks",
      label: "Lorebooks — attach worlds this persona lives in",
      type: "chips",
      emptyHint: "No lorebooks in your vault yet — create one on the Lorebooks page.",
      options: (() => {
        const counts = {};
        lore.forEach(e => {
          const w = (e.world || "").trim();
          if (w) counts[w] = (counts[w] || 0) + 1;
        });
        Object.keys(loreMeta || {}).forEach(w => {
          if (!(w in counts)) counts[w] = 0;
        });
        return Object.keys(counts).sort().map(w => ({
          value: w,
          label: w + " · " + counts[w]
        }));
      })()
    }, {
      key: "description",
      label: "Description",
      type: "textarea",
      // a persona is sent whole with every message, exactly like a description
      hint: tokenHint("description", "permanent"),
      placeholder: "Identity, personality, writing preferences"
    }, {
      key: "sections",
      label: "Sections — anything extra (appearance, kinks, boundaries, notes)",
      type: "sections",
      /* A persona reaches the AI as its description alone — nothing folds these
         in the way a character's sections fold into its own description — so
         they cost nothing and should not be counted as though they did. */
      kindOf: () => "unsent"
    }]
  }), editingRecord && editingRecord.type === "lore" && /*#__PURE__*/React.createElement(RecordModal, {
    title: editingRecord.record.createdAt ? "Edit lore entry" : "New lore entry",
    initial: editingRecord.record,
    onClose: () => setEditingRecord(null),
    onSave: r => saveRecord("lore", r),
    onDelete: r => deleteRecord("lore", r),
    fields: [{
      key: "title",
      label: "Title",
      placeholder: "e.g. The Ashen Court"
    }, {
      key: "world",
      label: "World / lorebook",
      placeholder: "Pick an existing lorebook or type a new name",
      datalist: [...new Set([...lore.map(e => (e.world || "").trim()).filter(Boolean), ...Object.keys(loreMeta || {})])].sort()
    }, {
      key: "entryType",
      label: "Type",
      placeholder: "Character, Location, Item, PlotEvent, Other…"
    }, {
      key: "triggers",
      label: "Triggers — keywords that bring this entry up",
      type: "tags",
      placeholder: "Add a trigger and press Enter",
      hint: rec => (rec.triggers || []).length ? null : "CharSnap needs at least one trigger — without one the entry can never come up",
      hintWarn: rec => !(rec.triggers || []).length
    }, {
      key: "content",
      label: "Entry",
      type: "textarea",
      rows: 9,
      placeholder: "Rules, factions, places, history…",
      /* CharSnap: Description "maximum 1500 characters, recommended ~500",
         and every entry needs at least one trigger or it can never fire. */
      hint: rec => { const n = String(rec.content || "").length; const cost = tokenLabel(String(rec.content || ""), "triggered"); const fit = n > 1500 ? n.toLocaleString() + " characters — CharSnap caps an entry at 1,500, so this will not fit" : n > 500 ? n.toLocaleString() + " characters — CharSnap allows 1,500 and suggests about 500" : "CharSnap allows 1,500 characters per entry and suggests about 500"; return cost + " · " + fit; },
      hintWarn: rec => String(rec.content || "").length > 1500
    }]
  }), editingRecord && editingRecord.type === "prompt" && /*#__PURE__*/React.createElement(RecordModal, {
    title: editingRecord.record.createdAt ? "Edit prompt" : "New prompt",
    initial: editingRecord.record,
    onClose: () => setEditingRecord(null),
    onSave: r => saveRecord("prompt", r),
    onDelete: r => deleteRecord("prompt", r),
    fields: [{
      key: "title",
      label: "Title",
      placeholder: "e.g. Tavern opening scene"
    }, {
      key: "collection",
      label: "Collection / prompt book",
      placeholder: "Pick an existing collection or type a new name",
      datalist: [...new Set([...prompts.map(p => (p.collection || "").trim()).filter(Boolean), ...Object.keys(promptMeta || {})])].sort()
    }, {
      key: "tags",
      label: "Tags",
      type: "tags",
      placeholder: "opener, template…"
    }, {
      key: "content",
      label: "Prompt",
      type: "textarea",
      hint: tokenHint("content", "pasted"),
      rows: 9,
      placeholder: "The reusable prompt text"
    }]
  }), pNewBucketOpen && /*#__PURE__*/React.createElement(NewBucketModal, {
    noun: "persona",
    onCreate: createEmptyPersonaBucket,
    onAssign: () => {
      setPNewBucketOpen(false);
      setPSelMode(true);
      toast("Pick personas below, type a bucket name, then hit Assign");
    },
    onClose: () => setPNewBucketOpen(false)
  }), newBucketOpen && /*#__PURE__*/React.createElement(NewBucketModal, {
    onCreate: createEmptyBucket,
    onAssign: () => {
      setNewBucketOpen(false);
      setSelectMode(true);
      toast("Pick characters below, type a bucket name, then hit Assign");
    },
    onClose: () => setNewBucketOpen(false)
  }), showGuide && /*#__PURE__*/React.createElement(GuideModal, {
    onClose: () => setShowGuide(false)
  }), statsOpen && /*#__PURE__*/React.createElement(StatsModal, {
    title: statsOpen.title,
    subtitle: statsOpen.subtitle,
    rows: statsOpen.rows,
    note: statsOpen.note,
    loading: statsOpen.loading,
    onClose: () => setStatsOpen(null)
  }), showSettings && /*#__PURE__*/React.createElement(SettingsModal, {
    onResetLayout: async () => {
      setDashOrderRaw(DASH_KEYS.slice());
      setTextSize("medium");
      await sDel("ui:dashorder");
      await sDel("ui:advopen");
      await sSet("ui:textsize", "medium");
    setCardSize("medium");
    await sSet("ui:cardsize", "medium");
      setContrast("normal");
      await sSet("ui:contrast", "normal");
      toast("Layout reset to defaults");
    },
    onClose: () => setShowSettings(false),
    textSize: textSize,
    setTextSize: applyTextSize,
    cardSize: cardSize,
    setCardSize: applyCardSize,
    contrast: contrast,
    setContrast: applyContrast,
    trash: trash,
    onRestoreTrash: restoreFromTrash,
    onEmptyTrash: emptyFromTrash,
    onExport: () => askExport("a full vault backup", exportAll),
    onImport: importAll,
    toast: toast,
    onDownloadImages: () => askExport("every image in the vault", () => {
        /* This said "every image in the vault" while collecting only what hung
           off a character or a persona. Bucket covers, book covers and the
           pictures inside lore entries and prompts were left behind. */
        const extras = [];
        const cover = (meta, folder) => Object.entries(meta || {}).forEach(([name, m]) => {
          if (m && m.cover) extras.push({ id: m.cover, path: folder + "/" + safeFileName(name || "Unnamed") });
        });
        cover(bucketMeta, "buckets");
        cover(pBucketMeta, "personas/buckets");
        cover(loreMeta, "lorebooks/covers");
        cover(promptMeta, "prompts/covers");
        const entryPics = (list, folder, titleOf, bookOf) => (list || []).forEach(e => {
          (e.images || []).forEach((im, k) => {
            if (!im || !im.imgId) return;
            const book = safeFileName(bookOf(e) || "Unsorted");
            const title = safeFileName(titleOf(e) || "Untitled");
            extras.push({ id: im.imgId, path: folder + "/" + book + "/" + title + "-" + String(k + 1).padStart(2, "0") });
          });
        });
        entryPics(lore, "lorebooks", e => e.title, e => e.world);
        entryPics(prompts, "prompts", e => e.title, e => e.collection);
        return downloadImagesZip(chars, personas, "rolecraft-images.zip", extras);
      }),
    theme: theme,
    setTheme: setTheme,
    authState: authState,
    refreshAuth: refreshAuth,
    counts: {
      chars: chars.length,
      personas: personas.length,
      lore: lore.length,
      prompts: prompts.length
    }
  }), /*#__PURE__*/React.createElement("input", {
    ref: bucketCoverRef,
    type: "file",
    accept: "image/*",
    hidden: true,
    onChange: async e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f || !coverTarget) return;
      try {
        const imgId = await readThenSave(f);
        await setBucketCover(coverTarget, imgId);
        toast("Bucket cover updated");
      } catch (err) {
        toast(imageFailMessage(err));
      }
      setCoverTarget(null);
    }
  }), /*#__PURE__*/React.createElement("input", {
    ref: jsonImportRef,
    type: "file",
    accept: "application/json,.json",
    hidden: true,
    onChange: e => {
      if (e.target.files[0]) handleJsonImportFile(e.target.files[0]);
      e.target.value = "";
    }
  }), exportConfirm && /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 120
    },
    onClick: () => setExportConfirm(null)
  }, /*#__PURE__*/React.createElement("div", {
    className: "card modal",
    style: {
      maxWidth: 480
    },
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Unencrypted export"), /*#__PURE__*/React.createElement("h2", {
    className: "serif",
    style: {
      margin: "4px 0 10px",
      fontSize: 24
    }
  }, "Before you export"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: "var(--mut)",
      lineHeight: 1.65,
      marginBottom: 16
    }
  }, "Inside the vault, your data is encrypted at rest. The file you're about to create — ", exportConfirm.what, " — is", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--text)"
    }
  }, " not encrypted"), ": anyone who gets hold of the file can open and read it. Save it somewhere you trust, and delete copies you no longer need."), exportConfirm.warning && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      lineHeight: 1.6,
      color: "var(--text)",
      background: "var(--brass-soft)",
      border: "1px solid var(--brass-line)",
      borderRadius: 10,
      padding: "10px 12px",
      marginBottom: 16
    }
  }, exportConfirm.warning), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    onClick: () => {
      const fn = exportConfirm.fn;
      setExportConfirm(null);
      fn();
    }
  }, "Export anyway"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setExportConfirm(null)
  }, "Cancel")))), zipProg && /*#__PURE__*/React.createElement("div", {
    className: "toast",
    style: {
      minWidth: 260,
      maxWidth: "min(420px, calc(100vw - 32px))",
      textAlign: "left",
      display: "block"
    },
    role: "status",
    "aria-live": "polite"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, zipProg.label), /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.7,
      whiteSpace: "nowrap"
    }
  }, zipProg.total ? zipProg.done + " of " + zipProg.total : zipProg.done)), /*#__PURE__*/React.createElement("div", {
    role: "progressbar",
    "aria-valuenow": zipProg.total ? Math.round(zipProg.done / zipProg.total * 100) : undefined,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    style: {
      height: 6,
      borderRadius: 999,
      background: "var(--line)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: (zipProg.total ? Math.round(zipProg.done / zipProg.total * 100) : 0) + "%",
      background: "var(--brass)",
      borderRadius: 999,
      transition: "width .2s linear"
    }
  })), zipProg.left && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 12,
      opacity: 0.7
    }
  }, zipProg.left)), toastMsg && !zipProg && /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, toastMsg));
}
window.RolecraftVaultMount = function (el) {
  const node = typeof el === "string" ? document.querySelector(el) : el;
  if (!node) throw new Error("RolecraftVaultMount: element not found");
  const root = ReactDOM.createRoot(node);
  root.render(React.createElement(RolecraftVault));
  return root;
};
(function () {
  const el = document.getElementById("rolecraft-root") || document.getElementById("root");
  if (el && !el.__rcvMounted) { el.__rcvMounted = true; window.RolecraftVaultMount(el); }
})();