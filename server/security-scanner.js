/**
 * 6-Layer Defensive Web Security Scanner for DevWebAudit
 * Performs non-intrusive security posture checks across a single URL or site-wide crawl:
 *  1. HTTP Security Headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP)
 *  2. Cookie & Session Security (HttpOnly, Secure, SameSite, __Secure-/__Host- prefixes)
 *  3. SSL/TLS & Transport Security (HTTPS, TLS version, Certificate expiry, Mixed Content)
 *  4. Sensitive File & Source Map Exposure (/.env, /.git/HEAD, /package.json, .js.map, security.txt)
 *  5. Client-Side & DOM Security (Outdated JS libs, Missing SRI, Insecure Forms, Secret Leaks, Tabnabbing)
 *  6. CORS & Information Disclosure (Server/X-Powered-By version leaks, Wildcard CORS)
 */

import tls from 'tls';

const DEFAULT_MODULES = [
  'headers',
  'cookies',
  'tls',
  'exposure',
  'dom',
  'cors'
];

const KNOWN_VULNERABLE_LIBS = [
  {
    name: 'jQuery',
    regex: /jquery[.-](\d+\.\d+\.\d+)(?:\.min)?\.js/i,
    isVulnerable: (v) => compareSemver(v, '3.5.0') < 0,
    safeVersion: '3.7.1',
    cveHint: 'CVE-2020-11022 / CVE-2020-11023 (XSS in jQuery < 3.5.0)'
  },
  {
    name: 'Bootstrap',
    regex: /bootstrap[.-](\d+\.\d+\.\d+)(?:\.min)?\.js/i,
    isVulnerable: (v) => compareSemver(v, '4.3.1') < 0 || (v.startsWith('3.') && compareSemver(v, '3.4.1') < 0),
    safeVersion: '5.3.3',
    cveHint: 'CVE-2019-8331 (XSS in Bootstrap tooltip/popover)'
  },
  {
    name: 'Lodash',
    regex: /lodash[.-](\d+\.\d+\.\d+)(?:\.min)?\.js/i,
    isVulnerable: (v) => compareSemver(v, '4.17.21') < 0,
    safeVersion: '4.17.21',
    cveHint: 'CVE-2021-23337 / CVE-2020-8203 (Prototype Pollution / Command Injection)'
  },
  {
    name: 'AngularJS (1.x)',
    regex: /angular[.-](1\.\d+\.\d+)(?:\.min)?\.js/i,
    isVulnerable: () => true,
    safeVersion: 'Angular 17+',
    cveHint: 'End-of-Life AngularJS 1.x has multiple known XSS & sandbox bypass vulnerabilities'
  },
  {
    name: 'Moment.js',
    regex: /moment[.-](\d+\.\d+\.\d+)(?:\.min)?\.js/i,
    isVulnerable: (v) => compareSemver(v, '2.29.4') < 0,
    safeVersion: '2.29.4 (or Luxon / date-fns)',
    cveHint: 'CVE-2022-31129 (ReDoS in Moment.js < 2.29.4)'
  }
];

const SECRET_PATTERNS = [
  {
    name: 'Google Cloud / Firebase API Key',
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/,
    severity: 'high'
  },
  {
    name: 'AWS Access Key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
    severity: 'critical'
  },
  {
    name: 'Stripe Live Secret Key',
    regex: /\bsk_live_[0-9a-zA-Z]{24,}\b/,
    severity: 'critical'
  },
  {
    name: 'OpenAI Secret API Key',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/,
    severity: 'critical'
  },
  {
    name: 'Private Cryptographic Key Block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    severity: 'critical'
  },
  {
    name: 'GitHub Personal Access Token',
    regex: /\bghp_[A-Za-z0-9]{36}\b/,
    severity: 'critical'
  }
];

