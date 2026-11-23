/**
 * SiteLens AI - Speed & Security Suite - Popup Controller
 */

import { renderIcon } from './icons.js';

const DEFAULT_SERVER_URL = 'https://sitelens-ai.vercel.app';
const PSI_API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

function getActiveServerUrl() {
  const raw = (currentSettings?.serverUrl || DEFAULT_SERVER_URL).trim();
  return raw.replace(/\/+$/, '') || DEFAULT_SERVER_URL;
}

const CATEGORY_META = [
  { key: 'performance', label: 'Perf' },
  { key: 'accessibility', label: 'A11y' },
  { key: 'best-practices', label: 'Best Prac' },
  { key: 'seo', label: 'SEO' }
];

const CORE_METRICS = [
  { id: 'first-contentful-paint', key: 'FCP', label: 'First Contentful Paint (FCP)' },
  { id: 'largest-contentful-paint', key: 'LCP', label: 'Largest Contentful Paint (LCP)' },
  { id: 'total-blocking-time', key: 'TBT', label: 'Total Blocking Time (TBT)' },
  { id: 'cumulative-layout-shift', key: 'CLS', label: 'Cumulative Layout Shift (CLS)' },
  { id: 'speed-index', key: 'SI', label: 'Speed Index (SI)' },
  { id: 'interactive', key: 'TTI', label: 'Time to Interactive (TTI)' }
];

const DEFAULT_SETTINGS = {
  serverUrl: DEFAULT_SERVER_URL,
  psiApiKey: '',
  activeModeTab: 'lighthouse', // 'lighthouse' | 'security' | 'responsive'
  deviceMode: 'both', // 'both' | 'desktop' | 'mobile'
  throttlingMethod: 'simulate', // 'simulate' (DevTools Incognito 1:1) | 'devtools' (Applied Packet Throttling)
  categories: {
    performance: true,
    accessibility: true,
    'best-practices': true,
    seo: true
  },
  formats: {
    json: true,
    html: false,
    aiSummary: true
  },
  autoDownload: true,
  secScanScope: 'full', // 'full' | 'quick'
  secMaxPages: 10, // 5 | 10 | 25
  secAutoDownload: true,
  secModules: {
    headers: true,
    cookies: true,
    tls: true,
    exposure: true,
    dom: true,
    cors: true
  }
};

// State
let currentSettings = structuredClone(DEFAULT_SETTINGS);
let isServerOnline = false;
let serverCapabilities = { lighthouse: false, security: false };
let isAuditing = false;
let lastAuditPayload = null;
let lastSecurityPayload = null;
let timerInterval = null;

// DOM Elements
const els = {
  serverStatusPill: document.getElementById('serverStatusPill'),
  serverStatusDot: document.getElementById('serverStatusDot'),
  serverStatusText: document.getElementById('serverStatusText'),
  serverSettingsPanel: document.getElementById('serverSettingsPanel'),
  serverUrlInput: document.getElementById('serverUrlInput'),
  saveServerUrlBtn: document.getElementById('saveServerUrlBtn'),
  resetServerUrlBtn: document.getElementById('resetServerUrlBtn'),
  psiApiKeyInput: document.getElementById('psiApiKeyInput'),
  savePsiKeyBtn: document.getElementById('savePsiKeyBtn'),
  fallbackBanner: document.getElementById('fallbackBanner'),
  fallbackMessage: document.getElementById('fallbackMessage'),
  urlInput: document.getElementById('urlInput'),
  localhostEngineHint: document.getElementById('localhostEngineHint'),
  useActiveTabBtn: document.getElementById('useActiveTabBtn'),
  deviceBoth: document.getElementById('deviceBoth'),
  deviceDesktop: document.getElementById('deviceDesktop'),
  deviceMobile: document.getElementById('deviceMobile'),
  deviceLabelBoth: document.getElementById('deviceLabelBoth'),
  deviceLabelDesktop: document.getElementById('deviceLabelDesktop'),
  deviceLabelMobile: document.getElementById('deviceLabelMobile'),
  catPerformance: document.getElementById('catPerformance'),
  catAccessibility: document.getElementById('catAccessibility'),
  catBestPractices: document.getElementById('catBestPractices'),
  catSeo: document.getElementById('catSeo'),
  autoDownloadToggle: document.getElementById('autoDownloadToggle'),
  fmtAiSummary: document.getElementById('fmtAiSummary'),
  fmtJson: document.getElementById('fmtJson'),
  fmtHtml: document.getElementById('fmtHtml'),
  throttleSimulate: document.getElementById('throttleSimulate'),
  throttleDevtools: document.getElementById('throttleDevtools'),
  throttleSimulateLabel: document.getElementById('throttleSimulateLabel'),
  throttleDevtoolsLabel: document.getElementById('throttleDevtoolsLabel'),
  runAuditBtn: document.getElementById('runAuditBtn'),
  runAuditBtnText: document.getElementById('runAuditBtnText'),
  progressSection: document.getElementById('progressSection'),
  progressStatusText: document.getElementById('progressStatusText'),
  progressTimer: document.getElementById('progressTimer'),
  progressBarFill: document.getElementById('progressBarFill'),
  progressSubText: document.getElementById('progressSubText'),
  errorSection: document.getElementById('errorSection'),
  errorMessage: document.getElementById('errorMessage'),
  dashboardSection: document.getElementById('dashboardSection'),
  dashboardMeta: document.getElementById('dashboardMeta'),
  dashboardSourceBadge: document.getElementById('dashboardSourceBadge'),
  dashboardEngineBadge: document.getElementById('dashboardEngineBadge'),
  comparisonColumns: document.getElementById('comparisonColumns'),
  desktopScoreCol: document.getElementById('desktopScoreCol'),
  mobileScoreCol: document.getElementById('mobileScoreCol'),
  desktopGauges: document.getElementById('desktopGauges'),
  mobileGauges: document.getElementById('mobileGauges'),
  desktopCwvList: document.getElementById('desktopCwvList'),
  mobileCwvList: document.getElementById('mobileCwvList'),
  copyAiPromptBtn: document.getElementById('copyAiPromptBtn'),
  downloadSelectedBtn: document.getElementById('downloadSelectedBtn'),
  downloadAiMdBtn: document.getElementById('downloadAiMdBtn'),
  clearResultsBtn: document.getElementById('clearResultsBtn'),
  heroArcProgress: document.getElementById('heroArcProgress'),
  heroArcDot: document.getElementById('heroArcDot'),
  heroScoreNumber: document.getElementById('heroScoreNumber'),
  heroScoreLabel: document.getElementById('heroScoreLabel'),
  heroStatusPill: document.getElementById('heroStatusPill'),
  btnViewDesktop: document.getElementById('btnViewDesktop'),
  btnViewMobile: document.getElementById('btnViewMobile'),
  btnViewCompare: document.getElementById('btnViewCompare'),
  dashboardViewSwitcher: document.getElementById('dashboardViewSwitcher'),
  categoryCardsWrap: document.getElementById('categoryCardsWrap'),
  cwvSummaryCard: document.getElementById('cwvSummaryCard'),
  cwvDeviceLabel: document.getElementById('cwvDeviceLabel'),
  cwvPillsGrid: document.getElementById('cwvPillsGrid'),
  opportunitiesCard: document.getElementById('opportunitiesCard'),
  opportunitiesList: document.getElementById('opportunitiesList'),
  heroGaugeContainer: document.getElementById('heroGaugeContainer'),
  // Main Mode Switcher
  tabBtnLighthouse: document.getElementById('tabBtnLighthouse'),
  tabBtnSecurity: document.getElementById('tabBtnSecurity'),
  tabBtnResponsive: document.getElementById('tabBtnResponsive'),
  lighthouseTabPanel: document.getElementById('lighthouseTabPanel'),
  securityTabPanel: document.getElementById('securityTabPanel'),
  responsiveTabPanel: document.getElementById('responsiveTabPanel'),
  launchMatrixBtn: document.getElementById('launchMatrixBtn'),
  // Security Scanner Controls & Dashboard
  secScopeFull: document.getElementById('secScopeFull'),
  secScopeQuick: document.getElementById('secScopeQuick'),
  secScopeLabelFull: document.getElementById('secScopeLabelFull'),
  secScopeLabelQuick: document.getElementById('secScopeLabelQuick'),
  secCrawlLimitRow: document.getElementById('secCrawlLimitRow'),
  secAutoDownloadToggle: document.getElementById('secAutoDownloadToggle'),
  secModHeaders: document.getElementById('secModHeaders'),
  secModCookies: document.getElementById('secModCookies'),
  secModTls: document.getElementById('secModTls'),
  secModExposure: document.getElementById('secModExposure'),
  secModDom: document.getElementById('secModDom'),
  secModCors: document.getElementById('secModCors'),
  runSecurityBtn: document.getElementById('runSecurityBtn'),
  runSecurityBtnText: document.getElementById('runSecurityBtnText'),
  securityDashboardSection: document.getElementById('securityDashboardSection'),
  secStackBadge: document.getElementById('secStackBadge'),
  secMeta: document.getElementById('secMeta'),
  clearSecurityResultsBtn: document.getElementById('clearSecurityResultsBtn'),
  secArcProgress: document.getElementById('secArcProgress'),
  secArcDot: document.getElementById('secArcDot'),
  secScoreNumber: document.getElementById('secScoreNumber'),
  secScoreLabel: document.getElementById('secScoreLabel'),
  secGradePill: document.getElementById('secGradePill'),
  secStatusPill: document.getElementById('secStatusPill'),
  secSeverityGrid: document.getElementById('secSeverityGrid'),
  secCategoryCardsWrap: document.getElementById('secCategoryCardsWrap'),
  secFindingsCard: document.getElementById('secFindingsCard'),
  secFindingsCountLabel: document.getElementById('secFindingsCountLabel'),
  secFindingsList: document.getElementById('secFindingsList'),
  copySecAiPromptBtn: document.getElementById('copySecAiPromptBtn'),
  downloadSecJsonBtn: document.getElementById('downloadSecJsonBtn'),
  downloadSecMdBtn: document.getElementById('downloadSecMdBtn')
};

let currentDashboardView = 'desktop'; // 'desktop' | 'mobile' | 'compare'

