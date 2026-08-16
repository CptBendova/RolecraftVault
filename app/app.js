const {
  useState,
  useEffect,
  useRef,
  useCallback
} = React;

/* ============================================================
   Rolecraft Vault — a private library for roleplay characters,
   personas, lorebooks and prompts. Data persists via storage.
   Design: deep-ink archive, serif display, brass accents.
   ============================================================ */

/* Single source of truth for the displayed version. Do not hand-edit: run
   `npm run set-version <v>`, which rewrites this line, app/package.json,
   FACTORY_BUILD in main.js and VERSION in build/installer.nsi together. */
const APP_VERSION = "1.099";

/* Version history shown in Settings.
   Only the 1.092 entry is a real record. Everything before it was reconstructed
   by reading the code — this project kept no changelog and has a single commit,
   so earlier releases left no notes behind. The reconstructed entries are
   anchored on the one-time migrations still present in this file (thumbver,
   charfields, lorefields), which are hard evidence that those changes happened,
   in that order. Their version numbers are genuinely unknown, so none are
   claimed. The UI labels this section as reconstructed; keep that label. */
const CHANGELOG = [{
  heading: "1.099 — current",
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
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
        resolve(c.toDataURL("image/jpeg", quality));
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
function makeZip(files) {
  // [{name, bytes}]
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = v => [v & 255, v >> 8 & 255];
  const u32 = v => [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255];
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const sz = f.bytes.length;
    const local = new Uint8Array([0x50, 0x4B, 3, 4, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nameB.length), ...u16(0)]);
    parts.push(local, nameB, f.bytes);
    central.push(new Uint8Array([0x50, 0x4B, 1, 2, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nameB);
    offset += local.length + nameB.length + sz;
  }
  let cdSize = 0;
  central.forEach(c => cdSize += c.length);
  const end = new Uint8Array([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end], {
    type: "application/zip"
  });
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
const extOf = u => {
  const m = /^data:image\/([\w+]+)/.exec(u || "");
  const e = m ? m[1].toLowerCase() : "jpeg";
  return e === "jpeg" ? "jpg" : e === "svg+xml" ? "svg" : e;
};
const sanitizeName = s => (s || "untitled").replace(/[^\w\- ]+/g, "").trim().replace(/ +/g, "-").slice(0, 40) || "untitled";

/* ---------- JSON import normalizers ---------- */
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
        tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
        searchables: Array.isArray(raw.searchables) ? raw.searchables.map(String).filter(Boolean) : [],
        story: raw.story || raw.backstory || raw.description || "",
        personality: raw.personality || "",
        tagline: raw.tagline || "",
        scenario: raw.scenario || "",
        firstMessage: raw.firstMessage || "",
        exampleMessage: raw.exampleMessage || "",
        creatorMemo: raw.creatorMemo || "",
        systemPrompt: raw.systemPrompt || "",
        alwaysActiveSystemPrompt: raw.alwaysActiveSystemPrompt || "",
        variants: Array.isArray(raw.variants) ? raw.variants.map(v => ({
          ...v,
          id: v.id || uid()
        })) : [],
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
    // extra first messages sometimes ship as a JSON-encoded array string
    try {
      const extra = typeof d.additionalFirstMessagesAndScenarios === "string" ? JSON.parse(d.additionalFirstMessagesAndScenarios) : d.additionalFirstMessagesAndScenarios;
      if (Array.isArray(extra) && extra.length) {
        sec("Additional first messages", extra.map(x => typeof x === "string" ? x : JSON.stringify(x)).join("\n\n---\n\n"));
      }
    } catch (e) {}
    sec("System override", d.baseSystemOverride);
    sec("NSFW system override", d.nsfwSystemOverride);
    sec("Prefill instructions", d.prefillInstructionOverride || d.post_history_instructions);
    const contentOf = v => ({
      tagline: S(v.tagline || v.variant_tagline || v.shortMessage),
      story: v.story || v.backstory || v.description || "",
      personality: v.personality || "",
      scenario: S(v.scenario),
      firstMessage: S(v.first_mes || v.firstMessage || v.first_message || v.greeting),
      exampleMessage: S(v.mes_example || v.exampleMessage || v.example_message || v.example_dialogs),
      creatorMemo: S(v.creator_notes || v.characterCreatorComment || v.creator_comment || v.creatorMemo),
      systemPrompt: S(v.system_prompt || v.systemPrompt),
      alwaysActiveSystemPrompt: S(v.superSystemPrompt || v.always_active_system_prompt || v.alwaysActiveSystemPrompt)
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
    results.push(fresh({
      name: S(d.name || d.variant_name),
      tags: Array.isArray(d.tags) ? d.tags : null,
      searchables: Array.isArray(d.searchables) ? d.searchables : null,
      sections,
      age: ageOf(d) || ageOf(firstV),
      gender: d.gender,
      pronouns: d.pronouns,
      ...base,
      variants
    }));
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
    const gallery = (raw.gallery || []).map(g => ({
      imgId: remap(g.imgId),
      caption: g.caption || ""
    })).filter(g => g.imgId);
    return {
      persona: {
        id: uid(),
        name: raw.name || "Imported persona",
        role: raw.role || "",
        pronouns: raw.pronouns || "",
        description: raw.description || raw.personality || "",
        avatar,
        gallery,
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

/* Convert a vault character into CharSnap's "Import Full Character JSON" shape:
   required top-level fields (name, gender, tagline, variants) + the same content
   field names CharSnap uses in its own character exports, mirrored into
   variants[0] (first variant becomes the default on import). */
function charToCharSnap(c, scope) {
  const known = {
    "system override": "baseSystemOverride",
    "nsfw system override": "nsfwSystemOverride",
    "prefill instructions": "prefillInstructionOverride",
    "additional first messages": "__afms"
  };
  const mapped = {};
  const extras = [];
  (c.sections || []).forEach(s => {
    const key = known[(s.title || "").trim().toLowerCase()];
    if (key && !mapped[key]) mapped[key] = s.content || "";else extras.push(s);
  });
  let baseDescription = c.story || "";
  extras.forEach(s => {
    if (!(s.content || "").trim()) return;
    baseDescription += (baseDescription ? "\n\n" : "") + "[" + (s.title || "Section") + "]\n" + s.content;
  });
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
      age: ageStr
    };
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
  const variants = scopeAll || scope === null ? [variantOf(c, baseDescription, "Default", tagline)] : [];
  (scopeAll ? (c.variants || []).slice(0, 4) : (c.variants || []).filter(v => v.id === scope)).forEach((v, i) => {
    // required fields fall back to the Default so each variant is complete
    variants.push(variantOf({
      personality: v.personality || c.personality,
      firstMessage: v.firstMessage || c.firstMessage,
      scenario: v.scenario,
      exampleMessage: v.exampleMessage,
      systemPrompt: v.systemPrompt,
      alwaysActiveSystemPrompt: v.alwaysActiveSystemPrompt,
      creatorMemo: v.creatorMemo
    }, v.story || baseDescription, v.name || "Variant " + (i + 2), v.tagline || tagline));
  });
  const scopedV = scopeAll || scope === null ? null : (c.variants || []).find(v => v.id === scope);
  /* Key order and set follow CharSnap's own "Full-Character" import template.
     tags/searchables go out even when empty, as the template does. This app has
     no NSFW flag, so those two are emitted false — the same result as omitting
     them, but explicit and matching the documented shape. If a character is adult,
     mark it on CharSnap after importing. */
  const main = {
    name: c.name || "Untitled",
    gender: gender,
    tagline: scopedV && (scopedV.tagline || "").trim() ? scopedV.tagline : tagline,
    tags: (c.tags || []).slice(),
    searchables: (c.searchables || []).slice(),
    nsfw: false,
    nsfw_picture: false,
    variants: variants
  };
  return {
    main,
    variantFiles: []
  };
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
    --ink: #0a0e1c; --ink2: #0e1426; --panel: #121a30; --panel2: #17203a;
    --line: rgba(150,166,214,.14); --line2: rgba(150,166,214,.26);
    --text: #e7ebf7; --mut: #8d97b8; --dim: #5c6688;
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
    --text: #1a2135; --mut: #59637f; --dim: #99a0b8;
    --brass: #9a721f; --brass-soft: rgba(154,114,31,.1); --brass-line: rgba(154,114,31,.35);
    --blue: #3f57c0; --blue-deep: #3a51b0; --danger: #c25555;
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
    --text: #ededf0; --mut: #a0a1aa; --dim: #6b6c76;
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
  }
  .rcv.charsnap .eyebrow { color: var(--blue); letter-spacing: .24em; }
  .rcv.charsnap .navitem.active { box-shadow: inset 3px 0 0 var(--brass); }
  .rcv .serif { font-family: 'Space Grotesk', 'Inter', sans-serif; font-weight: 700; letter-spacing: -0.02em; }
  .rcv .eyebrow { font-size: 10.5px; letter-spacing: .22em; text-transform: uppercase; color: var(--brass); font-weight: 700; }
  .rcv button { font: inherit; cursor: pointer; border: none; }
  .rcv input, .rcv textarea, .rcv select {
    font: inherit; color: var(--text); background: var(--field);
    border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px; width: 100%;
    outline: none; transition: border-color .15s;
  }
  .rcv input:focus, .rcv textarea:focus, .rcv select:focus { border-color: var(--blue-deep); }
  .rcv textarea { resize: vertical; min-height: 110px; line-height: 1.55; }
  .rcv ::placeholder { color: var(--dim); }
  .rcv .btn { border-radius: 9px; padding: 9px 16px; font-weight: 600; font-size: 13.5px; transition: filter .12s, background .12s; }
  .rcv .btn:hover { filter: brightness(1.08); }
  .rcv .btn:focus-visible, .rcv input:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .rcv .btn-primary { background: var(--btn-grad, linear-gradient(135deg, #5d78e0, #4a63c8)); color: var(--btn-text, #fff); }
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
  .rcv .grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
  .rcv .char-card { position: relative; overflow: hidden; border-radius: 14px; border: 1px solid var(--line);
    background: var(--panel); cursor: pointer; transition: transform .15s, border-color .15s; aspect-ratio: 3/4; }
  .rcv .char-card:hover { transform: translateY(-3px); border-color: var(--brass-line); }
  .rcv .char-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .rcv .char-card .veil { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 45%, rgba(6,9,20,.92) 88%); }
  .rcv.light .char-card .veil { background: linear-gradient(180deg, transparent 30%, rgba(6,9,20,.55) 62%, rgba(6,9,20,.96) 100%); }
  .rcv .char-card .meta { text-shadow: 0 1px 4px rgba(0,0,0,.65); }
  .rcv .char-card .meta { position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 14px; }
  .rcv .wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); grid-auto-rows: 148px; grid-auto-flow: dense; gap: 12px; }
  .rcv .tile { position: relative; border-radius: 14px; overflow: hidden; border: 1px solid var(--line); padding: 0;
    cursor: pointer; background: var(--placeholder); }
  .rcv .tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .35s; }
  .rcv .tile:hover img { transform: scale(1.05); }
  .rcv .tile:hover { border-color: var(--brass-line); }
  .rcv .tile .tlab { position: absolute; bottom: 0; left: 0; right: 0; padding: 24px 10px 8px; font-size: 12px; font-weight: 600;
    color: #eef1fb; background: linear-gradient(transparent, rgba(5,8,17,.88)); opacity: 0; transition: opacity .15s; text-align: left;
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
  .rcv .hero-back { position: absolute; inset: 0; background-size: cover; background-position: center 25%;
    filter: blur(26px) saturate(1.1); opacity: .35; transform: scale(1.15); }
  .rcv .cpage-grid { display: grid; grid-template-columns: minmax(0, 1fr) clamp(300px, 30%, 420px); gap: 24px; align-items: start; }
  .rcv .cpage-grid.nogal { grid-template-columns: minmax(0, 1fr) 200px; }
  .rcv .cpage-grid.nogal .cpage-aside { grid-template-columns: 1fr; }
  .rcv .cpage-aside { position: sticky; top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-content: start; }
  .rcv .cpage-aside .tile { aspect-ratio: 1; }
  .rcv .cpage-aside .tile.full { grid-column: 1 / -1; aspect-ratio: 4/4.6; }
  @media (max-width: 1120px) {
    .rcv .cpage-grid { grid-template-columns: 1fr; }
    .rcv .cpage-aside { position: static; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
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
  @keyframes rcvspin { to { transform: rotate(360deg); } }
  .rcv .spin { display: inline-block; width: 13px; height: 13px; border-radius: 50%;
    border: 2px solid var(--brass-line); border-top-color: var(--brass);
    animation: rcvspin .7s linear infinite; vertical-align: -2px; }
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
const icons = {
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
function LockScreen({
  authState,
  onUnlocked
}) {
  const [mode, setMode] = useState(authState.pinSet ? "pin" : "password");
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!val || busy) return;
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
  };
  return /*#__PURE__*/React.createElement("div", {
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
      width: 330
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "0 auto 18px",
      width: 58,
      height: 58,
      borderRadius: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--brass-soft)",
      color: "var(--brass)",
      border: "1px solid var(--brass-line)"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.lock,
    size: 26
  })), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Rolecraft Vault"), /*#__PURE__*/React.createElement("h1", {
    className: "serif",
    style: {
      fontSize: 30,
      margin: "6px 0 6px"
    }
  }, "Vault locked"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      marginBottom: 18
    }
  }, "Your library is encrypted with your master password."), /*#__PURE__*/React.createElement("input", {
    type: "password",
    inputMode: mode === "pin" ? "numeric" : "text",
    autoFocus: true,
    value: val,
    placeholder: mode === "pin" ? "Enter your PIN" : "Enter your master password",
    onChange: e => {
      setVal(e.target.value);
      setErr("");
    },
    onKeyDown: e => e.key === "Enter" && submit(),
    style: {
      textAlign: "center",
      letterSpacing: mode === "pin" ? "0.3em" : "0.05em",
      fontSize: 17
    }
  }), err && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--danger)",
      fontSize: 13,
      marginTop: 10
    }
  }, err), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    style: {
      width: "100%",
      marginTop: 14
    },
    disabled: busy,
    onClick: submit
  }, busy ? "Unlocking…" : "Unlock"), authState.pinSet && /*#__PURE__*/React.createElement("button", {
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
  }, mode === "pin" ? "Use master password instead" : "Use PIN instead")));
}

