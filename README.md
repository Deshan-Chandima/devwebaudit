# DevWebAudit — Web Performance, 6-Layer Security & Responsive Suite

A production-grade **Chrome Extension (Manifest V3)** and dual-engine architecture designed for web developers, QA engineers, and site owners. 

DevWebAudit provides **1-click Google Lighthouse audits (Desktop + Mobile)**, a **6-Layer Defensive Security Scanner with site-wide crawling and expandable Threat & Risk analysis**, and a **Live Multi-Device Responsive Matrix Studio**, generating token-optimized **AI-ready diagnostic reports (`.ai.md`, `.ai.json`, `.security.md`, `.security.json`)**.

---

## 🌟 Key Capabilities at a Glance

| Feature | Cloud Mode (Zero Setup) | Localhost In-Browser Mode | Local Engine (`start-server.bat`) |
| :--- | :---: | :---: | :---: |
| **Target Sites** | Live public websites (`https://*`) | Local development (`http://localhost:*`) | Both Public and Localhost |
| **Setup Required** | **None** (100% out of the box) | **None** (Audits live inside Chrome) | Node.js + Headless Chrome |
| **Performance Audits** | Google PageSpeed Insights Cloud API | Chrome Navigation Timing & DOM Probe | Chrome DevTools 1:1 Headless Runner |
| **Security Scanner** | 6-Layer Cloud Security Engine | 6-Layer In-Browser Security Probe | Full SSRF-Guarded Security Crawler |
| **Threat & Risk Guide** | Expandable Attack Scenarios & Fixes | Expandable Attack Scenarios & Fixes | Expandable Attack Scenarios & Fixes |
| **Responsive Studio** | 7 Live Device Viewports | 7 Live Device Viewports | 7 Live Device Viewports |

---

## ✨ Features Breakdown

### ⚡ 1. Dual Lighthouse Performance Audits
- **Dual Run (Desktop + Mobile)**: Runs Desktop (`1350×940`) and Mobile (`Moto G4 / 4G`) audits sequentially in one click.
- **Core Web Vitals**: Measures FCP (First Contentful Paint), LCP (Largest Contentful Paint), TBT (Total Blocking Time), CLS (Cumulative Layout Shift), Speed Index, and TTI (Time to Interactive).
- **Interactive Speedometer**: Semicircular score arc gauge with smooth pointer animations and color-coded status badges.
- **Smart Engine Routing**:
  - **Live Sites**: Automatically routes through the DevWebAudit Cloud Proxy on Vercel to bypass local ISP query limits.
  - **Localhost (`localhost:3000`, `localhost:5173`)**: Automatically audits directly inside your open Chrome tab using the In-Browser Native Engine with zero external dependencies.

### 🛡️ 2. 6-Layer Defensive Website Security Scanner
- **🔒 HTTP Security Headers**: Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), X-Frame-Options (Clickjacking), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy, and Cross-Origin-Opener-Policy (COOP).
- **🍪 Cookies & Session Flags**: Evaluates `HttpOnly`, `Secure`, `SameSite=Strict/Lax`, and cookie prefixes.
- **🔐 SSL/TLS & Transport Security**: Enforces HTTPS, validates modern TLS 1.2/1.3, tracks certificate expiry, and detects Mixed Content backdoors.
- **🕵️ Sensitive File & Secret Leaks**: Probes for exposed `/.env`, `/.git/HEAD`, `/package.json`, `/phpinfo.php`, `/wp-config.php.bak`, and production JavaScript Source Maps (`.js.map`).
- **📦 Client-Side, DOM & Script Vulnerabilities**: Flags known vulnerable libraries (jQuery, Lodash, Bootstrap, AngularJS, Moment.js), unpinned CDN scripts lacking Subresource Integrity (`integrity`), and reverse tabnabbing (`target="_blank"`).
- **🌐 CORS & Information Disclosure**: Catches permissive wildcard CORS (`Access-Control-Allow-Origin: *`) combined with credentials, and server version leakage.
- **⚠️ Expandable Threat & Risk Analysis**: Every detected vulnerability expands to reveal:
  - **Potential Threat & Risk**: The real-world attack scenario (e.g., account takeover, credential theft, clickjacking, defacement).
  - **Recommended Fix**: Concrete, copy-pasteable configuration and header syntax.
  - **Evidence**: Detected response headers or HTTP status proof.

