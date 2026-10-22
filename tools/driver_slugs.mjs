// Prints every driver with the file name a photo should have: node tools/driver_slugs.mjs
import fs from "fs";
import { slugOf } from "../server/pics.js";
const D = JSON.parse(fs.readFileSync(new URL("../data/data.json", import.meta.url))).drivers.slice().sort((a, b) => a.rank - b.rank);
const have = new Set(fs.existsSync(new URL("../public/drivers/", import.meta.url)) ? fs.readdirSync(new URL("../public/drivers/", import.meta.url)).filter((f) => !f.startsWith(".")).map((f) => f.replace(/\.\w+$/, "")) : []);
D.forEach((d) => console.log(`${String(d.rank).padStart(3)}  ${have.has(slugOf(d.name)) ? "[x]" : "[ ]"}  ${slugOf(d.name)}.jpg   ${d.name} (${d.series})`));
console.log(`\n${[...have].length} of ${D.length} have photos`);
