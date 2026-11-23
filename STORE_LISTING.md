# Public Release & Store Submission Guide — DevWebAudit v2.0.2

Everything you need to host the optional Security API for **\$0/month** and publish **DevWebAudit** to the **Chrome Web Store**, **Microsoft Edge Add-ons (\$0)**, and **GitHub Releases (\$0)**.

---

## 1. Package the Extension Zip (1-Click)

Run this PowerShell command from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-extension.ps1
```

This creates a clean, store-ready package at:
```text
dist/devwebaudit-v2.0.2-chrome-extension.zip
```
*(Automatically excludes Chrome's `_metadata/` folder and OS junk files.)*

---

## 2. Optional: Deploy the Free Cloud Security API (\$0/month on Render)

> Note: Even **without** any server, SiteLens AI already works 100% for public websites using **Google PageSpeed Insights** (Lighthouse), **Browser Security Fallback**, and the client-side **Multi-Device Responsive Studio**! Deploying Render simply adds deep server-side TLS/cipher & header inspection for public users.

1. Push your latest `main` branch to GitHub.
2. Go to **https://dashboard.render.com/blueprints** → **New Blueprint Instance**.
3. Connect `Deshan-Chandima/sitelens-ai` — Render will automatically detect `render.yaml` with:
   - `PUBLIC_CLOUD_MODE=true` (enables **SSRF protection** blocking localhost/private IPs & **15 req/min rate limiting**)
   - `DISABLE_LOCAL_LIGHTHOUSE=true` (keeps RAM under 100MB so Render Free Tier never crashes; extension automatically uses Google PSI for Lighthouse!)
4. Once live (e.g., `https://sitelens-ai-api.onrender.com`), you can:
   - Enter it inside the extension popup by clicking the top-right **Server Status Pill**, OR
   - Set `DEFAULT_SERVER_URL = 'https://sitelens-ai-api.onrender.com'` in `extension/popup.js` before zipping for the store!

---

## 3. Chrome Web Store & Microsoft Edge Add-ons Listing Copy

### Store Title
`DevWebAudit — Speed, Security & Responsive Suite`

### Short Summary (132 chars max)
`Audit Lighthouse speed (Desktop+Mobile), 6-layer website security, and live multi-device responsive layouts in one click.`

### Category
`Developer Tools`

### Privacy Policy URL
Link directly to your GitHub file (or GitHub Pages):
`https://github.com/Deshan-Chandima/sitelens-ai/blob/main/PRIVACY.md`

### Single Purpose Description (Required by Chrome Web Store)
> DevWebAudit is a unified web developer auditing tool that inspects a user-selected website's Lighthouse performance/SEO scores, defensive HTTP/DOM security posture, and multi-device responsive layouts, generating AI-ready diagnostic reports.

### Permission Justifications (Copy & Paste into Chrome Web Store Dashboard)

* **`activeTab`:** Used only when the user opens the extension popup or clicks "Active Tab" to read the current tab's URL for auditing or responsive previewing.
* **`tabs`:** Used to launch the fullscreen Multi-Device Live Responsive Studio tab (`responsive-matrix.html`) and automatically clean up tab-scoped DNR session rules when that Studio tab closes.
* **`storage`:** Stores user preferences (selected audit categories, throttling calibration mode, custom responsive device presets, engine URL, and latest audit summary) locally on the user's machine.
* **`downloads`:** Saves user-requested audit reports (`.ai.md`, `.ai.json`, `.security.md`, `.security.json`, `.html`) to the local Downloads folder.
* **`clipboardWrite`:** Copies formatted AI diagnostic prompts and audit reports to the clipboard only when the user clicks a "Copy" action button.
* **`declarativeNetRequest`:** Creates a temporary, **tab-scoped session rule** (`tabIds: [studioTabId]`) strictly for the active Responsive Studio tab so preview iframes can render websites that send `X-Frame-Options` or `frame-ancestors` headers. The rule never applies to normal browsing tabs and is immediately deleted when the Studio tab is closed.
* **Host Permissions (`<all_urls>`):** Required so developers can audit and preview any website or local development server they choose to inspect via browser fallback scans and the Responsive Studio tab.

### Remote Code Declaration
> **No remote code is used.** All HTML, CSS, JavaScript, and SVG icons are bundled directly inside the extension package.

---

## 4. Publishing Checklist

1. **Microsoft Edge Add-ons (\$0 Free):**  
   Go to https://partner.microsoft.com/dashboard/microsoftedge → Upload `dist/sitelens-ai-v2.0.0-chrome-extension.zip` → Paste copy above → Submit.
2. **Chrome Web Store (\$5 one-time fee):**  
   Go to https://chrome.google.com/webstore/devconsole → Register (\$5) → Upload `dist/sitelens-ai-v2.0.0-chrome-extension.zip` → Upload 1280×800 screenshots of the Popup (Lighthouse, Security, Responsive tabs) and Fullscreen Studio → Paste Privacy Policy & Permission Justifications → Submit for review (typically 2–5 days).
3. **GitHub Releases (\$0 Free):**  
   Attach `dist/sitelens-ai-v2.0.0-chrome-extension.zip` to your `v2.0.0` GitHub Release so developers can also install it directly.
