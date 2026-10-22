// Prints every track with the file name an outline should have: node tools/track_slugs.mjs
import fs from "fs";
import { slugOf } from "../server/pics.js";
const T = JSON.parse(fs.readFileSync(new URL("../data/data.json", import.meta.url))).tracks;
const dir = new URL("../public/tracks/", import.meta.url);
const have = new Set(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".png") && !f.endsWith("-s.png")).map((f) => f.replace(/\.png$/, "")) : []);
T.forEach((t, i) => console.log(`${String(i + 1).padStart(3)}  ${have.has(slugOf(t.name)) ? "[x]" : "[ ]"}  ${slugOf(t.name)}.png   ${t.name}`));
console.log(`\n${have.size} of ${T.length} have outlines`);
