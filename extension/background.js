/**
 * DevWebAudit - Manifest V3 Background Service Worker
 * Handles default settings initialization, badge status updates, and reliable file downloads.
 */

const DEFAULT_SETTINGS = {
  deviceMode: 'both', // 'both' | 'desktop' | 'mobile'
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
  psiApiKey: ''
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['settings']);
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  await cleanupLegacyDynamicRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await cleanupLegacyDynamicRules();
});

/**
 * Generates a deterministic positive integer rule ID scoped to a specific Chrome tab ID.
 */
function getStudioRuleIdForTab(tabId) {
  return 10000 + (Number(tabId) % 90000);
}

/**
 * Registers a tab-scoped session DNR rule ONLY for the specified Responsive Studio tab.
 * Never weakens security headers on normal browsing tabs (Chrome Web Store compliant).
 */
async function enableStudioIframeRuleForTab(tabId) {
  if (!chrome.declarativeNetRequest || !Number.isInteger(tabId) || tabId < 0) return false;
  const ruleId = getStudioRuleIdForTab(tabId);
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [
        {
          id: ruleId,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            responseHeaders: [
              { header: 'X-Frame-Options', operation: 'remove' },
              { header: 'Frame-Options', operation: 'remove' },
              { header: 'Content-Security-Policy', operation: 'remove' },
              { header: 'Cross-Origin-Opener-Policy', operation: 'remove' },
              { header: 'Cross-Origin-Embedder-Policy', operation: 'remove' }
            ]
          },
          condition: {
            tabIds: [tabId],
            resourceTypes: ['sub_frame']
          }
        }
      ]
    });
    return true;
  } catch (err) {
    console.warn('[SiteLens AI] Could not register tab-scoped studio rule:', err);
    return false;
  }
}

/**
 * Removes the tab-scoped session DNR rule immediately when the Studio tab closes or navigates away.
 */
async function disableStudioIframeRuleForTab(tabId) {
  if (!chrome.declarativeNetRequest || !Number.isInteger(tabId) || tabId < 0) return;
  const ruleId = getStudioRuleIdForTab(tabId);
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId]
    });
  } catch (_) {
    // ignore if rule did not exist
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  disableStudioIframeRuleForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !changeInfo.url.startsWith(chrome.runtime.getURL('responsive-matrix.html'))) {
    disableStudioIframeRuleForTab(tabId);
  }
});

async function cleanupLegacyDynamicRules() {
  if (!chrome.declarativeNetRequest) return;
  try {
    const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = currentRules.map((r) => r.id);
    if (ruleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
    }
  } catch (err) {
    console.warn('[SiteLens AI] Dynamic rules cleanup notice:', err);
  }
}

/**
 * Converts a UTF-8 string into a base64 Data URL (safe inside MV3 Service Workers where URL.createObjectURL is unavailable)
 */
function stringToDataUrl(content, mimeType = 'application/json') {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return `data:${mimeType};charset=utf-8;base64,${base64}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  if (message.action === 'REGISTER_STUDIO_TAB') {
    const tabId = sender?.tab?.id;
    enableStudioIframeRuleForTab(tabId).then((ok) => sendResponse({ ok, tabId }));
    return true; // async response
  }

  if (message.action === 'SET_BADGE') {
    const { text = '', color = '#0ea5e9' } = message;
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === 'DOWNLOAD_FILE') {
    const { filename, content, mimeType } = message;
    try {
      const dataUrl = stringToDataUrl(content, mimeType || 'application/octet-stream');
      chrome.downloads.download(
        {
          url: dataUrl,
          filename,
          saveAs: false,
          conflictAction: 'uniquify'
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ ok: true, downloadId });
          }
        }
      );
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return true; // async response
  }

  return false;
});