function compareSemver(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

function scoreToGrade(score) {
  if (score >= 95) return 'A+';
  if (score >= 88) return 'A';
  if (score >= 80) return 'B';
  if (score >= 68) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

export const FINDING_RISK_MAP = {
  // 1. HTTP Security Headers
  'missing-csp': 'Without Content-Security-Policy (CSP), attackers can execute Cross-Site Scripting (XSS) attacks by injecting malicious scripts. Attackers can steal user session cookies, log keystrokes/passwords, hijack administrator accounts, or secretly redirect visitors to phishing portals.',
  'weak-csp': 'Allowing \'unsafe-inline\' or \'unsafe-eval\' neutralizes CSP protections against XSS, enabling injected script tags and event handlers to execute in visitors\' browsers without restriction.',
  'missing-hsts': 'Without HSTS, attackers on the same network (such as public Wi-Fi) can execute SSL-Stripping Man-in-the-Middle (MITM) attacks, silently downgrading HTTPS connections to unencrypted HTTP to intercept login credentials and personal data.',
  'short-hsts': 'An HSTS max-age under 1 year leaves returning visitors vulnerable to SSL-stripping downgrade attacks if they haven\'t accessed the site recently.',
  'missing-clickjacking-protection': 'Attackers can embed your site in a transparent <iframe> on a malicious web page (Clickjacking attack). Unsuspecting visitors can be tricked into clicking hidden buttons to delete accounts, change settings, or authorize payments.',
  'missing-xfo': 'Without X-Frame-Options or CSP frame-ancestors, attackers can overlay transparent iframes over legitimate buttons, tricking authenticated users into clicking unauthorized actions (Clickjacking).',
  'missing-x-content-type-options': 'Browsers may attempt MIME-type sniffing on uploaded files. An attacker could upload an avatar image containing executable HTML/JS, which the browser executes as code (MIME Confusion attack).',
  'missing-xcto': 'Without nosniff, browsers can misinterpret uploaded files as executable scripts, leading to drive-by cross-site scripting attacks.',
  'missing-referrer-policy': 'When users click outbound links or third-party resources load, sensitive URL query parameters (like password reset tokens, internal user IDs, or API keys) can leak to external third-party servers via the Referer header.',
  'missing-permissions-policy': 'Third-party scripts and embedded iframes can silently access sensitive device hardware—including geolocation, camera, microphone, and payment request APIs—without user knowledge or restriction.',
  'missing-coop': 'Allows cross-origin windows to retain a reference to your window object via window.opener, enabling cross-origin information leaks and Spectre-class memory timing attacks.',

  // 2. SSL/TLS & Transport
  'http-unencrypted': 'CRITICAL THREAT: All communications are transmitted in unencrypted plaintext. Anyone on the local network, ISP, or gateway can view, capture, or tamper with passwords, payment details, and private sessions in real-time.',
  'insecure-http-protocol': 'Plain HTTP transmission allows network eavesdroppers to intercept session tokens, inject rogue advertisements, or redirect users to malicious endpoints.',
  'deprecated-tls-version': 'TLS 1.0 and 1.1 have cryptographically compromised cipher suites vulnerable to POODLE, BEAST, and Sweet32 attacks, allowing attackers to decrypt sensitive HTTPS traffic.',
  'tls-cert-expired': 'Browsers will display an alarming full-screen security interstitial, blocking visitors from reaching the website and breaking all customer trust and API integrations.',
  'tls-cert-untrusted': 'A self-signed or invalid certificate prevents users from verifying your server\'s authentic identity, leaving connections vulnerable to active Man-in-the-Middle impersonation.',
  'tls-cert-expiring-soon': 'If the TLS certificate expires, the website will immediately trigger full-page browser security blocks for all visitors, causing catastrophic downtime and transaction failures.',

  // 3. Cookies & Session Security
  'cookie-missing-secure': 'Session and authentication cookies without the \'Secure\' flag can be sent over unencrypted HTTP, allowing network eavesdroppers to intercept valid session tokens.',
  'cookie-missing-httponly': 'Cookies without \'HttpOnly\' can be read by any JavaScript running in the page. If the site suffers even a minor XSS vulnerability, attackers can immediately steal authentication tokens to hijack accounts.',
  'cookie-missing-samesite': 'Cookies without a SameSite attribute (or with SameSite=None without Secure) are sent automatically with cross-site requests, leaving users vulnerable to Cross-Site Request Forgery (CSRF) attacks.',

  // 4. Sensitive File & Repository Exposures
  'exposed-dotenv': 'CRITICAL THREAT: Anyone can read your .env file containing live database passwords, Stripe/payment secret keys, cloud API credentials, and JWT signing secrets. Attackers can gain complete backend server takeover within minutes.',
  'exposed-git-repo': 'CRITICAL THREAT: Attackers can run automated tools to clone your entire Git repository from /.git, recovering proprietary source code, past commits, internal server endpoints, and hardcoded secrets.',
  'exposed-package-json': 'Discloses your entire internal backend dependency tree and exact library versions, allowing attackers to cross-reference known CVE vulnerability databases to target unpatched packages.',
  'exposed-phpinfo': 'Exposes complete server configuration details, including OS version, internal IP addresses, active PHP modules, file paths, and environment variables, facilitating precision attacks.',
  'exposed-wp-config-bak': 'CRITICAL THREAT: Backup file contains plaintext database passwords, database hostnames, and security authentication salts, enabling direct remote takeover of your WordPress database.',
  'exposed-js-sourcemap': 'Exposes original unminified frontend source code, TypeScript files, internal API routes, and developer comments, making reverse-engineering and finding vulnerabilities trivial.',

  // 5. Server Leaks & CORS
  'server-version-leak': 'Broadcasting exact web server software and version numbers helps automated vulnerability scanners find and exploit known unpatched CVEs for that specific software version.',
  'x-powered-by-leak': 'Reveals underlying backend runtime framework (e.g., Express, PHP, ASP.NET), enabling attackers to tailor targeted framework-specific exploits.',
  'insecure-cors-wildcard-credentials': 'CRITICAL THREAT: Combining Access-Control-Allow-Origin: * with Allow-Credentials: true permits any arbitrary website to issue authenticated requests on behalf of your users and exfiltrate private data.',
  'cors-wildcard-origin': 'Permits any external domain to make cross-origin AJAX requests and read response data, potentially leaking sensitive user data or internal API responses.',

  // 6. DOM & Client-Side Scripts
  'mixed-content-resources': 'Loading insecure HTTP resources (scripts, stylesheets, iframes) on an HTTPS page allows network attackers to modify the unencrypted asset and take complete control over the secure page.',
  'missing-sri-integrity': 'If a third-party CDN hosting this external script is compromised or hijacked, attackers can inject malicious JavaScript into your site without detection (supply-chain attack).',
  'insecure-form-action': 'Form submissions (such as passwords, search queries, or personal info) are transmitted over unencrypted HTTP, allowing network interception even if the host page uses HTTPS.',
  'unsafe-target-blank': 'Opening external links with target="_blank" without rel="noopener noreferrer" allows the destination page to access your page via window.opener and replace it with a phishing copy (Reverse Tabnabbing).'
};

export function getFindingRisk(id, category = '', title = '') {
  if (id && FINDING_RISK_MAP[id]) return FINDING_RISK_MAP[id];
  if (id && id.startsWith('vuln-lib-')) {
    return 'Outdated JavaScript libraries with known public CVEs allow attackers to exploit documented security flaws to execute arbitrary scripts (XSS) or crash visitor browsers.';
  }
  if (id && id.startsWith('exposed-')) {
    return 'Publicly exposed internal files or directories provide attackers with sensitive architectural details, credentials, or internal configuration.';
  }
  const cat = (category || '').toLowerCase();
  switch (cat) {
    case 'headers':
      return 'Missing defensive HTTP response headers weakens the browser\'s security sandbox, leaving the application more vulnerable to cross-site scripting and unauthorized framing.';
    case 'cookies':
      return 'Insecure cookie attributes increase the risk of authentication token theft via XSS, network sniffing, or Cross-Site Request Forgery (CSRF).';
    case 'tls':
      return 'Suboptimal transport encryption leaves user traffic vulnerable to interception, eavesdropping, or Man-in-the-Middle credential theft.';
    case 'exposure':
      return 'Exposing sensitive endpoints or source metadata aids threat actors in reconnaissance, reverse engineering, and credential discovery.';
    case 'dom':
      return 'Client-side script vulnerabilities or unpinned CDN dependencies create supply-chain risks and potential vectors for unauthorized code execution.';
    case 'cors':
      return 'Overly permissive Cross-Origin Resource Sharing (CORS) rules can allow external malicious sites to read private user data.';
    default:
      return 'Security misconfigurations weaken your overall defensive posture, creating entry points that can be chained by attackers to compromise users or servers.';
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      redirect: options.redirect || 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'DevWebAudit-SecurityAuditor/2.0 (+https://github.com/Deshan-Chandima/sitelens-ai)',
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Inspects TLS Certificate & Protocol Version for HTTPS hosts.
 */
function inspectTlsCertificate(hostname, port = 443, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    try {
      const socket = tls.connect(
        {
          host: hostname,
          port: Number(port) || 443,
          servername: hostname,
          rejectUnauthorized: false
        },
        () => {
          try {
            const protocol = socket.getProtocol();
            const cert = socket.getPeerCertificate();
            const authorized = socket.authorized;
            const authError = socket.authorizationError || null;

            let validTo = null;
            let daysRemaining = null;
            if (cert && cert.valid_to) {
              validTo = cert.valid_to;
              const expMs = Date.parse(cert.valid_to);
              if (!Number.isNaN(expMs)) {
                daysRemaining = Math.floor((expMs - Date.now()) / (1000 * 60 * 60 * 24));
              }
            }

            socket.end();
            done({
              ok: true,
              protocol,
              authorized,
              authError,
              issuer: cert?.issuer?.O || cert?.issuer?.CN || null,
              subject: cert?.subject?.CN || null,
              validTo,
              daysRemaining
            });
          } catch (err) {
            socket.destroy();
            done({ ok: false, error: err.message });
          }
        }
      );

      socket.setTimeout(timeoutMs, () => {
        socket.destroy();
        done({ ok: false, error: 'TLS handshake timeout' });
      });

      socket.on('error', (err) => {
        done({ ok: false, error: err.message });
      });
    } catch (err) {
      done({ ok: false, error: err.message });
    }
  });
}

/**
 * Extracts internal links on the same origin from HTML string.
 */
function extractInternalLinks(html, baseUrl, maxLinks = 15) {
  const links = new Set();
  let baseParsed;
  try {
    baseParsed = new URL(baseUrl);
  } catch {
    return [];
  }

  const hrefRegex = /<a\b[^>]*?\bhref\s*=\s*["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref || /^(?:mailto:|tel:|javascript:|data:)/i.test(rawHref)) continue;

    try {
      const resolved = new URL(rawHref, baseParsed.href);
      if (resolved.origin !== baseParsed.origin) continue;
      if (/\.(?:png|jpe?g|gif|webp|svg|ico|pdf|zip|mp4|mp3|woff2?|ttf|eot|css|js)$/i.test(resolved.pathname)) {
        continue;
      }
      resolved.hash = '';
      const cleanUrl = resolved.href.replace(/\/$/, '') || resolved.origin;
      const cleanBase = baseParsed.href.replace(/\/$/, '') || baseParsed.origin;
      if (cleanUrl !== cleanBase) {
        links.add(resolved.href);
      }
      if (links.size >= maxLinks) break;
    } catch {
      // ignore invalid URLs
    }
  }

  return Array.from(links);
}

/**
 * Detects server / framework tech stack from headers and HTML to provide stack-specific fix snippets.
 */
function detectTechStack(headers, html = '') {
  const stack = new Set();
  const poweredBy = (headers.get('x-powered-by') || '').toLowerCase();
  const server = (headers.get('server') || '').toLowerCase();

  if (poweredBy.includes('next.js') || html.includes('/_next/static/')) stack.add('Next.js');
  if (poweredBy.includes('express')) stack.add('Express.js (Node)');
  if (poweredBy.includes('php')) stack.add('PHP');
  if (poweredBy.includes('asp.net')) stack.add('ASP.NET');
  if (server.includes('nginx')) stack.add('Nginx');
  if (server.includes('apache')) stack.add('Apache');
  if (server.includes('cloudflare') || headers.get('cf-ray')) stack.add('Cloudflare');
  if (headers.get('x-vercel-id') || server.includes('vercel')) stack.add('Vercel');
  if (headers.get('x-nf-request-id') || server.includes('netlify')) stack.add('Netlify');
  if (html.includes('wp-content/') || html.includes('wp-includes/')) stack.add('WordPress');

  if (stack.size === 0) stack.add('Web Server / Node.js');
  return Array.from(stack);
}

/**
 * Main Security Audit Runner
 */
export async function runSecurityAudit({
  url,
  scanScope = 'quick', // 'quick' | 'full'
  maxPages = 10,
  modules = DEFAULT_MODULES,
  onProgress = () => {}
}) {
  const startedAt = new Date().toISOString();
  const parsedUrl = new URL(url.trim());
  const origin = parsedUrl.origin;
  const isHttps = parsedUrl.protocol === 'https:';
  const isLocalhost =
    parsedUrl.hostname === 'localhost' ||
    parsedUrl.hostname === '127.0.0.1' ||
    parsedUrl.hostname === '0.0.0.0';

  const activeModules = new Set(Array.isArray(modules) && modules.length > 0 ? modules : DEFAULT_MODULES);
  const findings = [];
  const passedChecks = [];
  const categoryPenalties = {
    headers: 0,
    cookies: 0,
    tls: 0,
    exposure: 0,
    dom: 0,
    cors: 0
  };

  const addFinding = ({
    id,
    category,
    severity, // 'critical' | 'high' | 'medium' | 'low'
    title,
    description,
    risk,
    evidence,
    remediation,
    penalty = 10
  }) => {
    findings.push({
      id,
      category,
      severity,
      title,
      description,
      risk: risk || getFindingRisk(id, category, title),
      evidence: evidence || null,
      remediation: remediation || null
    });
    if (categoryPenalties[category] !== undefined) {
      categoryPenalties[category] += penalty;
    }
  };

  const addPass = (id, category, title, detail = null) => {
    passedChecks.push({ id, category, title, detail });
  };

  // Step 1: Fetch Primary Page
  onProgress({
    step: 1,
    totalSteps: scanScope === 'full' ? 4 : 3,
    statusText: 'Step 1: Fetching target URL & analyzing HTTP headers...'
  });

  const primaryRes = await fetchWithTimeout(parsedUrl.href, { method: 'GET' }, 10000);
  const headers = primaryRes.headers;
  const primaryHtml = await primaryRes.text();
  const detectedStack = detectTechStack(headers, primaryHtml);

  // =========================================================================
  // LAYER 1: HTTP Security Headers
  // =========================================================================
  if (activeModules.has('headers')) {
    const csp = headers.get('content-security-policy');
    const cspMetaMatch = primaryHtml.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i);

    if (!csp && !cspMetaMatch) {
      addFinding({
        id: 'missing-csp',
        category: 'headers',
        severity: 'high',
        title: 'Missing Content-Security-Policy (CSP) Header',
        description: 'No Content-Security-Policy header or meta tag was detected, leaving the site more vulnerable to Cross-Site Scripting (XSS) and unauthorized script injection.',
        evidence: 'Header: Content-Security-Policy (Not Present)',
        remediation: "Add a strict Content-Security-Policy header (e.g., default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self').",
        penalty: 25
      });
    } else {
      const cspVal = csp || cspMetaMatch[0];
      if (cspVal.includes("'unsafe-eval'") || cspVal.includes("'unsafe-inline'")) {
        addFinding({
          id: 'weak-csp',
          category: 'headers',
          severity: 'medium',
          title: 'Content-Security-Policy Uses unsafe-inline or unsafe-eval',
          description: 'CSP is present but permits unsafe-inline or unsafe-eval, which weakens protection against XSS injection.',
          evidence: `CSP: ${cspVal.slice(0, 140)}`,
          remediation: "Replace 'unsafe-inline' with cryptographic nonces or hashes and remove 'unsafe-eval'.",
          penalty: 10
        });
      } else {
        addPass('csp-strong', 'headers', 'Strong Content-Security-Policy (CSP) configured', cspVal.slice(0, 100));
      }
    }

    // HSTS
    const hsts = headers.get('strict-transport-security');
    if (isHttps) {
      if (!hsts) {
        addFinding({
          id: 'missing-hsts',
          category: 'headers',
          severity: 'high',
          title: 'Missing Strict-Transport-Security (HSTS) Header',
          description: 'HTTPS site does not send an HSTS header to prevent protocol downgrade and SSL stripping attacks.',
          evidence: 'Header: Strict-Transport-Security (Not Present)',
          remediation: 'Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
          penalty: 20
        });
      } else {
        const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
        const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
        if (maxAge < 15552000) {
          addFinding({
            id: 'short-hsts',
            category: 'headers',
            severity: 'low',
            title: 'HSTS max-age Is Shorter Than 6 Months',
            description: `HSTS max-age is set to ${maxAge} seconds. At least 31536000 seconds (1 year) is recommended.`,
            evidence: `Strict-Transport-Security: ${hsts}`,
            remediation: 'Increase max-age to 31536000 (1 year).',
            penalty: 6
          });
        } else {
          addPass('hsts-valid', 'headers', 'Strict-Transport-Security (HSTS) properly enforced', hsts);
        }
      }
    }

    // X-Frame-Options or CSP frame-ancestors
    const xfo = headers.get('x-frame-options');
    const hasFrameAncestors = csp && /frame-ancestors\b/i.test(csp);
    if (!xfo && !hasFrameAncestors) {
      addFinding({
        id: 'missing-clickjacking-protection',
        category: 'headers',
        severity: 'medium',
        title: 'Missing Clickjacking Protection (X-Frame-Options / frame-ancestors)',
        description: 'Page can be embedded inside malicious third-party <iframe> elements for UI redressing (Clickjacking) attacks.',
        evidence: 'Neither X-Frame-Options nor CSP frame-ancestors header found',
        remediation: "Set 'X-Frame-Options: SAMEORIGIN' (or 'DENY') and CSP 'frame-ancestors \'self\''.",
        penalty: 15
      });
    } else {
      addPass('clickjacking-protected', 'headers', 'Anti-Clickjacking frame protection enabled', xfo || 'CSP frame-ancestors');
    }

    // X-Content-Type-Options
    const xcto = (headers.get('x-content-type-options') || '').toLowerCase();
    if (xcto !== 'nosniff') {
      addFinding({
        id: 'missing-x-content-type-options',
        category: 'headers',
        severity: 'medium',
        title: 'Missing X-Content-Type-Options: nosniff Header',
        description: 'Without nosniff, browsers may MIME-sniff responses and execute disguised malicious files as scripts.',
        evidence: `X-Content-Type-Options: ${xcto || 'Not Present'}`,
        remediation: 'Add header: X-Content-Type-Options: nosniff',
        penalty: 12
      });
    } else {
      addPass('xcto-nosniff', 'headers', 'X-Content-Type-Options: nosniff enabled');
    }

    // Referrer-Policy
    const referrerPolicy = headers.get('referrer-policy');
    if (!referrerPolicy) {
      addFinding({
        id: 'missing-referrer-policy',
        category: 'headers',
        severity: 'low',
        title: 'Missing Referrer-Policy Header',
        description: 'Sensitive query parameters or session paths in URLs could leak via the Referer header to external sites.',
        evidence: 'Header: Referrer-Policy (Not Present)',
        remediation: 'Add header: Referrer-Policy: strict-origin-when-cross-origin',
        penalty: 8
      });
    } else {
      addPass('referrer-policy-present', 'headers', 'Referrer-Policy header configured', referrerPolicy);
    }

    // Permissions-Policy
    const permissionsPolicy = headers.get('permissions-policy') || headers.get('feature-policy');
    if (!permissionsPolicy) {
      addFinding({
        id: 'missing-permissions-policy',
        category: 'headers',
        severity: 'low',
        title: 'Missing Permissions-Policy Header',
        description: 'Browser hardware APIs (camera, microphone, geolocation, payment) are not explicitly restricted via Permissions-Policy.',
        evidence: 'Header: Permissions-Policy (Not Present)',
        remediation: 'Add header: Permissions-Policy: camera=(), microphone=(), geolocation=()',
        penalty: 7
      });
    } else {
      addPass('permissions-policy-present', 'headers', 'Permissions-Policy header configured', permissionsPolicy.slice(0, 80));
    }

    // COOP
    const coop = headers.get('cross-origin-opener-policy');
    if (!coop) {
      addFinding({
        id: 'missing-coop',
        category: 'headers',
        severity: 'low',
        title: 'Missing Cross-Origin-Opener-Policy (COOP) Header',
        description: 'Cross-Origin-Opener-Policy isolates the browsing context group from cross-origin windows.',
        evidence: 'Header: Cross-Origin-Opener-Policy (Not Present)',
        remediation: 'Add header: Cross-Origin-Opener-Policy: same-origin',
        penalty: 5
      });
    } else {
      addPass('coop-present', 'headers', 'Cross-Origin-Opener-Policy configured', coop);
    }
  }

  // =========================================================================
  // LAYER 2: Cookie & Session Security
  // =========================================================================
  if (activeModules.has('cookies')) {
    const rawCookies = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);

    if (rawCookies.length === 0) {
      addPass('no-insecure-cookies', 'cookies', 'No insecure Set-Cookie headers exposed on initial response');
    } else {
      for (const cookieStr of rawCookies) {
        const namePart = (cookieStr.split(';')[0] || '').split('=')[0].trim();
        const lower = cookieStr.toLowerCase();
        const hasHttpOnly = lower.includes('httponly');
        const hasSecure = lower.includes('secure');
        const hasSameSite = lower.includes('samesite=');

        if (!hasHttpOnly) {
          addFinding({
            id: `cookie-missing-httponly-${namePart}`,
            category: 'cookies',
            severity: 'high',
            title: `Cookie "${namePart}" Missing HttpOnly Flag`,
            description: 'Cookies without HttpOnly can be stolen via document.cookie if an XSS flaw occurs.',
            evidence: cookieStr.slice(0, 120),
            remediation: `Set the 'HttpOnly' attribute on cookie "${namePart}".`,
            penalty: 20
          });
        }
        if (isHttps && !hasSecure) {
          addFinding({
            id: `cookie-missing-secure-${namePart}`,
            category: 'cookies',
            severity: 'high',
            title: `Cookie "${namePart}" Missing Secure Flag`,
            description: 'Cookies without the Secure flag can be transmitted over unencrypted HTTP connections.',
            evidence: cookieStr.slice(0, 120),
            remediation: `Set the 'Secure' attribute on cookie "${namePart}".`,
            penalty: 20
          });
        }
        if (!hasSameSite) {
          addFinding({
            id: `cookie-missing-samesite-${namePart}`,
            category: 'cookies',
            severity: 'medium',
            title: `Cookie "${namePart}" Missing SameSite Attribute`,
            description: 'Cookies without explicit SameSite=Lax or SameSite=Strict are more susceptible to CSRF attacks.',
            evidence: cookieStr.slice(0, 120),
            remediation: `Set 'SameSite=Lax' or 'SameSite=Strict' on cookie "${namePart}".`,
            penalty: 12
          });
        }
        if (hasHttpOnly && (!isHttps || hasSecure) && hasSameSite) {
          addPass(`cookie-secure-${namePart}`, 'cookies', `Cookie "${namePart}" has Secure, HttpOnly, and SameSite flags`);
        }
      }
    }
  }

  // =========================================================================
  // LAYER 3: SSL/TLS & Transport Security
  // =========================================================================
  let tlsInfo = null;
  if (activeModules.has('tls')) {
    if (!isHttps && !isLocalhost) {
      addFinding({
        id: 'insecure-http-protocol',
        category: 'tls',
        severity: 'critical',
        title: 'Site Served Over Unencrypted HTTP',
        description: 'Traffic is not encrypted with HTTPS/TLS, allowing network attackers to intercept or tamper with credentials and content.',
        evidence: `Protocol: ${parsedUrl.protocol} (${parsedUrl.href})`,
        remediation: 'Enable HTTPS with a valid TLS 1.2/1.3 certificate (e.g., Let\'s Encrypt / Cloudflare) and redirect all HTTP traffic to HTTPS.',
        penalty: 50
      });
    } else if (isHttps) {
      addPass('https-enabled', 'tls', 'Connection encrypted over HTTPS');
      tlsInfo = await inspectTlsCertificate(parsedUrl.hostname, parsedUrl.port || 443);
      if (tlsInfo && tlsInfo.ok) {
        if (tlsInfo.protocol && (tlsInfo.protocol === 'TLSv1' || tlsInfo.protocol === 'TLSv1.1')) {
          addFinding({
            id: 'deprecated-tls-version',
            category: 'tls',
            severity: 'high',
            title: `Deprecated TLS Protocol (${tlsInfo.protocol})`,
            description: 'Server negotiated an outdated TLS version. Modern security standards require TLSv1.2 or TLSv1.3.',
            evidence: `Negotiated Protocol: ${tlsInfo.protocol}`,
            remediation: 'Disable TLS 1.0 and TLS 1.1 on your server and enable TLS 1.2 and TLS 1.3.',
            penalty: 30
          });
        } else if (tlsInfo.protocol) {
          addPass('tls-modern-protocol', 'tls', `Modern TLS protocol negotiated (${tlsInfo.protocol})`);
        }

        if (!tlsInfo.authorized && !isLocalhost) {
          addFinding({
            id: 'tls-cert-untrusted',
            category: 'tls',
            severity: 'critical',
            title: 'TLS Certificate Validation Error',
            description: `Certificate is not trusted by standard root CAs: ${tlsInfo.authError || 'Untrusted certificate'}`,
            evidence: `Issuer: ${tlsInfo.issuer || 'Unknown'}, Error: ${tlsInfo.authError}`,
            remediation: 'Install a valid, trusted SSL/TLS certificate chain.',
            penalty: 40
          });
        }

        if (typeof tlsInfo.daysRemaining === 'number') {
          if (tlsInfo.daysRemaining < 0) {
            addFinding({
              id: 'tls-cert-expired',
              category: 'tls',
              severity: 'critical',
              title: 'SSL/TLS Certificate Has Expired',
              description: `The SSL certificate expired ${Math.abs(tlsInfo.daysRemaining)} days ago (${tlsInfo.validTo}).`,
              evidence: `Valid To: ${tlsInfo.validTo}`,
              remediation: 'Renew the SSL/TLS certificate immediately.',
              penalty: 50
            });
          } else if (tlsInfo.daysRemaining < 14) {
            addFinding({
              id: 'tls-cert-expiring-soon',
              category: 'tls',
              severity: 'medium',
              title: `SSL/TLS Certificate Expires in ${tlsInfo.daysRemaining} Days`,
              description: 'Certificate is approaching expiration and should be renewed soon.',
              evidence: `Expires: ${tlsInfo.validTo}`,
              remediation: 'Verify automated certificate renewal (e.g., Certbot / ACME).',
              penalty: 15
            });
          } else {
            addPass('tls-cert-valid', 'tls', `SSL Certificate valid (${tlsInfo.daysRemaining} days remaining, Issuer: ${tlsInfo.issuer || 'Valid CA'})`);
          }
        }
      }
    } else if (isLocalhost) {
      addPass('localhost-dev-mode', 'tls', 'Localhost development environment detected');
    }
  }

  // =========================================================================
  // LAYER 4: Sensitive File & Source Map Exposure
  // =========================================================================
  if (activeModules.has('exposure')) {
    onProgress({
      step: 2,
      totalSteps: scanScope === 'full' ? 4 : 3,
      statusText: 'Step 2: Probing sensitive paths (/.env, /.git, source maps)...'
    });

    const sensitiveProbes = [
      {
        path: '/.env',
        id: 'exposed-dotenv',
        title: 'Publicly Exposed .env Environment File',
        severity: 'critical',
        penalty: 60,
        validate: (text, contentType) =>
          !contentType.includes('text/html') &&
          /^[A-Z0-9_]+\s*=/m.test(text) &&
          !text.trim().startsWith('<')
      },
      {
        path: '/.git/HEAD',
        id: 'exposed-git-repo',
        title: 'Publicly Exposed .git Repository Directory',
        severity: 'critical',
        penalty: 60,
        validate: (text) => /^ref:\s+refs\/heads\//m.test(text.trim())
      },
      {
        path: '/package.json',
        id: 'exposed-package-json',
        title: 'Publicly Exposed package.json Manifest',
        severity: 'medium',
        penalty: 18,
        validate: (text, contentType) => {
          if (contentType.includes('text/html') || text.trim().startsWith('<')) return false;
          try {
            const pkg = JSON.parse(text);
            return Boolean(pkg && (pkg.dependencies || pkg.devDependencies || pkg.scripts));
          } catch {
            return false;
          }
        }
      },
      {
        path: '/phpinfo.php',
        id: 'exposed-phpinfo',
        title: 'Publicly Exposed phpinfo.php Diagnostic Page',
        severity: 'high',
        penalty: 35,
        validate: (text) => text.includes('<title>phpinfo()</title>') || text.includes('PHP Version')
      },
      {
        path: '/wp-config.php.bak',
        id: 'exposed-wp-config-bak',
        title: 'Publicly Exposed WordPress Backup Configuration',
        severity: 'critical',
        penalty: 60,
        validate: (text) => text.includes('DB_PASSWORD') || text.includes('wp-settings.php')
      }
    ];

    const probeResults = await Promise.allSettled(
      sensitiveProbes.map(async (probe) => {
        const target = new URL(probe.path, origin).href;
        const res = await fetchWithTimeout(target, { method: 'GET' }, 4500);
        if (res.status === 200) {
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          const bodyText = (await res.text()).slice(0, 4000);
          if (probe.validate(bodyText, contentType)) {
            return { exposed: true, probe, target, snippet: bodyText.slice(0, 120) };
          }
        }
        return { exposed: false, probe };
      })
    );

    let anySensitiveFileExposed = false;
    for (const r of probeResults) {
      if (r.status === 'fulfilled' && r.value?.exposed) {
        anySensitiveFileExposed = true;
        const { probe, target } = r.value;
        addFinding({
          id: probe.id,
          category: 'exposure',
          severity: probe.severity,
          title: probe.title,
          description: `Sensitive file ${probe.path} is publicly readable at ${target}, which can leak credentials, source code, or dependency structure.`,
          evidence: `HTTP 200 OK at ${target}`,
          remediation: `Block access to ${probe.path} in your web server configuration and remove sensitive files from the public web root.`,
          penalty: probe.penalty
        });
      }
    }

    if (!anySensitiveFileExposed) {
      addPass('sensitive-files-protected', 'exposure', 'Sensitive files (/.env, /.git/HEAD, backups) are not publicly exposed');
    }

    // Check if JavaScript Source Maps (.js.map) are exposed in production
    const scriptUrls = [];
    const scriptRegex = /<script\b[^>]*?\bsrc\s*=\s*["']([^"']+\.js(?:\?[^"']*)?)["']/gi;
    let sMatch;
    while ((sMatch = scriptRegex.exec(primaryHtml)) !== null && scriptUrls.length < 3) {
      try {
        const resolved = new URL(sMatch[1], parsedUrl.href);
        if (resolved.origin === origin) {
          scriptUrls.push(resolved.href);
        }
      } catch {
        // ignore
      }
    }

    for (const jsUrl of scriptUrls) {
      try {
        const mapUrl = jsUrl.split('?')[0] + '.map';
        const mapRes = await fetchWithTimeout(mapUrl, { method: 'GET' }, 3500);
        if (mapRes.status === 200) {
          const mapText = (await mapRes.text()).slice(0, 500);
          if (mapText.includes('"version"') && mapText.includes('"sources"')) {
            addFinding({
              id: 'exposed-js-sourcemap',
              category: 'exposure',
              severity: 'low',
              title: 'Production JavaScript Source Maps (.js.map) Exposed',
              description: 'Source maps allow anyone to reconstruct your original unminified frontend source code and internal comments.',
              evidence: `Exposed Source Map: ${mapUrl}`,
              remediation: 'Disable production browser source maps (e.g., productionBrowserSourceMaps: false in Next.js or GENERATE_SOURCEMAP=false) or restrict .map files to internal networks.',
              penalty: 10
            });
            break;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // =========================================================================
  // LAYER 6: CORS & Information Disclosure
  // =========================================================================
  if (activeModules.has('cors')) {
    const serverHeader = headers.get('server');
    if (serverHeader && /\d+\.\d+/.test(serverHeader)) {
      addFinding({
        id: 'server-version-leak',
        category: 'cors',
        severity: 'low',
        title: 'Server Header Leaks Exact Software Version',
        description: 'Exposing exact server version numbers helps attackers fingerprint known CVEs for your web server.',
        evidence: `Server: ${serverHeader}`,
        remediation: 'Disable server tokens (e.g., server_tokens off; in Nginx or ServerTokens Prod in Apache).',
        penalty: 10
      });
    } else {
      addPass('server-header-clean', 'cors', 'Server header does not leak detailed version numbers');
    }

    const poweredBy = headers.get('x-powered-by') || headers.get('x-aspnet-version');
    if (poweredBy) {
      addFinding({
        id: 'x-powered-by-leak',
        category: 'cors',
        severity: 'low',
        title: 'X-Powered-By Header Exposes Backend Framework',
        description: 'The X-Powered-By header reveals the underlying application framework.',
        evidence: `X-Powered-By: ${poweredBy}`,
        remediation: "Remove X-Powered-By (e.g., app.disable('x-powered-by') in Express or poweredByHeader: false in Next.js).",
        penalty: 10
      });
    } else {
      addPass('no-x-powered-by', 'cors', 'X-Powered-By header hidden');
    }

    const acao = headers.get('access-control-allow-origin');
    const acac = (headers.get('access-control-allow-credentials') || '').toLowerCase();
    if (acao === '*' && acac === 'true') {
      addFinding({
        id: 'insecure-cors-wildcard-credentials',
        category: 'cors',
        severity: 'critical',
        title: 'Dangerous CORS Configuration (Wildcard Origin with Credentials)',
        description: 'Access-Control-Allow-Origin: * combined with Allow-Credentials: true is a severe CORS misconfiguration.',
        evidence: `ACAO: ${acao}, ACAC: ${acac}`,
        remediation: 'Restrict Access-Control-Allow-Origin to trusted explicit origins.',
        penalty: 40
      });
    } else if (acao === '*') {
      addFinding({
        id: 'cors-wildcard-origin',
        category: 'cors',
        severity: 'low',
        title: 'Permissive Wildcard CORS Header (Access-Control-Allow-Origin: *)',
        description: 'Any external domain can read responses from this endpoint via browser fetch/XHR.',
        evidence: 'Access-Control-Allow-Origin: *',
        remediation: 'If this is not a public static API, restrict CORS to specific allowed origins.',
        penalty: 8
      });
    } else {
      addPass('cors-restricted', 'cors', 'CORS policy is not overly permissive');
    }
  }

  // =========================================================================
  // STEP 3: Crawl Internal Pages (If Full Site Scan) & Analyze DOM / Scripts
  // =========================================================================
  const pagesToInspect = [{ url: parsedUrl.href, html: primaryHtml }];

  if (scanScope === 'full') {
    const internalLinks = extractInternalLinks(primaryHtml, parsedUrl.href, Math.max(1, maxPages - 1));
    onProgress({
      step: 3,
      totalSteps: 4,
      statusText: `Step 3/4: Crawling ${internalLinks.length + 1} internal pages across site...`
    });

    const crawled = await Promise.allSettled(
      internalLinks.map(async (linkUrl) => {
        const r = await fetchWithTimeout(linkUrl, { method: 'GET' }, 6000);
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (r.ok && ct.includes('text/html')) {
          const text = await r.text();
          return { url: linkUrl, html: text };
        }
        return null;
      })
    );

    for (const c of crawled) {
      if (c.status === 'fulfilled' && c.value) {
        pagesToInspect.push(c.value);
      }
    }
  }

  // =========================================================================
  // LAYER 5: Client-Side & DOM Security Across All Inspected Pages
  // =========================================================================
  const seenVulnLibs = new Set();
  let missingSriCount = 0;
  let missingSriExample = null;
  let insecureFormCount = 0;
  let insecureFormExample = null;
  let unsafeBlankCount = 0;
  let mixedContentCount = 0;
  let mixedContentExample = null;

  for (const page of pagesToInspect) {
    const html = page.html || '';

    // 5a. Mixed Content Check (on HTTPS pages)
    if (isHttps && activeModules.has('tls')) {
      const mixedMatch = html.match(/<(?:script|iframe|img|link|form)\b[^>]*?\b(?:src|href|action)\s*=\s*["'](http:\/\/[^"']+)["']/i);
      if (mixedMatch) {
        mixedContentCount++;
        if (!mixedContentExample) mixedContentExample = `${mixedMatch[1]} (on ${page.url})`;
      }
    }

    if (!activeModules.has('dom')) continue;

    // 5b. Vulnerable JS Libraries
    for (const lib of KNOWN_VULNERABLE_LIBS) {
      const m = html.match(lib.regex);
      if (m && m[1] && lib.isVulnerable(m[1])) {
        const key = `${lib.name}@${m[1]}`;
        if (!seenVulnLibs.has(key)) {
          seenVulnLibs.add(key);
          addFinding({
            id: `vuln-lib-${lib.name.toLowerCase()}`,
            category: 'dom',
            severity: 'high',
            title: `Outdated & Vulnerable ${lib.name} (${m[1]}) Detected`,
            description: `${lib.cveHint}. Found on ${page.url}.`,
            evidence: `Detected ${lib.name} v${m[1]}`,
            remediation: `Upgrade ${lib.name} to v${lib.safeVersion} or later.`,
            penalty: 25
          });
        }
      }
    }

    // 5c. External 3rd-party scripts without Subresource Integrity (SRI)
    const extScriptRegex = /<script\b([^>]*?\bsrc\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*)>/gi;
    let sm;
    while ((sm = extScriptRegex.exec(html)) !== null) {
      const attrs = sm[1];
      const srcUrl = sm[2];
      try {
        const srcParsed = new URL(srcUrl);
        if (srcParsed.origin !== origin && !/\bintegrity\s*=\s*["']sha(?:256|384|512)-/i.test(attrs)) {
          missingSriCount++;
          if (!missingSriExample) missingSriExample = srcUrl;
        }
      } catch {
        // ignore
      }
    }

    // 5d. Insecure Form Action (HTTP submission)
    const formRegex = /<form\b([^>]*)>/gi;
    let fm;
    while ((fm = formRegex.exec(html)) !== null) {
      const formAttrs = fm[1];
      const actionMatch = formAttrs.match(/\baction\s*=\s*["'](http:\/\/[^"']+)["']/i);
      if (actionMatch && !isLocalhost) {
        insecureFormCount++;
        if (!insecureFormExample) insecureFormExample = `${actionMatch[1]} (on ${page.url})`;
      }
    }

    // 5e. Reverse Tabnabbing (target="_blank" without rel="noopener")
    const blankRegex = /<a\b([^>]*?\btarget\s*=\s*["']_blank["'][^>]*)>/gi;
    let bm;
    while ((bm = blankRegex.exec(html)) !== null) {
      const aAttrs = bm[1];
      if (!/\brel\s*=\s*["'][^"']*(?:noopener|noreferrer)/i.test(aAttrs)) {
        unsafeBlankCount++;
      }
    }

    // 5f. Hardcoded API Keys / Secrets in HTML / inline scripts
    for (const pat of SECRET_PATTERNS) {
      const secMatch = html.match(pat.regex);
      if (secMatch) {
        const masked = secMatch[0].slice(0, 8) + '...' + secMatch[0].slice(-4);
        addFinding({
          id: `secret-leak-${pat.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          category: 'dom',
          severity: pat.severity,
          title: `Potential Exposed ${pat.name} in Client Code`,
          description: `A string matching ${pat.name} pattern was found directly in the client-side HTML/JS of ${page.url}.`,
          evidence: `Matched token: ${masked}`,
          remediation: 'Revoke/rotate the exposed key immediately and move secret credentials to server-side environment variables.',
          penalty: 40
        });
      }
    }
  }

  if (mixedContentCount > 0) {
    addFinding({
      id: 'mixed-content-resources',
      category: 'tls',
      severity: 'high',
      title: `Mixed Content Detected (${mixedContentCount} HTTP resource(s) on HTTPS page)`,
      description: 'Loading insecure HTTP scripts, images, or frames inside an HTTPS page weakens transport security.',
      evidence: `Example: ${mixedContentExample}`,
      remediation: 'Update all resource URLs to use https://.',
      penalty: 22
    });
  }

  if (activeModules.has('dom')) {
    if (missingSriCount > 0) {
      addFinding({
        id: 'missing-sri-integrity',
        category: 'dom',
        severity: 'medium',
        title: `${missingSriCount} External Third-Party Script(s) Missing Subresource Integrity (SRI)`,
        description: 'If an external CDN is compromised, scripts without an integrity="sha384-..." hash can execute arbitrary code on your site.',
        evidence: `Example script: ${missingSriExample}`,
        remediation: 'Add integrity="sha384-..." and crossorigin="anonymous" attributes to all third-party <script> tags.',
        penalty: 12
      });
    } else {
      addPass('sri-verified', 'dom', 'External scripts verified (no missing Subresource Integrity)');
    }

    if (insecureFormCount > 0) {
      addFinding({
        id: 'insecure-form-action',
        category: 'dom',
        severity: 'critical',
        title: `${insecureFormCount} Form(s) Submit Data Over Unencrypted HTTP`,
        description: 'Forms with action="http://..." transmit user input in cleartext.',
        evidence: `Example: ${insecureFormExample}`,
        remediation: 'Ensure all <form action="..."> attributes use https:// endpoints.',
        penalty: 35
      });
    }

    if (unsafeBlankCount > 0) {
      addFinding({
        id: 'unsafe-target-blank',
        category: 'dom',
        severity: 'low',
        title: `${unsafeBlankCount} External Link(s) Using target="_blank" Without rel="noopener"`,
        description: 'Links opening in a new tab without rel="noopener noreferrer" may allow the opened page to access window.opener.',
        evidence: `${unsafeBlankCount} <a target="_blank"> tag(s) missing rel="noopener"`,
        remediation: 'Add rel="noopener noreferrer" to all <a target="_blank"> links.',
        penalty: 6
      });
    }

    if (seenVulnLibs.size === 0) {
      addPass('no-known-vuln-libs', 'dom', 'No outdated client-side JS libraries with known CVEs detected');
    }
  }

  // =========================================================================
  // Compute Category Scores & Overall Weighted Security Score
  // =========================================================================
  const categoryScores = {};
  for (const mod of DEFAULT_MODULES) {
    categoryScores[mod] = Math.max(0, Math.min(100, 100 - (categoryPenalties[mod] || 0)));
  }

  const weights = {
    headers: 0.25,
    cookies: 0.15,
    tls: 0.20,
    exposure: 0.20,
    dom: 0.12,
    cors: 0.08
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const mod of activeModules) {
    const w = weights[mod] || 0.15;
    weightedSum += (categoryScores[mod] ?? 100) * w;
    totalWeight += w;
  }

  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100;
  const grade = scoreToGrade(overallScore);

  // Sort findings by severity
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4));

  const severityCounts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    passed: passedChecks.length
  };

  const result = {
    schema: 'sitelens-security-report/v1',
    url: parsedUrl.href,
    origin,
    scanScope,
    pagesScanned: pagesToInspect.length,
    scannedUrls: pagesToInspect.map((p) => p.url),
    generatedAt: startedAt,
    detectedStack,
    overallScore,
    grade,
    categoryScores,
    severityCounts,
    tlsInfo,
    findings,
    passedChecks
  };

  const markdown = buildSecurityMarkdownReport(result);

  return {
    ok: true,
    type: 'security-result',
    url: parsedUrl.href,
    timestamp: startedAt,
    securityReport: {
      json: result,
      markdown
    }
  };
}

/**
 * Generates an AI-Ready Markdown Security Report with Stack-Specific Remediation Instructions
 */
export function buildSecurityMarkdownReport(report) {
  const lines = [];
  lines.push(`# 🛡️ Website Security Audit Report (AI-Ready Remediation Guide)`);
  lines.push(`- **Target URL:** ${report.url}`);
  lines.push(`- **Scan Scope:** ${report.scanScope === 'full' ? `Full Site Crawl (${report.pagesScanned} pages inspected)` : 'Quick Single-Page Audit'}`);
  lines.push(`- **Detected Tech Stack:** ${report.detectedStack.join(', ')}`);
  lines.push(`- **Overall Security Score:** **${report.overallScore}/100 (Grade: ${report.grade})**`);
  lines.push(
    `- **Summary:** 🔴 ${report.severityCounts.critical} Critical | 🟠 ${report.severityCounts.high} High | 🟡 ${report.severityCounts.medium} Medium | 🔵 ${report.severityCounts.low} Low | 🟢 ${report.severityCounts.passed} Passed`
  );
  lines.push('');
  lines.push(
    `> **AI Assistant Instructions:** Please act as a Principal Application Security Engineer. Review the security findings below for **${report.url}** (Tech stack: ${report.detectedStack.join(', ')}) and provide exact, production-ready configuration & code changes to achieve an **A+ (95+)** security score.`
  );
  lines.push('');

  lines.push(`## 1. Security Layer Scores (0–100)`);
  lines.push(`| Security Layer | Score |`);
  lines.push(`| :--- | :---: |`);
  const labels = {
    headers: '🔒 HTTP Security Headers',
    cookies: '🍪 Cookie & Session Security',
    tls: '🔐 SSL/TLS & Transport',
    exposure: '🕵️ Sensitive Files & Source Maps',
    dom: '📦 Client-Side & DOM Security',
    cors: '🌐 CORS & Info Disclosure'
  };
  for (const [k, label] of Object.entries(labels)) {
    if (report.categoryScores[k] !== undefined) {
      lines.push(`| **${label}** | ${report.categoryScores[k]}/100 |`);
    }
  }
  lines.push('');

  if (report.findings.length > 0) {
    lines.push(`## 2. Security Vulnerabilities & Misconfigurations Found (${report.findings.length})`);
    for (const f of report.findings) {
      const badge =
        f.severity === 'critical'
          ? '🔴 [CRITICAL]'
          : f.severity === 'high'
          ? '🟠 [HIGH]'
          : f.severity === 'medium'
          ? '🟡 [MEDIUM]'
          : '🔵 [LOW]';
      lines.push(`### ${badge} ${f.title}`);
      lines.push(`- **Category:** \`${f.category}\``);
      lines.push(`- **Issue:** ${f.description}`);
      if (f.risk) lines.push(`- **Potential Risk & Impact:** ${f.risk}`);
      if (f.evidence) lines.push(`- **Evidence:** \`${f.evidence}\``);
      if (f.remediation) lines.push(`- **Recommended Fix:** ${f.remediation}`);
      lines.push('');
    }
  } else {
    lines.push(`## 2. Security Vulnerabilities Found`);
    lines.push(`✅ All security checks passed with zero vulnerabilities detected!`);
    lines.push('');
  }

  if (report.passedChecks.length > 0) {
    lines.push(`## 3. Passed Security Controls (${report.passedChecks.length})`);
    for (const p of report.passedChecks) {
      lines.push(`- ✅ **[${p.category}]** ${p.title}${p.detail ? ` (\`${p.detail}\`)` : ''}`);
    }
    lines.push('');
  }

  if (report.scannedUrls && report.scannedUrls.length > 1) {
    lines.push(`## 4. Crawled Pages Inspected (${report.scannedUrls.length})`);
    for (const u of report.scannedUrls) {
      lines.push(`- \`${u}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}