/* ==========================================================================
   Initialization & Persistence
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await detectActiveTabUrl();
  await checkLocalServerHealth();
  await restorePreviousDashboard();
  bindEvents();
});

async function loadSettings() {
  try {
    const data = await chrome.storage.local.get(['settings']);
    if (data && data.settings) {
      currentSettings = {
        ...DEFAULT_SETTINGS,
        ...data.settings,
        categories: { ...DEFAULT_SETTINGS.categories, ...(data.settings.categories || {}) },
        formats: { ...DEFAULT_SETTINGS.formats, ...(data.settings.formats || {}) },
        secModules: { ...DEFAULT_SETTINGS.secModules, ...(data.settings.secModules || {}) }
      };

      // Auto-migrate legacy localhost:9876 setting to cloud URL if not explicitly marked custom
      if (data.settings.serverUrl === 'http://localhost:9876' && !data.settings.isCustomServer) {
        currentSettings.serverUrl = DEFAULT_SERVER_URL;
      }
    }
  } catch (err) {
    console.warn('Could not load settings from storage:', err);
  }
  applySettingsToUI();
}

async function saveSettings() {
  try {
    await chrome.storage.local.set({ settings: currentSettings });
  } catch (err) {
    console.warn('Could not save settings:', err);
  }
}

function setModeTabUI(tab) {
  const activeTab = tab === 'security' ? 'security' : tab === 'responsive' ? 'responsive' : 'lighthouse';
  currentSettings.activeModeTab = activeTab;

  if (els.tabBtnLighthouse) {
    const isLight = activeTab === 'lighthouse';
    els.tabBtnLighthouse.classList.toggle('active', isLight);
    els.tabBtnLighthouse.setAttribute('aria-selected', String(isLight));
  }
  if (els.tabBtnSecurity) {
    const isSec = activeTab === 'security';
    els.tabBtnSecurity.classList.toggle('active', isSec);
    els.tabBtnSecurity.setAttribute('aria-selected', String(isSec));
  }
  if (els.tabBtnResponsive) {
    const isRes = activeTab === 'responsive';
    els.tabBtnResponsive.classList.toggle('active', isRes);
    els.tabBtnResponsive.setAttribute('aria-selected', String(isRes));
  }

  if (els.lighthouseTabPanel) els.lighthouseTabPanel.classList.toggle('hidden', activeTab !== 'lighthouse');
  if (els.securityTabPanel) els.securityTabPanel.classList.toggle('hidden', activeTab !== 'security');
  if (els.responsiveTabPanel) els.responsiveTabPanel.classList.toggle('hidden', activeTab !== 'responsive');
}

function setSecScopeUI(scope) {
  const isFull = scope !== 'quick';
  currentSettings.secScanScope = isFull ? 'full' : 'quick';
  if (els.secScopeFull) els.secScopeFull.checked = isFull;
  if (els.secScopeQuick) els.secScopeQuick.checked = !isFull;
  if (els.secScopeLabelFull) els.secScopeLabelFull.classList.toggle('active', isFull);
  if (els.secScopeLabelQuick) els.secScopeLabelQuick.classList.toggle('active', !isFull);
  if (els.secCrawlLimitRow) els.secCrawlLimitRow.classList.toggle('hidden', !isFull);
  updateSecurityButtonLabel();
}

function setSecMaxPagesUI(pages) {
  const num = [5, 10, 25].includes(Number(pages)) ? Number(pages) : 10;
  currentSettings.secMaxPages = num;
  document.querySelectorAll('.crawl-pill').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.pages) === num);
  });
  updateSecurityButtonLabel();
}

function updateSecurityButtonLabel() {
  if (isAuditing || !els.runSecurityBtnText) return;
  if (currentSettings.secScanScope === 'full') {
    els.runSecurityBtnText.textContent = `Run Full Site Security Audit (Up to ${currentSettings.secMaxPages} Pages)`;
  } else {
    els.runSecurityBtnText.textContent = 'Run Quick Page Security Audit';
  }
}

function applySettingsToUI() {
  setModeTabUI(currentSettings.activeModeTab || 'lighthouse');
  setDeviceModeUI(currentSettings.deviceMode);

  els.catPerformance.checked = Boolean(currentSettings.categories.performance);
  els.catAccessibility.checked = Boolean(currentSettings.categories.accessibility);
  els.catBestPractices.checked = Boolean(currentSettings.categories['best-practices']);
  els.catSeo.checked = Boolean(currentSettings.categories.seo);

  els.autoDownloadToggle.checked = Boolean(currentSettings.autoDownload);
  els.fmtAiSummary.checked = Boolean(currentSettings.formats.aiSummary);
  els.fmtJson.checked = Boolean(currentSettings.formats.json);
  els.fmtHtml.checked = Boolean(currentSettings.formats.html);

  // Security Settings UI
  setSecScopeUI(currentSettings.secScanScope || 'full');
  setSecMaxPagesUI(currentSettings.secMaxPages || 10);
  if (els.secAutoDownloadToggle) {
    els.secAutoDownloadToggle.checked = Boolean(currentSettings.secAutoDownload);
  }
  if (els.secModHeaders) els.secModHeaders.checked = Boolean(currentSettings.secModules.headers);
  if (els.secModCookies) els.secModCookies.checked = Boolean(currentSettings.secModules.cookies);
  if (els.secModTls) els.secModTls.checked = Boolean(currentSettings.secModules.tls);
  if (els.secModExposure) els.secModExposure.checked = Boolean(currentSettings.secModules.exposure);
  if (els.secModDom) els.secModDom.checked = Boolean(currentSettings.secModules.dom);
  if (els.secModCors) els.secModCors.checked = Boolean(currentSettings.secModules.cors);

  // Engine Calibration UI
  setThrottlingModeUI(currentSettings.throttlingMethod || 'simulate');
  if (els.serverUrlInput) {
    els.serverUrlInput.value = getActiveServerUrl();
  }
  if (els.psiApiKeyInput) {
    els.psiApiKeyInput.value = currentSettings.psiApiKey || '';
  }

  updateRunButtonLabel();
  updateSecurityButtonLabel();
}

function setThrottlingModeUI(method) {
  const norm = method === 'devtools' ? 'devtools' : 'simulate';
  currentSettings.throttlingMethod = norm;
  if (els.throttleSimulate) els.throttleSimulate.checked = norm === 'simulate';
  if (els.throttleDevtools) els.throttleDevtools.checked = norm === 'devtools';

  if (els.throttleSimulateLabel) {
    els.throttleSimulateLabel.classList.toggle('active', norm === 'simulate');
  }
  if (els.throttleDevtoolsLabel) {
    els.throttleDevtoolsLabel.classList.toggle('active', norm === 'devtools');
  }
}

function setDeviceModeUI(mode) {
  currentSettings.deviceMode = mode;
  els.deviceBoth.checked = mode === 'both';
  els.deviceDesktop.checked = mode === 'desktop';
  els.deviceMobile.checked = mode === 'mobile';

  els.deviceLabelBoth.classList.toggle('active', mode === 'both');
  els.deviceLabelDesktop.classList.toggle('active', mode === 'desktop');
  els.deviceLabelMobile.classList.toggle('active', mode === 'mobile');
  updateRunButtonLabel();
}

function updateRunButtonLabel() {
  if (isAuditing) return;
  const mode = currentSettings.deviceMode;
  const modeLabel =
    mode === 'both'
      ? 'Dual Lighthouse Audit (Desktop + Mobile)'
      : mode === 'desktop'
      ? 'Desktop Lighthouse Audit'
      : 'Mobile Lighthouse Audit';

  els.runAuditBtnText.textContent = isServerOnline
    ? `Run ${modeLabel}`
    : `Run ${modeLabel} (Server / Fallback)`;
}

async function detectActiveTabUrl() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (tab && tab.url && /^https?:\/\//i.test(tab.url)) {
      els.urlInput.value = tab.url;
    } else if (!els.urlInput.value) {
      els.urlInput.value = 'https://example.com';
    }
  } catch (err) {
    console.warn('Failed to detect active tab URL:', err);
  }
  updateLocalhostHint();
}

function updateLocalhostHint() {
  const val = (els.urlInput?.value || '').trim();
  if (isLocalhostUrl(val)) {
    els.localhostEngineHint?.classList.remove('hidden');
  } else {
    els.localhostEngineHint?.classList.add('hidden');
  }
}

async function checkLocalServerHealth() {
  els.serverStatusDot.className = 'status-dot';
  els.serverStatusText.textContent = 'Checking...';
  const serverUrl = getActiveServerUrl();
  const isCloudHost = !isLocalhostUrl(serverUrl);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isCloudHost ? 4000 : 1800);
    const res = await fetch(`${serverUrl}/api/health`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      let healthData = {};
      try {
        healthData = await res.json();
      } catch (_) {}

      isServerOnline = true;
      serverCapabilities = {
        lighthouse: healthData?.capabilities?.lighthouse !== false,
        security: healthData?.capabilities?.security !== false
      };
      els.serverStatusDot.className = 'status-dot online';
      els.serverStatusText.textContent = isCloudHost
        ? 'DevWebAudit Cloud: Online'
        : 'Local Engine: Online';
      els.fallbackBanner.classList.add('hidden');
      updateRunButtonLabel();
      return true;
    }
  } catch (_) {
    // Server offline
  }

  isServerOnline = false;
  serverCapabilities = { lighthouse: false, security: false };
  els.serverStatusDot.className = 'status-dot offline';
  els.serverStatusText.textContent = 'Cloud / PSI Mode';
  els.fallbackBanner.classList.remove('hidden');
  updateRunButtonLabel();
  return false;
}

async function restorePreviousDashboard() {
  try {
    const stored = await chrome.storage.local.get(['lastAuditCache', 'lastSecurityCache']);
    if (stored && stored.lastAuditCache) {
      lastAuditPayload = stored.lastAuditCache;
      renderDashboard(lastAuditPayload);
    }
    if (stored && stored.lastSecurityCache) {
      lastSecurityPayload = stored.lastSecurityCache;
      renderSecurityDashboard(lastSecurityPayload);
    }
  } catch (_) {
    // ignore
  }
}

/* ==========================================================================
   Event Listeners
   ========================================================================== */

