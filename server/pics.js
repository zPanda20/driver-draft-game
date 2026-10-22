// Which driver and principal photos exist. Photos live in public/drivers/<slug>.(jpg|png|webp) and public/principals/<slug>.(jpg|png|webp), where slug is the person's name in lower case
// without accents or spaces (Sébastien Loeb -> sebastien-loeb). The catalogue tells every browser which drivers have a photo,
// so the page never asks for one that is missing. The folder is read when the server starts.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const slugOf = (name) => String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const caches = {};
function scan(folder) {
  if (caches[folder]) return caches[folder];
  const m = (caches[folder] = new Map());
  try { for (const f of fs.readdirSync(path.join(root, folder))) { const x = /^(.+)\.(jpg|jpeg|png|webp)$/i.exec(f); if (x) m.set(x[1].toLowerCase(), f); } } catch (e) { /* no folder yet */ }
  return m;
}
export const driverPics = () => scan("drivers");
export const principalPics = () => scan("principals");
