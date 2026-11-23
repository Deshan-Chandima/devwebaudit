import express from 'express';
import cors from 'cors';
import dns from 'dns/promises';
import net from 'net';
import {
  buildSingleDeviceAiSummary,
  buildCombinedAiReport,
  buildCombinedAiMarkdown
} from './ai-formatter.js';
import { runSecurityAudit } from './security-scanner.js';

let _lhModule = null;
let _chromeLauncherModule = null;

async function getLighthouseDeps() {
  if (!_lhModule) {
    _lhModule = await import('lighthouse');
  }
  if (!_chromeLauncherModule) {
    _chromeLauncherModule = await import('chrome-launcher');
  }
  return {
    lighthouse: _lhModule.default,
    desktopConfig: _lhModule.desktopConfig,
    chromeLauncher: _chromeLauncherModule
  };
}

const IS_VERCEL = Boolean(process.env.VERCEL);
const PORT = process.env.PORT ? Number(process.env.PORT) : 9876;
const PUBLIC_CLOUD_MODE = process.env.PUBLIC_CLOUD_MODE === 'true' || IS_VERCEL;
const DISABLE_LOCAL_LIGHTHOUSE = process.env.DISABLE_LOCAL_LIGHTHOUSE === 'true' || IS_VERCEL;
const HOST = process.env.HOST || (PUBLIC_CLOUD_MODE ? '0.0.0.0' : '127.0.0.1');
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 15);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.set('trust proxy', 1);

// Production-safe CORS: allows configured origins or chrome-extension:// + localhost
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || !PUBLIC_CLOUD_MODE) return callback(null, true);
      if (ALLOWED_ORIGINS.length > 0) {
        return callback(null, ALLOWED_ORIGINS.includes(origin));
      }
      if (
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by DevWebAudit CORS policy.'));
    }
  })
);
app.use(express.json({ limit: '50mb' }));

/**
 * Lightweight zero-dependency sliding-window rate limiter for Public Cloud Mode.
 */
const rateLimitStore = new Map();
function rateLimitMiddleware(req, res, next) {
  if (!PUBLIC_CLOUD_MODE) return next();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const record = rateLimitStore.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  record.count += 1;
  rateLimitStore.set(ip, record);

  if (record.count > RATE_LIMIT_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      ok: false,
      error: `Rate limit exceeded (${RATE_LIMIT_MAX} requests/min). Please retry in ${retryAfterSec}s.`
    });
  }
  return next();
}

// Periodically prune stale rate-limit records
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rateLimitStore.entries()) {
    if (now > rec.resetAt) rateLimitStore.delete(ip);
  }
}, 120_000).unref?.();

/**
 * Checks whether an IPv4/IPv6 address belongs to private, loopback, link-local, or cloud metadata space.
 */
function isPrivateOrReservedIp(ip) {
  if (!ip) return true;
  const normalized = ip.replace(/^::ffff:/i, '').toLowerCase();
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) {
    return true;
  }
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Cloud metadata (AWS/GCP/Azure)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
  }
  return false;
}

/**
 * SSRF Guard for Public Cloud Mode: blocks internal/private/loopback/cloud-metadata URLs.
 */
async function assertSafePublicUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('Invalid URL format.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// protocols are supported.');
  }

  if (!PUBLIC_CLOUD_MODE) return parsed.toString();

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    throw new Error('Scanning private or localhost addresses is disabled on the public cloud server. Run the local engine for localhost audits.');
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Target IP is in a private or reserved network range.');
    }
    return parsed.toString();
  }

  try {
    const addresses = await dns.lookup(host, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new Error('Unable to resolve target hostname.');
    }
    for (const entry of addresses) {
      if (isPrivateOrReservedIp(entry.address)) {
        throw new Error('Target hostname resolves to a private or reserved IP address.');
      }
    }
  } catch (err) {
    throw new Error(err.message || 'DNS resolution failed for target URL.');
  }

  return parsed.toString();
}

// Track active audit status for live status queries
let activeAuditState = {
  running: false,
  url: null,
  step: 0,
  totalSteps: 0,
  statusText: 'Idle',
  startedAt: null,
  updatedAt: null
};

