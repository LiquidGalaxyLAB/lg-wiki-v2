
# Liquid Galaxy Docs & Contribution Portal (v2)

Welcome to the **Liquid Galaxy Docs & Contribution Portal**-a modern, fast, and responsive Single-Page Application (SPA) designed to serve as the documentation hub for the Liquid Galaxy project. 

This portal functions both as a documentation viewer and as a seamless contribution bridge, enabling contributors to write, edit, and publish markdown documentation directly from the web browser by automatically staging pull requests via the GitHub API.

---

## 🚀 Key Features

- **Dynamic Content Fetching**: Retrieves and parses markdown documentation and index files in real time directly from the public [LiquidGalaxyLAB/lg-wiki-content](https://github.com/LiquidGalaxyLAB/lg-wiki-content) repository.
- **Modern Markdown Rendering**: Renders standard Markdown dynamically with inline copyable code snippets, custom table formatting, syntax highlighting (via `highlight.js`), and automated asset/image URL rewriting.
- **Streamlined Contribution Workflow**: Allows users to log in with a GitHub Personal Access Token (PAT) to submit new documents or update existing ones. The portal automatically handles:
  - Base64 encoding and uploading embedded local images/blobs.
  - Automatically renaming and referencing uploaded images in the markdown.
  - Registering the document inside the global `index.json` registry.
  - Creating a pull request (PR) to the core repository for review.
- **Premium User Experience & Aesthetics**:
  - Built with a custom Material-Design-inspired design system (`tokens.css`, `components.css`, `layout.css`).
  - Native dark/light mode toggle with `localStorage` persistence and FOUC (Flash of Unstyled Content) prevention.
  - Active-state navigation highlighting and smooth page transitions.
  - Interactive Table of Contents (TOC) with scroll-aware highlighting (Intersection Observer).
  - Browser-history-compatible hash navigation (`#file-name.md`).
- **MDN-Style Search**: Highly responsive client-side global search modal with keyboard shortcuts (`/` to open, `Escape` to close), arrow-key list traversal, and real-time result highlighting.
- **Built-in Utility Scripts**: Contains Node.js utilities for bulk content migrations, YAML frontmatter resolution, and heading adjustments.

---

## 🛠️ Architecture & Tech Stack

This portal is designed to be extremely lightweight, serverless, and easy to deploy:
- **Core Logic**: Pure HTML5 and client-side JavaScript (ES modules). No compilation or bundling required.
- **UI & Icons**: Google Material Web Components (`@material/web`) via CDN.
- **Markdown Parsing**: `marked` combined with `marked-highlight` and `highlight.js`.
- **API Integration**: GitHub REST API client via `Octokit` ESM package.
- **Hosting**: Serves statically from any standard web host, GitHub Pages, or locally.

---

## 🏃 Getting Started

### Prerequisites
- A modern web browser.
- (Optional) Node.js (only required to run utility scripts or local HTTP servers).

### Running Locally
Since the portal is a static SPA, it does not require a build step. You can run it locally using any static file server:

- **Using Node.js (`npx`):**
  ```bash
  npx serve .
  ```
- **Using Python:**
  ```bash
  python -m http.server 8000
  ```
- **Using VS Code:**
  Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension and click **Go Live**.

Once served, open `http://localhost:<port>` in your browser to view the portal.

---

## 📦 Project Structure

```text
├── index.html          # Main SPA entrypoint & viewport setup
├── app.js              # Core application logic, routing, TOC, and search
├── github.js           # GitHub API Octokit service wrapper for read/PR workflows
├── theme.js            # Light/Dark mode state management & toggle handlers
├── markdown-setup.js   # Marked parsing configuration & copy-button hooks
├── tokens.css          # Design system core design tokens (colors, variables, transitions)
├── layout.css          # Page scaffolding, sidebar responsive drawer, layout zones
├── components.css      # Styled atomic components (buttons, search dialog, TOC, badges)
├── LICENSE             # MIT License file
├── metadata.json       # App configuration metadata
├── convert_backup.js   # Utility: Migrates legacy Appwrite JSON exports to Markdown & assets
├── fix_headings.js     # Utility: Audits and fixes YAML frontmatter & missing headings in MD files
└── extract.js          # Developer utility script for log exports
```

---

## 🔧 Content Utility Scripts

If you are maintaining the repository or importing documentation in bulk, you can use the included Node.js scripts:

### 1. Migrating from Appwrite Backups (`convert_backup.js`)
If you have a legacy Appwrite backup database file (e.g., `backup_db.json`), you can convert all active entries into clean markdown files and automatically download all hosted assets locally:
```bash
node convert_backup.js [path/to/backup_db.json]
```
This will:
- Parse all `active` status documents.
- Download hosted Appwrite images and save them under `output/content/images/`.
- Rewrite markdown image source URLs to local relative paths.
- Generate a clean `index.json` registry file mapping all pages.

### 2. Auditing & Formatting Markdown Files (`fix_headings.js`)
To audit and resolve bulk formatting issues (such as invalid YAML frontmatter colon syntax or empty TOC lists due to missing markdown header symbols):
```bash
node fix_headings.js [path/to/content/dir]
```
This will:
- Check for unquoted title string colons in YAML headers (which break parses).
- Convert standalone bold patterns (e.g., `**Bold Title**`) into clean standard headings (`## Bold Title`).
- Inject a fallback `## Overview` heading if no section headings are found.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 Dev T Gadani and the Liquid Galaxy LAB community.
