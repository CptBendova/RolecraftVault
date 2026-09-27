"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path");
const source = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
const helpers = source.slice(source.indexOf("function charImgIds("), source.indexOf("function restoreRecordsWithFreshIds("));
const { withGalleryProfile: set, charImgIds: ids } = new Function('const DEFAULT_VID="__default__";' + helpers + ';return {withGalleryProfile,charImgIds};')();
const original = { id: "c", name: "Ari", profileImg: "old", banner: "banner", chatPortraitCrop: { zoom: 3 },
  variants: [{ id: "v", name: "Evening", profileImg: "variant-old", chatPortraitCrop: { zoom: 2 } }],
  gallery: [{ imgId: "new", caption: "Keep caption", album: "Outfits", variantId: "__default__" }],
  imgMeta: { old: { album: "Portraits" } } };
const frozen = JSON.stringify(original);
const base = set(original, "new", "__default__");
assert.equal(base.profileImg, "new"); assert.equal(base.chatPortraitCrop, null);
assert.equal(base.variants[0].profileImg, "variant-old"); assert.equal(base.variants[0].chatPortraitCrop.zoom, 2);
assert.equal(base.gallery[0].caption, "Keep caption");
assert.deepEqual(base.gallery[1], { imgId: "old", caption: "Previous profile picture", album: "Portraits", variantId: "__default__" });
assert(ids(original).every(id => ids(base).includes(id)), "Every original remains reachable for backup/sync");
assert.equal(JSON.stringify(original), frozen, "No mutation of the current character");
const variant = set(original, "new", "v");
assert.equal(variant.profileImg, "old"); assert.equal(variant.chatPortraitCrop.zoom, 3);
assert.equal(variant.variants[0].profileImg, "new"); assert.equal(variant.variants[0].chatPortraitCrop, null);
assert.equal(variant.gallery[1].variantId, "v");
const unchanged = set(original, "old", null);
assert.equal(unchanged.chatPortraitCrop.zoom, 3); assert.equal(unchanged.gallery.length, 1);
const shared = set({ ...original, profileImg: "variant-old" }, "new", null);
assert.equal(shared.gallery.length, 1, "A portrait still held by a variant is not duplicated");
assert.throws(() => set(original, "new", "missing"), /variant no longer exists/);
assert.throws(() => set(original, "missing", null), /no longer in this gallery/);
assert.throws(() => set(null, "new", null), /no longer in this gallery/);
const persona = set({ avatar: "old", gallery: [{ imgId: "new", caption: "Keep" }] }, "new", null, true);
assert.equal(persona.avatar, "new"); assert.equal(persona.gallery[1].imgId, "old");
console.log("PASS gallery profile selection: Default/variants/personas, retained originals, framing, no mutation and stale selection guards");
