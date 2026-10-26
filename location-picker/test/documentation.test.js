const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../..");

function collectMarkdown(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectMarkdown(absolute));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files;
}

function markdownLinks(content) {
  const links = [];
  const pattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of content.matchAll(pattern)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }
    links.push(target);
  }
  return links;
}

function githubSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

function headingSlugs(content) {
  const result = new Set();
  const occurrences = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const base = githubSlug(match[2].replace(/\s+#+$/, ""));
    const count = occurrences.get(base) || 0;
    result.add(count === 0 ? base : `${base}-${count}`);
    occurrences.set(base, count + 1);
  }
  return result;
}

test("all Markdown links resolve inside the repository", () => {
  const failures = [];
  for (const document of collectMarkdown(repositoryRoot)) {
    const content = fs.readFileSync(document, "utf8");
    for (const link of markdownLinks(content)) {
      if (/^(?:https?:|mailto:)/i.test(link) || link.startsWith("#")) continue;
      const [rawPath, rawFragment] = link.split("#", 2);
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {
        failures.push(`${path.relative(repositoryRoot, document)}: invalid URL encoding in ${link}`);
        continue;
      }
      const target = path.resolve(path.dirname(document), decodedPath || path.basename(document));
      if (!fs.existsSync(target)) {
        failures.push(`${path.relative(repositoryRoot, document)}: missing ${link}`);
        continue;
      }
      if (rawFragment && fs.statSync(target).isFile() && target.endsWith(".md")) {
        const fragment = decodeURIComponent(rawFragment).toLowerCase();
        const slugs = headingSlugs(fs.readFileSync(target, "utf8"));
        if (!slugs.has(fragment)) {
          failures.push(`${path.relative(repositoryRoot, document)}: missing heading ${link}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test("every detailed guide links back to a repository home page", () => {
  const homePages = new Set([
    path.join(repositoryRoot, "README.md"),
    path.join(repositoryRoot, "README.en.md"),
  ]);
  const documents = collectMarkdown(repositoryRoot).filter((file) => !homePages.has(file));
  for (const document of documents) {
    const content = fs.readFileSync(document, "utf8");
    const resolved = markdownLinks(content)
      .filter((link) => !/^(?:https?:|mailto:|#)/i.test(link))
      .map((link) => path.resolve(path.dirname(document), decodeURIComponent(link.split("#", 1)[0])));
    assert.ok(
      resolved.some((target) => homePages.has(target)),
      `${path.relative(repositoryRoot, document)} has no link back to README`,
    );
  }
});

test("published client files use the current GitHub repository", () => {
  const deprecatedOwner = ["mekos", "2772"].join("");
  const files = [
    "README.md",
    "README.en.md",
    "使用教程.md",
    "使用教程.en.md",
    "COOLIFY.md",
    "ios-location-spoofer.sgmodule",
    "ios-location-spoofer-surge.sgmodule",
    "ios-location-spoofer.lnplugin",
    "ios-location-spoofer.snippet",
    "ios-location-spoofer.stoverride",
    "location-picker/cloudflare-webui/README.md",
    "location-picker/worker/README.md",
  ];
  for (const relative of files) {
    const content = fs.readFileSync(path.join(repositoryRoot, relative), "utf8");
    assert.doesNotMatch(content, new RegExp(deprecatedOwner, "i"), `${relative} contains the retired owner`);
  }

  for (const relative of files.filter((file) => /^ios-location-spoofer\./.test(file))) {
    const content = fs.readFileSync(path.join(repositoryRoot, relative), "utf8");
    assert.match(content, /github(?:usercontent)?\.com\/GUSHU101\/ios-location-spoofer/);
  }
});