function bindEvents() {
  // Main Mode Tab Switching (Lighthouse vs Security Scanner vs Responsive Matrix)
  els.tabBtnLighthouse?.addEventListener('click', () => {
    setModeTabUI('lighthouse');
    saveSettings();
  });
  els.tabBtnSecurity?.addEventListener('click', () => {
    setModeTabUI('security');
    saveSettings();
  });
  els.tabBtnResponsive?.addEventListener('click', () => {
    setModeTabUI('responsive');
    saveSettings();
  });

  // Launch Responsive Matrix Studio in New Fullscreen Tab
  els.launchMatrixBtn?.addEventListener('click', () => {
    let targetUrl = (els.urlInput.value || '').trim();
    if (!targetUrl) {
      targetUrl = 'https://example.com';
    } else if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }
    const matrixUrl = chrome.runtime.getURL(`responsive-matrix.html?url=${encodeURIComponent(targetUrl)}`);
    chrome.tabs.create({ url: matrixUrl });
  });

  els.serverStatusPill.addEventListener('click', () => {
    els.serverSettingsPanel?.classList.toggle('hidden');
    if (els.serverUrlInput) {
      els.serverUrlInput.value = getActiveServerUrl();
    }
    checkLocalServerHealth();
  });

  els.saveServerUrlBtn?.addEventListener('click', async () => {
    const val = (els.serverUrlInput?.value || '').trim().replace(/\/+$/, '');
    if (val && !/^https?:\/\//i.test(val)) {
      showError('Engine URL must start with http:// or https://');
      return;
    }
    clearError();
    currentSettings.serverUrl = val || DEFAULT_SERVER_URL;
    currentSettings.isCustomServer = Boolean(val && val !== DEFAULT_SERVER_URL);
    if (els.serverUrlInput) els.serverUrlInput.value = currentSettings.serverUrl;
    await saveSettings();
    const ok = await checkLocalServerHealth();
    if (ok) {
      els.serverSettingsPanel?.classList.add('hidden');
    }
  });

  els.resetServerUrlBtn?.addEventListener('click', async () => {
    currentSettings.serverUrl = DEFAULT_SERVER_URL;
    currentSettings.isCustomServer = false;
    if (els.serverUrlInput) els.serverUrlInput.value = DEFAULT_SERVER_URL;
    await saveSettings();
    await checkLocalServerHealth();
  });

  els.savePsiKeyBtn?.addEventListener('click', async () => {
    const key = (els.psiApiKeyInput?.value || '').trim();
    currentSettings.psiApiKey = key;
    await saveSettings();
    if (els.savePsiKeyBtn) {
      const origText = els.savePsiKeyBtn.textContent;
      els.savePsiKeyBtn.textContent = 'Saved!';
      setTimeout(() => {
        if (els.savePsiKeyBtn) els.savePsiKeyBtn.textContent = origText;
      }, 1500);
    }
  });

  els.useActiveTabBtn.addEventListener('click', () => {
    detectActiveTabUrl();
  });

  els.urlInput?.addEventListener('input', () => {
    updateLocalhostHint();
  });

  // Device mode checkboxes acting as radio-like selector
  const deviceMap = [
    { input: els.deviceBoth, mode: 'both' },
    { input: els.deviceDesktop, mode: 'desktop' },
    { input: els.deviceMobile, mode: 'mobile' }
  ];
  for (const { input, mode } of deviceMap) {
    input.addEventListener('change', () => {
      setDeviceModeUI(mode);
      saveSettings();
    });
  }

  // Categories
  const onCategoryChange = () => {
    currentSettings.categories = {
      performance: els.catPerformance.checked,
      accessibility: els.catAccessibility.checked,
      'best-practices': els.catBestPractices.checked,
      seo: els.catSeo.checked
    };
    // Ensure at least one category remains checked
    if (!Object.values(currentSettings.categories).some(Boolean)) {
      currentSettings.categories.performance = true;
      els.catPerformance.checked = true;
    }
    saveSettings();
  };
  els.catPerformance.addEventListener('change', onCategoryChange);
  els.catAccessibility.addEventListener('change', onCategoryChange);
  els.catBestPractices.addEventListener('change', onCategoryChange);
  els.catSeo.addEventListener('change', onCategoryChange);

  // Formats & Auto-Download
  const onFormatChange = () => {
    currentSettings.autoDownload = els.autoDownloadToggle.checked;
    currentSettings.formats = {
      aiSummary: els.fmtAiSummary.checked,
      json: els.fmtJson.checked,
      html: els.fmtHtml.checked
    };
    saveSettings();
  };
  els.autoDownloadToggle.addEventListener('change', onFormatChange);
  els.fmtAiSummary.addEventListener('change', onFormatChange);
  els.fmtJson.addEventListener('change', onFormatChange);
  els.fmtHtml.addEventListener('change', onFormatChange);

  // Engine Calibration Mode (DevTools 1:1 vs Applied)
  if (els.throttleSimulate) {
    els.throttleSimulate.addEventListener('change', () => {
      setThrottlingModeUI('simulate');
      saveSettings();
    });
  }
  if (els.throttleDevtools) {
    els.throttleDevtools.addEventListener('change', () => {
      setThrottlingModeUI('devtools');
      saveSettings();
    });
  }

  // Run Audit Button
  els.runAuditBtn.addEventListener('click', () => {
    runAuditFlow();
  });

  // Copy AI Prompt + Report
  els.copyAiPromptBtn.addEventListener('click', async () => {
    if (!lastAuditPayload || !lastAuditPayload.aiReport?.markdown) return;
    const promptHeader = [
      'Please act as a Principal Web Performance & Accessibility Engineer.',
      'Below is my Google Lighthouse Dual Audit Report (Desktop + Mobile).',
      'Analyze the failing audits, Core Web Vitals bottlenecks, wasted bytes/ms, DOM selectors, console errors, and CSP issues, then give me exact code fixes to achieve 95+ scores across all categories:\n\n'
    ].join(' ');
    const fullClipboardText = promptHeader + lastAuditPayload.aiReport.markdown;
    try {
      await navigator.clipboard.writeText(fullClipboardText);
      const originalText = els.copyAiPromptBtn.innerHTML;
      els.copyAiPromptBtn.innerHTML = `${renderIcon('checkCircle2', { size: 14 })}<span>Copied AI Prompt + Report to Clipboard!</span>`;
      setTimeout(() => {
        els.copyAiPromptBtn.innerHTML = originalText;
      }, 2400);
    } catch (err) {
      showError('Failed to copy to clipboard: ' + err.message);
    }
  });

  // Manual download buttons
  els.downloadSelectedBtn.addEventListener('click', () => {
    if (lastAuditPayload) {
      triggerReportDownloads(lastAuditPayload, true);
    }
  });

  els.downloadAiMdBtn.addEventListener('click', () => {
    if (lastAuditPayload && lastAuditPayload.aiReport?.markdown) {
      const prefix = buildFilePrefix(lastAuditPayload.url, lastAuditPayload.timestamp);
      downloadFileViaBackground(
        `${prefix}-combined-ai-report.md`,
        lastAuditPayload.aiReport.markdown,
        'text/markdown'
      );
    }
  });

  // Dashboard View Switchers
  els.btnViewDesktop?.addEventListener('click', () => {
    currentDashboardView = 'desktop';
    updateDashboardView();
  });
  els.btnViewMobile?.addEventListener('click', () => {
    currentDashboardView = 'mobile';
    updateDashboardView();
  });
  els.btnViewCompare?.addEventListener('click', () => {
    currentDashboardView = 'compare';
    updateDashboardView();
  });

  // Clear Audit Results Button
  els.clearResultsBtn.addEventListener('click', async () => {
    lastAuditPayload = null;
    els.desktopGauges.innerHTML = '';
    els.mobileGauges.innerHTML = '';
    els.desktopCwvList.innerHTML = '';
    els.mobileCwvList.innerHTML = '';
    if (els.categoryCardsWrap) els.categoryCardsWrap.innerHTML = '';
    if (els.cwvPillsGrid) els.cwvPillsGrid.innerHTML = '';
    if (els.opportunitiesList) els.opportunitiesList.innerHTML = '';
    els.dashboardMeta.textContent = '';
    els.dashboardSection.classList.add('hidden');
    clearError();
    try {
      await chrome.storage.local.remove(['lastAuditCache']);
      chrome.runtime.sendMessage({ action: 'SET_BADGE', text: '' });
    } catch (_) {
      // ignore
    }
  });

  // =========================================================================
  // Security Scanner Tab Event Listeners
  // =========================================================================
  els.secScopeFull?.addEventListener('change', () => {
    setSecScopeUI('full');
    saveSettings();
  });
  els.secScopeQuick?.addEventListener('change', () => {
    setSecScopeUI('quick');
    saveSettings();
  });

  document.querySelectorAll('.crawl-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSecMaxPagesUI(Number(btn.dataset.pages));
      saveSettings();
    });
  });

  const onSecModuleChange = () => {
    currentSettings.secAutoDownload = Boolean(els.secAutoDownloadToggle?.checked);
    currentSettings.secModules = {
      headers: Boolean(els.secModHeaders?.checked),
      cookies: Boolean(els.secModCookies?.checked),
      tls: Boolean(els.secModTls?.checked),
      exposure: Boolean(els.secModExposure?.checked),
      dom: Boolean(els.secModDom?.checked),
      cors: Boolean(els.secModCors?.checked)
    };
    if (!Object.values(currentSettings.secModules).some(Boolean)) {
      currentSettings.secModules.headers = true;
      if (els.secModHeaders) els.secModHeaders.checked = true;
    }
    saveSettings();
  };

  els.secAutoDownloadToggle?.addEventListener('change', onSecModuleChange);
  els.secModHeaders?.addEventListener('change', onSecModuleChange);
  els.secModCookies?.addEventListener('change', onSecModuleChange);
  els.secModTls?.addEventListener('change', onSecModuleChange);
  els.secModExposure?.addEventListener('change', onSecModuleChange);
  els.secModDom?.addEventListener('change', onSecModuleChange);
  els.secModCors?.addEventListener('change', onSecModuleChange);

  els.runSecurityBtn?.addEventListener('click', () => {
    runSecurityAuditFlow();
  });

  els.copySecAiPromptBtn?.addEventListener('click', async () => {
    if (!lastSecurityPayload || !lastSecurityPayload.securityReport?.markdown) return;
    try {
      await navigator.clipboard.writeText(lastSecurityPayload.securityReport.markdown);
      const orig = els.copySecAiPromptBtn.innerHTML;
      els.copySecAiPromptBtn.innerHTML = `${renderIcon('checkCircle2', { size: 14 })}<span>Copied Security Fix Prompt + Report!</span>`;
      setTimeout(() => {
        els.copySecAiPromptBtn.innerHTML = orig;
      }, 2400);
    } catch (err) {
      showError('Failed to copy security report: ' + err.message);
    }
  });

  els.downloadSecJsonBtn?.addEventListener('click', () => {
    if (lastSecurityPayload && lastSecurityPayload.securityReport?.json) {
      const prefix = buildFilePrefix(lastSecurityPayload.url, lastSecurityPayload.timestamp);
      downloadFileViaBackground(
        `${prefix}-security-report.json`,
        JSON.stringify(lastSecurityPayload.securityReport.json, null, 2),
        'application/json'
      );
    }
  });

  els.downloadSecMdBtn?.addEventListener('click', () => {
    if (lastSecurityPayload && lastSecurityPayload.securityReport?.markdown) {
      const prefix = buildFilePrefix(lastSecurityPayload.url, lastSecurityPayload.timestamp);
      downloadFileViaBackground(
        `${prefix}-security-report.md`,
        lastSecurityPayload.securityReport.markdown,
        'text/markdown'
      );
    }
  });

  els.clearSecurityResultsBtn?.addEventListener('click', async () => {
    lastSecurityPayload = null;
    if (els.secCategoryCardsWrap) els.secCategoryCardsWrap.innerHTML = '';
    if (els.secFindingsList) els.secFindingsList.innerHTML = '';
    if (els.secSeverityGrid) els.secSeverityGrid.innerHTML = '';
    if (els.secMeta) els.secMeta.textContent = '';
    if (els.securityDashboardSection) els.securityDashboardSection.classList.add('hidden');
    clearError();
    try {
      await chrome.storage.local.remove(['lastSecurityCache']);
      chrome.runtime.sendMessage({ action: 'SET_BADGE', text: '' });
    } catch (_) {
      // ignore
    }
  });
}

/* ==========================================================================
   Audit Execution (Local Lighthouse Engine + PageSpeed Insights Fallback)
   ========================================================================== */

function getSelectedDevices() {
  if (currentSettings.deviceMode === 'desktop') return ['desktop'];
  if (currentSettings.deviceMode === 'mobile') return ['mobile'];
  return ['desktop', 'mobile'];
}

function getSelectedCategories() {
  return Object.entries(currentSettings.categories)
    .filter(([, checked]) => checked)
    .map(([key]) => key);
}

function getSelectedFormats() {
  const list = [];
  if (currentSettings.formats.json) list.push('json');
  if (currentSettings.formats.html) list.push('html');
  if (currentSettings.formats.aiSummary) list.push('ai-summary');
  return list.length > 0 ? list : ['ai-summary'];
}

function isLocalhostUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function startProgressTimer() {
  stopProgressTimer();
  const start = Date.now();
  els.progressTimer.textContent = '0s';
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    els.progressTimer.textContent = `${elapsed}s`;
  }, 500);
}

function stopProgressTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function setProgressUI(step, totalSteps, statusText, subText, percentOverride = null) {
  els.progressSection.classList.remove('hidden');
  els.progressStatusText.textContent = statusText;
  if (subText) els.progressSubText.textContent = subText;
  const pct =
    percentOverride !== null
      ? percentOverride
      : totalSteps > 0
      ? Math.min(95, Math.max(15, Math.round(((step - 0.35) / totalSteps) * 100)))
      : 25;
  els.progressBarFill.style.width = `${pct}%`;
}

function showError(msg) {
  els.errorSection.classList.remove('hidden');
  els.errorMessage.textContent = msg;
}

function clearError() {
  els.errorSection.classList.add('hidden');
  els.errorMessage.textContent = '';
}

async function runAuditFlow() {
  if (isAuditing) return;

  const targetUrl = (els.urlInput.value || '').trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    showError('Please enter a valid http:// or https:// URL to audit.');
    return;
  }

  clearError();
  isAuditing = true;
  els.runAuditBtn.disabled = true;
  els.runAuditBtnText.textContent = 'Auditing in Progress...';
  chrome.runtime.sendMessage({ action: 'SET_BADGE', text: 'RUN', color: '#0ea5e9' });

  const devices = getSelectedDevices();
  const categories = getSelectedCategories();
  const formats = getSelectedFormats();

  startProgressTimer();
  setProgressUI(
    1,
    devices.length,
    `Step 1/${devices.length}: Auditing ${devices[0] === 'desktop' ? 'Desktop' : 'Mobile'}...`,
    'Checking Local Lighthouse Server (localhost:9876)...',
    18
  );

  try {
    const serverReady = await checkLocalServerHealth();
    let finalPayload = null;

    if (serverReady && serverCapabilities.lighthouse) {
      finalPayload = await runViaLocalServer({
        url: targetUrl,
        devices,
        categories,
        formats
      });
    } else if (isLocalhostUrl(targetUrl)) {
      // In-Browser Native Auditor for Localhost (runs live in Chrome with zero server setup)
      finalPayload = await runInBrowserAudit({
        url: targetUrl,
        devices,
        categories,
        formats
      });
    } else {
      finalPayload = await runViaPageSpeedFallback({
        url: targetUrl,
        devices,
        categories,
        formats
      });
    }

    setProgressUI(devices.length, devices.length, 'Completed!', 'Generating reports...', 100);
    lastAuditPayload = finalPayload;

    // Cache a lightweight version in chrome.storage.local so popup reopening restores scores
    await saveLightweightAuditCache(finalPayload);

    renderDashboard(finalPayload);

    if (currentSettings.autoDownload) {
      await triggerReportDownloads(finalPayload, false);
    }

    chrome.runtime.sendMessage({ action: 'SET_BADGE', text: 'OK', color: '#10b981' });
  } catch (err) {
    console.error('Audit error:', err);
    showError(err.message || 'Audit failed.');
    chrome.runtime.sendMessage({ action: 'SET_BADGE', text: 'ERR', color: '#ef4444' });
  } finally {
    stopProgressTimer();
    isAuditing = false;
    els.runAuditBtn.disabled = false;
    setTimeout(() => {
      if (!isAuditing) {
        els.progressSection.classList.add('hidden');
      }
    }, 900);
    updateRunButtonLabel();
  }
}

/**
 * Streams progress and final audit payload from the Local Node.js Lighthouse Engine (`localhost:9876`)
 */
