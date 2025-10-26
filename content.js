let blockedNow = 0;
let isEnabled = true;
let observer = null;
let whitelistedChannels = [];
let processedItems = new Set();
let permanentlyBlockedItems = new Set();
let lastUrl = location.href;
let checkInterval = null;
let blockedVideosCache = new Map();
let channelNameCache = new Map();

async function checkIfEnabled() {
  const response = await browser.runtime.sendMessage({ action: "isEnabled" });
  isEnabled = response.enabled;
}

async function getWhitelist() {
  const response = await browser.runtime.sendMessage({ action: "getWhitelist" });
  whitelistedChannels = response.channels || [];
  console.log('[YHM] Whitelist loaded:', whitelistedChannels);
}

async function loadBlockedVideosCache() {
  try {
    const data = await browser.storage.local.get("blockedVideosCache");
    if (data.blockedVideosCache && Array.isArray(data.blockedVideosCache)) {
      blockedVideosCache = new Map(data.blockedVideosCache);
      console.log(`[YHM] Cache loaded: ${blockedVideosCache.size} blocked videos`);
    }
  } catch (error) {
    console.error('[YHM] Error loading cache:', error);
  }
}

async function saveBlockedVideo(title, channelInfo) {
  if (!title || blockedVideosCache.has(title)) return;
  blockedVideosCache.set(title, { channel: channelInfo, timestamp: Date.now() });
  try {
    const cacheArray = Array.from(blockedVideosCache.entries());
    const maxCacheSize = 1000;
    if (cacheArray.length > maxCacheSize) {
      const sortedCache = cacheArray.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const trimmedCache = sortedCache.slice(0, maxCacheSize);
      blockedVideosCache = new Map(trimmedCache);
      await browser.storage.local.set({ blockedVideosCache: trimmedCache });
    } else {
      await browser.storage.local.set({ blockedVideosCache: cacheArray });
    }
    console.log(`[YHM] Saved to cache: "${title}" from ${channelInfo} (Total: ${blockedVideosCache.size})`);
  } catch (error) {
    console.error('[YHM] Error saving cache:', error);
  }
}

async function fetchChannelName(handle) {
  if (channelNameCache.has(handle)) return channelNameCache.get(handle);
  const url = `https://www.youtube.com/${handle}`;
  try {
    const r = await fetch(url);
    const html = await r.text();
    let match = html.match(/<meta property="og:title" content="([^"]+)"/i);
    if (match) {
      const channelName = match[1];
      channelNameCache.set(handle, channelName);
      return channelName;
    }
    match = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/i);
    if (match) {
      const obj = JSON.parse(match[1]);
      if (obj && obj.name) {
        const channelName = obj.name;
        channelNameCache.set(handle, channelName);
        return channelName;
      }
    }
  } catch (e) {
    console.error("[YHM] Fetch failed:", e);
  }
  return null;
}

function extractChannelHandleFromUrl() {
  const url = window.location.href;
  const handleMatch = url.match(/\/@([^\/\?]+)/);
  if (handleMatch) return `@${handleMatch[1]}`;
  return null;
}

async function getChannelInfo(item) {
  const urlHandle = extractChannelHandleFromUrl();
  if (urlHandle) {
    const channelName = await fetchChannelName(urlHandle);
    return channelName || urlHandle;
  }
  const channelSelectors = [
    'yt-content-metadata-view-model .yt-content-metadata-view-model__metadata-row span.yt-core-attributed-string',
    '.yt-core-attributed-string.yt-content-metadata-view-model__metadata-text',
    '.ytd-channel-name',
    '#channel-name #text',
    'a[href*="/@"]',
  ];
  const foundNames = new Set();
  for (const selector of channelSelectors) {
    const elements = item.querySelectorAll(selector);
    for (const element of elements) {
      const text = element.textContent?.trim();
      if (
        text && 
        text.length > 0 && 
        !text.includes('subscribers') && 
        !text.includes('Emitido') && 
        !text.includes('\n')
      ) {
        foundNames.add(text);
      }
    }
  }
  if (foundNames.size > 0) return [...foundNames][0];
  const channelLinks = item.querySelectorAll('a[href*="/@"], a[href*="/channel/"], a[href*="/c/"]');
  for (const link of channelLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;
    const handleMatch = href.match(/\/@([^\/\?]+)/);
    if (handleMatch) {
      const handle = `@${handleMatch[1]}`;
      const channelName = await fetchChannelName(handle);
      return channelName || handle;
    }
    const idMatch = href.match(/\/channel\/([^\/\?]+)/);
    if (idMatch) return idMatch[1];
    const customMatch = href.match(/\/c\/([^\/\?]+)/);
    if (customMatch) return customMatch[1];
  }
  return 'Unknown channel';
}