/* ---------- lightbox ---------- */
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
    if (requestFull && items[index]) requestFull(items[index].imgId);
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
  const item = items[index];
  if (!item) return null;
  const src = fullCache && fullCache[item.imgId] || imgCache[item.imgId];
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-back",
    style: {
      zIndex: 80
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 900,
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 12
    },
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      borderRadius: 16,
      overflow: "hidden",
      border: "1px solid var(--line2)",
      background: "#05070f",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 320,
      maxHeight: "72vh"
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: item.caption || "gallery image",
    className: blurred && blurred[item.imgId] ? "blur-img" : undefined,
    style: {
      maxWidth: "100%",
      maxHeight: "72vh",
      objectFit: "contain"
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--dim)",
      padding: 60
    }
  }, "Loading image…"), items.length > 1 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    "aria-label": "Previous image",
    onClick: () => onNav(-1),
    style: {
      position: "absolute",
      left: 12,
      top: "50%",
      transform: "translateY(-50%)",
      padding: 10,
      borderRadius: 99,
      background: "rgba(6,9,20,.6)"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.left
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    "aria-label": "Next image",
    onClick: () => onNav(1),
    style: {
      position: "absolute",
      right: 12,
      top: "50%",
      transform: "translateY(-50%)",
      padding: 10,
      borderRadius: 99,
      background: "rgba(6,9,20,.6)"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.right
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 12,
      right: 12,
      display: "flex",
      gap: 8
    }
  }, items.length > 1 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      background: "rgba(6,9,20,.6)",
      padding: "8px 10px"
    },
    "aria-label": playing ? "Pause slideshow" : "Play slideshow",
    onClick: () => setPlaying(p => !p)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: playing ? icons.pause : icons.play
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      background: "rgba(6,9,20,.6)",
      padding: "8px 10px"
    },
    "aria-label": "Close",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.x
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      bottom: 12,
      left: 12,
      fontSize: 12.5,
      color: "var(--mut)",
      background: "rgba(6,9,20,.6)",
      padding: "4px 12px",
      borderRadius: 99
    }
  }, index + 1, " of ", items.length)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap"
    }
  }, onCaption ? /*#__PURE__*/React.createElement("input", {
    value: item.caption || "",
    placeholder: "Add a caption for this image…",
    onChange: e => onCaption(index, e.target.value),
    style: {
      flex: 1,
      minWidth: 200
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 200,
      fontSize: 13.5,
      color: "var(--mut)"
    }
  }, item.caption || ""), onToggleBlur && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
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
    className: "btn btn-brass",
    onClick: () => onSetProfile(item.imgId)
  }, "Set as profile"), onRemove && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: () => onRemove(index)
  }, "Remove"))));
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
    }
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
    style: {
      background: "none",
      color: "inherit",
      padding: 0,
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.x,
    size: 11
  }))))));
}

