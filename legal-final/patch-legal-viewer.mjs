import fs from "fs";

const termsMd = fs
  .readFileSync(new URL("./_out-terms.md", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const privacyMd = fs
  .readFileSync(new URL("./_out-privacy.md", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

const path = "C:/Users/Anil/ABIDE-APP/frontend/app/legal-viewer.tsx";
const src = fs.readFileSync(path, "utf8");

function toTemplateLiteral(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

const replacement =
  "const TERMS_BODY = `" +
  toTemplateLiteral(termsMd) +
  "`;\n\nconst PRIVACY_BODY = `" +
  toTemplateLiteral(privacyMd) +
  "`;";

const next = src.replace(
  /const TERMS_BODY = `[\s\S]*?`;\r?\n\r?\nconst PRIVACY_BODY = `[\s\S]*?`;/,
  replacement,
);

if (next === src) {
  console.error("REPLACE FAILED");
  process.exit(1);
}

fs.writeFileSync(path, next);
console.log("patched", path);
console.log("November 24:", next.includes("November 24, 2026"));
console.log("placeholder gone:", !next.includes("fill in before publishing"));
console.log("has Provider table:", next.includes("| Provider | Purpose |"));
