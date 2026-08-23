#!/usr/bin/env node
/* Build a PNG-in-ICO from a list of square PNGs. */
"use strict";
const fs = require("fs");
const path = require("path");

function icoFromPngs(files, outPath) {
  const entries = files.map(f => {
    const buf = fs.readFileSync(f);
    const size = parseInt(path.basename(f, ".png"), 10);
    return { size, buf };
  }).sort((a, b) => a.size - b.size);
  const count = entries.length;
  let offset = 6 + 16 * count;
  const dir = Buffer.alloc(6 + 16 * count);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(count, 4);
  const parts = [dir];
  entries.forEach((e, i) => {
    const o = 6 + 16 * i;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(e.buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.buf.length;
    parts.push(e.buf);
  });
  fs.writeFileSync(outPath, Buffer.concat(parts));
  console.log("ico", outPath, entries.map(e => e.size).join(","));
}

const brand = __dirname;
const sizes = [16, 24, 32, 48, 64, 128, 256];
icoFromPngs(sizes.map(s => path.join(brand, "ico-app", s + ".png")), path.join(brand, "..", "..", "app", "icon.ico"));
icoFromPngs(sizes.map(s => path.join(brand, "ico-setup", s + ".png")), path.join(brand, "..", "setup-icon.ico"));
