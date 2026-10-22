// Which driver photos exist. Photos live in public/drivers/<slug>.(jpg|png|webp), where slug is the driver's name in lower case
// without accents or spaces (Sébastien Loeb -> sebastien-loeb). The catalogue tells every browser which drivers have a photo,
// so the page never asks for one that is missing. The folder is read when the server starts.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const slugOf = (name) => String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "drivers");
let cache = null;
export function driverPics() {
  if (cache) return cache;
  cache = new Map();
  try { for (const f of fs.readdirSync(dir)) { const m = /^(.+)\.(jpg|jpeg|png|webp)$/i.exec(f); if (m) cache.set(m[1].toLowerCase(), f); } } catch (e) { /* no folder yet */ }
  return cache;
}
