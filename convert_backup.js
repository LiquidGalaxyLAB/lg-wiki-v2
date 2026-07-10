/**
 * convert_backup.js
 *
 * Converts backup_db.json (Appwrite export) into individual .md files + index.json
 * matching the format used by the Service Account Contribution Portal.
 * Also downloads all Appwrite-hosted images and rewrites URLs to local relative paths.
 *
 * Output layout:
 *   output/
 *   └── content/
 *       ├── index.json              ← { pages: [{ id, title, file }] }
 *       ├── <slug>.md               ← one file per active document (URLs rewritten)
 *       └── images/
 *           └── <imageID>.jpg       ← downloaded Appwrite images
 *
 * Usage:
 *   node convert_backup.js [path/to/backup_db.json]
 *   (defaults to ./backup_db.json if no arg given)
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKUP_PATH  = process.argv[2] || path.join(__dirname, 'backup_db.json');
const OUTPUT_DIR   = path.join(__dirname, 'output', 'content');
const IMAGES_DIR   = path.join(OUTPUT_DIR, 'images');

/** Appwrite image URL pattern — only these are downloaded */
const APPWRITE_IMG_REGEX = /https?:\/\/cloud\.appwrite\.io\/v1\/storage\/buckets\/([^/]+)\/files\/([^/]+)\/(preview|view)\?[^\s)"']*/g;

const MAX_RETRIES   = 3;
const RETRY_DELAY_MS = 1500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a title string to a URL-friendly slug used as the filename.
 * e.g. "Questions and Answers from Discord!" → "questions-and-answers-from-discord"
 */
function slugify(str) {
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // remove non-word chars (except hyphens)
    .replace(/[\s_]+/g, '-')    // spaces/underscores → hyphen
    .replace(/-+/g, '-')        // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');   // strip leading/trailing hyphens
}

/**
 * Ensures a slug is unique within the seen-set by appending -2, -3, … as needed.
 */
function uniqueSlug(base, seen) {
  if (!seen.has(base)) { seen.add(base); return base; }
  let i = 2;
  while (seen.has(`${base}-${i}`)) i++;
  const unique = `${base}-${i}`;
  seen.add(unique);
  return unique;
}

/**
 * Builds YAML frontmatter matching the format used by github.js submitPR().
 */
function buildFrontmatter(title, contributor, date) {
  const safeTitle       = title.replace(/:/g, '\\:');
  const safeContributor = contributor.replace(/:/g, '\\:');
  return `---\ntitle: ${safeTitle}\ncontributor: ${safeContributor}\ndate: ${date}\n---\n`;
}

/**
 * Sleep helper (for retry delays).
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Downloads a URL to a local file path.
 * Follows HTTP redirects (up to 5 hops).
 * Returns a Promise that resolves with the number of bytes written.
 */
function downloadFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'lg-wiki-migrator/1.0' } }, res => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        return resolve(downloadFile(res.headers.location, destPath, redirectsLeft - 1));
      }

      if (res.statusCode !== 200) {
        res.resume(); // drain body
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(file.bytesWritten)));
      file.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

/**
 * Downloads with retry (up to MAX_RETRIES attempts).
 * Returns true on success, false after all retries exhausted.
 */