function updateState(patch) {
  activeAuditState = {
    ...activeAuditState,
    ...patch,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Build accurate official Lighthouse configuration for Desktop vs Mobile (Moto G4 / Slow 4G).
 * Supports both Simulated Throttling (1:1 match with Chrome DevTools Incognito) and Applied DevTools Throttling.
 */
function buildLighthouseConfig(device, categories, throttlingMethod = 'simulate', desktopConfig = {}) {
  const onlyCategories = Array.isArray(categories) && categories.length > 0
    ? categories
    : ['performance', 'accessibility', 'best-practices', 'seo'];

  const method = throttlingMethod === 'devtools' ? 'devtools' : 'simulate';

  if (device === 'desktop') {
    // Official Lighthouse desktop preset matching Chrome DevTools
    return {
      ...desktopConfig,
      settings: {
        ...(desktopConfig?.settings || {}),
        formFactor: 'desktop',
        onlyCategories,
        throttlingMethod: method,
        disableStorageReset: false,
        clearStorageTypes: ['cookies', 'local_storage', 'session_storage', 'service_workers', 'cache_storage', 'indexeddb'],
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false
        },
        throttling: {
          rttMs: 40,
          throughputKbps: 10 * 1024,
          cpuSlowdownMultiplier: 1,
          requestLatencyMs: 0,
          downloadThroughputKbps: 0,
          uploadThroughputKbps: 0
        }
      }
    };
  }

  // Official Mobile Moto G4 / Slow 4G preset matching Chrome DevTools
  return {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'mobile',
      onlyCategories,
      throttlingMethod: method,
      disableStorageReset: false,
      clearStorageTypes: ['cookies', 'local_storage', 'session_storage', 'service_workers', 'cache_storage', 'indexeddb'],
      screenEmulation: {
        mobile: true,
        width: 412,
        height: 823,
        deviceScaleFactor: 1.75,
        disabled: false
      },
      throttling: {
        rttMs: 150,
        throughputKbps: 1.6 * 1024,
        requestLatencyMs: 150 * 3.75,
        downloadThroughputKbps: 1.6 * 1024 * 0.9,
        uploadThroughputKbps: 750 * 0.9,
        cpuSlowdownMultiplier: 4
      },
      emulatedUserAgent:
        'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
    }
  };
}

/**
 * Health check endpoint used by the Chrome Extension popup & cloud host monitors.
 */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'online',
    service: 'DevWebAudit Engine',
    version: '2.0.2',
    mode: PUBLIC_CLOUD_MODE ? 'cloud' : 'local',
    capabilities: {
      lighthouse: !DISABLE_LOCAL_LIGHTHOUSE,
      security: true,
      cloudLighthouse: true
    },
    port: PORT,
    activeAudit: activeAuditState
  });
});

/**
 * GET /api/psi
 * Cloud Lighthouse / Google PageSpeed Proxy Endpoint
 * Routes requests through the cloud server with optional server-side PSI_API_KEY.
 * Protected by rate limiting and SSRF guards in cloud mode.
 */