/* ---------- stats helpers ---------- */
const VARIANT_TEXT_KEYS = ["tagline", "story", "personality", "scenario", "firstMessage", "exampleMessage", "creatorMemo", "systemPrompt", "alwaysActiveSystemPrompt"];
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
    tokens: Math.ceil(t.length / 4)
  };
}
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
const fmtNum = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
  }, rows.map(([label, value], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 14,
      padding: "9px 0",
      borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--mut)",
      fontSize: 13.5
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 13.5
    }
  }, value)))), note && /*#__PURE__*/React.createElement("div", {
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
  const rest = options.filter(o => !cur.includes(o.value) && (!needle || String(o.label).toLowerCase().includes(needle)));
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
  }, attached.map(o => chip(o, true))), many && /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Filter " + options.length + " lorebooks\u2026",
    style: {
      width: "100%",
      marginBottom: 8
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: many ? "scrollbody" : undefined,
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
  onChange
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
  }))), /*#__PURE__*/React.createElement("button", {
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
  const item = items[order[pos % n]];
  const src = item ? fullCache[item.imgId] || imgCache[item.imgId] : null;
  const advance = useCallback(d => {
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
  if (!item) return null;
  const prevSrc = prevImg ? fullCache[prevImg.imgId] || imgCache[prevImg.imgId] : null;
  return /*#__PURE__*/React.createElement("div", {
    className: "ss-root" + (hidden && playing ? " ss-hide" : "") + (playing ? "" : " ss-paused"),
    onMouseMove: wake,
    onClick: wake
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
    key: "s" + pos + order[pos % n]
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
  }, pos % n + 1, " / ", n), /*#__PURE__*/React.createElement("button", {
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
    items.forEach(it => it.imgId && requestFull && requestFull(it.imgId));
  }, []);
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
      maxWidth: 1560,
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
      maxWidth: 1560,
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
      maxWidth: 1560,
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
  }, "Remove from album")))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1560,
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
      cursor: "pointer",
      borderColor: sel[it.imgId] ? "var(--brass)" : undefined,
      boxShadow: sel[it.imgId] ? "0 0 0 2px var(--brass-line)" : undefined
    },
    onClick: () => toggle(it.imgId),
    onKeyDown: e => e.key === "Enter" && toggle(it.imgId)
  }, /*#__PURE__*/React.createElement("span", {
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
  }), onSetAlbum && (it.album || "").trim() && /*#__PURE__*/React.createElement("span", {
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
  }, variantNameOf(it.variantId)), imgCache[it.imgId] ? /*#__PURE__*/React.createElement("img", {
    src: imgCache[it.imgId],
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
    onNav: d => setLb(p => (p + d + lbItems.length) % lbItems.length),
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
      onSetProfile(imgId);
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
      flexShrink: 0
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
  }), " Copy")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: onEdit
  }, "Edit"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Close"))), /*#__PURE__*/React.createElement(MDText, {
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
  })), /*#__PURE__*/React.createElement("span", {
    className: "blurbtn on",
    role: "button",
    tabIndex: 0,
    "aria-label": "Remove image " + (i + 1),
    style: {
      opacity: 1,
      right: 80
    },
    onClick: ev => {
      ev.stopPropagation();
      onRemoveImage(i);
    },
    onKeyDown: ev => {
      if (ev.key === "Enter") {
        ev.stopPropagation();
        onRemoveImage(i);
      }
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.x,
    size: 13
  })), imgCache[im.imgId] ? /*#__PURE__*/React.createElement("img", {
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
  }, /*#__PURE__*/React.createElement("div", {
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
      background: "linear-gradient(180deg, rgba(5,7,14,.35), var(--ink) 97%)"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: 1560,
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
  }, entries.length, " ", entries.length === 1 ? entryNoun : entriesNoun, " ", inLabel, "."), /*#__PURE__*/React.createElement("div", {
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
  }), " New ", entryNoun)), world && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => {
      setRenaming(true);
      setNewName(world);
    }
  }, "Rename ", bookNoun), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onExportBook
  }, "Export JSON"), onExportBookText && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    title: "This " + bookNoun + " as text, with no pictures — small enough to read or paste elsewhere.",
    onClick: onExportBookText
  }, "Export text only"), onExportCharSnap && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onExportCharSnap
  }, "Export for CharSnap"), onStats && /*#__PURE__*/React.createElement("button", {
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
  }, cover ? "Replace cover" : "Set cover"), cover && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onRemoveCover
  }, "Remove cover"), anyImages && /*#__PURE__*/React.createElement("button", {
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
  }, confirmDel ? "Really delete all " + entries.length + "?" : "Delete " + bookNoun), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Close"), /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "Search " + label + "…",
    style: {
      width: 240,
      marginLeft: "auto"
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1560,
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
  onSetVariant,
  onReorder,
  onReorderImages,
  onDownloadImages,
  onDownloadSelected,
  onExportJson,
  onExportCharSnap,
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
  useEffect(() => {
    [c.profileImg, ...(c.gallery || []).map(g => g.imgId)].filter(Boolean).forEach(loadImage);
    (c.variants || []).forEach(v => v.profileImg && loadImage(v.profileImg));
    requestFull(c.profileImg);
  }, [c]);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape" && lb === null && !ss && !grid && !escOff) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, lb, ss, grid, escOff]);
  let activeProfileId = c.profileImg;
  let profile = activeProfileId ? fullCache[activeProfileId] || imgCache[activeProfileId] : null;
  const details = [["Age", c.age], ["Gender", c.gender], ["Pronouns", c.pronouns], ["Bucket", c.bucket]].filter(x => x[1]);
  const [activeVar, setActiveVar] = useState(null); // variant id or null = Default
  const variants = c.variants || [];
  /* Images with no variantId are shared (shown everywhere); tagged ones only appear
     under their variant. A tag naming a variant that no longer exists — a restore
     can remove one, and rule 2 forbids a restore from editing the gallery — would
     otherwise match nothing and the picture would silently stop rendering. Treat
     those as shared so the image stays reachable without rewriting its record. */
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
  }, {
    key: "creatorMemo",
    title: "Creator memo",
    body: F("creatorMemo")
  }, ...c.sections.map(s => ({
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
    className: "scrollbody"
  }, /*#__PURE__*/React.createElement("div", {
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
      background: "linear-gradient(180deg, rgba(5,7,14,.25), var(--ink) 96%)"
    }
  })) : profile && /*#__PURE__*/React.createElement("div", {
    className: "hero-back",
    style: {
      backgroundImage: "url(" + profile + ")"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      maxWidth: 1560,
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
  }, "Variant"), /*#__PURE__*/React.createElement("button", {
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
  }, v.name || "Variant " + (i + 2)))), details.length > 0 && /*#__PURE__*/React.createElement("div", {
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
  }, k, ":"), " ", v))), (c.tags || []).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 10
    }
  }, c.tags.map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    className: "chip",
    style: {
      cursor: "pointer"
    },
    title: "Show everything tagged \u201c" + t + "\u201d",
    onClick: () => onTagClick && onTagClick(t)
  }, t))), (c.lorebooks || []).length > 0 && /*#__PURE__*/React.createElement("div", {
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
  }), " Slideshow")), ((c.gallery || []).length > 0 || c.profileImg) && /*#__PURE__*/React.createElement("button", {
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
  }), " Download images")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onExportJson(activeVar),
    title: "Exports only what you're viewing right now"
  }, "Export JSON \u00b7 " + (av ? av.name || "Variant" : "Default")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onExportCharSnap(activeVar),
    title: "Exports only what you're viewing right now"
  }, "Export for CharSnap \u00b7 " + (av ? av.name || "Variant" : "Default")), variants.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onExportCharSnap("all"),
    title: "Every variant in one CharSnap file"
  }, "Export all variants"), (c.sectionOrder || []).length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    title: "Put the sections back in their original order",
    onClick: () => onReorder(null)
  }, "Reset layout"), /*#__PURE__*/React.createElement("button", {
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
    onClick: onClose
  }, "Close"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1560,
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
        maxWidth: 940,
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
    onClick: () => setGrid(true),
    "aria-label": "Open image grid",
    title: "Drag to reorder · click to open grid"
  }, /*#__PURE__*/React.createElement(BlurBtn, {
    imgId: g.imgId,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    label: "image " + (i + 1)
  }), imgCache[g.imgId] ? /*#__PURE__*/React.createElement("img", {
    src: imgCache[g.imgId],
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
    items: c.gallery || [], // the lightbox maps over this
    index: lb.index,
    imgCache: imgCache,
    fullCache: fullCache,
    requestFull: requestFull,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    autoPlay: lb.autoPlay,
    onClose: () => setLb(null),
    onNav: d => setLb(p => ({
      ...p,
      index: (p.index + d + (c.gallery || []).length) % (c.gallery || []).length
    })),
    onSetProfile: imgId => {
      onSetProfile(imgId);
      toast("Profile image updated");
    },
    onCaption: onCaption,
    onRemove: onDeleteImages ? i => {
      const removedId = (c.gallery || [])[i] && (c.gallery || [])[i].imgId;
      onDeleteImages(removedId ? [removedId] : []);
      setLb(p => {
        const remaining = (c.gallery || []).length - 1;
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
  imgCache,
  fullCache,
  loadImage,
  requestFull,
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
  useEffect(() => {
    [p.avatar, ...gallery.map(g => g.imgId)].filter(Boolean).forEach(loadImage);
    requestFull(p.avatar);
  }, [p]);
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape" && lb === null && !ss && !grid && !escOff) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, lb, ss, grid, escOff]);
  const portrait = p.avatar ? fullCache[p.avatar] || imgCache[p.avatar] : null;
  const details = [["Role", p.role], ["Pronouns", p.pronouns]].filter(x => x[1]);
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
    className: "scrollbody"
  }, /*#__PURE__*/React.createElement("div", {
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
      maxWidth: 1560,
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
  }), " Slideshow")), (gallery.length > 0 || p.avatar) && /*#__PURE__*/React.createElement("button", {
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
  }), " Download images")), /*#__PURE__*/React.createElement("button", {
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
    onClick: onClose
  }, "Close")), /*#__PURE__*/React.createElement("input", {
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
      maxWidth: 1560,
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
        maxWidth: 940,
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
    onClick: () => setGrid(true),
    "aria-label": "Open image grid",
    title: "Drag to reorder · click to open grid"
  }, /*#__PURE__*/React.createElement(BlurBtn, {
    imgId: g.imgId,
    blurred: blurred,
    onToggleBlur: onToggleBlur,
    label: "image " + (i + 1)
  }), imgCache[g.imgId] ? /*#__PURE__*/React.createElement("img", {
    src: imgCache[g.imgId],
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
    onNav: d => setLb(prev => (prev + d + gallery.length) % gallery.length),
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
const VARIANT_FIELDS = ["tagline", "story", "personality", "scenario", "firstMessage", "exampleMessage", "creatorMemo", "systemPrompt", "alwaysActiveSystemPrompt"];
const DEFAULT_VID = "__default__"; // image belongs to the Default variant only
/* version history: text only — images (profileImg/banner/gallery) are never captured or restored,
   so photos always survive an update or a rollback */
const VERSION_BASE_KEYS = ["name", "age", "gender", "pronouns"].concat(VARIANT_FIELDS);
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
    lorebooks: (snap.lorebooks || []).slice(),
    sections,
    sectionOrder: order && order.length ? order : null,
    variants: (snap.variants || []).map(v => Object.assign({}, v, {
      id: v.id || uid()
    }))
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
  const setF = (k, v) => {
    if (vIdx < 0) set(k, v);else set("variants", variants.map((x, j) => j === vIdx ? {
      ...x,
      [k]: v
    } : x));
  };
  const addVariant = () => {
    const nv = {
      id: uid(),
      name: "Variant " + (variants.length + 2)
    };
    set("variants", [...variants, nv]);
    setVIdx(variants.length);
    setAdvOpen(true);
  };
  const removeVariant = i => {
    set("variants", variants.filter((_, j) => j !== i));
    setVIdx(-1);
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
        toast("No character found in that file");
        return;
      }
      setJsonIncoming(results[0].char);
    } catch (e) {
      toast("Couldn't read that JSON file");
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
      ["age", "gender", "pronouns"].forEach(k => {
        if ((inc[k] || "").trim()) patch[k] = inc[k];
      });
      if ((inc.tags || []).length) patch.tags = [...new Set([...(c.tags || []), ...inc.tags])];
      if ((inc.sections || []).length) patch.sections = inc.sections.map(s => ({
        id: uid(),
        title: s.title || "",
        content: s.content || ""
      }));
      setC(p => ({ ...p, ...patch, history, __historyPushed: true }));
      setVIdx(-1);
      toast("Default updated from JSON — images kept");
    } else if (mode === "variant" && vIdx >= 0) {
      const nextVariants = variants.map((x, j) => {
        if (j !== vIdx) return x;
        const merged = { ...x };
        VARIANT_FIELDS.forEach(k => {
          if ((inc[k] || "").trim()) merged[k] = inc[k];
        });
        return merged;
      });
      setC(p => ({ ...p, variants: nextVariants, history, __historyPushed: true }));
      toast("Variant updated from JSON — images kept");
    } else {
      const nv = Object.assign({
        id: uid(),
        name: (inc.name || "").trim() && inc.name !== c.name ? inc.name : "Variant " + (variants.length + 2)
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
    try {
      const orig = await fileToDataUrl(files[0]);
      const thumb = await makeThumb(orig).catch(() => null);
      const imgId = uid();
      await saveImage(imgId, orig, thumb);
      if (c.banner) {
        sDel("img:" + c.banner);
        sDel("th:" + c.banner);
      }
      set("banner", imgId);
      toast("Banner updated");
    } catch (e) {
      toast("Couldn't read that image");
    }
  };
  const doSave = () => {
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
  const profileSrc = editorPortraitId ? imgCache[editorPortraitId] : null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--ink)",
      zIndex: 50,
      overflowY: "auto"
    },
    className: "scrollbody"
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
  }, confirmDel ? "Click again to delete forever" : "Delete"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: doSave
  }, "Save character"))), /*#__PURE__*/React.createElement("div", {
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
  }), editorPortraitId && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      width: "100%",
      marginTop: 10
    },
    onClick: () => setPortraitFor(null)
  }, "Remove \u201c" + activeVariantName + "\u201d portrait"), vIdx >= 0 && !editorPortraitId && c.profileImg && /*#__PURE__*/React.createElement("div", {
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
  }), c.banner && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      width: "100%",
      marginTop: 8,
      fontSize: 12.5,
      padding: "7px 10px"
    },
    onClick: () => {
      sDel("img:" + c.banner);
      sDel("th:" + c.banner);
      set("banner", null);
    }
  }, "Remove banner")), /*#__PURE__*/React.createElement("div", {
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
    value: c.age,
    onChange: e => set("age", e.target.value),
    placeholder: "24"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Gender"), /*#__PURE__*/React.createElement("input", {
    value: c.gender,
    onChange: e => set("gender", e.target.value),
    placeholder: "Woman, man, nonbinary…"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Pronouns"), /*#__PURE__*/React.createElement("input", {
    value: c.pronouns,
    onChange: e => set("pronouns", e.target.value),
    placeholder: "she/her, they/them…"
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
  }))), /*#__PURE__*/React.createElement("div", {
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
  }, "Variant"), /*#__PURE__*/React.createElement("button", {
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
  }, v.name || "Variant " + (i + 2))), /*#__PURE__*/React.createElement("button", {
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
    onClick: () => removeVariant(vIdx)
  }, "Delete variant")), vIdx >= 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--mut)",
      marginTop: 10
    }
  }, "Variant fields left empty fall back to the Default variant on the character page. Tags, bucket, sections and the gallery are shared across all variants.")), vIdx >= 0 && /*#__PURE__*/React.createElement("div", {
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
    className: "eyebrow",
    style: {
      marginBottom: 10
    }
  }, "Backstory"), /*#__PURE__*/React.createElement("textarea", {
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
    className: "eyebrow",
    style: {
      marginBottom: 10
    }
  }, "Personality"), /*#__PURE__*/React.createElement("textarea", {
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
    className: "eyebrow",
    style: {
      marginBottom: 10
    }
  }, "Scenario"), /*#__PURE__*/React.createElement("textarea", {
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
    className: "eyebrow",
    style: {
      marginBottom: 10
    }
  }, "First message"), /*#__PURE__*/React.createElement("textarea", {
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
  }), /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Creator memo — notes for readers; not used by the AI"), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: getF("creatorMemo"),
    onChange: e => setF("creatorMemo", e.target.value),
    placeholder: "What to expect, content warnings, tips for the best experience",
    style: {
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "System prompt"), /*#__PURE__*/React.createElement("textarea", {
    rows: 6,
    value: getF("systemPrompt"),
    onChange: e => setF("systemPrompt", e.target.value),
    placeholder: "How the bot is set up behind the scenes"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "lbl"
  }, "Always-active system prompt — appended at the end; keep it short"), /*#__PURE__*/React.createElement("textarea", {
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
  }), " Add section"))), c.sections.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--dim)",
      fontSize: 13.5,
      padding: "8px 2px"
    }
  }, "No custom sections yet."), c.sections.map((s, i) => /*#__PURE__*/React.createElement("div", {
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
    onChange: e => set("sections", c.sections.map((x, j) => j === i ? {
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
    onClick: () => set("sections", c.sections.filter((_, j) => j !== i))
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.trash,
    size: 15
  }))), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: s.content,
    placeholder: "Section content",
    onChange: e => set("sections", c.sections.map((x, j) => j === i ? {
      ...x,
      content: e.target.value
    } : x))
  })))), /*#__PURE__*/React.createElement("div", {
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
  })), (c.gallery || []).length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px dashed var(--line2)",
      borderRadius: 10,
      padding: "26px 16px",
      textAlign: "center",
      color: "var(--dim)",
      fontSize: 13.5
    }
  }, "No gallery images yet. Add reference art, outfits, expressions — anything.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
      gap: 12
    }
  }, (c.gallery || []).map((g, i) => /*#__PURE__*/React.createElement("button", {
    key: g.imgId,
    onClick: () => setLightbox(i),
    "aria-label": "Open image " + (i + 1),
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
  }, confirmDel ? "Click again to delete forever" : "Delete"), /*#__PURE__*/React.createElement("button", {
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
    onNav: d => setLightbox(i => (i + d + (c.gallery || []).length) % (c.gallery || []).length),
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
      if (!e.target.files[0]) return;
      const orig = await fileToDataUrl(e.target.files[0]);
      const thumb = await makeThumb(orig).catch(() => null);
      const imgId = uid();
      await imgCtx.saveImage(imgId, orig, thumb);
      onChange(imgId);
      e.target.value = "";
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
  const [confirmDel, setConfirmDel] = useState(false);
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
    onClick: onClose
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
  }))))), /*#__PURE__*/React.createElement("div", {
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
      ...r,
      updatedAt: Date.now(),
      createdAt: r.createdAt || Date.now()
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
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, fields.map(f => /*#__PURE__*/React.createElement("input", {
    key: f.key,
    type: "password",
    placeholder: f.label,
    value: vals[f.key] || "",
    onChange: e => {
      setVals(p => ({
        ...p,
        [f.key]: e.target.value
      }));
      setErr("");
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
    onClick: async () => {
      setBusy(true);
      const e2 = await onSubmit(vals);
      setBusy(false);
      if (e2) setErr(e2);
    }
  }, busy ? "Working…" : submitLabel), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onCancel
  }, "Cancel")));
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
  authState,
  refreshAuth
}) {
  const [form, setForm] = useState(null); // 'setup' | 'change' | 'removePw' | 'setPin' | 'removePin'
  const [pendingImport, setPendingImport] = useState(null);
  const [xfer, setXfer] = useState(null);
  const [xferBusy, setXferBusy] = useState(false);
  const spinner = label => React.createElement("span", {
    style: { display: "inline-flex", gap: 8, alignItems: "center" }
  }, React.createElement("span", { className: "spin" }), label);
  const [xferCode, setXferCode] = useState("");
  const [xferMsg, setXferMsg] = useState(null);
  const [xferReplace, setXferReplace] = useState(true);
  const [xferConfirm, setXferConfirm] = useState(false);
  useEffect(() => {
    if (window.transfer) window.transfer.status().then(s => {
      if (s && s.active) setXfer(s);
    }).catch(() => {});
  }, []);
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
  const [openRel, setOpenRel] = useState(0);
  const desktop = !!window.auth;
  const web = typeof window !== "undefined" && window.vaultPlatform === "web";
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
      fontSize: 12.5,
      color: "var(--dim)",
      marginTop: 8
    }
  }, "Applies to character, persona, lorebook and prompt text."), /*#__PURE__*/React.createElement("div", {
    className: "divider"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      marginBottom: 4
    }
  }, "Master password"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--mut)",
      lineHeight: 1.5,
      marginBottom: 12
    }
  }, desktop ? web ? "Your password encrypts every record and photo in this browser's storage (AES-256, key derived from your password and never stored). There is no recovery if you forget it — keep an exported backup somewhere safe. Note: clearing this site's browser data erases the vault." : "Your password encrypts every record and photo on disk (AES-256), layered on top of Windows account encryption. There is no recovery if you forget it — keep an exported backup somewhere safe." : "Password and PIN protection are available in the Windows desktop app."), desktop && !authState.passwordSet && !form && /*#__PURE__*/React.createElement("button", {
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
      label: "New PIN (4+ digits)"
    }, {
      key: "q",
      label: "Repeat PIN"
    }],
    onSubmit: async v => {
      if ((v.p || "").length < 4) return "PIN needs at least 4 digits";
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
  }, "Without a master password, web data sits unencrypted in this browser's storage. Setting one is strongly recommended."), desktop && web && authState.pinSet && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: "var(--mut)",
      marginTop: 12,
      lineHeight: 1.5
    }
  }, "On the web there is no OS key store, so the quick-unlock PIN is only as strong as the digits you pick. Prefer the master password on shared devices."), desktop && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      gap: 10,
      marginTop: 14
    }
  }, (web ? [["Password encryption", enc == null ? "…" : enc.password ? "On (AES-256)" : "Off", enc && enc.password], ["Storage", "This browser (IndexedDB)", true]] : [["Windows encryption", enc == null ? "…" : enc.dpapi ? "On (DPAPI)" : "Unavailable", enc && enc.dpapi], ["Password encryption", enc == null ? "…" : enc.password ? "On (AES-256)" : "Off", enc && enc.password]]).map(([k, v, on]) => /*#__PURE__*/React.createElement("div", {
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
  }, "Transfer to another device"), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 13, color: "var(--mut)", marginBottom: 10, lineHeight: 1.55 }
  }, "Syncs over your local Wi\u2011Fi \u2014 nothing goes to the internet. Only records that actually differ are sent, so after the first sync repeat runs are quick. Both devices must be on the same network, and the receiving device needs the one\u2011time code."),
  xferMsg && /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 13, color: xferMsg.ok ? "var(--brass)" : "#e2698a", marginBottom: 10, lineHeight: 1.5 }
  }, xferMsg.text),
  xfer ? /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: { padding: "14px 16px", marginBottom: 10 }
  }, /*#__PURE__*/React.createElement("div", { className: "eyebrow" }, "Code for the other device"),
  /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: { fontSize: 26, letterSpacing: 2, margin: "6px 0", wordBreak: "break-all" }
  }, xfer.code), /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12.5, color: "var(--dim)", marginBottom: 10 }
  }, "On the other device: Settings \u2192 Transfer \u2192 type this code. Expires in about ", xfer.minutesLeft != null ? xfer.minutesLeft : 10, " minutes."),
  /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: async () => {
      await window.transfer.stop();
      setXfer(null);
      setXferMsg({ ok: true, text: "Sending stopped." });
    }
  }, "Stop sending")) : /*#__PURE__*/React.createElement("button", {
    className: "btn btn-brass",
    disabled: xferBusy,
    style: { marginBottom: 10 },
    onClick: async () => {
      setXferBusy(true);
      setXferMsg(null);
      const r = await window.transfer.start();
      setXferBusy(false);
      if (r && r.ok) setXfer(r);
      else setXferMsg({ ok: false, text: r && r.error || "Couldn't start sending" });
    }
  }, xferBusy ? spinner("Starting\u2026") : "Share this vault"),
  /*#__PURE__*/React.createElement("div", {
    style: { fontSize: 12.5, color: "var(--mut)", margin: "12px 0 6px", fontWeight: 700 }
  }, "Receive from another device"),
  /*#__PURE__*/React.createElement("input", {
    value: xferCode,
    onChange: e => { setXferCode(e.target.value); setXferConfirm(false); },
    placeholder: "Type the code shown on the other device",
    style: { width: "100%", marginBottom: 8 }
  }),
  /*#__PURE__*/React.createElement("label", {
    style: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--mut)", marginBottom: 10 }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: xferReplace,
    onChange: e => { setXferReplace(e.target.checked); setXferConfirm(false); }
  }), "Mirror the other device (also delete records it no longer has)"),
  /*#__PURE__*/React.createElement("button", {
    className: xferConfirm ? "btn btn-danger" : "btn btn-ghost",
    disabled: !xferCode.trim() || xferBusy,
    style: { opacity: !xferCode.trim() || xferBusy ? .5 : 1 },
    onClick: async () => {
      if (!xferConfirm) { setXferConfirm(true); return; }
      setXferBusy(true);
      setXferMsg(null);
      const r = await window.transfer.receive(xferCode.trim(), xferReplace);
      setXferBusy(false);
      setXferConfirm(false);
      if (r && r.ok) {
        setXferCode("");
        if (r.upToDate) {
          setXferMsg({ ok: true, text: "Already up to date \u2014 nothing needed copying (" + r.unchanged + " records checked)." });
        } else {
          const bits = [];
          if (r.added) bits.push(r.added + " new");
          if (r.updated) bits.push(r.updated + " updated");
          if (r.removed) bits.push(r.removed + " removed");
          const mb = r.bytes ? " (" + (r.bytes > 1048576 ? (r.bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(r.bytes / 1024)) + " KB") + " transferred)" : "";
          setXferMsg({ ok: true, text: (bits.join(", ") || "No changes") + mb + ", " + r.unchanged + " already matched. Relaunch to see them." });
        }
      } else setXferMsg({ ok: false, text: r && r.error || "Transfer failed" });
    }
  }, xferBusy ? spinner("Checking what changed\u2026") : xferConfirm ? (xferReplace ? "Confirm \u2014 mirror the other device" : "Confirm \u2014 merge changes in") : "Sync from other device")),
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
        [c.profileImg, c.banner, ...(c.gallery || []).map(g => g.imgId)].filter(Boolean).forEach(id => {
          sDel("img:" + id);
          sDel("th:" + id);
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
          sDel("img:" + id);
          sDel("th:" + id);
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
          sDel("img:" + im.imgId);
          sDel("th:" + im.imgId);
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
  const [selectMode, setSelectMode] = useState(false);
  const [confirmBulkDel, setConfirmBulkDel] = useState(false);
  const bulkDeleteChars = async ids => {
    const idSet = new Set(ids);
    const going = chars.filter(c => idSet.has(c.id));
    going.forEach(c => [c.profileImg, c.banner, ...(c.gallery || []).map(g => g.imgId)].filter(Boolean).forEach(id => {
      sDel("img:" + id);
      sDel("th:" + id);
    }));
    const next = chars.filter(c => !idSet.has(c.id));
    setChars(next);
    await sSet("chars:all", JSON.stringify(next));
    setSelected({});
    setConfirmBulkDel(false);
    setSelectMode(false);
    toast(going.length + (going.length === 1 ? " character deleted" : " characters deleted"));
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
  const setBucketCover = async (name, imgId) => {
    setBucketMeta(prev => {
      const old = prev[name] && prev[name].cover;
      if (old && old !== imgId) {
        sDel("img:" + old);
        sDel("th:" + old);
      }
      const next = {
        ...prev
      };
      if (imgId) next[name] = {
        ...(next[name] || {}),
        cover: imgId
      };else if (next[name]) {
        const m = {
          ...next[name]
        };
        delete m.cover;
        if (Object.keys(m).length) next[name] = m;else delete next[name];
      }
      sSet("buckets:meta", JSON.stringify(next));
      return next;
    });
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

  /* --- preload thumbnails for everything (dashboard wall is randomized) --- */
  useEffect(() => {
    if (!ready) return;
    chars.forEach(c => {
      if (c.profileImg) loadImage(c.profileImg);
      (c.gallery || []).forEach(g => loadImage(g.imgId));
    });
    personas.forEach(p => {
      if (p.avatar) loadImage(p.avatar);
      (p.gallery || []).forEach(g => loadImage(g.imgId));
    });
    Object.values(bucketMeta).forEach(m => {
      if (m && m.cover) loadImage(m.cover);
    });
    [...chars.map(c => ({
      u: c.updatedAt,
      img: c.profileImg
    })), ...personas.map(p => ({
      u: p.updatedAt,
      img: p.avatar
    }))].filter(r => r.u && r.img).sort((a, b) => b.u - a.u).slice(0, 8).forEach(r => loadImage(r.img));
    lore.forEach(e => (e.images || []).forEach(im => loadImage(im.imgId)));
    Object.values(loreMeta).forEach(m => {
      if (m && m.cover) loadImage(m.cover);
    });
    prompts.forEach(p => (p.images || []).forEach(im => loadImage(im.imgId)));
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
  const toggleBlur = useCallback(imgId => {
    if (!imgId) return;
    setBlurred(prev => {
      const next = {
        ...prev
      };
      if (next[imgId]) delete next[imgId];else next[imgId] = true;
      sSet("blurset", JSON.stringify(Object.keys(next)));
      return next;
    });
  }, []);

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
  const [statsOpen, setStatsOpen] = useState(null); // null | { title, subtitle?, rows, note?, loading }
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
      let bytes = 0;
      for (const k of imgKeys) {
        try {
          bytes += dataUrlSize(await sGet(k));
        } catch (e) {}
      }
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
  const openRecordStats = async (title, text, imgIds) => {
    setStatsOpen({
      title,
      loading: true,
      rows: []
    });
    try {
      const ts = textStats(text);
      let bytes = 0;
      const ids = [...new Set(imgIds.filter(Boolean))];
      for (const id of ids) {
        try {
          bytes += dataUrlSize(await sGet("img:" + id));
        } catch (e) {}
      }
      setStatsOpen({
        title,
        rows: [["Pictures", fmtNum(ids.length)], ["Picture size (originals)", fmtBytes(bytes)], ["Words", fmtNum(ts.words)], ["Letters (excl. spaces)", fmtNum(ts.letters)], ["Characters (incl. spaces)", fmtNum(ts.chars)], ["Est. AI tokens", "~" + fmtNum(ts.tokens)]],
        note: "Text counts every written field (including variants and sections). Token estimate: ~4 characters per token."
      });
    } catch (e) {
      setStatsOpen(null);
      toast("Couldn't compute stats");
    }
  };
  const [textSize, setTextSize] = useState("medium"); // reading size for prose: small | medium | large
  const proseSizePx = textSize === "small" ? "13px" : textSize === "large" ? "16px" : "14.5px";
  const applyTextSize = async s => {
    setTextSize(s);
    await sSet("ui:textsize", s);
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
  const bulkDeletePersonas = async ids => {
    const idSet = new Set(ids);
    const going = personas.filter(p => idSet.has(p.id));
    going.forEach(p => [p.avatar, ...(p.gallery || []).map(g => g.imgId)].filter(Boolean).forEach(id => {
      sDel("img:" + id);
      sDel("th:" + id);
    }));
    const next = personas.filter(p => !idSet.has(p.id));
    setPersonas(next);
    await sSet("personas:all", JSON.stringify(next));
    setPSelected({});
    setPConfirmDel(false);
    setPSelMode(false);
    toast(going.length + (going.length === 1 ? " persona deleted" : " personas deleted"));
  };
  useEffect(() => {
    if (view === "dashboard") setDashSeed(Date.now() & 0x7fffffff || 1);
  }, [view]);
  const lockVault = async () => {
    if (window.auth) await window.auth.lock();
    setReady(false);
    setChars([]);
    setPersonas([]);
    setLore([]);
    setPrompts([]);
    setImgCache({});
    setFullCache({});
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
  const loadImage = useCallback(async imgId => {
    if (!imgId) return;
    setImgCache(prev => {
      if (prev[imgId]) return prev;
      sGet("th:" + imgId).then(v => v || sGet("img:" + imgId)).then(v => {
        if (v) setImgCache(p2 => ({
          ...p2,
          [imgId]: v
        }));
      }).catch(() => {}); // a picture that will not load shows as blank, not as a save failure
      return prev;
    });
  }, []);
  const [fullCache, setFullCache] = useState({});
  const requestFull = useCallback(imgId => {
    if (!imgId) return;
    setFullCache(prev => {
      if (prev[imgId]) return prev;
      sGet("img:" + imgId).then(v => {
        if (v) setFullCache(p => ({
          ...p,
          [imgId]: v
        }));
      }).catch(() => {}); // as above
      return prev;
    });
  }, []);
  const saveImage = useCallback(async (imgId, dataUrl, thumb) => {
    setImgCache(p => ({
      ...p,
      [imgId]: thumb || dataUrl
    }));
    setFullCache(p => ({
      ...p,
      [imgId]: dataUrl
    }));
    await sSet("img:" + imgId, dataUrl);
    if (thumb) await sSet("th:" + imgId, thumb);
  }, []);

  /* --- character CRUD --- */
  const persistChar = async c => {
    const next = chars.some(x => x.id === c.id) ? chars.map(x => x.id === c.id ? c : x) : [...chars, c];
    setChars(next);
    await sSet("chars:all", JSON.stringify(next));
  };
  const saveChar = async c => {
    await persistChar(c);
    setEditingChar(null);
    toast("Character saved");
  };
  const deleteChar = async c => {
    const next = chars.filter(x => x.id !== c.id);
    setChars(next);
    await sSet("chars:all", JSON.stringify(next));
    const imgIds = [c.profileImg, c.banner, ...(c.gallery || []).map(g => g.imgId)].filter(Boolean);
    imgIds.forEach(id => {
      sDel("img:" + id);
      sDel("th:" + id);
    });
    setEditingChar(null);
    setViewCharId(null);
    toast("Character deleted");
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
  const persistPersona = async p => {
    const next = personas.map(x => x.id === p.id ? p : x);
    setPersonas(next);
    await sSet("personas:all", JSON.stringify(next));
  };
  const deleteRecord = async (type, r) => {
    if (type === "prompt") {
      (r.images || []).forEach(im => {
        sDel("img:" + im.imgId);
        sDel("th:" + im.imgId);
      });
      setViewPromptEntryId(null);
    }
    if (type === "lore") {
      (r.images || []).forEach(im => {
        sDel("img:" + im.imgId);
        sDel("th:" + im.imgId);
      });
      setViewLoreEntryId(null);
    }
    if (type === "persona") {
      [r.avatar, ...(r.gallery || []).map(g => g.imgId)].filter(Boolean).forEach(id => {
        sDel("img:" + id);
        sDel("th:" + id);
      });
      setViewPersonaId(null);
    }
    const col = collections[type];
    const next = col.list.filter(x => x.id !== r.id);
    col.set(next);
    await sSet(col.key, JSON.stringify(next));
    setEditingRecord(null);
    toast("Deleted");
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
  const triggerJsonImport = type => {
    setJsonImportType(type);
    setTimeout(() => jsonImportRef.current && jsonImportRef.current.click(), 0);
  };
  const applyImportedBlur = async ids => {
    if (!ids || !ids.length) return;
    setBlurred(prev => {
      const next = {
        ...prev
      };
      ids.forEach(id => next[id] = true);
      sSet("blurset", JSON.stringify(Object.keys(next)));
      return next;
    });
  };
  const writeImportedImages = async (images, thumbs) => {
    for (const [id, v] of Object.entries(images || {})) {
      if (!v) continue;
      await sSet("img:" + id, v);
      setFullCache(p => ({
        ...p,
        [id]: v
      }));
      setImgCache(p => ({
        ...p,
        [id]: thumbs && thumbs[id] || v
      }));
    }
    for (const [id, v] of Object.entries(thumbs || {})) {
      if (v) await sSet("th:" + id, v);
    }
  };
  const handleJsonImportFile = async file => {
    const type = jsonImportType;
    setJsonImportType(null);
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
        const res = normalizeLoreImport(data, file.name.replace(/\.json$/i, ""));
        if (!res.entries.length) {
          toast("No lore entries found in that file");
          return;
        }
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
      }
    } catch (e) {
      toast("Couldn't read that file — is it valid JSON?");
    }
  };
  const collectImagesFor = async (charList, personaList) => {
    const images = {},
      thumbs = {};
    const ids = [];
    for (const c of charList || []) ids.push(c.profileImg, c.banner, ...(c.gallery || []).map(g => g.imgId));
    for (const p of personaList || []) ids.push(p.avatar, ...(p.gallery || []).map(g => g.imgId));
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
      return !vid || orphan || (scope !== null && vid === scope);
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
  const exportCharSnap = (c, scope) => {
    const out = charToCharSnap(c, scope);
    const label = scopeLabel(c, scope);
    downloadJSON(out.main, sanitizeName(c.name) + (label ? "-" + sanitizeName(label) : "") + "-charsnap.json");
    toast("CharSnap file exported" + (label ? " \u2014 " + label + " only" : " (" + out.main.variants.length + " variants)") + "; images upload separately");
  };
  const exportCharJson = async (c, scope) => {
    const sc = scopedChar(c, scope);
    const label = scopeLabel(c, scope);
    delete sc.__scopeName;
    const {
      images,
      thumbs
    } = await collectImagesFor([sc], []);
    // banner belongs here too — leaving it out meant a blurred banner came back unblurred
    const ids = [sc.profileImg, sc.banner, ...(sc.gallery || []).map(g => g.imgId)].filter(Boolean);
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
    const files = [];
    let n = 1;
    for (const it of items) {
      const v = await sGet("img:" + it.imgId);
      if (!v) continue;
      files.push({
        name: String(n).padStart(2, "0") + (it.label ? "-" + sanitizeName(it.label) : "") + "." + extOf(v),
        bytes: dataUrlBytes(v)
      });
      n++;
    }
    if (!files.length) {
      toast("Nothing to download");
      return;
    }
    downloadBlob(makeZip(files), zipName);
    toast(files.length + (files.length === 1 ? " image" : " images") + " exported at original quality");
  };
  const [personaGrid, setPersonaGrid] = useState(false);
  const downloadImagesZip = async (scopeChars, scopePersonas, zipName) => {
    toast("Collecting images…");
    const files = [];
    const seen = new Set();
    const push = async (id, base, n) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const v = await sGet("img:" + id);
      if (!v) return;
      files.push({
        name: base + "/" + String(n).padStart(2, "0") + "." + extOf(v),
        bytes: dataUrlBytes(v)
      });
    };
    for (const c of scopeChars) {
      const base = sanitizeName(c.name);
      let n = 1;
      await push(c.profileImg, base, n++);
      await push(c.banner, base, n++);
      for (const g of c.gallery) await push(g.imgId, base, n++);
    }
    for (const p of scopePersonas || []) {
      const base = "personas/" + sanitizeName(p.name);
      let n = 1;
      await push(p.avatar, base, n++);
      for (const g of p.gallery || []) await push(g.imgId, base, n++);
    }
    if (!files.length) {
      toast("No images to download");
      return;
    }
    downloadBlob(makeZip(files), zipName);
    toast(files.length + (files.length === 1 ? " image exported" : " images exported"));
  };
  const exportAll = async () => {
    toast("Preparing backup…");
    const images = {};
    const imgIds = [];
    for (const c of chars) imgIds.push(c.profileImg, c.banner, ...(c.gallery || []).map(g => g.imgId));
    for (const p of personas) imgIds.push(p.avatar, ...(p.gallery || []).map(g => g.imgId));
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
    for (const id of imgIds.filter(Boolean)) {
      images[id] = (await sGet("img:" + id)) || imgCache[id] || null;
      const t = await sGet("th:" + id);
      if (t) thumbs[id] = t;
    }
    downloadJSON({
      app: "rolecraft-vault",
      version: 3,
      exportedAt: new Date().toISOString(),
      chars,
      personas,
      lore,
      prompts,
      images,
      thumbs,
      blurred: Object.keys(blurred),
      buckets: bucketMeta,
      loreBooks: loreMeta,
      promptBooks: promptMeta
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
      setShowSettings(false);
      toast("Backup restored");
    } catch {
      toast("Couldn't read that file");
    }
  };

  /* --- derived --- */
  const allTags = [...new Set(chars.flatMap(c => c.tags || []))].sort();
  const filteredChars = chars.filter(c => bucketFilter === null || (c.bucket || "").trim() === bucketFilter).filter(c => !tagFilter || (c.tags || []).includes(tagFilter)).filter(c => !charQ || (c.name + " " + (c.tags || []).join(" ") + " " + c.story + " " + c.personality).toLowerCase().includes(charQ.toLowerCase())).sort((a, b) => sort === "name" ? (a.name || "").localeCompare(b.name || "") : sort === "updated" ? (b.updatedAt || 0) - (a.updatedAt || 0) : sort === "oldest" ? (a.createdAt || 0) - (b.createdAt || 0) : (b.createdAt || 0) - (a.createdAt || 0));
  const recent = [...chars.map(c => ({
    ...c,
    _t: "Character"
  })), ...personas.map(p => ({
    ...p,
    _t: "Persona"
  })), ...lore.map(l => ({
    ...l,
    _t: "Lore"
  })), ...prompts.map(p => ({
    ...p,
    _t: "Prompt"
  }))].filter(r => r.updatedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
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
  const rootClass = "rcv" + (theme === "light" ? " light" : theme === "charsnap" ? " charsnap" : "");
  if (authState.checked && authState.locked) return /*#__PURE__*/React.createElement("div", {
    className: rootClass,
    "data-rcv-state": "locked",
    style: {
      "--prose-size": proseSizePx
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
  if (!authState.checked || !ready) return /*#__PURE__*/React.createElement("div", {
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
  }, "Opening the vault…"));
  return /*#__PURE__*/React.createElement("div", {
    className: rootClass,
    "data-rcv-state": "ready",
    style: {
      "--prose-size": proseSizePx
    }
  }, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "sidebar",
    style: {
      width: 230,
      flexShrink: 0,
      borderRight: "1px solid var(--line)",
      padding: "22px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      background: "var(--sidebg)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: "2px 8px 20px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 11,
      background: "var(--brass-soft)",
      border: "1px solid var(--brass-line)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "serif",
    style: {
      color: "var(--brass)",
      fontSize: 19,
      fontWeight: 700
    }
  }, "R")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
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
    onClick: () => setView(n.id)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: n.icon,
    size: 16
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
    onClick: openVaultStats
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.chart,
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    className: "navlabel"
  }, "Stats")), /*#__PURE__*/React.createElement("button", {
    className: "navitem",
    onClick: () => setTheme(theme === "dark" ? "light" : theme === "light" ? "charsnap" : "dark")
  }, /*#__PURE__*/React.createElement(Ic, {
    d: theme === "dark" ? icons.sun : theme === "light" ? icons.persona : icons.moon,
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    className: "navlabel"
  }, theme === "dark" ? "Light theme" : theme === "light" ? "CharSnap theme" : "Dark theme")), authState.passwordSet && /*#__PURE__*/React.createElement("button", {
    className: "navitem",
    onClick: lockVault
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.lock,
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    className: "navlabel"
  }, "Lock vault")), /*#__PURE__*/React.createElement("button", {
    className: "navitem",
    onClick: () => setShowSettings(true)
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.gear,
    size: 16
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
  }, view === "dashboard" && (() => {
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
      }), imgCache[spotlight.profileImg] && /*#__PURE__*/React.createElement("img", {
        src: imgCache[spotlight.profileImg],
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
        }, tid && imgCache[tid] ? /*#__PURE__*/React.createElement("img", {
          src: imgCache[tid],
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
      }, wallShow.slice(0, Math.max(1, wallCols) * 2).map((w, i) => /*#__PURE__*/React.createElement("div", {
        key: w.imgId + i,
        className: "wtile",
        tabIndex: 0,
        "aria-label": w.label
      }, /*#__PURE__*/React.createElement(BlurBtn, {
        imgId: w.imgId,
        blurred: blurred,
        onToggleBlur: toggleBlur,
        label: w.label
      }), imgCache[w.imgId] ? /*#__PURE__*/React.createElement("img", {
        src: imgCache[w.imgId],
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
        onClick: () => setWallLb({
          items: wallShow.slice(0, Math.max(1, wallCols) * 2).map(x => ({
            imgId: x.imgId,
            caption: x.label
          })),
          index: i
        })
      }, "View image"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-primary",
        style: {
          minWidth: 150
        },
        onClick: w.open
      }, w.kind === "persona" ? "Open persona" : "Open character")))))))) : null
    };
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
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
      onNav: d => setWallLb(p => ({
        ...p,
        index: (p.index + d + p.items.length) % p.items.length
      }))
    }));
  })(), view === "characters" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
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
    placeholder: "Search names, tags, story…",
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
  }, selectMode ? "Cancel selection" : "Select"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      flexShrink: 0
    },
    onClick: () => triggerJsonImport("characters")
  }, "Import JSON"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      flexShrink: 0
    },
    onClick: () => askExport("your characters (including images)", exportCharsJson)
  }, "Export JSON"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      flexShrink: 0
    },
    title: "Every character as text, with no pictures — small enough to read or paste elsewhere. Linked lore travels with it.",
    onClick: () => askExport("your characters as text, with no pictures", exportCharsTextJson)
  }, "Export text only"), /*#__PURE__*/React.createElement("button", {
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
  }, confirmBulkDel ? "Really delete " + Object.keys(selected).length + "? This removes their images too" : "Delete selected")), (() => {
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
      const coverId = customCover && imgCache[customCover] ? customCover : (cs.find(c => c.profileImg && imgCache[c.profileImg]) || {}).profileImg;
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
      })), coverId ? /*#__PURE__*/React.createElement("img", {
        src: imgCache[coverId],
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
  })), c.profileImg && imgCache[c.profileImg] ? /*#__PURE__*/React.createElement("img", {
    src: imgCache[c.profileImg],
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
  }, (c.name || "?").charAt(0).toUpperCase())), /*#__PURE__*/React.createElement("div", {
    className: "veil"
  }), /*#__PURE__*/React.createElement("div", {
    className: "meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "serif",
    style: {
      fontSize: 17,
      fontWeight: 700,
      textShadow: "0 1px 8px rgba(0,0,0,.6)"
    }
  }, c.name || "Untitled"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: "#aeb8d6",
      marginTop: 2,
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, (c.gallery || []).length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 4,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    d: icons.img,
    size: 11
  }), (c.gallery || []).length), (c.tagline || (c.tags || []).join(" | ")) && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--brass)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: 170
    }
  }, c.tagline || (c.tags || []).join(" | ")))))))), view === "personas" && (() => {
    const needle = personaQ.trim().toLowerCase();
    const shown = personas.filter(p => pBucketFilter === null || (p.bucket || "").trim() === pBucketFilter).filter(p => !needle || [p.name, p.tagline, p.role, p.description].some(v => (v || "").toLowerCase().includes(needle))).slice().sort((a, b) => sort === "name" ? (a.name || "").localeCompare(b.name || "") : sort === "updated" ? (b.updatedAt || 0) - (a.updatedAt || 0) : sort === "oldest" ? (a.createdAt || 0) - (b.createdAt || 0) : (b.createdAt || 0) - (a.createdAt || 0));
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
    }, "Image grid"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => triggerJsonImport("personas")
    }, "Import JSON"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => askExport("your personas (including portraits)", exportPersonasJson)
    }, "Export JSON"), /*#__PURE__*/React.createElement("button", {
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
    }, pConfirmDel ? "Really delete " + Object.keys(pSelected).length + "? This removes their images too" : "Delete selected")), shown.length === 0 && (pBucketFilter && pBucketMeta[pBucketFilter] !== undefined && !personas.some(p => (p.bucket || "").trim() === pBucketFilter) ? /*#__PURE__*/React.createElement("div", {
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
    }, p.avatar && imgCache[p.avatar] ? /*#__PURE__*/React.createElement("img", {
      src: imgCache[p.avatar],
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
    }, (p.name || "?").charAt(0).toUpperCase())), /*#__PURE__*/React.createElement("div", {
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
    }, p.tagline || p.role), (p.gallery || []).length > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        gap: 4,
        alignItems: "center",
        color: "var(--mut)"
      }
    }, /*#__PURE__*/React.createElement(Ic, {
      d: icons.img,
      size: 11
    }), (p.gallery || []).length)))))));
  })(), view === "lorebooks" && (() => {
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
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => triggerJsonImport("lore")
    }, "Import JSON"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => askExport("your lorebooks", exportLoreJson)
    }, "Export JSON"), /*#__PURE__*/React.createElement("button", {
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
  })(), view === "prompts" && (() => {
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
    }), " New collection")))), names.length === 0 && /*#__PURE__*/React.createElement("div", {
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
      onStats: () => openRecordStats(vp.name || "Untitled", textOfPersona(vp), [vp.avatar, ...(vp.gallery || []).map(g => g.imgId)]),
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
        } : g)
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
        for (const f of Array.from(files)) {
          try {
            const orig = await fileToDataUrl(f);
            const thumb = await makeThumb(orig).catch(() => null);
            const imgId = uid();
            await saveImage(imgId, orig, thumb);
            added.push({
              imgId,
              caption: ""
            });
          } catch (e) {}
        }
        if (!added.length) {
          toast("Couldn't read those images");
          return;
        }
        await persistPersona({
          ...vp,
          gallery: [...(vp.gallery || []), ...added],
          updatedAt: Date.now()
        });
        toast(added.length + (added.length === 1 ? " image added" : " images added"));
      },
      onDeleteImages: async imgIds => {
        const idSet = new Set(imgIds);
        idSet.forEach(id => {
          sDel("img:" + id);
          sDel("th:" + id);
        });
        const patch = {
          ...vp,
          gallery: (vp.gallery || []).filter(g => !idSet.has(g.imgId)),
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
      onSetAlbum: async (imgIds, albumName) => {
        const idSet = new Set(imgIds);
        const gallery = (vp.gallery || []).map(g => idSet.has(g.imgId) ? { ...g, album: albumName } : g);
        const touched = (vp.gallery || []).filter(g => idSet.has(g.imgId)).length;
        const known = (vp.albums || []).slice();
        if (albumName && known.indexOf(albumName) < 0) known.push(albumName);
        await persistPersona({ ...vp, gallery, albums: known, updatedAt: Date.now() });
        if (!touched) {
          toast("Portraits can't be put in albums");
          return;
        }
        toast(albumName ? touched + (touched === 1 ? " image added to " : " images added to ") + "\u201c" + albumName + "\u201d"
          : touched + (touched === 1 ? " image removed from its album" : " images removed from their albums"));
      },
      onDownloadImages: () => askExport("this persona's images", () => downloadImagesZip([], [vp], sanitizeName(vp.name) + "-images.zip")),
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
        sDel("img:" + id);
        sDel("th:" + id);
      });
      const next = personas.map(p => {
        const hitAvatar = idSet.has(p.avatar);
        const hitGallery = (p.gallery || []).some(g => idSet.has(g.imgId));
        if (!hitAvatar && !hitGallery) return p;
        return {
          ...p,
          avatar: hitAvatar ? null : p.avatar,
          gallery: (p.gallery || []).filter(g => !idSet.has(g.imgId)),
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
          const orig = await fileToDataUrl(files[0]);
          const thumb = await makeThumb(orig).catch(() => null);
          const imgId = uid();
          await saveImage(imgId, orig, thumb);
          if (meta.cover) {
            sDel("img:" + meta.cover);
            sDel("th:" + meta.cover);
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
          toast("Couldn't read that image");
        }
      },
      onRemoveCover: async () => {
        if (meta.cover) {
          sDel("img:" + meta.cover);
          sDel("th:" + meta.cover);
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
      onRename: async name => {
        const nm = name.trim();
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
        setViewLoreBook(nm);
        toast("Book renamed");
      },
      onDeleteBook: async () => {
        entries.forEach(e => (e.images || []).forEach(im => {
          sDel("img:" + im.imgId);
          sDel("th:" + im.imgId);
        }));
        if (meta.cover) {
          sDel("img:" + meta.cover);
          sDel("th:" + meta.cover);
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
        // CharSnap's lorebook import uses the Chub/world-info structure plus
        // CharSnap's own fields (triggers/description/entryType) — emit both per entry.
        const out = {
          name: viewLoreBook || "Lorebook",
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
        downloadJSON(out, sanitizeName(viewLoreBook || "lorebook") + "-charsnap.json");
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
      onClose: () => setViewLoreEntryId(null),
      onEdit: () => {
        setViewLoreEntryId(null);
        setEditingRecord({
          type: "lore",
          record: ve
        });
      },
      onAddImages: async files => {
        const added = [];
        for (const f of Array.from(files)) {
          try {
            const orig = await fileToDataUrl(f);
            const thumb = await makeThumb(orig).catch(() => null);
            const imgId = uid();
            await saveImage(imgId, orig, thumb);
            added.push({
              imgId
            });
          } catch (e) {}
        }
        if (!added.length) {
          toast("Couldn't read those images");
          return;
        }
        await persistLore(lore.map(e => e.id === ve.id ? {
          ...e,
          images: [...(e.images || []), ...added],
          updatedAt: Date.now()
        } : e));
        toast(added.length + (added.length === 1 ? " image added" : " images added"));
      },
      onRemoveImage: async idx => {
        const im = (ve.images || [])[idx];
        if (im) {
          sDel("img:" + im.imgId);
          sDel("th:" + im.imgId);
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
          const orig = await fileToDataUrl(files[0]);
          const thumb = await makeThumb(orig).catch(() => null);
          const imgId = uid();
          await saveImage(imgId, orig, thumb);
          if (meta.cover) {
            sDel("img:" + meta.cover);
            sDel("th:" + meta.cover);
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
          toast("Couldn't read that image");
        }
      },
      onRemoveCover: async () => {
        if (meta.cover) {
          sDel("img:" + meta.cover);
          sDel("th:" + meta.cover);
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
      onRename: async name => {
        const nm = name.trim();
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
          sDel("img:" + im.imgId);
          sDel("th:" + im.imgId);
        }));
        if (meta.cover) {
          sDel("img:" + meta.cover);
          sDel("th:" + meta.cover);
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
        for (const f of Array.from(files)) {
          try {
            const orig = await fileToDataUrl(f);
            const thumb = await makeThumb(orig).catch(() => null);
            const imgId = uid();
            await saveImage(imgId, orig, thumb);
            added.push({
              imgId
            });
          } catch (e) {}
        }
        if (!added.length) {
          toast("Couldn't read those images");
          return;
        }
        await persistPrompts(prompts.map(p => p.id === ve.id ? {
          ...p,
          images: [...(p.images || []), ...added],
          updatedAt: Date.now()
        } : p));
        toast(added.length + (added.length === 1 ? " image added" : " images added"));
      },
      onRemoveImage: async idx => {
        const im = (ve.images || [])[idx];
        if (im) {
          sDel("img:" + im.imgId);
          sDel("th:" + im.imgId);
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
    const noun = dp.type === "characters" ? "character" : isLore ? "lore entry" : "persona";
    const names = dp.dupes.map(d => (isLore ? d.entry.title : dp.type === "characters" ? d.item.char.name : d.item.persona.name) || "Untitled");
    // lore entries arrive as one payload for the whole file, not one per entry
    const commit = isLore ? (fresh, over, mode) => commitLoreImport(fresh, over, mode, dp.payload) : dp.type === "characters" ? commitCharImport : commitPersonaImport;
    return /*#__PURE__*/React.createElement(DupeImportModal, {
      noun: noun,
      nounPlural: isLore ? "lore entries" : undefined,
      softImages: isLore,
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
        await commit([...dp.fresh, ...dp.dupes.map(d => isLore ? d.entry : d.item)], [], "copies");
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
      onStats: () => openRecordStats(vc.name || "Untitled", textOfChar(vc), [vc.profileImg, vc.banner, ...(vc.gallery || []).map(g => g.imgId)]),
      onClose: () => setViewCharId(null),
      onEdit: () => {
        setEditingChar(vc);
      },
      onDownloadImages: () => askExport("this character's images", () => downloadImagesZip([vc], [], sanitizeName(vc.name) + "-images.zip")),
      onDownloadSelected: (items, albumName) => askExport(albumName ? "the \u201c" + albumName + "\u201d album" : "the selected images", () => zipSelectedImages(items, sanitizeName(vc.name) + "-" + sanitizeName(albumName || "selected") + ".zip")),
      onExportJson: scope => askExport(scope === "all" || scope === undefined ? "this character (including images)" : "the \u201c" + (scope === null ? "Default" : (((vc.variants || []).find(v => v.id === scope) || {}).name || "variant")) + "\u201d version (including its images)", () => exportCharJson(vc, scope)), // no tag warning: this export is not necessarily bound for CharSnap
      onExportCharSnap: scope => askExport(scope === "all" ? "every variant in CharSnap format" : "the \u201c" + (scope === null ? "Default" : (((vc.variants || []).find(v => v.id === scope) || {}).name || "variant")) + "\u201d version in CharSnap format", () => exportCharSnap(vc, scope), unknownTagWarning(vc)),
      onReorder: keys => {
        if (keys === null) toast("Section layout reset");
        return persistChar({
          ...vc,
          sectionOrder: keys
        });
      },
      onSetProfile: (imgId, variantId) => variantId ? persistChar({
        ...vc,
        variants: (vc.variants || []).map(v => v.id === variantId ? { ...v, profileImg: imgId } : v),
        updatedAt: Date.now()
      }).then(() => toast("Portrait set for \u201c" + (((vc.variants || []).find(v => v.id === variantId) || {}).name || "variant") + "\u201d")) : persistChar({
        ...vc,
        profileImg: imgId,
        updatedAt: Date.now()
      }),
      onCaption: (idx, text) => persistChar({
        ...vc,
        gallery: (vc.gallery || []).map((g, j) => j === idx ? {
          ...g,
          caption: text
        } : g)
      }),
      onDeleteImages: async imgIds => {
        const idSet = new Set(imgIds);
        idSet.forEach(id => {
          sDel("img:" + id);
          sDel("th:" + id);
        });
        const patch = {
          ...vc,
          gallery: (vc.gallery || []).filter(g => !idSet.has(g.imgId)),
          updatedAt: Date.now()
        };
        if (idSet.has(vc.profileImg)) patch.profileImg = null;
        if (idSet.has(vc.banner)) patch.banner = null;
        await persistChar(patch);
        toast(imgIds.length + (imgIds.length === 1 ? " image deleted" : " images deleted"));
      },
      onCreateAlbum: async name => {
        const n = (name || "").trim();
        if (!n) return;
        const known = (vc.albums || []).slice();
        const exists = known.indexOf(n) >= 0 || (vc.gallery || []).some(g => (g.album || "").trim() === n);
        if (exists) {
          toast("That album already exists");
          return;
        }
        known.push(n);
        await persistChar({ ...vc, albums: known, updatedAt: Date.now() });
        toast("Album \u201c" + n + "\u201d created \u2014 tick images and add them any time");
      },
      onSetVariant: async (imgIds, variantId) => {
        const idSet = new Set(imgIds);
        const gallery = (vc.gallery || []).map(g => idSet.has(g.imgId) ? { ...g, variantId: variantId } : g);
        const galleryIds = new Set((vc.gallery || []).map(g => g.imgId));
        const imgMeta = { ...(vc.imgMeta || {}) };
        imgIds.filter(id => !galleryIds.has(id)).forEach(id => {
          imgMeta[id] = { ...(imgMeta[id] || {}), variantId: variantId };
        });
        const touched = imgIds.length;
        await persistChar({ ...vc, gallery, imgMeta, updatedAt: Date.now() });
        const vName = variantId === DEFAULT_VID ? "Default" : variantId ? ((vc.variants || []).find(v => v.id === variantId) || {}).name || "that variant" : "";
        toast(variantId ? touched + (touched === 1 ? " image assigned to " : " images assigned to ") + "\u201c" + vName + "\u201d"
          : touched + (touched === 1 ? " image is now shared across variants" : " images are now shared across variants"));
      },
      onSetAlbum: async (imgIds, albumName) => {
        const idSet = new Set(imgIds);
        const gallery = (vc.gallery || []).map(g => idSet.has(g.imgId) ? { ...g, album: albumName } : g);
        const galleryIds = new Set((vc.gallery || []).map(g => g.imgId));
        const imgMeta = { ...(vc.imgMeta || {}) };
        imgIds.filter(id => !galleryIds.has(id)).forEach(id => {
          imgMeta[id] = { ...(imgMeta[id] || {}), album: albumName };
        });
        const touched = imgIds.length;
        const known = (vc.albums || []).slice();
        if (albumName && known.indexOf(albumName) < 0) known.push(albumName);
        await persistChar({ ...vc, gallery, imgMeta, albums: known, updatedAt: Date.now() });
        if (!touched) {
          return;
        }
        toast(albumName ? touched + (touched === 1 ? " image added to " : " images added to ") + "\u201c" + albumName + "\u201d"
          : touched + (touched === 1 ? " image removed from its album" : " images removed from their albums"));
      },
      onReorderImages: g => {
        persistChar({
          ...vc,
          gallery: g,
          updatedAt: Date.now()
        });
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
      onToggleBlur: toggleBlur
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
      placeholder: "Identity, personality, writing preferences"
    }, {
      key: "sections",
      label: "Sections — anything extra (appearance, kinks, boundaries, notes)",
      type: "sections"
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
      placeholder: "Add a trigger and press Enter"
    }, {
      key: "content",
      label: "Entry",
      type: "textarea",
      rows: 9,
      placeholder: "Rules, factions, places, history…"
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
      toast("Layout reset to defaults");
    },
    onClose: () => setShowSettings(false),
    textSize: textSize,
    setTextSize: applyTextSize,
    onExport: () => askExport("a full vault backup", exportAll),
    onImport: importAll,
    toast: toast,
    onDownloadImages: () => askExport("every image in the vault", () => downloadImagesZip(chars, personas, "rolecraft-images.zip")),
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
        const orig = await fileToDataUrl(f);
        const thumb = await makeThumb(orig).catch(() => null);
        const imgId = uid();
        await saveImage(imgId, orig, thumb);
        await setBucketCover(coverTarget, imgId);
        toast("Bucket cover updated");
      } catch (err) {
        toast("Couldn't read that image");
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
  }, "Cancel")))), toastMsg && /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, toastMsg));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(RolecraftVault));