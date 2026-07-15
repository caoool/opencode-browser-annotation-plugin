// Builds dist/extension.zip for Chrome Web Store upload.
// Uses only Node's built-in zlib (deflate) to write a spec-compliant ZIP with
// manifest.json at the archive root. No third-party deps.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateRawSync, crc32 } from "node:zlib";
import { join } from "node:path";

const EXT = "extension";
// Explicit allowlist: never ship the SVG source or the 512 promo icon.
const MEMBERS = [
  "manifest.json",
  "background.js",
  "overlay.js",
  "options.html",
  "options.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

if (typeof crc32 !== "function") {
  console.error("This Node lacks zlib.crc32 (needs Node >=20.15). Use the python3 fallback.");
  process.exit(1);
}

const local = [];
const central = [];
let offset = 0;

for (const name of MEMBERS) {
  const data = readFileSync(join(EXT, name));
  const comp = deflateRawSync(data);
  const crc = crc32(data);

  const nameBuf = Buffer.from(name, "utf8");
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);      // local file header sig
  lh.writeUInt16LE(20, 4);              // version needed
  lh.writeUInt16LE(0, 6);               // flags
  lh.writeUInt16LE(8, 8);               // method = deflate
  lh.writeUInt16LE(0, 10);              // mod time
  lh.writeUInt16LE(0x21, 12);           // mod date (fixed, deterministic)
  lh.writeUInt32LE(crc >>> 0, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  local.push(lh, nameBuf, comp);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);      // central dir sig
  ch.writeUInt16LE(20, 4);              // version made by
  ch.writeUInt16LE(20, 6);              // version needed
  ch.writeUInt16LE(0, 8);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(0, 12);
  ch.writeUInt16LE(0x21, 14);
  ch.writeUInt32LE(crc >>> 0, 16);
  ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(offset, 42);         // local header offset
  central.push(ch, nameBuf);

  offset += lh.length + nameBuf.length + comp.length;
}

const centralBuf = Buffer.concat(central);
const localBuf = Buffer.concat(local);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(MEMBERS.length, 8);
eocd.writeUInt16LE(MEMBERS.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(localBuf.length, 16);

mkdirSync("dist", { recursive: true });
const out = "dist/extension.zip";
writeFileSync(out, Buffer.concat([localBuf, centralBuf, eocd]));
console.log(`wrote ${out} (${MEMBERS.length} files)`);
for (const m of MEMBERS) console.log("  " + m);