app.get('/api/psi', rateLimitMiddleware, async (req, res) => {
  const targetUrl = (req.query.url || '').trim();
  if (!targetUrl) {
    return res.status(400).json({ ok: false, error: 'Target URL is required.' });
  }

  try {
    await assertSafePublicUrl(targetUrl);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  const strategy = req.query.strategy === 'desktop' ? 'desktop' : 'mobile';
  const categories = Array.isArray(req.query.category)
    ? req.query.category
    : req.query.category
      ? [req.query.category]
      : ['performance', 'accessibility', 'best-practices', 'seo'];

  const psiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  psiUrl.searchParams.set('url', targetUrl);
  psiUrl.searchParams.set('strategy', strategy);
  for (const cat of categories) {
    psiUrl.searchParams.append('category', cat);
  }

  const apiKey = (process.env.PSI_API_KEY || req.query.key || '').trim();
  if (apiKey) {
    psiUrl.searchParams.set('key', apiKey);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    const upstreamRes = await fetch(psiUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DevWebAudit-Cloud-Auditor/2.0'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await upstreamRes.json().catch(() => ({}));
    if (!upstreamRes.ok) {
      const errMsg = data?.error?.message || `Google PageSpeed API HTTP ${upstreamRes.status}`;
      return res.status(upstreamRes.status).json({
        ok: false,
        error: errMsg,
        details: data?.error
      });
    }

    return res.json({
      ok: true,
      strategy,
      lighthouseResult: data.lighthouseResult
    });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res.status(504).json({
      ok: false,
      error: isTimeout
        ? 'Google PageSpeed Insights request timed out. Please try again.'
        : `PageSpeed proxy failure: ${err.message}`
    });
  }
});

app.get('/api/status', (req, res) => {
  res.json(activeAuditState);
});

/**
 * POST /api/audit
 * Body: {
 *   url: string,
 *   devices: ['desktop', 'mobile'],
 *   categories: ['performance', 'accessibility', 'best-practices', 'seo'],
 *   formats: ['json', 'html', 'ai-summary'],
 *   stream?: boolean
 * }
 */
app.post('/api/audit', rateLimitMiddleware, async (req, res) => {
  if (DISABLE_LOCAL_LIGHTHOUSE) {
    return res.status(501).json({
      ok: false,
      error: 'Local Chromium Lighthouse is disabled on this lightweight cloud instance. Use Google PageSpeed Insights or the local engine.'
    });
  }

  const {
    url,
    devices = ['desktop', 'mobile'],
    categories = ['performance', 'accessibility', 'best-practices', 'seo'],
    formats = ['json', 'html', 'ai-summary'],
    throttlingMethod = 'simulate', // 'simulate' (1:1 Chrome DevTools match) | 'devtools' (Applied)
    stream = false
  } = req.body || {};

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({
      ok: false,
      error: 'A valid http:// or https:// URL is required.'
    });
  }

  let targetUrl;
  try {
    targetUrl = await assertSafePublicUrl(url.trim());
  } catch (err) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  const normalizedDevices = Array.isArray(devices) && devices.length > 0
    ? devices.filter((d) => d === 'desktop' || d === 'mobile')
    : ['desktop', 'mobile'];

  if (normalizedDevices.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'At least one device ("desktop" or "mobile") must be selected.'
    });
  }

  const wantStream = Boolean(stream) || (req.headers.accept && req.headers.accept.includes('application/x-ndjson'));
  if (wantStream) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
  }

  const sendProgress = (payload) => {
    updateState(payload);
    if (wantStream && !res.writableEnded) {
      res.write(JSON.stringify({ type: 'progress', ...activeAuditState }) + '\n');
    }
  };

  const timestamp = new Date().toISOString();
  const totalSteps = normalizedDevices.length;

  updateState({
    running: true,
    url: targetUrl,
    step: 0,
    totalSteps,
    statusText: 'Launching isolated headless Chrome...',
    startedAt: timestamp
  });

  const resultsByDevice = {};
  const summariesByDevice = {};

  try {
    const { lighthouse, desktopConfig, chromeLauncher } = await getLighthouseDeps();

    for (let i = 0; i < normalizedDevices.length; i++) {
      const device = normalizedDevices[i];
      const stepNumber = i + 1;
      const deviceTitle = device === 'desktop' ? 'Desktop' : 'Mobile';

      sendProgress({
        running: true,
        step: stepNumber,
        totalSteps,
        device,
        statusText: `Running ${deviceTitle} Audit...`
      });

      console.log(`[DevWebAudit] Step ${stepNumber}/${totalSteps}: Running ${deviceTitle} Audit for ${targetUrl}...`);

      let chrome = null;
      try {
        const windowSizeFlag = device === 'desktop' ? '--window-size=1350,940' : '--window-size=412,823';
        // Launch fresh isolated headless Chrome instance matching exact DevTools dimensions & flags
        chrome = await chromeLauncher.launch({
          chromeFlags: [
            '--headless=new',
            '--no-sandbox',
            '--incognito',
            windowSizeFlag,
            '--hide-scrollbars',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-background-networking',
            '--disable-sync',
            '--metrics-recording-only',
            '--disable-default-apps',
            '--mute-audio',
            '--no-first-run',
            '--disable-dev-shm-usage',
            '--disable-features=Translate,BackForwardCache,AcceptCHFrame'
          ]
        });

        const lhFlags = {
          logLevel: 'error',
          output: ['json', 'html'],
          port: chrome.port
        };

        const lhConfig = buildLighthouseConfig(device, categories, throttlingMethod, desktopConfig);
        const runnerResult = await lighthouse(targetUrl, lhFlags, lhConfig);

        const lhr = runnerResult.lhr;
        const reports = Array.isArray(runnerResult.report)
          ? runnerResult.report
          : [runnerResult.report];
        const rawJsonReport = reports[0] || JSON.stringify(lhr, null, 2);
        const htmlReport = reports[1] || '';

        const aiSummary = buildSingleDeviceAiSummary(lhr, device);
        summariesByDevice[device] = aiSummary;

        resultsByDevice[device] = {
          device,
          scores: aiSummary.scores,
          coreWebVitals: aiSummary.coreWebVitals,
          aiSummary,
          rawJson: formats.includes('json') ? rawJsonReport : undefined,
          html: formats.includes('html') ? htmlReport : undefined
        };
      } finally {
        if (chrome) {
          try {
            await chrome.kill();
          } catch (killErr) {
            console.warn('[DevWebAudit] Warning killing Chrome process:', killErr?.message);
          }
        }
      }
    }

    const combinedAiJson = buildCombinedAiReport({
      url: targetUrl,
      timestamp,
      desktopSummary: summariesByDevice.desktop || null,
      mobileSummary: summariesByDevice.mobile || null
    });
    const combinedAiMarkdown = buildCombinedAiMarkdown(combinedAiJson);

    sendProgress({
      running: false,
      step: totalSteps,
      totalSteps,
      statusText: 'Completed'
    });

    console.log(`[DevWebAudit] Completed audit for ${targetUrl}`);

    const finalPayload = {
      ok: true,
      type: 'result',
      source: 'local-lighthouse',
      url: targetUrl,
      timestamp,
      devices: normalizedDevices,
      categories,
      throttlingMethod: throttlingMethod === 'devtools' ? 'devtools' : 'simulate',
      engineCalibrated: true,
      formats,
      results: resultsByDevice,
      aiReport: {
        json: combinedAiJson,
        markdown: combinedAiMarkdown
      }
    };

    if (wantStream) {
      res.write(JSON.stringify(finalPayload) + '\n');
      res.end();
    } else {
      res.json(finalPayload);
    }
  } catch (error) {
    console.error('[SiteLens AI] Audit failed:', error);
    updateState({
      running: false,
      statusText: `Error: ${error.message || 'Audit failed'}`
    });

    const errPayload = {
      ok: false,
      type: 'error',
      error: error.message || 'Failed to run Lighthouse audit.'
    };

    if (wantStream) {
      if (!res.writableEnded) {
        res.write(JSON.stringify(errPayload) + '\n');
        res.end();
      }
    } else if (!res.headersSent) {
      res.status(500).json(errPayload);
    }
  }
});

