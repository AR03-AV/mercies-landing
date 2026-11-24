/**
 * One-off: convert final-*.txt → HTML main bodies + markdown for the app.
 * Run: node legal-final/convert-legal.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const SUBHEADINGS = new Set([
  "Reply Service",
  "Safety Screening",
  "Report This Reply",
  "Support Emails",
  "Scripture Texts",
  "Canada",
  "India",
  "European Union / United Kingdom (GDPR)",
  "United States",
  "Australia",
  "United Arab Emirates",
]);

const SECTION_RE = /^\d+\.\s+.+$/;
const BULLET_RE = /^•\s+(.*)$/;

/** Explicit lead-ins from the final legal text (bold label + rest of paragraph). */
const LEADINS = [
  "Moderation.",
  "Groups.",
  "Blocking.",
  "Not a crisis service.",
  "Severability.",
  "Entire agreement.",
  "No waiver.",
  "Assignment.",
  "Account Information.",
  "Content You Create.",
  "Device and Reminder Information.",
  "Payment Information.",
  "Usage Information.",
  "What is sent.",
  "What is not sent:",
  "Consent.",
  "Exporting your data.",
  "A note on sensitive information.",
  "Backups.",
];

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function splitLeadIn(line) {
  for (const lead of LEADINS) {
    if (line.startsWith(lead + " ")) {
      return [lead, line.slice(lead.length + 1)];
    }
  }
  return null;
}

function boldLeadInHtml(line) {
  const parts = splitLeadIn(line);
  if (!parts) return escapeHtml(line);
  return `<strong>${escapeHtml(parts[0])}</strong> ${escapeHtml(parts[1])}`;
}

function boldLeadInMd(line) {
  const parts = splitLeadIn(line);
  if (!parts) return line;
  return `**${parts[0]}** ${parts[1]}`;
}

function parseLines(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  // Drop title + date
  return lines.slice(2).filter((l, i, arr) => !(l === "" && (i === 0 || arr[i - 1] === "")));
}

function tokenize(lines) {
  const tokens = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Provider table: Provider / Purpose then pairs
    if (line === "Provider" && lines[i + 1] === "Purpose") {
      const rows = [];
      i += 2;
      while (i + 1 < lines.length) {
        const a = lines[i];
        const b = lines[i + 1];
        if (!a || !b || SECTION_RE.test(a) || SUBHEADINGS.has(a) || BULLET_RE.test(a)) break;
        // Stop if next looks like prose (long line without a following "purpose" style)
        if (a.length > 80) break;
        rows.push([a, b]);
        i += 2;
      }
      tokens.push({ type: "table", rows });
      continue;
    }

    if (SECTION_RE.test(line)) {
      tokens.push({ type: "h2", text: line });
      i += 1;
      continue;
    }

    if (SUBHEADINGS.has(line)) {
      tokens.push({ type: "h3", text: line });
      i += 1;
      continue;
    }

    if (BULLET_RE.test(line)) {
      const items = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].replace(BULLET_RE, "$1"));
        i += 1;
      }
      tokens.push({ type: "ul", items });
      continue;
    }

    tokens.push({ type: "p", text: line });
    i += 1;
  }
  return tokens;
}

