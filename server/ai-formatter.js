/**
 * AI-Ready Compact Report Formatter for Google Lighthouse Results (LHR)
 * Strips verbose trace/timeline bloat while preserving exact failing DOM selectors,
 * wasted bytes/ms, Core Web Vitals, console errors, and CSP issues.
 */

const CORE_METRICS = [
  { id: 'first-contentful-paint', key: 'FCP', label: 'First Contentful Paint (FCP)' },
  { id: 'largest-contentful-paint', key: 'LCP', label: 'Largest Contentful Paint (LCP)' },
  { id: 'total-blocking-time', key: 'TBT', label: 'Total Blocking Time (TBT)' },
  { id: 'cumulative-layout-shift', key: 'CLS', label: 'Cumulative Layout Shift (CLS)' },
  { id: 'speed-index', key: 'SI', label: 'Speed Index (SI)' },
  { id: 'interactive', key: 'TTI', label: 'Time to Interactive (TTI)' }
];

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

function formatMs(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return null;
  return `${Math.round(ms)} ms`;
}

function truncate(str, maxLen = 220) {
  if (!str || typeof str !== 'string') return str;
  const clean = str.replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}...` : clean;
}

/**
 * Extracts compact actionable items (DOM selectors, snippets, URLs, wasted bytes/ms)
 * from a Lighthouse audit details object.
 */
function extractAuditItems(details, maxItems = 10) {
  if (!details || !Array.isArray(details.items) || details.items.length === 0) {
    return [];
  }

  const extracted = [];
  for (const item of details.items.slice(0, maxItems)) {
    const entry = {};

    // Extract DOM node info if present (either directly on item.node or nested sub-properties)
    const nodeObj = item.node || (item.element && item.element.node) || null;
    if (nodeObj && typeof nodeObj === 'object') {
      if (nodeObj.selector) entry.selector = nodeObj.selector;
      if (nodeObj.snippet) entry.snippet = truncate(nodeObj.snippet, 180);
      if (nodeObj.nodeLabel && nodeObj.nodeLabel !== nodeObj.snippet) {
        entry.nodeLabel = truncate(nodeObj.nodeLabel, 120);
      }
      if (nodeObj.explanation) entry.explanation = truncate(nodeObj.explanation, 220);
    }

    // Also inspect any nested properties that might hold a node-type value
    for (const [k, v] of Object.entries(item)) {
      if (k === 'node' || k === 'subItems') continue;
      if (v && typeof v === 'object' && v.type === 'node') {
        if (v.selector && !entry.selector) entry.selector = v.selector;
        if (v.snippet && !entry.snippet) entry.snippet = truncate(v.snippet, 180);
        if (v.explanation && !entry.explanation) entry.explanation = truncate(v.explanation, 220);
      }
    }

    if (typeof item.url === 'string') entry.url = truncate(item.url, 180);
    if (typeof item.source === 'string') entry.source = truncate(item.source, 160);
    if (item.sourceLocation && typeof item.sourceLocation === 'object') {
      const loc = item.sourceLocation;
      if (loc.url) {
        entry.sourceLocation = `${truncate(loc.url, 140)}:${loc.line ?? 0}:${loc.column ?? 0}`;
      }
    }

    if (typeof item.wastedMs === 'number' && item.wastedMs > 0) {
      entry.wastedMs = Math.round(item.wastedMs);
    }
    if (typeof item.wastedBytes === 'number' && item.wastedBytes > 0) {
      entry.wastedBytes = Math.round(item.wastedBytes);
      entry.wastedSize = formatBytes(item.wastedBytes);
    }
    if (typeof item.totalBytes === 'number' && item.totalBytes > 0) {
      entry.totalBytes = Math.round(item.totalBytes);
      entry.totalSize = formatBytes(item.totalBytes);
    }
    if (typeof item.TransferSize === 'number') {
      entry.transferSize = formatBytes(item.TransferSize);
    }
    if (typeof item.description === 'string') {
      entry.description = truncate(item.description, 220);
    }
    if (typeof item.directive === 'string') {
      entry.directive = item.directive;
    }
    if (typeof item.severity === 'string') {
      entry.severity = item.severity;
    }
    if (typeof item.reason === 'string') {
      entry.reason = truncate(item.reason, 180);
    }
    if (typeof item.score === 'number') {
      entry.itemScore = Number(item.score.toFixed(3));
    }

    // Sub-items (e.g. third-party summary, unminified assets, LCP subparts)
    if (item.subItems && Array.isArray(item.subItems.items) && item.subItems.items.length > 0) {
      entry.subItems = item.subItems.items.slice(0, 5).map((sub) => {
        const cleanSub = {};
        for (const [sk, sv] of Object.entries(sub)) {
          if (typeof sv === 'string') cleanSub[sk] = truncate(sv, 140);
          else if (typeof sv === 'number') cleanSub[sk] = Math.round(sv * 100) / 100;
          else if (sv && typeof sv === 'object' && sv.type === 'node') {
            cleanSub.selector = sv.selector;
            cleanSub.snippet = truncate(sv.snippet, 140);
          }
        }
        return cleanSub;
      });
    }

    if (Object.keys(entry).length > 0) {
      extracted.push(entry);
    }
  }

  return extracted;
}

/**
 * Builds a single-device AI summary object from a raw Lighthouse Result (LHR).
 */
export function buildSingleDeviceAiSummary(lhr, device = 'desktop') {
  if (!lhr) return null;

  // 1. Category Scores (0 - 100)
  const scores = {};
  const categoryAuditMap = {};
  for (const [catKey, catVal] of Object.entries(lhr.categories || {})) {
    scores[catKey] = catVal.score !== null && catVal.score !== undefined
      ? Math.round(catVal.score * 100)
      : null;
    if (Array.isArray(catVal.auditRefs)) {
      for (const ref of catVal.auditRefs) {
        if (!categoryAuditMap[ref.id]) categoryAuditMap[ref.id] = [];
        categoryAuditMap[ref.id].push(catKey);
      }
    }
  }

  // 2. Core Web Vitals & Performance Metrics
  const coreWebVitals = {};
  const audits = lhr.audits || {};
  for (const metric of CORE_METRICS) {
    const a = audits[metric.id];
    if (a) {
      coreWebVitals[metric.key] = {
        id: metric.id,
        label: metric.label,
        displayValue: a.displayValue || null,
        numericValue: typeof a.numericValue === 'number' ? Math.round(a.numericValue * 1000) / 1000 : null,
        numericUnit: a.numericUnit || null,
        score: typeof a.score === 'number' ? Math.round(a.score * 100) : null,
        rating: scoreToRating(a.score)
      };
    }
  }

  // 3. Opportunities (with wastedMs / wastedBytes)
  const opportunities = [];
  // 4. Failed Audits (score < 0.9)
  const failedAudits = [];
  // 5. Console Errors & CSP Issues
  const consoleErrors = [];
  const cspIssues = [];

  const metricIds = new Set(CORE_METRICS.map((m) => m.id));

  for (const [auditId, audit] of Object.entries(audits)) {
    if (!audit) continue;

    // Extract Console Errors specifically
    if (auditId === 'errors-in-console' && audit.details && Array.isArray(audit.details.items)) {
      for (const item of audit.details.items.slice(0, 15)) {
        consoleErrors.push({
          source: item.source || 'console.error',
          description: truncate(item.description, 300),
          url: truncate(item.sourceLocation?.url || item.url, 180),
          line: item.sourceLocation?.line ?? null,
          column: item.sourceLocation?.column ?? null
        });
      }
    }

    // Extract CSP / XSS issues specifically
    if (auditId === 'csp-xss' && audit.details && Array.isArray(audit.details.items)) {
      for (const item of audit.details.items.slice(0, 15)) {
        cspIssues.push({
          directive: item.directive || null,
          description: truncate(item.description, 260),
          severity: item.severity || null
        });
      }
    }

    const mode = audit.scoreDisplayMode;
    if (mode === 'notApplicable' || mode === 'manual' || mode === 'informative') {
      continue;
    }

    if (typeof audit.score !== 'number' || audit.score >= 0.9) {
      continue;
    }

    const details = audit.details || {};
    const overallSavingsMs = typeof details.overallSavingsMs === 'number'
      ? Math.round(details.overallSavingsMs)
      : (audit.metricSavings?.LCP || audit.metricSavings?.FCP || audit.metricSavings?.TBT || null);
    const overallSavingsBytes = typeof details.overallSavingsBytes === 'number'
      ? Math.round(details.overallSavingsBytes)
      : null;

    const items = extractAuditItems(details, 10);

    const compactAudit = {
      id: auditId,
      title: audit.title,
      categories: categoryAuditMap[auditId] || ['other'],
      score: Math.round(audit.score * 100),
      displayValue: audit.displayValue || null,
      description: truncate(audit.description, 260),
      wastedMs: overallSavingsMs ? Math.round(overallSavingsMs) : null,
      wastedBytes: overallSavingsBytes || null,
      wastedSize: overallSavingsBytes ? formatBytes(overallSavingsBytes) : null,
      metricSavings: audit.metricSavings || undefined,
      items
    };

    if (
      details.type === 'opportunity' ||
      (overallSavingsMs && overallSavingsMs > 0) ||
      (overallSavingsBytes && overallSavingsBytes > 0)
    ) {
      opportunities.push(compactAudit);
    }

    if (!metricIds.has(auditId)) {
      failedAudits.push(compactAudit);
    }
  }

  // Sort opportunities by wastedMs desc, then wastedBytes desc, then lowest score
  opportunities.sort((a, b) => {
    const msDiff = (b.wastedMs || 0) - (a.wastedMs || 0);
    if (msDiff !== 0) return msDiff;
    const bytesDiff = (b.wastedBytes || 0) - (a.wastedBytes || 0);
    if (bytesDiff !== 0) return bytesDiff;
    return (a.score ?? 100) - (b.score ?? 100);
  });

  // Sort failed audits by lowest score first
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
    cspIssues,
    runWarnings: Array.isArray(lhr.runWarnings) ? lhr.runWarnings : []
  };
}

/**
 * Merges Desktop and Mobile AI summaries into one combined AI-Ready JSON object.
 */
export function buildCombinedAiReport({ url, timestamp, desktopSummary, mobileSummary }) {
  return {
    schema: 'sitelens-ai-report/v1',
    url,
    generatedAt: timestamp || new Date().toISOString(),
    summaryComparison: {
      desktop: desktopSummary ? desktopSummary.scores : null,
      mobile: mobileSummary ? mobileSummary.scores : null
    },
    devices: {
      ...(desktopSummary ? { desktop: desktopSummary } : {}),
      ...(mobileSummary ? { mobile: mobileSummary } : {})
    }
  };
}

/**
 * Generates an AI-Ready Markdown document (`.ai.md`) suitable for direct pasting
 * into an AI coding assistant (like Antigravity, Cursor, Claude, ChatGPT).
 */
export function buildCombinedAiMarkdown(combinedReport) {
  const lines = [];
  const { url, generatedAt, devices } = combinedReport;
  const desktop = devices?.desktop || null;
  const mobile = devices?.mobile || null;

  lines.push(`# DevWebAudit Dual Audit Report (Speed & Diagnostics)`);
  lines.push(`- **Target URL:** ${url}`);
  lines.push(`- **Audited At:** ${generatedAt}`);
  lines.push(
    `> **AI Assistant Instructions:** Analyze the failing Lighthouse audits, Core Web Vitals bottlenecks, DOM selectors, wasted bytes/ms, console errors, and CSP issues below. Provide concrete code changes to bring both Desktop and Mobile scores to 90–100.`
  );
  lines.push('');

  // Score Comparison Table
  lines.push(`## 1. Category Scores (0–100)`);
  lines.push(`| Category | Desktop | Mobile |`);
  lines.push(`| :--- | :---: | :---: |`);
  const categories = [
    { key: 'performance', label: 'Performance' },
    { key: 'accessibility', label: 'Accessibility' },
    { key: 'best-practices', label: 'Best Practices' },
    { key: 'seo', label: 'SEO' }
  ];
  for (const cat of categories) {
    const dScore = desktop?.scores?.[cat.key] ?? '—';
    const mScore = mobile?.scores?.[cat.key] ?? '—';
    lines.push(`| **${cat.label}** | ${dScore} | ${mScore} |`);
  }
  lines.push('');

  // Core Web Vitals Comparison Table
  lines.push(`## 2. Core Web Vitals & Performance Metrics`);
  lines.push(`| Metric | Desktop | Mobile |`);
  lines.push(`| :--- | :---: | :---: |`);
  for (const m of CORE_METRICS) {
    const dMetric = desktop?.coreWebVitals?.[m.key];
    const mMetric = mobile?.coreWebVitals?.[m.key];
    const dVal = dMetric ? `${dMetric.displayValue || dMetric.numericValue} (${dMetric.rating})` : '—';
    const mVal = mMetric ? `${mMetric.displayValue || mMetric.numericValue} (${mMetric.rating})` : '—';
    lines.push(`| **${m.label}** | ${dVal} | ${mVal} |`);
  }
  lines.push('');

  // Per-device detailed breakdown
  for (const [deviceKey, summary] of Object.entries(devices || {})) {
    if (!summary) continue;
    const titleDevice = deviceKey.charAt(0).toUpperCase() + deviceKey.slice(1);
    lines.push(`---`);
    lines.push(`## 3.${deviceKey === 'desktop' ? '1' : '2'} ${titleDevice} Diagnostics`);
    lines.push('');

    // Top Opportunities
    if (summary.topOpportunities && summary.topOpportunities.length > 0) {
      lines.push(`### Top Optimization Opportunities (${titleDevice})`);
      for (const opp of summary.topOpportunities) {
        const savingsParts = [];
        if (opp.wastedMs) savingsParts.push(`~${opp.wastedMs} ms`);
        if (opp.wastedSize) savingsParts.push(`~${opp.wastedSize}`);
        const savingsStr = savingsParts.length > 0 ? ` — **Est. Savings: ${savingsParts.join(', ')}**` : '';
        lines.push(`- **[${opp.id}] ${opp.title}** (Score: ${opp.score}/100)${ opp.displayValue ? ` [${opp.displayValue}]` : '' }${savingsStr}`);
        if (opp.items && opp.items.length > 0) {
          for (const item of opp.items.slice(0, 5)) {
            const parts = [];
            if (item.selector) parts.push(`Selector: \`${item.selector}\``);
            if (item.snippet) parts.push(`Snippet: \`${item.snippet}\``);
            if (item.url) parts.push(`URL: \`${item.url}\``);
            if (item.wastedMs) parts.push(`Wasted: ${item.wastedMs} ms`);
            if (item.wastedSize) parts.push(`Wasted: ${item.wastedSize}`);
            if (parts.length > 0) {
              lines.push(`  - ${parts.join(' | ')}`);
            }
          }
        }
      }
      lines.push('');
    }

    // Failed Audits
    if (summary.failedAudits && summary.failedAudits.length > 0) {
      lines.push(`### Failed Audits (Score < 90) (${titleDevice})`);
      for (const audit of summary.failedAudits) {
        lines.push(
          `- **[${audit.id}] ${audit.title}** (Score: ${audit.score}/100, Categories: ${audit.categories.join(', ')})${
            audit.displayValue ? ` — ${audit.displayValue}` : ''
          }`
        );
        if (audit.description) {
          lines.push(`  - *Why:* ${audit.description}`);
        }
        if (audit.items && audit.items.length > 0) {
          for (const item of audit.items.slice(0, 6)) {
            const parts = [];
            if (item.selector) parts.push(`Selector: \`${item.selector}\``);
            if (item.snippet) parts.push(`DOM: \`${item.snippet}\``);
            if (item.explanation) parts.push(`Issue: ${item.explanation}`);
            if (item.url) parts.push(`Asset: \`${item.url}\``);
            if (item.sourceLocation) parts.push(`Source: \`${item.sourceLocation}\``);
            if (item.wastedMs) parts.push(`Wasted: ${item.wastedMs} ms`);
            if (item.wastedSize) parts.push(`Wasted: ${item.wastedSize}`);
            if (item.description && !item.explanation) parts.push(`Detail: ${item.description}`);
            if (parts.length > 0) {
              lines.push(`  - ${parts.join(' | ')}`);
            }
          }
        }
      }
      lines.push('');
    }

    // Console Errors
    if (summary.consoleErrors && summary.consoleErrors.length > 0) {
      lines.push(`### Console Errors (${titleDevice})`);
      for (const err of summary.consoleErrors) {
        lines.push(
          `- **[${err.source}]** ${err.description}${err.url ? ` (\`${err.url}${err.line ? `:${err.line}` : ''}\`)` : ''}`
        );
      }
      lines.push('');
    }

    // CSP Issues
    if (summary.cspIssues && summary.cspIssues.length > 0) {
      lines.push(`### Content Security Policy (CSP) Issues (${titleDevice})`);
      for (const csp of summary.cspIssues) {
        lines.push(`- **[${csp.severity || 'CSP'}]** Directive \`${csp.directive || 'n/a'}\`: ${csp.description}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