function getItemId(item) {
  const videoLink = item.querySelector('a#video-title, a#thumbnail, a[href*="/watch?v="]');
  if (videoLink) {
    const href = videoLink.getAttribute('href');
    if (href) {
      const videoIdMatch = href.match(/[?&]v=([^&]+)/);
      if (videoIdMatch) return videoIdMatch[1];
    }
  }
  const videoTitle = item.querySelector('#video-title, h3, .title')?.textContent?.trim();
  if (videoTitle) return videoTitle;
  return null;
}

function getVideoTitle(item) {
  const titleElement = item.querySelector('#video-title, h3, .title');
  return titleElement?.textContent?.trim() || null;
}

function normalizeChannelIdentifier(identifier) {
  if (!identifier) return '';
  let normalized = identifier.trim().toLowerCase();
  if (normalized.startsWith('@')) return normalized;
  return normalized;
}

async function isWhitelisted(item) {
  const videoTitle = getVideoTitle(item) || 'Unknown video';
  const channelInfo = await getChannelInfo(item);
  if (whitelistedChannels.length === 0) return false;
  const currentUrl = window.location.href;
  const normalizedChannelInfo = normalizeChannelIdentifier(channelInfo);
  for (const channel of whitelistedChannels) {
    const cleanChannel = channel.trim();
    const normalizedWhitelist = normalizeChannelIdentifier(cleanChannel);
    if (cleanChannel.startsWith('@')) {
      const handle = cleanChannel.substring(1).toLowerCase();
      if (currentUrl.toLowerCase().includes('/@' + handle)) return true;
    } else {
      const channelLower = cleanChannel.toLowerCase();
      if (currentUrl.toLowerCase().includes('/channel/' + channelLower) || currentUrl.toLowerCase().includes('/c/' + channelLower)) return true;
    }
    if (normalizedChannelInfo === normalizedWhitelist) return true;
    if (normalizedWhitelist.startsWith('@') && normalizedChannelInfo.startsWith('@')) {
      if (normalizedWhitelist === normalizedChannelInfo) return true;
    }
    const allLinks = item.querySelectorAll('a[href]');
    for (const link of allLinks) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const hrefLower = href.toLowerCase();
      if (cleanChannel.startsWith('@')) {
        const handle = cleanChannel.substring(1).toLowerCase();
        if (hrefLower.includes('/@' + handle)) return true;
      } else {
        const channelLower = cleanChannel.toLowerCase();
        if (hrefLower.includes('/channel/' + channelLower) || hrefLower.includes('/c/' + channelLower)) return true;
      }
    }
  }
  return false;
}

function hasMemberStarIcon(item) {
  const svgs = item.querySelectorAll('svg');
  for (const svg of svgs) {
    const path = svg.querySelector('path[d*="M6 .5a5.5 5.5"]');
    if (path) {
      const dAttr = path.getAttribute('d');
      if (dAttr && dAttr.includes('M6 .5a5.5 5.5') && dAttr.includes('.906 1.837')) return true;
    }
  }
  return false;
}

function hideElement(element) {
  element.style.setProperty('display', 'none', 'important');
  element.style.setProperty('visibility', 'hidden', 'important');
  element.style.setProperty('height', '0', 'important');
  element.style.setProperty('width', '0', 'important');
  element.style.setProperty('overflow', 'hidden', 'important');
  element.style.setProperty('margin', '0', 'important');
  element.style.setProperty('padding', '0', 'important');
  element.setAttribute('data-yhm-hidden', 'true');
}