function toHtml(tokens) {
  const parts = [
    `<p class="updated"><strong>Last updated: November 24, 2026</strong></p>`,
    ``,
  ];
  let firstProse = true;
  for (const t of tokens) {
    if (t.type === "h2") {
      if (firstProse) {
        parts.push(`<hr />`);
        parts.push(``);
        firstProse = false;
      }
      parts.push(`<h2>${escapeHtml(t.text)}</h2>`);
      parts.push(``);
    } else if (t.type === "h3") {
      parts.push(`<h3>${escapeHtml(t.text)}</h3>`);
      parts.push(``);
    } else if (t.type === "ul") {
      parts.push(`<ul>`);
      for (const item of t.items) {
        parts.push(`  <li>${escapeHtml(item)}</li>`);
      }
      parts.push(`</ul>`);
      parts.push(``);
    } else if (t.type === "table") {
      parts.push(`<table>`);
      parts.push(`  <thead><tr><th>Provider</th><th>Purpose</th></tr></thead>`);
      parts.push(`  <tbody>`);
      for (const [prov, purpose] of t.rows) {
        parts.push(
          `    <tr><td>${escapeHtml(prov)}</td><td>${escapeHtml(purpose)}</td></tr>`,
        );
      }
      parts.push(`  </tbody>`);
      parts.push(`</table>`);
      parts.push(``);
    } else if (t.type === "p") {
      firstProse = false;
      // Contact email alone → strong
      if (t.text === "help@support.merciesapp.com" || t.text.startsWith("Questions about these Terms? Contact us at:")) {
        if (t.text.startsWith("Questions about")) {
          parts.push(`<p>${escapeHtml(t.text)}</p>`);
        } else {
          parts.push(`<p><strong>${escapeHtml(t.text)}</strong></p>`);
        }
      } else if (t.text.startsWith("If you have questions about this Privacy Policy")) {
        parts.push(`<p>${escapeHtml(t.text)}</p>`);
      } else if (t.text === "Mercies") {
        parts.push(`<p>${escapeHtml(t.text)}</p>`);
      } else {
        // Wrap paragraphs properly — existing pages sometimes left bare text; use <p>
        parts.push(`<p>${boldLeadInHtml(t.text)}</p>`);
      }
      parts.push(``);
    }
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function toMarkdown(tokens) {
  const parts = [`**Last updated: November 24, 2026**`, ``];
  for (const t of tokens) {
    if (t.type === "h2") {
      parts.push(`---`);
      parts.push(``);
      parts.push(`## ${t.text}`);
      parts.push(``);
    } else if (t.type === "h3") {
      parts.push(`### ${t.text}`);
      parts.push(``);
    } else if (t.type === "ul") {
      for (const item of t.items) {
        parts.push(`- ${item}`);
      }
      parts.push(``);
    } else if (t.type === "table") {
      parts.push(`| Provider | Purpose |`);
      parts.push(`| --- | --- |`);
      for (const [prov, purpose] of t.rows) {
        parts.push(`| ${prov} | ${purpose} |`);
      }
      parts.push(``);
    } else if (t.type === "p") {
      if (t.text === "help@support.merciesapp.com") {
        parts.push(`**${t.text}**`);
      } else {
        parts.push(boldLeadInMd(t.text));
      }
      parts.push(``);
    }
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function replaceMain(htmlPath, mainInner) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const next = html.replace(
    /<main>[\s\S]*?<\/main>/,
    `<main>\n${mainInner}</main>`,
  );
  if (next === html) throw new Error(`Could not find <main> in ${htmlPath}`);
  // Also update Last updated if somehow outside — already in main
  fs.writeFileSync(htmlPath, next, "utf8");
}

function main() {
  const termsRaw = fs.readFileSync(path.join(__dirname, "final-terms.txt"), "utf8");
  const privacyRaw = fs.readFileSync(
    path.join(__dirname, "final-privacy.txt"),
    "utf8",
  );

  const termsTokens = tokenize(parseLines(termsRaw));
  const privacyTokens = tokenize(parseLines(privacyRaw));

  const termsHtml = toHtml(termsTokens);
  const privacyHtml = toHtml(privacyTokens);
  const termsMd = toMarkdown(termsTokens);
  const privacyMd = toMarkdown(privacyTokens);

  fs.writeFileSync(path.join(__dirname, "_out-terms-main.html"), termsHtml);
  fs.writeFileSync(path.join(__dirname, "_out-privacy-main.html"), privacyHtml);
  fs.writeFileSync(path.join(__dirname, "_out-terms.md"), termsMd);
  fs.writeFileSync(path.join(__dirname, "_out-privacy.md"), privacyMd);

  for (const f of ["terms/index.html", "mercies-terms.html"]) {
    replaceMain(path.join(root, f), termsHtml);
  }
  for (const f of ["privacy/index.html", "mercies-privacy.html"]) {
    replaceMain(path.join(root, f), privacyHtml);
  }

  // Write app legal-viewer bodies helper
  fs.writeFileSync(
    path.join(__dirname, "_out-legal-viewer-snippet.txt"),
    JSON.stringify({ TERMS_BODY: termsMd, PRIVACY_BODY: privacyMd }),
  );

  console.log("OK: wrote HTML into 4 files + _out-*.md/html");
}

main();
