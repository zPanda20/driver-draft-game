// Prints every driver (or, with --principals, every team principal) with the file name a photo should have: node tools/driver_slugs.mjs [--principals]
import fs from "fs";
import { slugOf } from "../server/pics.js";
const kind = process.argv.includes("--principals") ? "principals" : "drivers";
const D = JSON.parse(fs.readFileSync(new URL("../data/data.json", import.meta.url)))[kind].slice().sort((a, b) => a.rank - b.rank);
const have = new Set(fs.existsSync(new URL(`../public/${kind}/`, import.meta.url)) ? fs.readdirSync(new URL(`../public/${kind}/`, import.meta.url)).filter((f) => !f.startsWith(".")).map((f) => f.replace(/\.\w+$/, "")) : []);
D.forEach((d) => console.log(`${String(d.rank).padStart(3)}  ${have.has(slugOf(d.name)) ? "[x]" : "[ ]"}  ${slugOf(d.name)}.jpg   ${d.name} (${d.series || d.era || d.group || ""})`));
console.log(`\n${[...have].length} of ${D.length} have photos`);