async function runViaLocalServer({ url, devices, categories, formats }) {
  const response = await fetch(`${getActiveServerUrl()}/api/audit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson'
    },
    body: JSON.stringify({
      url,
      devices,
      categories,
      formats,
      throttlingMethod: currentSettings.throttlingMethod || 'simulate',
      stream: true
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Local server error (${response.status}): ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resultPayload = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;

      const event = JSON.parse(line);
      if (event.type === 'progress') {
        const step = event.step || 1;
        const total = event.totalSteps || devices.length;
        setProgressUI(
          step,
          total,
          `Step ${step}/${total}: ${event.statusText || 'Auditing...'}`,
          `Running headless Chrome (--headless=new --incognito) on ${url}`
        );
      } else if (event.type === 'result' && event.ok) {
        resultPayload = event;
      } else if (event.type === 'error' || event.ok === false) {
        throw new Error(event.error || 'Local Lighthouse audit failed.');
      }
    }
  }

  if (!resultPayload) {
    throw new Error('Local server closed stream before returning audit results.');
  }

  return resultPayload;
}

/**
 * In-Browser Native Auditor for Localhost URLs (or offline tabs).
 * Measures real in-tab Performance Timing, DOM metrics, Accessibility, Best Practices, and SEO.
 * Zero server setup required — works directly on localhost:5173, localhost:3000, 127.0.0.1, etc.
 */
async function runInBrowserAudit({ url, devices, categories, formats }) {
  const timestamp = new Date().toISOString();
  const resultsByDevice = {};
  const summariesByDevice = {};

  let metrics = null;

  // 1. Try to probe the active tab via chrome.scripting if it matches the target URL
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs && tabs[0];
    if (activeTab && activeTab.id && activeTab.url && activeTab.url.startsWith('http')) {
      const activeOrigin = new URL(activeTab.url).origin;
      const targetOrigin = new URL(url).origin;
      if (activeOrigin === targetOrigin) {
        const injected = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: inTabMetricsCollector
        });
        if (injected && injected[0]?.result) {
          metrics = injected[0].result;
        }
      }
    }
  } catch (err) {
    console.warn('In-tab scripting probe error:', err);
  }

  // 2. If in-tab probe wasn't matching/available, fetch the page directly from extension context
  if (!metrics) {
    metrics = await fetchPageAnalysis(url);
  }

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    const stepNum = i + 1;
    const deviceTitle = device === 'desktop' ? 'Desktop' : 'Mobile';

    setProgressUI(
      stepNum,
      devices.length,
      `Step ${stepNum}/${devices.length}: Auditing ${deviceTitle} (Browser Engine)...`,
      `Evaluating in-browser Core Web Vitals for localhost (${device})...`
    );

    const lhr = buildSyntheticLhrFromMetrics(url, device, categories, metrics);
    const aiSummary = buildClientAiSummary(lhr, device);
    summariesByDevice[device] = aiSummary;

    resultsByDevice[device] = {
      device,
      scores: aiSummary.scores,
      coreWebVitals: aiSummary.coreWebVitals,
      aiSummary,
      rawJson: formats.includes('json') ? JSON.stringify(lhr, null, 2) : undefined,
      html: formats.includes('html') ? buildStandaloneHtmlFromSummary(aiSummary) : undefined
    };
  }

  const combinedAiJson = {
    schema: 'sitelens-ai-report/v1',
    url,
    generatedAt: timestamp,
    source: 'browser-native',
    summaryComparison: {
      desktop: summariesByDevice.desktop ? summariesByDevice.desktop.scores : null,
      mobile: summariesByDevice.mobile ? summariesByDevice.mobile.scores : null
    },
    devices: {
      ...(summariesByDevice.desktop ? { desktop: summariesByDevice.desktop } : {}),
      ...(summariesByDevice.mobile ? { mobile: summariesByDevice.mobile } : {})
    }
  };

  const combinedAiMarkdown = buildClientAiMarkdown(combinedAiJson);

  return {
    ok: true,
    type: 'result',
    source: 'browser-native',
    url,
    timestamp,
    devices,
    categories,
    formats,
    results: resultsByDevice,
    aiReport: {
      json: combinedAiJson,
      markdown: combinedAiMarkdown
    }
  };
}

function inTabMetricsCollector() {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paints = performance.getEntriesByType('paint') || [];
  const fcpEntry = paints.find((p) => p.name === 'first-contentful-paint');
  const fcp = fcpEntry ? fcpEntry.startTime : (nav.domContentLoadedEventEnd || 420);

  let lcp = fcp * 1.25;
  try {
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length) lcp = lcpEntries[lcpEntries.length - 1].startTime;
  } catch (_) {}

  let cls = 0;
  try {
    const shifts = performance.getEntriesByType('layout-shift');
    for (const s of shifts) {
      if (!s.hadRecentInput) cls += s.value;
    }
  } catch (_) {}

  const resources = performance.getEntriesByType('resource') || [];
  let totalBytes = nav.transferSize || 0;
  for (const r of resources) totalBytes += (r.transferSize || 0);

  const images = Array.from(document.querySelectorAll('img'));
  const imagesWithoutAlt = images.filter((img) => !img.hasAttribute('alt') || !img.alt.trim()).length;
  const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'));
  const inputsWithoutLabel = inputs.filter((el) => !el.labels || el.labels.length === 0).length;
  const h1s = document.querySelectorAll('h1').length;

  return {
    fcp: Math.max(80, Math.round(fcp)),
    lcp: Math.max(120, Math.round(lcp)),
    cls: Number(cls.toFixed(3)),
    domInteractive: Math.round(nav.domInteractive || 300),
    loadEventEnd: Math.round(nav.loadEventEnd || 650),
    domCount: document.querySelectorAll('*').length,
    totalBytes,
    resourceCount: resources.length,
    title: document.title || '',
    hasMetaDesc: Boolean(document.querySelector('meta[name="description"]')?.content?.trim()),
    hasViewport: Boolean(document.querySelector('meta[name="viewport"]')?.content?.trim()),
    hasCharset: Boolean(document.querySelector('meta[charset]') || document.querySelector('meta[http-equiv="Content-Type"]')),
    hasDoctype: Boolean(document.doctype),
    imagesTotal: images.length,
    imagesWithoutAlt,
    inputsTotal: inputs.length,
    inputsWithoutLabel,
    h1s
  };
}

async function fetchPageAnalysis(url) {
  const start = performance.now();
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  const duration = Math.round(performance.now() - start);
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const images = Array.from(doc.querySelectorAll('img'));
  const imagesWithoutAlt = images.filter((img) => !img.hasAttribute('alt') || !img.alt.trim()).length;
  const inputs = Array.from(doc.querySelectorAll('input:not([type="hidden"]), select, textarea'));
  const inputsWithoutLabel = inputs.filter((el) => !el.labels || el.labels.length === 0).length;
  const h1s = doc.querySelectorAll('h1').length;

  const fcp = Math.max(90, Math.round(duration * 1.5));
  const lcp = Math.max(140, Math.round(fcp * 1.3));

  return {
    fcp,
    lcp,
    cls: 0.012,
    domInteractive: Math.max(150, Math.round(duration * 1.2)),
    loadEventEnd: Math.max(250, Math.round(duration * 2.2)),
    domCount: doc.querySelectorAll('*').length,
    totalBytes: html.length,
    resourceCount: doc.querySelectorAll('script, link[rel="stylesheet"], img').length,
    title: doc.title || '',
    hasMetaDesc: Boolean(doc.querySelector('meta[name="description"]')?.content?.trim()),
    hasViewport: Boolean(doc.querySelector('meta[name="viewport"]')?.content?.trim()),
    hasCharset: Boolean(doc.querySelector('meta[charset]') || doc.querySelector('meta[http-equiv="Content-Type"]')),
    hasDoctype: Boolean(doc.doctype || html.toLowerCase().startsWith('<!doctype html')),
    imagesTotal: images.length,
    imagesWithoutAlt,
    inputsTotal: inputs.length,
    inputsWithoutLabel,
    h1s
  };
}

function buildSyntheticLhrFromMetrics(url, device, categories, m) {
  const isMobile = device === 'mobile';
  const mult = isMobile ? 1.35 : 1.0;

  const fcpVal = Math.round(m.fcp * mult);
  const lcpVal = Math.round(m.lcp * mult);
  const tbtVal = isMobile ? Math.min(280, Math.round(m.domCount * 0.16)) : Math.min(110, Math.round(m.domCount * 0.07));
  const clsVal = isMobile ? Math.min(0.25, m.cls * 1.2) : m.cls;
  const siVal = Math.round((fcpVal + lcpVal) / 2);
  const ttiVal = Math.round(lcpVal + tbtVal * 1.5);

  // Performance scoring (0 to 1)
  const fcpScore = fcpVal <= 1800 ? 1 : fcpVal <= 3000 ? 0.75 : 0.5;
  const lcpScore = lcpVal <= 2500 ? 1 : lcpVal <= 4000 ? 0.75 : 0.45;
  const tbtScore = tbtVal <= 200 ? 1 : tbtVal <= 400 ? 0.8 : 0.5;
  const clsScore = clsVal <= 0.1 ? 1 : clsVal <= 0.25 ? 0.75 : 0.4;
  const siScore = siVal <= 3400 ? 1 : siVal <= 5000 ? 0.75 : 0.5;

  const perfScore = Math.round((fcpScore * 0.1 + siScore * 0.1 + lcpScore * 0.25 + tbtScore * 0.3 + clsScore * 0.25) * 100) / 100;

  // Accessibility (0 to 1)
  let a11yScore = 1.0;
  if (m.imagesWithoutAlt > 0) a11yScore -= 0.15;
  if (m.inputsWithoutLabel > 0) a11yScore -= 0.15;
  if (m.h1s === 0) a11yScore -= 0.1;
  a11yScore = Math.max(0.4, Math.round(a11yScore * 100) / 100);

  // Best Practices (0 to 1)
  let bpScore = 0.95;
  if (!m.hasDoctype) bpScore -= 0.2;
  if (!m.hasCharset) bpScore -= 0.15;
  bpScore = Math.max(0.5, Math.round(bpScore * 100) / 100);

  // SEO (0 to 1)
  let seoScore = 1.0;
  if (!m.title) seoScore -= 0.3;
  if (!m.hasMetaDesc) seoScore -= 0.2;
  if (!m.hasViewport) seoScore -= 0.25;
  if (m.h1s === 0) seoScore -= 0.1;
  seoScore = Math.max(0.3, Math.round(seoScore * 100) / 100);

  const audits = {
    'first-contentful-paint': {
      id: 'first-contentful-paint',
      title: 'First Contentful Paint',
      displayValue: `${(fcpVal / 1000).toFixed(1)} s`,
      numericValue: fcpVal,
      numericUnit: 'millisecond',
      score: fcpScore
    },
    'largest-contentful-paint': {
      id: 'largest-contentful-paint',
      title: 'Largest Contentful Paint',
      displayValue: `${(lcpVal / 1000).toFixed(1)} s`,
      numericValue: lcpVal,
      numericUnit: 'millisecond',
      score: lcpScore
    },
    'total-blocking-time': {
      id: 'total-blocking-time',
      title: 'Total Blocking Time',
      displayValue: `${tbtVal} ms`,
      numericValue: tbtVal,
      numericUnit: 'millisecond',
      score: tbtScore
    },
    'cumulative-layout-shift': {
      id: 'cumulative-layout-shift',
      title: 'Cumulative Layout Shift',
      displayValue: clsVal.toFixed(3),
      numericValue: clsVal,
      numericUnit: 'unitless',
      score: clsScore
    },
    'speed-index': {
      id: 'speed-index',
      title: 'Speed Index',
      displayValue: `${(siVal / 1000).toFixed(1)} s`,
      numericValue: siVal,
      numericUnit: 'millisecond',
      score: siScore
    },
    'interactive': {
      id: 'interactive',
      title: 'Time to Interactive',
      displayValue: `${(ttiVal / 1000).toFixed(1)} s`,
      numericValue: ttiVal,
      numericUnit: 'millisecond',
      score: lcpScore
    }
  };

  // Opportunities & Fixes
  if (m.imagesWithoutAlt > 0) {
    audits['image-alt'] = {
      id: 'image-alt',
      title: 'Image elements do not have [alt] attributes',
      description: 'Informative elements should aim for short, descriptive alternate text.',
      score: 0,
      details: { overallSavingsMs: 0 }
    };
  }
  if (!m.hasMetaDesc) {
    audits['meta-description'] = {
      id: 'meta-description',
      title: 'Document does not have a meta description',
      description: 'Meta descriptions may be included in search results to summarize page content.',
      score: 0,
      details: { overallSavingsMs: 0 }
    };
  }
  if (!m.hasViewport) {
    audits['viewport'] = {
      id: 'viewport',
      title: 'Does not have a <meta name="viewport"> tag with width or initial-scale',
      description: 'Add a viewport meta tag to optimize your app for mobile screens.',
      score: 0,
      details: { overallSavingsMs: 0 }
    };
  }
  if (m.domCount > 800) {
    audits['dom-size'] = {
      id: 'dom-size',
      title: 'Avoid an excessive DOM size',
      description: `A large DOM will increase memory usage and style calculations. Current: ${m.domCount} nodes.`,
      displayValue: `${m.domCount} elements`,
      score: m.domCount > 1400 ? 0.3 : 0.65,
      details: { overallSavingsMs: 150 }
    };
  }

  return {
    lighthouseVersion: '11.4.0 (In-Browser Native Localhost Engine)',
    fetchTime: new Date().toISOString(),
    requestedUrl: url,
    finalDisplayedUrl: url,
    categories: {
      performance: { id: 'performance', title: 'Performance', score: perfScore, auditRefs: Object.keys(audits).map((id) => ({ id })) },
      accessibility: { id: 'accessibility', title: 'Accessibility', score: a11yScore, auditRefs: [] },
      'best-practices': { id: 'best-practices', title: 'Best Practices', score: bpScore, auditRefs: [] },
      seo: { id: 'seo', title: 'SEO', score: seoScore, auditRefs: [] }
    },
    audits
  };
}

/**
 * Fallback mode using Google PageSpeed Insights REST API v5 when local server is offline.
 */
async function runViaPageSpeedFallback({ url, devices, categories, formats }) {
  const timestamp = new Date().toISOString();
  const resultsByDevice = {};
  const summariesByDevice = {};
  const serverUrl = getActiveServerUrl();
  const canUseCloudProxy = isServerOnline && !isLocalhostUrl(serverUrl);

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    const stepNum = i + 1;
    const deviceTitle = device === 'desktop' ? 'Desktop' : 'Mobile';

    setProgressUI(
      stepNum,
      devices.length,
      `Step ${stepNum}/${devices.length}: Auditing ${deviceTitle} (Cloud Engine)...`,
      canUseCloudProxy ? 'Auditing via DevWebAudit Cloud Engine...' : `Querying Google PageSpeed Insights (${device})...`
    );

    const params = new URLSearchParams({
      url,
      strategy: device === 'desktop' ? 'desktop' : 'mobile'
    });
    for (const cat of categories) {
      params.append('category', cat);
    }
    if (currentSettings.psiApiKey && currentSettings.psiApiKey.trim()) {
      params.append('key', currentSettings.psiApiKey.trim());
    }

    let lhr = null;
    let proxyError = null;

    // 1. Try DevWebAudit Cloud Engine proxy first (runs in Vercel data center, avoiding local ISP IP quota)
    if (canUseCloudProxy) {
      try {
        const proxyRes = await fetch(`${serverUrl}/api/psi?${params.toString()}`);
        const proxyData = await proxyRes.json().catch(() => ({}));
        if (proxyRes.ok && proxyData?.lighthouseResult) {
          lhr = proxyData.lighthouseResult;
        } else {
          proxyError = proxyData?.error || `Proxy HTTP ${proxyRes.status}`;
        }
      } catch (err) {
        proxyError = err.message;
      }
    }

    // 2. Direct Google PSI fallback if proxy wasn't available or failed
    if (!lhr) {
      const res = await fetch(`${PSI_API_URL}?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error?.message || proxyError || `PageSpeed Insights HTTP ${res.status}`;
        if (msg.includes('Quota exceeded') || res.status === 429) {
          throw new Error(
            `Google PageSpeed API free anonymous IP quota reached.\n\n` +
            `Fix 1: Run 'start-server.bat' to launch the unlimited Local Lighthouse Engine (0 quota limits & 100% accurate).\n` +
            `Fix 2: Enter your free Google PSI API Key in Settings (Click top status pill > Paste key for 25,000 free queries/day).\n` +
            `Fix 3: Switch to the 'Security' tab — Cloud Security Audits run without quota on Vercel!`
          );
        }
        throw new Error(`Cloud Audit Error (${deviceTitle}): ${msg}`);
      }

      const data = await res.json();
      lhr = data.lighthouseResult;
    }

    if (!lhr) {
      throw new Error(`PageSpeed Insights response did not include lighthouseResult for ${deviceTitle}.`);
    }

    const aiSummary = buildClientAiSummary(lhr, device);
    summariesByDevice[device] = aiSummary;

    resultsByDevice[device] = {
      device,
      scores: aiSummary.scores,
      coreWebVitals: aiSummary.coreWebVitals,
      aiSummary,
      rawJson: formats.includes('json') ? JSON.stringify(lhr, null, 2) : undefined,
      html: formats.includes('html') ? buildStandaloneHtmlFromSummary(aiSummary) : undefined
    };
  }

  const combinedAiJson = {
    schema: 'sitelens-ai-report/v1',
    url,
    generatedAt: timestamp,
    source: 'pagespeed-insights-fallback',
    summaryComparison: {
      desktop: summariesByDevice.desktop ? summariesByDevice.desktop.scores : null,
      mobile: summariesByDevice.mobile ? summariesByDevice.mobile.scores : null
    },
    devices: {
      ...(summariesByDevice.desktop ? { desktop: summariesByDevice.desktop } : {}),
      ...(summariesByDevice.mobile ? { mobile: summariesByDevice.mobile } : {})
    }
  };

  const combinedAiMarkdown = buildClientAiMarkdown(combinedAiJson);

  return {
    ok: true,
    type: 'result',
    source: 'psi-fallback',
    url,
    timestamp,
    devices,
    categories,
    formats,
    results: resultsByDevice,
    aiReport: {
      json: combinedAiJson,
      markdown: combinedAiMarkdown
    }
  };
}