### 📱 3. Live Multi-Device Responsive Matrix Studio
- **7 Viewports Tested Simultaneously**:
  - 📱 **Mobile Small**: iPhone SE (375 × 667 px)
  - 📱 **Mobile Standard**: iPhone 14 / 15 / 16 (390 × 844 px)
  - 📱 **Android Modern**: Google Pixel 7 / Galaxy S23 (412 × 915 px)
  - 📟 **Tablet Portrait**: iPad Mini (768 × 1024 px)
  - 📟 **Tablet Landscape**: iPad Pro 11" (1024 × 768 px)
  - 💻 **Laptop**: 13" MacBook Air (1280 × 800 px)
  - 🖥️ **Desktop**: Standard 1080p Desktop (1440 × 900 px)
- **Zero-Reload Breakpoint Strips**: Toggle individual device rows or mobile/tablet/desktop categories on the fly.
- **Orientation Flipping**: Instant Portrait ↔ Landscape rotation for any device or all devices together.
- **Automatic Iframe Unblocking**: Built-in declarative net request rules temporarily strip `X-Frame-Options` and `CSP frame-ancestors` exclusively within the Studio tab, allowing any website to render live.

### 🤖 4. AI-Ready Diagnostics & 1-Click Clipboard Prompts
- **Token-Efficient Reports**: Strips multi-megabyte trace bloat while preserving exact DOM selectors, failing code snippets, wasted milliseconds, and security issues.
- **📋 Copy AI Fix Prompt**: Copies a structured engineering prompt + Markdown diagnostic report to your clipboard, ready to paste into **ChatGPT, Claude, Cursor, or Antigravity** for instant code fixes.
- **Auto-Download**: Automatically exports `.ai.md`, `.ai.json`, `.security.md`, and `.security.json` upon audit completion.

---

## 📦 How to Install DevWebAudit

### Method 1: Install from Release ZIP (Recommended for End Users & Teammates)