async function hideMembersOnlyContent() {
  if (!isEnabled) return;
  const containers = [
    'ytd-rich-item-renderer',
    'yt-lockup-view-model',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer'
  ].join(',');
  const badgeClassSelectors = [
    '.badge-style-type-members-only',
    '.badge-style-type-membership',
    '.yt-badge-shape--membership'
  ].join(',');
  let removed = 0;
  const items = document.querySelectorAll(containers);
  for (const item of items) {
    if (item.getAttribute('data-yhm-hidden') === 'true') {
      hideElement(item);
      continue;
    }
    const videoTitle = getVideoTitle(item);
    const itemId = getItemId(item);
    if (itemId && permanentlyBlockedItems.has(itemId)) {
      const ancestor = item.closest('ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer') || item;
      hideElement(ancestor);
      continue;
    }
    if (videoTitle && blockedVideosCache.has(videoTitle)) {
      if (itemId && !processedItems.has(itemId)) {
        processedItems.add(itemId);
        if (!(await isWhitelisted(item))) {
          permanentlyBlockedItems.add(itemId);
          const ancestor = item.closest('ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer') || item;
          hideElement(ancestor);
          removed++;
        }
      }
      continue;
    }
    if (!item.querySelector(badgeClassSelectors) && !hasMemberStarIcon(item)) continue;
    if (!itemId || processedItems.has(itemId)) continue;
    processedItems.add(itemId);
    if (!(await isWhitelisted(item))) {
      permanentlyBlockedItems.add(itemId);
      const channelInfo = await getChannelInfo(item);
      const ancestor = item.closest('ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer') || item;
      hideElement(ancestor);
      removed++;
      if (videoTitle) saveBlockedVideo(videoTitle, channelInfo);
    }
  }
  if (removed > 0) {
    blockedNow += removed;
    browser.runtime.sendMessage({ action: "videosBlocked", count: removed });
  }
}

function checkUrlChange() {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    processedItems.clear();
    setTimeout(() => {
      hideMembersOnlyContent();
    }, 500);
  }
}

function startObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const containers = [
              'ytd-rich-item-renderer',
              'yt-lockup-view-model',
              'ytd-video-renderer',
              'ytd-grid-video-renderer',
              'ytd-compact-video-renderer'
            ];
            if (containers.some(selector => node.matches && node.matches(selector))) {
              shouldProcess = true;
              break;
            }
            if (node.querySelector && containers.some(selector => node.querySelector(selector))) {
              shouldProcess = true;
              break;
            }
          }
        }
      }
      if (shouldProcess) break;
    }
    if (shouldProcess) hideMembersOnlyContent();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  if (checkInterval) clearInterval(checkInterval);
  checkInterval = setInterval(() => {
    checkUrlChange();
    hideMembersOnlyContent();
  }, 1000);
}

function stopObserver() {
  if (observer) observer.disconnect();
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

browser.runtime.onMessage.addListener((request) => {
  if (request.action === "toggleBlocking") {
    isEnabled = request.enabled;
    if (isEnabled) {
      processedItems.clear();
      permanentlyBlockedItems.clear();
      hideMembersOnlyContent();
      startObserver();
    } else {
      stopObserver();
    }
  }
  if (request.action === "updateWhitelist") {
    whitelistedChannels = request.channels || [];
    processedItems.clear();
    permanentlyBlockedItems.clear();
    hideMembersOnlyContent();
  }
  if (request.action === "clearCache") {
    blockedVideosCache.clear();
    channelNameCache.clear();
    permanentlyBlockedItems.clear();
    browser.storage.local.remove("blockedVideosCache");
  }
});

Promise.all([checkIfEnabled(), getWhitelist(), loadBlockedVideosCache()]).then(() => {
  if (isEnabled) {
    hideMembersOnlyContent();
    startObserver();
  }
});

browser.runtime.sendMessage({ action: "contentScriptLoaded" });