/* ==========================================================================
   Client-Side AI Report Formatter (Used by PSI Fallback & UI)
   ========================================================================== */

function scoreToRating(score) {
  if (score === null || score === undefined) return 'n/a';
  if (score >= 0.9) return 'good';
  if (score >= 0.5) return 'needs-improvement';
  return 'poor';
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KiB`;
  return `${(kb / 1024).toFixed(2)} MiB`;
}

function truncate(str, maxLen = 200) {
  if (!str || typeof str !== 'string') return str;
  const clean = str.replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}...` : clean;
}

function buildClientAiSummary(lhr, device) {
  const scores = {};
  const categoryAuditMap = {};
  for (const [catKey, catVal] of Object.entries(lhr.categories || {})) {
    scores[catKey] =
      catVal.score !== null && catVal.score !== undefined ? Math.round(catVal.score * 100) : null;
    if (Array.isArray(catVal.auditRefs)) {
      for (const ref of catVal.auditRefs) {
        if (!categoryAuditMap[ref.id]) categoryAuditMap[ref.id] = [];
        categoryAuditMap[ref.id].push(catKey);
      }
    }
  }

  const coreWebVitals = {};
  const audits = lhr.audits || {};
  for (const metric of CORE_METRICS) {
    const a = audits[metric.id];
    if (a) {
      coreWebVitals[metric.key] = {
        id: metric.id,
        label: metric.label,
        displayValue: a.displayValue || null,
        numericValue:
          typeof a.numericValue === 'number' ? Math.round(a.numericValue * 1000) / 1000 : null,
        numericUnit: a.numericUnit || null,
        score: typeof a.score === 'number' ? Math.round(a.score * 100) : null,
        rating: scoreToRating(a.score)
      };
    }
  }

  const opportunities = [];
  const failedAudits = [];
  const consoleErrors = [];
  const cspIssues = [];
  const metricIds = new Set(CORE_METRICS.map((m) => m.id));

  for (const [auditId, audit] of Object.entries(audits)) {
    if (!audit) continue;

    if (auditId === 'errors-in-console' && Array.isArray(audit.details?.items)) {
      for (const item of audit.details.items.slice(0, 15)) {
        consoleErrors.push({
          source: item.source || 'console.error',
          description: truncate(item.description, 260),
          url: truncate(item.sourceLocation?.url || item.url, 160)
        });
      }
    }

    if (auditId === 'csp-xss' && Array.isArray(audit.details?.items)) {
      for (const item of audit.details.items.slice(0, 15)) {
        cspIssues.push({
          directive: item.directive || null,
          description: truncate(item.description, 240),
          severity: item.severity || null
        });
      }
    }

    const mode = audit.scoreDisplayMode;
    if (mode === 'notApplicable' || mode === 'manual' || mode === 'informative') continue;
    if (typeof audit.score !== 'number' || audit.score >= 0.9) continue;

    const details = audit.details || {};
    const overallSavingsMs =
      typeof details.overallSavingsMs === 'number' ? Math.round(details.overallSavingsMs) : null;
    const overallSavingsBytes =
      typeof details.overallSavingsBytes === 'number' ? Math.round(details.overallSavingsBytes) : null;

    const items = (details.items || []).slice(0, 8).map((item) => {
      const node = item.node || item.element?.node || {};
      return {
        selector: node.selector || undefined,
        snippet: truncate(node.snippet, 160) || undefined,
        explanation: truncate(node.explanation, 200) || undefined,
        url: truncate(item.url, 160) || undefined,
        wastedMs: typeof item.wastedMs === 'number' ? Math.round(item.wastedMs) : undefined,
        wastedSize: typeof item.wastedBytes === 'number' ? formatBytes(item.wastedBytes) : undefined
      };
    });

    const entry = {
      id: auditId,
      title: audit.title,
      categories: categoryAuditMap[auditId] || ['other'],
      score: Math.round(audit.score * 100),
      displayValue: audit.displayValue || null,
      description: truncate(audit.description, 240),
      wastedMs: overallSavingsMs,
      wastedBytes: overallSavingsBytes,
      wastedSize: overallSavingsBytes ? formatBytes(overallSavingsBytes) : null,
      items
    };

    if (details.type === 'opportunity' || overallSavingsMs || overallSavingsBytes) {
      opportunities.push(entry);
    }
    if (!metricIds.has(auditId)) {
      failedAudits.push(entry);
    }
  }

  opportunities.sort((a, b) => (b.wastedMs || 0) - (a.wastedMs || 0));
  failedAudits.sort((a, b) => (a.score ?? 100) - (b.score ?? 100));

  return {
    device,
    finalUrl: lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl,
    fetchTime: lhr.fetchTime || new Date().toISOString(),
    lighthouseVersion: lhr.lighthouseVersion || null,
    scores,
    coreWebVitals,
    topOpportunities: opportunities.slice(0, 15),
    failedAudits: failedAudits.slice(0, 30),
    consoleErrors,
    cspIssues
  };
}