1. Download the latest **`devwebaudit-v2.0.2-chrome-extension.zip`** from the [Releases](https://github.com/Deshan-Chandima/devwebaudit/releases) section or the `dist/` folder.
2. Right-click the `.zip` file and select **Extract All** (Unzip).
3. Open Google Chrome and enter `chrome://extensions` in the address bar.
4. Turn **ON** the **Developer mode** toggle in the top-right corner.
5. Click the **Load unpacked** button in the top-left corner.
6. Select the unzipped folder containing `manifest.json`.
7. Click the **🧩 Extensions** icon in your Chrome toolbar and **Pin** DevWebAudit for instant access.

> **Zero Configuration:** DevWebAudit connects automatically to the free DevWebAudit Cloud Engine (`https://sitelens-ai.vercel.app`). No servers, command lines, or API keys are required to audit public sites or localhost!

---

### Method 2: Developer Setup (From Source Code)

If you are developing or contributing to DevWebAudit:

```bash
# 1. Clone the repository
git clone https://github.com/Deshan-Chandima/devwebaudit.git
cd devwebaudit

# 2. Switch to development branch
git checkout dev

# 3. Install server dependencies (optional, for local engine)
cd server
npm install
cd ..

# 4. Load into Chrome
# Open chrome://extensions -> Enable Developer Mode -> Click "Load unpacked" -> Select the "extension" directory.
```

---

## 📖 Step-by-Step Usage Guide

### 1. Running Performance & Core Web Vitals Audits
1. Navigate to any website or web application in Chrome.
2. Click the **DevWebAudit** extension icon in your toolbar.
   - The current tab's URL is automatically detected and filled.
   - For live websites (e.g. `https://github.com`), the engine operates in **DevWebAudit Cloud** mode.
   - For localhost websites (e.g. `http://localhost:5173`), the extension activates **Localhost In-Browser Mode** automatically.
3. Select your desired device mode:
   - **Dual Run**: Audits both Desktop and Mobile sequentially (recommended).
   - **Desktop**: Fast desktop-only audit.
   - **Mobile**: Mobile audit with emulated viewport.
4. Click **Run Dual Lighthouse Audit**.
5. Once complete, inspect the speedometer score gauge, review Core Web Vitals metrics, and view high-impact performance optimization opportunities.

---

### 2. Running 6-Layer Security Scans & Viewing Threat Risks
1. Open the DevWebAudit popup and click the **Security** tab.
2. Choose your crawl scope:
   - **Full Site Crawl**: Discovers internal links and scans across multiple pages. Choose between **5**, **10 (default)**, or **25** pages.
   - **Quick Page Scan**: Fast single-page audit of headers, cookies, TLS, and DOM scripts.
3. Click **Run Deep Security Audit**.
4. Review the overall Security Grade (`A+` to `F`) and the 6 security layer cards.
5. Scroll down to the **Vulnerabilities & Fixes** section:
   - Click **any finding card** to expand it.
   - Review the **⚠️ Potential Threat & Risk** box to understand the exact attack scenario (what an attacker can do if this vulnerability is left unpatched).
   - Review the **🛠️ Recommended Fix** box for copy-pasteable server configuration or header rules.
6. Click **Copy AI Security Fix Prompt + Report** to have an AI assistant generate patches for your specific backend stack!

---

### 3. Using the Live Responsive Matrix Studio
1. Open the DevWebAudit popup and click the **Responsive** tab.
2. Click **Launch Live Responsive Studio**.
3. A full-screen testing matrix opens in a new tab rendering your active site across 7 viewports simultaneously:
   - **Live Navigation & Scrolling**: Click links or interact with forms—actions reflect across the viewports.
   - **Rotate Devices**: Click the **Rotate** button on any phone or tablet to test Landscape orientation.
   - **Scale Viewports**: Use the zoom selector (`Fit`, `50%`, `75%`, `100%`) to comfortably view all screens on a single laptop monitor.
   - **Toggle Categories**: Hide or show Mobile, Tablet, or Desktop rows using the header switches without reloading the page.

---

### 4. Running the Local Node.js Engine (Optional for Developers)
For local developers who require **100% Chrome DevTools Incognito 1:1 simulation** with applied packet throttling for local applications:

1. Double-click **`start-server.bat`** in the project root (or run `npm start` in the `server/` directory).
2. The local runner launches at `http://localhost:9876`.
3. In the DevWebAudit popup, click the top status pill (`DevWebAudit Cloud: Online`), enter `http://localhost:9876`, and click **Connect**.
4. The status turns to **`Local Engine: Online`**, using your computer's local headless Chrome for audits.

---

### 5. Adding a Free Google PageSpeed Insights API Key (Optional)
DevWebAudit connects through our Vercel cloud proxy, which handles public queries without requiring a personal API key. However, if you perform high-volume daily audits, you can attach a personal Google Cloud API key:

1. Click the top status pill in the extension popup.
2. Click **Get Free Key** (or visit the [Google PageSpeed Insights Get Key](https://developers.google.com/speed/docs/insights/v5/get-started) page).
3. Generate a free API key (25,000 queries per day, no credit card required).
4. Paste your key into the **Google PageSpeed API Key** field and click **Save**.

---

## 📁 Repository Structure

```text
Performane/
├── dist/                         # Packaged release zip archives
│   └── devwebaudit-v2.0.2-chrome-extension.zip
├── extension/                    # Chrome Extension (Manifest V3)
│   ├── manifest.json             # Extension manifest & permissions
│   ├── background.js             # MV3 Service worker (downloads, badges, DNR rules)
│   ├── popup.html                # Main UI (Lighthouse, Security, Responsive)
│   ├── popup.css                 # Sleek UI design, animations & expandable cards
│   ├── popup.js                  # Audit controller, in-browser engine & Vercel client
│   ├── icons.js                  # Vector Lucide icon registry
│   ├── responsive-matrix.html    # Live 7-viewport responsive studio
│   ├── responsive-matrix.css     # Responsive grid styling & breakpoint rows
│   ├── responsive-matrix.js      # Frame controller, scaling & rotation logic
│   └── icon*.png                 # Official Shield + Magnifier app icon suite
├── server/                       # Node.js Backend & Vercel Serverless Function
│   ├── package.json
│   ├── server.js                 # Express API (/api/health, /api/psi, /api/security-audit)
│   ├── security-scanner.js       # 6-Layer security engine with threat mapping
│   ├── ai-formatter.js           # Token-optimized Markdown report generator
│   ├── vercel.json               # Vercel serverless deployment config
│   ├── Dockerfile                # Container deployment file
│   └── api/
│       └── index.js              # Vercel serverless entry point
├── scripts/
│   └── package-extension.ps1     # Automated release packaging script
├── start-server.bat              # 1-click Windows launcher for local runner
├── STORE_LISTING.md              # Chrome Web Store copy, badges & promotional text
├── PRIVACY.md                    # Zero-data-retention privacy policy
└── README.md                     # Comprehensive setup and usage guide
```

---

## 🔒 Security & Privacy Policy

- **Zero Data Collection**: DevWebAudit does not track your browsing history, inject advertisements, collect analytics, or sell user data.
- **Transparent Execution**: Audits are performed either in your own browser, via public Google APIs, or on your own local server.
- **SSRF Protected**: The cloud backend prohibits requests to loopback, private RFC 1918 subnets, and cloud metadata addresses (`169.254.169.254`).
- Full details are available in [PRIVACY.md](file:///d:/Coding/Extention/Performane/PRIVACY.md).

---

## 📄 License

MIT License. Designed and engineered for developers, security professionals, and performance engineers.