async function downloadWithRetry(url, destPath, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const bytes = await downloadFile(url, destPath);
      return { ok: true, bytes };
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      if (isLast) {
        console.warn(`   ⚠️  [${label}] Failed after ${MAX_RETRIES} attempts: ${err.message}`);
        return { ok: false };
      }
      console.warn(`   ↩️  [${label}] Attempt ${attempt} failed (${err.message}), retrying in ${RETRY_DELAY_MS}ms…`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async function main() {
  // 1. Read & parse backup
  if (!fs.existsSync(BACKUP_PATH)) {
    console.error(`❌  Backup file not found: ${BACKUP_PATH}`);
    process.exit(1);
  }

  const raw    = fs.readFileSync(BACKUP_PATH, 'utf8');
  const backup = JSON.parse(raw);
  const docs   = backup.documents || [];

  console.log(`📂  Loaded ${docs.length} documents from backup.`);

  // 2. Filter to active only
  const active = docs.filter(d => d.status === 'active');
  console.log(`✅  ${active.length} active documents after filtering.\n`);

  // 3. Prepare output directories
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // ── Phase 1: Collect all unique Appwrite image URLs across all documents ────
  // Map of imageID → full URL (we need the URL to download the right query params)
  const imageURLMap = new Map(); // imageID → canonical URL

  for (const doc of active) {
    const markdown = doc.markdown || '';
    let m;
    APPWRITE_IMG_REGEX.lastIndex = 0; // reset regex state

    // Reset regex for fresh search
    const freshRegex = new RegExp(APPWRITE_IMG_REGEX.source, 'g');
    while ((m = freshRegex.exec(markdown)) !== null) {
      const fullUrl  = m[0].replace(/\/preview\?/, '/view?'); // always use /view endpoint
      const fileId   = m[2]; // capture group 2 is the fileId
      if (!imageURLMap.has(fileId)) {
        imageURLMap.set(fileId, fullUrl);
      }
    }

    // Also add imageIDs listed in the imageID array (in case not inline in markdown)
    // We reconstruct the URL from the inline URL's pattern since we need bucket+project IDs.
    // If they appear in the imageID array but not in markdown, we can't reconstruct the URL
    // without extra info — so we only download what we can find in markdown.
  }

  console.log(`🖼️   Found ${imageURLMap.size} unique Appwrite image(s) to process.\n`);

  // ── Phase 2: Download images ───────────────────────────────────────────────
  let dlOk = 0, dlSkipped = 0, dlFailed = 0;

  for (const [fileId, url] of imageURLMap) {
    const localFilename = `${fileId}.jpg`;
    const localPath     = path.join(IMAGES_DIR, localFilename);

    if (fs.existsSync(localPath)) {
      process.stdout.write(`   ⏭️  Skip (exists): ${localFilename}\n`);
      dlSkipped++;
      continue;
    }

    process.stdout.write(`   ⬇️  Downloading: ${localFilename} … `);
    const result = await downloadWithRetry(url, localPath, fileId);
    if (result.ok) {
      process.stdout.write(`done (${(result.bytes / 1024).toFixed(1)} KB)\n`);
      dlOk++;
    } else {
      dlFailed++;
    }
  }

  console.log(`\n   📊  Images: ${dlOk} downloaded, ${dlSkipped} skipped, ${dlFailed} failed\n`);

  // ── Phase 3: Generate .md files with rewritten image URLs ─────────────────
  const pages     = [];
  const seenSlugs = new Set();
  let   docSkipped = 0;

  for (const doc of active) {
    const title       = (doc.title || '').trim();
    let   markdown    = doc.markdown || '';
    const contributor = (doc.userName || doc.userID || 'Unknown').trim();
    const date        = doc.$createdAt || new Date().toISOString();

    if (!title) {
      console.warn(`⚠️  Skipping document $id=${doc.$id} — no title.`);
      docSkipped++;
      continue;
    }

    // Rewrite Appwrite image URLs → relative local path (images/<fileId>.jpg)
    markdown = markdown.replace(
      /https?:\/\/cloud\.appwrite\.io\/v1\/storage\/buckets\/[^/]+\/files\/([^/]+)\/(preview|view)\?[^\s)"']*/g,
      (_, fileId) => `images/${fileId}.jpg`
    );

    // Build unique slug and filename
    const slug     = uniqueSlug(slugify(title), seenSlugs);
    const filename = `${slug}.md`;
    const filePath = path.join(OUTPUT_DIR, filename);

    const frontmatter = buildFrontmatter(title, contributor, date);
    fs.writeFileSync(filePath, `${frontmatter}\n${markdown}\n`, 'utf8');

    pages.push({ id: slug, title, file: filename });
  }

  // ── Phase 4: Write index.json ──────────────────────────────────────────────
  const indexPath = path.join(OUTPUT_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify({ pages }, null, 2), 'utf8');

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`🎉  Done!`);
  console.log(`   📝  ${pages.length} .md files written (URLs rewritten)`);
  if (docSkipped) console.log(`   ⚠️   ${docSkipped} documents skipped (no title)`);
  console.log(`   🖼️   ${dlOk} images downloaded, ${dlSkipped} skipped, ${dlFailed} failed`);
  console.log(`   📋  index.json written with ${pages.length} entries`);
  console.log(`   📁  Output: ${OUTPUT_DIR}`);
})();