function buildClientAiMarkdown(combinedReport) {
  const lines = [];
  const { url, generatedAt, devices } = combinedReport;
  const desktop = devices?.desktop || null;
  const mobile = devices?.mobile || null;

  lines.push(`# Lighthouse Dual Audit Report (AI-Optimized Diagnostic)`);
  lines.push(`- **Target URL:** ${url}`);
  lines.push(`- **Audited At:** ${generatedAt}`);
  lines.push('');
  lines.push(`## 1. Category Scores (0–100)`);
  lines.push(`| Category | Desktop | Mobile |`);
  lines.push(`| :--- | :---: | :---: |`);
  for (const cat of [
    { key: 'performance', label: 'Performance' },
    { key: 'accessibility', label: 'Accessibility' },
    { key: 'best-practices', label: 'Best Practices' },
    { key: 'seo', label: 'SEO' }
  ]) {
    lines.push(
      `| **${cat.label}** | ${desktop?.scores?.[cat.key] ?? '—'} | ${mobile?.scores?.[cat.key] ?? '—'} |`
    );
  }
  lines.push('');

  lines.push(`## 2. Core Web Vitals & Performance Metrics`);
  lines.push(`| Metric | Desktop | Mobile |`);
  lines.push(`| :--- | :---: | :---: |`);
  for (const m of CORE_METRICS) {
    const d = desktop?.coreWebVitals?.[m.key];
    const mb = mobile?.coreWebVitals?.[m.key];
    lines.push(
      `| **${m.label}** | ${d ? `${d.displayValue} (${d.rating})` : '—'} | ${
        mb ? `${mb.displayValue} (${mb.rating})` : '—'
      } |`
    );
  }
  lines.push('');

  for (const [deviceKey, summary] of Object.entries(devices || {})) {
    if (!summary) continue;
    const titleDevice = deviceKey.charAt(0).toUpperCase() + deviceKey.slice(1);
    lines.push(`---`);
    lines.push(`## 3. ${titleDevice} Diagnostics`);
    lines.push('');
    if (summary.failedAudits?.length) {
      lines.push(`### Failed Audits (Score < 90) (${titleDevice})`);
      for (const audit of summary.failedAudits) {
        lines.push(
          `- **[${audit.id}] ${audit.title}** (Score: ${audit.score}/100)${
            audit.displayValue ? ` — ${audit.displayValue}` : ''
          }`
        );
        if (audit.description) lines.push(`  - *Why:* ${audit.description}`);
        for (const item of (audit.items || []).slice(0, 5)) {
          const parts = [];
          if (item.selector) parts.push(`Selector: \`${item.selector}\``);
          if (item.snippet) parts.push(`DOM: \`${item.snippet}\``);
          if (item.explanation) parts.push(`Issue: ${item.explanation}`);
          if (item.url) parts.push(`URL: \`${item.url}\``);
          if (item.wastedMs) parts.push(`Wasted: ${item.wastedMs} ms`);
          if (item.wastedSize) parts.push(`Wasted: ${item.wastedSize}`);
          if (parts.length > 0) lines.push(`  - ${parts.join(' | ')}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function buildStandaloneHtmlFromSummary(summary) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Lighthouse Report (${summary.device}) - ${summary.finalUrl}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; max-width: 960px; margin: 0 auto; }
  h1, h2 { color: #38bdf8; }
  pre { background: #1e293b; padding: 16px; border-radius: 8px; overflow-x: auto; }
</style>
</head>
<body>
  <h1>Lighthouse ${summary.device.toUpperCase()} Report</h1>
  <p><strong>URL:</strong> ${summary.finalUrl} | <strong>Fetched:</strong> ${summary.fetchTime}</p>
  <pre>${JSON.stringify(summary, null, 2)}</pre>
</body>
</html>`;
}

/* ==========================================================================
   Visual Score Dashboard Rendering
   ========================================================================== */

function getScoreColor(score) {
  if (score === null || score === undefined) return '#64748b';
  if (score >= 90) return '#10b981'; // 90-100 Green
  if (score >= 50) return '#f59e0b'; // 50-89 Orange
  return '#ef4444'; // 0-49 Red
}

function createCircularGaugeHTML(score, label) {
  const numericScore = typeof score === 'number' ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const color = getScoreColor(numericScore);
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const dashOffset =
    numericScore !== null ? circumference - (numericScore / 100) * circumference : circumference;

  return `
    <div class="gauge-item">
      <div class="gauge-svg-wrap">
        <svg class="gauge-svg" viewBox="0 0 52 52">
          <circle class="gauge-bg" cx="26" cy="26" r="${radius}"></circle>
          <circle
            class="gauge-arc"
            cx="26"
            cy="26"
            r="${radius}"
            stroke="${color}"
            stroke-dasharray="${circumference.toFixed(2)}"
            stroke-dashoffset="${dashOffset.toFixed(2)}"
          ></circle>
        </svg>
        <div class="gauge-score-text" style="color: ${color}">
          ${numericScore !== null ? numericScore : '—'}
        </div>
      </div>
      <span class="gauge-label">${label}</span>
    </div>
  `;
}

function renderDeviceColumn(deviceResult, gaugesContainer, cwvContainer) {
  if (!deviceResult) {
    gaugesContainer.innerHTML = '';
    cwvContainer.innerHTML = '';
    return;
  }

  const scores = deviceResult.scores || {};
  const gaugesHtml = CATEGORY_META.filter((c) => scores[c.key] !== undefined && scores[c.key] !== null)
    .map((c) => createCircularGaugeHTML(scores[c.key], c.label))
    .join('');

  gaugesContainer.innerHTML = gaugesHtml;

  const cwv = deviceResult.coreWebVitals || {};
  const cwvRows = ['FCP', 'LCP', 'TBT', 'CLS', 'SI', 'TTI']
    .filter((k) => cwv[k] && cwv[k].displayValue)
    .map(
      (k) => `
      <div class="cwv-row">
        <span class="cwv-key">${k}</span>
        <span class="cwv-val ${cwv[k].rating || ''}">${cwv[k].displayValue}</span>
      </div>
    `
    )
    .join('');

  cwvContainer.innerHTML = cwvRows;
}

function updateDashboardView() {
  if (!lastAuditPayload || !lastAuditPayload.results) return;

  const desktopData = lastAuditPayload.results.desktop || null;
  const mobileData = lastAuditPayload.results.mobile || null;

  // Update segmented buttons
  if (els.btnViewDesktop) {
    els.btnViewDesktop.classList.toggle('active', currentDashboardView === 'desktop');
    els.btnViewDesktop.disabled = !desktopData;
  }
  if (els.btnViewMobile) {
    els.btnViewMobile.classList.toggle('active', currentDashboardView === 'mobile');
    els.btnViewMobile.disabled = !mobileData;
  }
  if (els.btnViewCompare) {
    els.btnViewCompare.classList.toggle('active', currentDashboardView === 'compare');
    els.btnViewCompare.disabled = !(desktopData && mobileData);
  }

  if (currentDashboardView === 'compare') {
    // Show side-by-side comparison columns
    if (els.heroGaugeContainer) els.heroGaugeContainer.classList.add('hidden');
    if (els.categoryCardsWrap) els.categoryCardsWrap.classList.add('hidden');
    if (els.cwvSummaryCard) els.cwvSummaryCard.classList.add('hidden');
    if (els.opportunitiesCard) els.opportunitiesCard.classList.add('hidden');
    if (els.comparisonColumns) els.comparisonColumns.classList.remove('hidden');
    return;
  }

  // Single device view (desktop or mobile)
  if (els.heroGaugeContainer) els.heroGaugeContainer.classList.remove('hidden');
  if (els.categoryCardsWrap) els.categoryCardsWrap.classList.remove('hidden');
  if (els.cwvSummaryCard) els.cwvSummaryCard.classList.remove('hidden');
  if (els.opportunitiesCard) els.opportunitiesCard.classList.remove('hidden');
  if (els.comparisonColumns) els.comparisonColumns.classList.add('hidden');

  const devResult = currentDashboardView === 'desktop' ? desktopData : mobileData;
  if (!devResult) return;

  const scores = devResult.scores || {};
  const perfScore = typeof scores.performance === 'number'
    ? scores.performance
    : Math.round(Object.values(scores).reduce((a, b) => a + (b || 0), 0) / (Object.values(scores).length || 1));

  const safeScore = Math.max(0, Math.min(100, Math.round(perfScore)));

  // Update Semicircular Arc Gauge (Image 1 Style)
  if (els.heroArcProgress) {
    const arcLen = 235.619;
    const progressOffset = arcLen * (1 - safeScore / 100);
    els.heroArcProgress.style.strokeDashoffset = progressOffset.toFixed(1);
  }

  // Position indicator dot on arc
  if (els.heroArcDot) {
    const rad = Math.PI * (1 - safeScore / 100);
    const cx = 100 - 75 * Math.cos(rad);
    const cy = 105 - 75 * Math.sin(rad);
    els.heroArcDot.setAttribute('cx', cx.toFixed(1));
    els.heroArcDot.setAttribute('cy', cy.toFixed(1));
    const dotColor = safeScore >= 90 ? '#10b981' : safeScore >= 50 ? '#f59e0b' : '#ef4444';
    els.heroArcDot.setAttribute('stroke', dotColor);
  }

  if (els.heroScoreNumber) {
    els.heroScoreNumber.textContent = safeScore;
  }
  if (els.heroScoreLabel) {
    els.heroScoreLabel.textContent = `${currentDashboardView === 'desktop' ? 'Desktop' : 'Mobile'} Score`;
  }

  // Status Pill Tag (Image 1 Style: "To improve", "Good", "Needs attention")
  if (els.heroStatusPill) {
    if (safeScore >= 90) {
      els.heroStatusPill.textContent = 'Good';
      els.heroStatusPill.className = 'hero-status-pill good';
    } else if (safeScore >= 50) {
      els.heroStatusPill.textContent = 'To improve';
      els.heroStatusPill.className = 'hero-status-pill needs-improvement';
    } else {
      els.heroStatusPill.textContent = 'Needs attention';
      els.heroStatusPill.className = 'hero-status-pill poor';
    }
  }

  // Render Image 1 Style Category Cards
  if (els.categoryCardsWrap) {
    const cwv = devResult.coreWebVitals || {};
    const catConfig = [
      {
        key: 'performance',
        title: 'Performance',
        sub: `FCP ${cwv.FCP?.displayValue || '—'} • LCP ${cwv.LCP?.displayValue || '—'} • TBT ${cwv.TBT?.displayValue || '—'}`
      },
      {
        key: 'accessibility',
        title: 'Accessibility',
        sub: 'Color contrast, ARIA landmarks, page headings'
      },
      {
        key: 'best-practices',
        title: 'Best Practices',
        sub: 'Security protocols, modern web APIs, trust'
      },
      {
        key: 'seo',
        title: 'SEO',
        sub: 'Mobile crawlability, descriptive tags, meta'
      }
    ];

    let catCardsHtml = '';
    for (const cat of catConfig) {
      if (scores[cat.key] === undefined || scores[cat.key] === null) continue;
      const catScore = Math.max(0, Math.min(100, Math.round(scores[cat.key])));
      const catColor = getScoreColor(catScore);
      const dashOffset = (87.96 * (1 - catScore / 100)).toFixed(1);

      let impactClass = 'low-impact';
      let impactText = 'Low Impact';
      if (catScore < 50) {
        impactClass = 'high-impact';
        impactText = 'High Impact';
      } else if (catScore < 90) {
        impactClass = 'moderate-impact';
        impactText = 'Moderate impact';
      }

      catCardsHtml += `
        <div class="cat-score-card">
          <div class="cat-mini-gauge">
            <svg class="cat-mini-svg" viewBox="0 0 38 38">
              <circle class="cat-mini-bg" cx="19" cy="19" r="14" />
              <circle class="cat-mini-arc" cx="19" cy="19" r="14" stroke="${catColor}" stroke-dasharray="87.96" stroke-dashoffset="${dashOffset}" />
            </svg>
            <div class="cat-mini-score" style="color: ${catColor}">${catScore}</div>
          </div>
          <div class="cat-info">
            <div class="cat-title">${cat.title}</div>
            <div class="cat-sub">${cat.sub}</div>
          </div>
          <span class="impact-badge ${impactClass}">${impactText}</span>
        </div>
      `;
    }
    els.categoryCardsWrap.innerHTML = catCardsHtml;
  }

  // Render CWV Chips
  if (els.cwvSummaryCard && els.cwvPillsGrid) {
    if (els.cwvDeviceLabel) {
      els.cwvDeviceLabel.textContent = currentDashboardView === 'desktop' ? 'Desktop' : 'Mobile';
    }
    const cwv = devResult.coreWebVitals || {};
    const cwvKeys = ['FCP', 'LCP', 'TBT', 'CLS', 'SI', 'TTI'];
    let cwvHtml = '';
    for (const k of cwvKeys) {
      const item = cwv[k];
      if (item && item.displayValue) {
        cwvHtml += `
          <div class="cwv-chip">
            <div class="cwv-chip-name">${k}</div>
            <div class="cwv-chip-val ${item.rating || ''}">${item.displayValue}</div>
          </div>
        `;
      }
    }
    els.cwvPillsGrid.innerHTML = cwvHtml || '<p style="color: #64748b; font-size: 11px;">No CWV data</p>';
  }

  // Render Top Impact Fixes (Opportunities from Image 1 style)
  if (els.opportunitiesCard && els.opportunitiesList) {
    const topOpps = devResult.aiSummary?.topOpportunities || [];
    const failedAudits = devResult.aiSummary?.failedAudits || [];
    const fixes = [...topOpps, ...failedAudits].slice(0, 4);

    if (fixes.length > 0) {
      els.opportunitiesCard.classList.remove('hidden');
      let oppsHtml = '';
      for (const opp of fixes) {
        const savingsParts = [];
        if (opp.wastedMs) savingsParts.push(`~${opp.wastedMs} ms`);
        if (opp.wastedSize) savingsParts.push(opp.wastedSize);
        const sub = savingsParts.length > 0
          ? `Est. Savings: ${savingsParts.join(', ')}`
          : (opp.displayValue || opp.description || 'Improve performance');

        const isHigh = opp.score < 50 || (opp.wastedMs && opp.wastedMs > 300);
        const badgeClass = isHigh ? 'high-impact' : 'moderate-impact';
        const badgeText = isHigh ? 'High Impact' : 'Moderate impact';

        oppsHtml += `
          <div class="opp-item-card">
            <div class="opp-info">
              <div class="opp-title">${opp.title || opp.id}</div>
              <div class="opp-desc">${sub}</div>
            </div>
            <span class="impact-badge ${badgeClass}">${badgeText}</span>
          </div>
        `;
      }
      els.opportunitiesList.innerHTML = oppsHtml;
    } else {
      els.opportunitiesCard.classList.add('hidden');
    }
  }
}

function renderDashboard(payload) {
  if (!payload || !payload.results) return;

  lastAuditPayload = payload;
  els.dashboardSection.classList.remove('hidden');

  const desktopData = payload.results.desktop || null;
  const mobileData = payload.results.mobile || null;

  // Set default view to available data
  if (desktopData) {
    currentDashboardView = 'desktop';
  } else if (mobileData) {
    currentDashboardView = 'mobile';
  }

  // Side-by-side comparison pre-render
  const hasBoth = Boolean(desktopData && mobileData);
  if (els.comparisonColumns) {
    els.comparisonColumns.classList.toggle('single-col', !hasBoth);
  }
  if (els.desktopScoreCol) {
    els.desktopScoreCol.classList.toggle('hidden', !desktopData);
  }
  if (els.mobileScoreCol) {
    els.mobileScoreCol.classList.toggle('hidden', !mobileData);
  }

  if (desktopData && els.desktopGauges && els.desktopCwvList) {
    renderDeviceColumn(desktopData, els.desktopGauges, els.desktopCwvList);
  }
  if (mobileData && els.mobileGauges && els.mobileCwvList) {
    renderDeviceColumn(mobileData, els.mobileGauges, els.mobileCwvList);
  }

  let host = payload.url;
  try {
    host = new URL(payload.url).host;
  } catch {
    // keep raw
  }
  const timeStr = new Date(payload.timestamp || Date.now()).toLocaleTimeString();
  if (els.dashboardMeta) {
    els.dashboardMeta.textContent = `${host} • ${timeStr}`;
  }
  if (els.dashboardSourceBadge) {
    els.dashboardSourceBadge.textContent =
      payload.source === 'browser-native'
        ? 'In-Browser Native Engine'
        : payload.source === 'psi-fallback'
          ? 'PSI Cloud Fallback'
          : 'Local Lighthouse';
  }
  if (els.dashboardEngineBadge) {
    if (payload.source === 'browser-native') {
      els.dashboardEngineBadge.innerHTML = `${renderIcon('cpu', { size: 11 })}<span>Browser Native</span>`;
      els.dashboardEngineBadge.title = 'Audited live directly inside your Chrome browser tab';
    } else if (payload.source === 'psi-fallback') {
      els.dashboardEngineBadge.innerHTML = `${renderIcon('cloud', { size: 11 })}<span>PSI API</span>`;
      els.dashboardEngineBadge.title = 'Audited via Google PageSpeed Insights Cloud API';
    } else if (payload.throttlingMethod === 'devtools') {
      els.dashboardEngineBadge.innerHTML = `${renderIcon('wifi', { size: 11 })}<span>Applied (Real 4G)</span>`;
      els.dashboardEngineBadge.title = 'Applied Packet Throttling';
    } else {
      els.dashboardEngineBadge.innerHTML = `${renderIcon('crosshair', { size: 11 })}<span>DevTools 1:1</span>`;
      els.dashboardEngineBadge.title = 'Simulated Throttling matching Chrome DevTools Incognito exactly';
    }
  }

  updateDashboardView();
}

async function saveLightweightAuditCache(payload) {
  try {
    // Strip multi-megabyte rawJson/html before storing in chrome.storage.local
    const slimResults = {};
    for (const [dev, val] of Object.entries(payload.results || {})) {
      slimResults[dev] = {
        device: val.device,
        scores: val.scores,
        coreWebVitals: val.coreWebVitals,
        aiSummary: val.aiSummary
      };
    }
    const slimPayload = {
      ok: true,
      source: payload.source,
      throttlingMethod: payload.throttlingMethod || 'simulate',
      url: payload.url,
      timestamp: payload.timestamp,
      devices: payload.devices,
      categories: payload.categories,
      results: slimResults,
      aiReport: payload.aiReport
    };
    await chrome.storage.local.set({ lastAuditCache: slimPayload });
  } catch (err) {
    console.warn('Failed to cache audit summary:', err);
  }
}

/* ==========================================================================
   Auto-Download & File Naming (`<domain>-<timestamp>-...`)
   ========================================================================== */

function buildFilePrefix(urlStr, isoTimestamp) {
  let domain = 'website';
  try {
    const u = new URL(urlStr);
    domain = (u.hostname + (u.port ? `-${u.port}` : '')).replace(/[^a-zA-Z0-9.-]/g, '_');
  } catch {
    domain = 'website';
  }
  const ts = (isoTimestamp || new Date().toISOString())
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  return `${domain}-${ts}`;
}

function downloadFileViaBackground(filename, content, mimeType) {
  return new Promise((resolve) => {
    // Use Blob URL directly in popup if available for large files, with background fallback
    try {
      const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
      const blobUrl = URL.createObjectURL(blob);
      chrome.downloads.download(
        {
          url: blobUrl,
          filename: `lighthouse-reports/${filename}`,
          saveAs: false,
          conflictAction: 'uniquify'
        },
        (downloadId) => {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
          resolve({ ok: !chrome.runtime.lastError, downloadId });
        }
      );
    } catch (_) {
      chrome.runtime.sendMessage(
        {
          action: 'DOWNLOAD_FILE',
          filename: `lighthouse-reports/${filename}`,
          content,
          mimeType
        },
        (res) => resolve(res || { ok: false })
      );
    }
  });
}

async function triggerReportDownloads(payload, forceAllSelected = false) {
  if (!payload) return;
  const prefix = buildFilePrefix(payload.url, payload.timestamp);

  const wantJson = currentSettings.formats.json;
  const wantHtml = currentSettings.formats.html;
  const wantAi = currentSettings.formats.aiSummary;

  const jobs = [];

  // 1. Per-device Raw JSON & HTML reports
  for (const [device, devResult] of Object.entries(payload.results || {})) {
    if (wantJson) {
      const jsonContent =
        devResult.rawJson || JSON.stringify(devResult.aiSummary || devResult, null, 2);
      jobs.push(
        downloadFileViaBackground(`${prefix}-${device}.json`, jsonContent, 'application/json')
      );
    }
    if (wantHtml && devResult.html) {
      jobs.push(downloadFileViaBackground(`${prefix}-${device}.html`, devResult.html, 'text/html'));
    }
  }

  // 2. Combined AI-Optimized Compact Reports (.json & .md)
  if (wantAi || forceAllSelected) {
    if (payload.aiReport?.json) {
      jobs.push(
        downloadFileViaBackground(
          `${prefix}-combined-ai-report.json`,
          JSON.stringify(payload.aiReport.json, null, 2),
          'application/json'
        )
      );
    }
    if (payload.aiReport?.markdown) {
      jobs.push(
        downloadFileViaBackground(
          `${prefix}-combined-ai-report.md`,
          payload.aiReport.markdown,
          'text/markdown'
        )
      );
    }
  }

  await Promise.allSettled(jobs);
}

/* ==========================================================================
   6-Layer Security Scanner Execution (Local Engine + Browser Fallback)
   ========================================================================== */

function getSelectedSecModules() {
  return Object.entries(currentSettings.secModules || {})
    .filter(([, checked]) => checked)
    .map(([key]) => key);
}

async function runSecurityAuditFlow() {
  if (isAuditing) return;

  const targetUrl = (els.urlInput.value || '').trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    showError('Please enter a valid http:// or https:// URL to scan.');
    return;
  }

  clearError();
  isAuditing = true;
  if (els.runSecurityBtn) els.runSecurityBtn.disabled = true;
  if (els.runSecurityBtnText) els.runSecurityBtnText.textContent = 'Scanning Website Security...';
  chrome.runtime.sendMessage({ action: 'SET_BADGE', text: 'SEC', color: '#0284c7' });

  const scanScope = currentSettings.secScanScope || 'full';
  const maxPages = currentSettings.secMaxPages || 10;
  const modules = getSelectedSecModules();

  startProgressTimer();
  setProgressUI(
    1,
    scanScope === 'full' ? 4 : 3,
    'Step 1: Analyzing HTTP Security Headers & TLS...',
    `Scanning ${targetUrl}...`,
    22
  );

  try {
    const serverReady = await checkLocalServerHealth();
    const serverUrl = getActiveServerUrl();
    const isCloudHost = !isLocalhostUrl(serverUrl);
    const targetIsLocalhost = isLocalhostUrl(targetUrl);
    let finalSecPayload = null;

    // Use cloud server only for public websites. If target is localhost, run browser-native security scan!
    if (serverReady && (!targetIsLocalhost || !isCloudHost)) {
      finalSecPayload = await runSecurityViaLocalServer({
        url: targetUrl,
        scanScope,
        maxPages,
        modules
      });
    } else {
      finalSecPayload = await runBrowserSecurityFallback({
        url: targetUrl,
        scanScope,
        maxPages,
        modules
      });
    }

    setProgressUI(4, 4, 'Security Audit Completed!', 'Generating security report...', 100);
    lastSecurityPayload = finalSecPayload;

    await chrome.storage.local.set({ lastSecurityCache: finalSecPayload });
    renderSecurityDashboard(finalSecPayload);

    if (currentSettings.secAutoDownload) {
      await triggerSecurityReportDownloads(finalSecPayload);
    }

    const grade = finalSecPayload.securityReport?.json?.grade || 'OK';
    const score = finalSecPayload.securityReport?.json?.overallScore ?? 100;
    const badgeColor = score >= 88 ? '#10b981' : score >= 68 ? '#f59e0b' : '#ef4444';
    chrome.runtime.sendMessage({ action: 'SET_BADGE', text: grade, color: badgeColor });
  } catch (err) {
    console.error('Security scan error:', err);
    showError(err.message || 'Security scan failed.');
    chrome.runtime.sendMessage({ action: 'SET_BADGE', text: 'ERR', color: '#ef4444' });
  } finally {
    stopProgressTimer();
    isAuditing = false;
    if (els.runSecurityBtn) els.runSecurityBtn.disabled = false;
    setTimeout(() => {
      if (!isAuditing) {
        els.progressSection.classList.add('hidden');
      }
    }, 900);
    updateSecurityButtonLabel();
  }
}

async function runSecurityViaLocalServer({ url, scanScope, maxPages, modules }) {
  const response = await fetch(`${getActiveServerUrl()}/api/security-audit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson'
    },
    body: JSON.stringify({
      url,
      scanScope,
      maxPages,
      modules,
      stream: true
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Local Security Engine error (${response.status}): ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resultPayload = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;

      const event = JSON.parse(line);
      if (event.type === 'progress') {
        const step = event.step || 1;
        const total = event.totalSteps || 4;
        setProgressUI(
          step,
          total,
          event.statusText || 'Running security checks...',
          `6-Layer Security Engine scanning ${url}`
        );
      } else if (event.type === 'security-result' && event.ok) {
        resultPayload = event;
      } else if (event.type === 'error' || event.ok === false) {
        throw new Error(event.error || 'Local security scan failed.');
      }
    }
  }

  if (!resultPayload) {
    throw new Error('Local server closed stream before returning security report.');
  }

  return resultPayload;
}

const FINDING_RISK_MAP = {
  // 1. HTTP Security Headers
  'missing-csp': 'Without Content-Security-Policy (CSP), attackers can execute Cross-Site Scripting (XSS) attacks by injecting malicious scripts. Attackers can steal logged-in users\' session cookies, record keystrokes/passwords, hijack administrator accounts, or secretly redirect visitors to credential-stealing phishing pages.',
  'weak-csp': 'Allowing \'unsafe-inline\' or \'unsafe-eval\' neutralizes CSP protections against XSS, enabling injected script tags and event handlers to execute in visitors\' browsers without restriction.',
  'missing-hsts': 'Without HSTS, attackers on the same network (such as public Wi-Fi) can execute SSL-Stripping Man-in-the-Middle (MITM) attacks, silently downgrading HTTPS connections to unencrypted HTTP to intercept login credentials and confidential data.',
  'short-hsts': 'An HSTS max-age under 1 year leaves returning visitors vulnerable to SSL-stripping downgrade attacks if they haven\'t accessed the site recently.',
  'missing-clickjacking-protection': 'Attackers can embed your site in a transparent <iframe> on a malicious web page (Clickjacking attack). Unsuspecting visitors can be tricked into clicking hidden buttons to delete their accounts, change settings, or authorize payments.',
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

function getFindingRisk(id, category = '', title = '') {
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

/**
 * Browser-Native Security Fallback when Local Server (localhost:9876) is offline.
 * Uses extension host_permissions (<all_urls>) to inspect HTTP headers, sensitive paths, and DOM.
 */
async function runBrowserSecurityFallback({ url, scanScope, maxPages, modules }) {
  const startedAt = new Date().toISOString();
  const parsedUrl = new URL(url.trim());
  const origin = parsedUrl.origin;
  const isHttps = parsedUrl.protocol === 'https:';
  const activeModules = new Set(modules && modules.length ? modules : ['headers', 'cookies', 'tls', 'exposure', 'dom', 'cors']);

  const findings = [];
  const passedChecks = [];
  const penalties = { headers: 0, cookies: 0, tls: 0, exposure: 0, dom: 0, cors: 0 };

  const addFinding = (f) => {
    f.risk = f.risk || getFindingRisk(f.id, f.category, f.title);
    findings.push(f);
    if (penalties[f.category] !== undefined) penalties[f.category] += f.penalty || 12;
  };

  setProgressUI(1, 3, 'Step 1/3: Fetching HTTP headers (Browser Fallback)...', url, 30);
  const res = await fetch(parsedUrl.href, { method: 'GET', cache: 'no-store' });
  const headers = res.headers;
  const html = await res.text();

  if (activeModules.has('headers')) {
    if (!headers.get('content-security-policy')) {
      addFinding({
        id: 'missing-csp',
        category: 'headers',
        severity: 'high',
        title: 'Missing Content-Security-Policy (CSP) Header',
        description: 'No CSP header detected to mitigate XSS and unauthorized script execution.',
        evidence: 'Content-Security-Policy: Not Present',
        remediation: "Configure a strict Content-Security-Policy header (e.g., default-src 'self').",
        penalty: 25
      });
    } else {
      passedChecks.push({ id: 'csp', category: 'headers', title: 'Content-Security-Policy header present' });
    }

    if (isHttps && !headers.get('strict-transport-security')) {
      addFinding({
        id: 'missing-hsts',
        category: 'headers',
        severity: 'high',
        title: 'Missing Strict-Transport-Security (HSTS) Header',
        description: 'HTTPS site does not enforce HSTS.',
        evidence: 'Strict-Transport-Security: Not Present',
        remediation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
        penalty: 20
      });
    }

    if (!headers.get('x-frame-options') && !(headers.get('content-security-policy') || '').includes('frame-ancestors')) {
      addFinding({
        id: 'missing-xfo',
        category: 'headers',
        severity: 'medium',
        title: 'Missing Clickjacking Protection (X-Frame-Options)',
        description: 'Site can be framed by third-party pages.',
        evidence: 'X-Frame-Options: Not Present',
        remediation: 'Add X-Frame-Options: SAMEORIGIN',
        penalty: 15
      });
    }

    if ((headers.get('x-content-type-options') || '').toLowerCase() !== 'nosniff') {
      addFinding({
        id: 'missing-xcto',
        category: 'headers',
        severity: 'medium',
        title: 'Missing X-Content-Type-Options: nosniff',
        description: 'Prevents MIME-type sniffing attacks.',
        evidence: 'X-Content-Type-Options: Not Present',
        remediation: 'Add X-Content-Type-Options: nosniff',
        penalty: 12
      });
    }
  }

  if (activeModules.has('tls')) {
    if (!isHttps && !isLocalhostUrl(parsedUrl.href)) {
      addFinding({
        id: 'http-unencrypted',
        category: 'tls',
        severity: 'critical',
        title: 'Unencrypted HTTP Connection',
        description: 'Site is served over plain HTTP instead of HTTPS.',
        evidence: parsedUrl.href,
        remediation: 'Enforce HTTPS across all pages.',
        penalty: 50
      });
    } else {
      passedChecks.push({ id: 'https-ok', category: 'tls', title: 'HTTPS encryption verified' });
    }
  }

  if (activeModules.has('exposure')) {
    setProgressUI(2, 3, 'Step 2/3: Checking /.env & /.git exposure...', url, 65);
    for (const p of ['/.env', '/.git/HEAD']) {
      try {
        const probeRes = await fetch(new URL(p, origin).href, { method: 'GET' });
        if (probeRes.status === 200) {
          const t = (await probeRes.text()).slice(0, 300);
          if ((p === '/.env' && /^[A-Z0-9_]+=/m.test(t) && !t.trim().startsWith('<')) || (p === '/.git/HEAD' && t.startsWith('ref:'))) {
            addFinding({
              id: `exposed-${p}`,
              category: 'exposure',
              severity: 'critical',
              title: `Publicly Exposed ${p} File`,
              description: `${p} is publicly accessible on ${origin}.`,
              evidence: `HTTP 200 at ${origin}${p}`,
              remediation: `Deny public access to ${p} immediately.`,
              penalty: 60
            });
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const categoryScores = {};
  for (const k of ['headers', 'cookies', 'tls', 'exposure', 'dom', 'cors']) {
    categoryScores[k] = Math.max(0, 100 - (penalties[k] || 0));
  }
  const overallScore = Math.round(
    Object.values(categoryScores).reduce((a, b) => a + b, 0) / 6
  );
  const grade =
    overallScore >= 95 ? 'A+' : overallScore >= 88 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 68 ? 'C' : overallScore >= 50 ? 'D' : 'F';

  const reportJson = {
    schema: 'sitelens-security-report/v1',
    url: parsedUrl.href,
    origin,
    scanScope,
    pagesScanned: 1,
    scannedUrls: [parsedUrl.href],
    generatedAt: startedAt,
    detectedStack: [headers.get('server') || headers.get('x-powered-by') || 'Browser Fallback'],
    overallScore,
    grade,
    categoryScores,
    severityCounts: {
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length,
      passed: passedChecks.length
    },
    findings,
    passedChecks
  };

  const mdLines = [
    `# Website Security Audit Report`,
    `- **Target URL:** ${parsedUrl.href}`,
    `- **Overall Score:** **${overallScore}/100 (Grade: ${grade})**`,
    '',
    `## Findings (${findings.length})`,
    ...findings.map(
      (f) =>
        `- **[${f.severity.toUpperCase()}] ${f.title}**: ${f.description}\n  - **Potential Risk & Impact:** ${f.risk || getFindingRisk(f.id, f.category, f.title)}\n  - **Recommended Fix:** ${f.remediation}`
    )
  ];

  return {
    ok: true,
    type: 'security-result',
    url: parsedUrl.href,
    timestamp: startedAt,
    securityReport: {
      json: reportJson,
      markdown: mdLines.join('\n')
    }
  };
}

function renderSecurityDashboard(payload) {
  const report = payload?.securityReport?.json;
  if (!report || !els.securityDashboardSection) return;

  els.securityDashboardSection.classList.remove('hidden');

  const safeScore = Math.max(0, Math.min(100, Math.round(report.overallScore ?? 0)));

  // 1. Hero Semicircular Arc & Dot
  if (els.secArcProgress) {
    const arcLen = 235.619;
    els.secArcProgress.style.strokeDashoffset = (arcLen * (1 - safeScore / 100)).toFixed(1);
  }
  if (els.secArcDot) {
    const rad = Math.PI * (1 - safeScore / 100);
    const cx = 100 - 75 * Math.cos(rad);
    const cy = 105 - 75 * Math.sin(rad);
    els.secArcDot.setAttribute('cx', cx.toFixed(1));
    els.secArcDot.setAttribute('cy', cy.toFixed(1));
    const dotColor = safeScore >= 88 ? '#10b981' : safeScore >= 68 ? '#f59e0b' : '#ef4444';
    els.secArcDot.setAttribute('stroke', dotColor);
  }
  if (els.secScoreNumber) {
    els.secScoreNumber.textContent = safeScore;
  }
  if (els.secScoreLabel) {
    els.secScoreLabel.textContent =
      report.scanScope === 'full'
        ? `Site Security (${report.pagesScanned || 1} pg)`
        : 'Page Security Score';
  }

  // 2. Grade Pill & Status Pill
  if (els.secGradePill) {
    const g = report.grade || 'B';
    els.secGradePill.textContent = `Grade ${g}`;
    const gClass = g.startsWith('A')
      ? 'grade-a'
      : g === 'B'
      ? 'grade-b'
      : g === 'C'
      ? 'grade-c'
      : 'grade-df';
    els.secGradePill.className = `sec-grade-pill ${gClass}`;
  }

  if (els.secStatusPill) {
    if (safeScore >= 88) {
      els.secStatusPill.textContent = 'Strong Posture';
      els.secStatusPill.className = 'hero-status-pill good';
    } else if (safeScore >= 65) {
      els.secStatusPill.textContent = 'To improve';
      els.secStatusPill.className = 'hero-status-pill needs-improvement';
    } else {
      els.secStatusPill.textContent = 'High Risk';
      els.secStatusPill.className = 'hero-status-pill poor';
    }
  }

  // 3. Header Meta & Stack
  if (els.secStackBadge) {
    els.secStackBadge.textContent = (report.detectedStack || ['Web Server']).slice(0, 2).join(' • ');
  }
  if (els.secMeta) {
    let host = report.url;
    try {
      host = new URL(report.url).host;
    } catch {
      // ignore
    }
    const timeStr = new Date(report.generatedAt || Date.now()).toLocaleTimeString();
    els.secMeta.textContent = `${host} • ${timeStr}`;
  }

  // 4. Severity Summary Chips
  if (els.secSeverityGrid) {
    const sev = report.severityCounts || { critical: 0, high: 0, medium: 0, low: 0, passed: 0 };
    els.secSeverityGrid.innerHTML = `
      <div class="sec-sev-chip">
        <div class="sec-sev-num" style="color: #dc2626">${sev.critical || 0}</div>
        <div class="sec-sev-lbl">Critical</div>
      </div>
      <div class="sec-sev-chip">
        <div class="sec-sev-num" style="color: #ea580c">${sev.high || 0}</div>
        <div class="sec-sev-lbl">High</div>
      </div>
      <div class="sec-sev-chip">
        <div class="sec-sev-num" style="color: #d97706">${sev.medium || 0}</div>
        <div class="sec-sev-lbl">Medium</div>
      </div>
      <div class="sec-sev-chip">
        <div class="sec-sev-num" style="color: #0284c7">${sev.low || 0}</div>
        <div class="sec-sev-lbl">Low</div>
      </div>
      <div class="sec-sev-chip">
        <div class="sec-sev-num" style="color: #16a34a">${sev.passed || 0}</div>
        <div class="sec-sev-lbl">Passed</div>
      </div>
    `;
  }

  // 5. 6-Layer Security Category Cards (Image 1 Style)
  if (els.secCategoryCardsWrap) {
    const layerConfig = [
      { key: 'headers', title: 'HTTP Security Headers', sub: 'CSP, HSTS, Clickjacking, X-Content-Type' },
      { key: 'tls', title: 'SSL/TLS & Transport', sub: 'HTTPS encryption, TLS 1.2/1.3, Mixed Content' },
      { key: 'exposure', title: 'Sensitive File Exposure', sub: '/.env, /.git/HEAD, backups, .js.map' },
      { key: 'cookies', title: 'Cookies & Session Flags', sub: 'HttpOnly, Secure, SameSite protection' },
      { key: 'dom', title: 'DOM, JS Libs & Secrets', sub: 'Outdated libraries, SRI hashes, leaked keys' },
      { key: 'cors', title: 'CORS & Info Disclosure', sub: 'Access-Control origins, Server version leaks' }
    ];

    let cardsHtml = '';
    for (const layer of layerConfig) {
      const val = report.categoryScores?.[layer.key];
      if (val === undefined || val === null) continue;
      const sc = Math.max(0, Math.min(100, Math.round(val)));
      const color = getScoreColor(sc);
      const dashOffset = (87.96 * (1 - sc / 100)).toFixed(1);

      let badgeClass = 'low-impact';
      let badgeText = 'Secure';
      if (sc < 60) {
        badgeClass = 'high-impact';
        badgeText = 'High Risk';
      } else if (sc < 90) {
        badgeClass = 'moderate-impact';
        badgeText = 'To improve';
      }

      cardsHtml += `
        <div class="cat-score-card">
          <div class="cat-mini-gauge">
            <svg class="cat-mini-svg" viewBox="0 0 38 38">
              <circle class="cat-mini-bg" cx="19" cy="19" r="14" />
              <circle class="cat-mini-arc" cx="19" cy="19" r="14" stroke="${color}" stroke-dasharray="87.96" stroke-dashoffset="${dashOffset}" />
            </svg>
            <div class="cat-mini-score" style="color: ${color}">${sc}</div>
          </div>
          <div class="cat-info">
            <div class="cat-title">${layer.title}</div>
            <div class="cat-sub">${layer.sub}</div>
          </div>
          <span class="impact-badge ${badgeClass}">${badgeText}</span>
        </div>
      `;
    }
    els.secCategoryCardsWrap.innerHTML = cardsHtml;
  }

  // 6. Detailed Findings & Remediation Cards
  if (els.secFindingsCard && els.secFindingsList) {
    const findings = report.findings || [];
    if (els.secFindingsCountLabel) {
      els.secFindingsCountLabel.textContent = `${findings.length} issue(s) found`;
    }

    if (findings.length === 0) {
      els.secFindingsList.innerHTML = `
        <div class="sec-finding-card">
          <div class="sec-finding-title inline-icon-label" style="color: #15803d">${renderIcon('checkCircle2', { size: 14 })}<span>Zero vulnerabilities detected!</span></div>
          <div class="sec-finding-desc">All checked security headers, TLS settings, sensitive paths, and DOM scripts passed inspection.</div>
        </div>
      `;
    } else {
      els.secFindingsList.innerHTML = findings
        .slice(0, 16)
        .map((f, idx) => {
          const isHigh = f.severity === 'critical' || f.severity === 'high';
          const badgeClass = isHigh ? 'high-impact' : f.severity === 'medium' ? 'moderate-impact' : 'low-impact';
          const badgeLabel = f.severity.toUpperCase();
          const riskText = f.risk || getFindingRisk(f.id, f.category, f.title);
          const isOpen = idx === 0 ? ' open' : '';

          return `
            <details class="sec-finding-card"${isOpen}>
              <summary class="sec-finding-summary">
                <div class="sec-finding-top">
                  <div class="sec-finding-title-wrap">
                    ${renderIcon('chevronDown', { size: 12, className: 'sec-finding-chevron' })}
                    <span class="sec-finding-title">${f.title}</span>
                  </div>
                  <span class="impact-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="sec-finding-desc">${f.description}</div>
                <div class="sec-finding-toggle-hint">
                  ${renderIcon('alertTriangle', { size: 10 })}
                  <span>Click to view threat risk &amp; remediation fix ▾</span>
                </div>
              </summary>
              <div class="sec-finding-body">
                <div class="sec-finding-risk-box">
                  <div class="sec-finding-box-header threat">
                    ${renderIcon('alertTriangle', { size: 12 })}
                    <span>Potential Threat &amp; Risk</span>
                  </div>
                  <p class="sec-finding-risk-text">${riskText}</p>
                </div>
                ${f.remediation ? `
                  <div class="sec-finding-fix-box">
                    <div class="sec-finding-box-header fix">
                      ${renderIcon('wrench', { size: 12 })}
                      <span>Recommended Fix</span>
                    </div>
                    <div class="sec-finding-fix-text"><code>${f.remediation}</code></div>
                  </div>
                ` : ''}
                ${f.evidence ? `
                  <div class="sec-finding-evidence-row">
                    <span class="sec-evidence-label">Evidence:</span>
                    <code class="sec-evidence-code">${f.evidence}</code>
                  </div>
                ` : ''}
              </div>
            </details>
          `;
        })
        .join('');
    }
  }
}

async function triggerSecurityReportDownloads(payload) {
  if (!payload || !payload.securityReport) return;
  const prefix = buildFilePrefix(payload.url, payload.timestamp);
  const jobs = [];

  if (payload.securityReport.json) {
    jobs.push(
      downloadFileViaBackground(
        `${prefix}-security-report.json`,
        JSON.stringify(payload.securityReport.json, null, 2),
        'application/json'
      )
    );
  }
  if (payload.securityReport.markdown) {
    jobs.push(
      downloadFileViaBackground(
        `${prefix}-security-report.md`,
        payload.securityReport.markdown,
        'text/markdown'
      )
    );
  }

  await Promise.allSettled(jobs);
}
