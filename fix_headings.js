/**
 * fix_headings.js
 *
 * Fixes two issues across all .md files in a wiki content directory:
 *
 * ISSUE 1 — YAML Frontmatter colon error:
 *   "mapping values are not allowed in this context at line 1 column 47"
 *   Caused by unquoted titles containing colons, e.g.:
 *     title: KML: its use          ← broken
 *     title: "KML: its use"        ← fixed
 *
 * ISSUE 2 — Missing headings (TOC is empty):
 *   a) Converts standalone **Bold Text** lines → ## headings
 *   b) If file still has no headings → inserts ## Overview after frontmatter
 *
 * Usage:
 *   node fix_headings.js [path/to/content/dir]
 *   (defaults to ./output/content if no arg given)
 */

const fs   = require('fs');
const path = require('path');

const CONTENT_DIR = process.argv[2] || path.join(__dirname, 'output', 'content');

// ─── YAML Fix ─────────────────────────────────────────────────────────────────

/**
 * Fixes frontmatter fields that contain an unquoted colon after the value start.
 * Only fixes `title:`, `contributor:`, `date:` fields.
 *
 * Before: title: KML: its use
 * After:  title: "KML: its use"
 */
function fixYamlColons(frontmatter) {
  let changed = false;
  const fixed = frontmatter.replace(
    /^(title|contributor|date):\s*(.+)$/mg,
    (match, key, value) => {
      value = value.trim();
      // Already quoted? Leave alone.
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        return match;
      }
      // Contains a colon not in a date/time pattern? Quote it.
      // Date pattern: 2024-03-18T09:36:09.721+00:00 — allow colons in time part
      const isDateField = key === 'date';
      if (!isDateField && value.includes(':')) {
        changed = true;
        // Escape any inner double quotes
        const escaped = value.replace(/"/g, '\\"');
        return `${key}: "${escaped}"`;
      }
      return match;
    }
  );
  return { frontmatter: fixed, changed };
}

// ─── Heading Fix ──────────────────────────────────────────────────────────────

/** Count real headings (## or ###) in a markdown body */
function countHeadings(body) {
  return (body.match(/^#{2,3}\s+.+/mg) || []).length;
}

/**
 * Converts standalone **Bold Text** lines → ## headings.
 * Skips content inside code blocks.
 */
function convertBoldFakeHeadings(body) {
  const lines = body.split('\n');
  let inCodeBlock = false;
  let changed = false;

  const result = lines.map(line => {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (inCodeBlock) return line;

    // Match a line that is ONLY **text** or **text:** — nothing else
    const boldMatch = line.match(/^\*\*([^*]+)\*\*:?\s*$/);
    if (boldMatch) {
      const headingText = boldMatch[1].trim();
      const words = headingText.split(/\s+/);
      // Only convert if it looks like a section title (1–8 words, no sentence endings)
      if (words.length >= 1 && words.length <= 8
          && !headingText.endsWith('.') && !headingText.endsWith('!')) {
        changed = true;
        return `## ${headingText}`;
      }
    }
    return line;
  });

  return { body: result.join('\n'), changed };
}

/**
 * Split frontmatter from body content.
 */
function splitFrontmatter(content) {
  if (!content.startsWith('---')) {
    return { frontmatter: '', body: content };
  }
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { frontmatter: '', body: content };
  }
  const frontmatter = content.slice(0, endIdx + 4);
  const body = content.slice(endIdx + 4);
  return { frontmatter, body };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error(`❌  Directory not found: ${CONTENT_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  console.log(`📂  Found ${files.length} .md files in ${CONTENT_DIR}\n`);

  let yamlFixed    = 0;
  let boldConverted = 0;
  let overviewAdded = 0;
  let alreadyGood  = 0;

  for (const filename of files) {
    const filePath = path.join(CONTENT_DIR, filename);
    const original = fs.readFileSync(filePath, 'utf8');

    let { frontmatter, body } = splitFrontmatter(original);
    let fileChanged = false;

    // ── Fix 1: YAML colon errors ──────────────────────────────────────────────
    const { frontmatter: fixedFm, changed: yamlChanged } = fixYamlColons(frontmatter);
    if (yamlChanged) {
      frontmatter = fixedFm;
      fileChanged = true;
      yamlFixed++;
      console.log(`   🔧  YAML fixed: ${filename}`);
    }

    // ── Fix 2: Headings ───────────────────────────────────────────────────────
    if (countHeadings(body) >= 2) {
      // Already has enough headings
      if (!fileChanged) alreadyGood++;
    } else {
      // Try converting standalone **Bold** lines first
      const { body: boldConverted_, changed: boldChanged } = convertBoldFakeHeadings(body);
      if (boldChanged) {
        body = boldConverted_;
        fileChanged = true;
        boldConverted++;
      }

      // If still no headings, insert ## Overview
      if (countHeadings(body) < 1) {
        body = `\n## Overview\n${body.trimStart()}`;
        fileChanged = true;
        overviewAdded++;
        console.log(`   ➕  Overview added: ${filename}`);
      } else if (boldChanged) {
        console.log(`   🔄  Bold→heading: ${filename}`);
      }
    }

    if (fileChanged) {
      fs.writeFileSync(filePath, frontmatter + body, 'utf8');
    }
  }

  console.log(`\n🎉  Done!`);
  console.log(`   🔧  YAML colon errors fixed:    ${yamlFixed}`);
  console.log(`   🔄  Bold text → ## heading:     ${boldConverted}`);
  console.log(`   ➕  ## Overview inserted:        ${overviewAdded}`);
  console.log(`   ✅  Already had good headings:   ${alreadyGood}`);
  console.log(`   📝  Total files modified:        ${yamlFixed + boldConverted + overviewAdded}`);
})();