/**
 * POST /api/security-audit
 * Body: {
 *   url: string,
 *   scanScope: 'quick' | 'full',
 *   maxPages: 5 | 10 | 25,
 *   modules: ['headers', 'cookies', 'tls', 'exposure', 'dom', 'cors'],
 *   stream?: boolean
 * }
 */
app.post('/api/security-audit', rateLimitMiddleware, async (req, res) => {
  const {
    url,
    scanScope = 'quick',
    maxPages = 10,
    modules = ['headers', 'cookies', 'tls', 'exposure', 'dom', 'cors'],
    stream = false
  } = req.body || {};

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
    return res.status(400).json({
      ok: false,
      error: 'A valid http:// or https:// URL is required.'
    });
  }

  let targetUrl;
  try {
    targetUrl = await assertSafePublicUrl(url.trim());
  } catch (err) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  const wantStream = Boolean(stream) || (req.headers.accept && req.headers.accept.includes('application/x-ndjson'));
  if (wantStream) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
  }

  const sendProgress = (payload) => {
    updateState({ running: true, url: targetUrl, ...payload });
    if (wantStream && !res.writableEnded) {
      res.write(JSON.stringify({ type: 'progress', ...activeAuditState }) + '\n');
    }
  };

  try {
    console.log(`[DevWebAudit Security] Starting ${scanScope} security audit for ${targetUrl}...`);
    const resultPayload = await runSecurityAudit({
      url: targetUrl,
      scanScope,
      maxPages: Math.max(1, Math.min(30, Number(maxPages) || 10)),
      modules,
      onProgress: sendProgress
    });

    updateState({
      running: false,
      statusText: 'Security Audit Completed'
    });

    console.log(`[DevWebAudit Security] Completed security audit for ${targetUrl} (Score: ${resultPayload.securityReport.json.overallScore}/100, Grade: ${resultPayload.securityReport.json.grade})`);

    if (wantStream) {
      res.write(JSON.stringify(resultPayload) + '\n');
      res.end();
    } else {
      res.json(resultPayload);
    }
  } catch (error) {
    console.error('[DevWebAudit Security] Security audit failed:', error);
    updateState({
      running: false,
      statusText: `Error: ${error.message || 'Security scan failed'}`
    });

    const errPayload = {
      ok: false,
      type: 'error',
      error: error.message || 'Failed to run security audit.'
    };

    if (wantStream) {
      if (!res.writableEnded) {
        res.write(JSON.stringify(errPayload) + '\n');
        res.end();
      }
    } else if (!res.headersSent) {
      res.status(500).json(errPayload);
    }
  }
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'DevWebAudit Cloud Security & Speed Engine',
    version: '2.0.2',
    mode: PUBLIC_CLOUD_MODE ? 'cloud' : 'local',
    endpoints: {
      health: '/api/health',
      psi: 'GET /api/psi',
      securityAudit: 'POST /api/security-audit'
    },
    repository: 'https://github.com/Deshan-Chandima/sitelens-ai'
  });
});

if (!IS_VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log('==============================================================');
    console.log(` DevWebAudit Engine v2.0.2 is ONLINE (${PUBLIC_CLOUD_MODE ? 'PUBLIC CLOUD MODE' : 'LOCAL MODE'})`);
    console.log(` Listening at: http://${HOST}:${PORT}`);
    console.log(` Health Check: /api/health`);
    console.log(` Audit API:    POST /api/audit (${DISABLE_LOCAL_LIGHTHOUSE ? 'disabled - PSI mode' : 'enabled'})`);
    console.log(` Security API: POST /api/security-audit (enabled${PUBLIC_CLOUD_MODE ? ', SSRF-guarded + rate-limited' : ''})`);
    console.log('==============================================================');
  });
}

export default app;
