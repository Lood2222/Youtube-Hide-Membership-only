let blockedNow = 0;
let isEnabled = true;
let observer = null;
let whitelistedChannels = [];
let processedItems = new Set();
let lastUrl = location.href;
let checkInterval = null;
let blockedVideosCache = new Map();

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
  
  blockedVideosCache.set(title, {
    channel: channelInfo,
    timestamp: Date.now()
  });
  
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

function getChannelInfo(item) {
  const channelSelectors = [
    'yt-content-metadata-view-model .yt-content-metadata-view-model__metadata-row span.yt-core-attributed-string',
    '.yt-core-attributed-string.yt-content-metadata-view-model__metadata-text',
    '.ytd-channel-name',
    '#channel-name #text',
    'a[href*="/@"]',
  ];

  for (const selector of channelSelectors) {
    const element = item.querySelector(selector);
    if (element) {
      const text = element.textContent?.trim();
      if (text && text.length > 0 && !text.includes('subscribers') && !text.includes('Emitido')) {
        console.log(`[YHM] Found channel name: "${text}" using selector: ${selector}`);
        return text;
      }
    }
  }


  const channelLinks = item.querySelectorAll('a[href*="/@"], a[href*="/channel/"], a[href*="/c/"]');

  for (const link of channelLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;

    const handleMatch = href.match(/\/@([^\/\?]+)/);
    if (handleMatch) return `@${handleMatch[1]}`;

    const idMatch = href.match(/\/channel\/([^\/\?]+)/);
    if (idMatch) return idMatch[1];

    const customMatch = href.match(/\/c\/([^\/\?]+)/);
    if (customMatch) return customMatch[1];
  }

  console.log('[YHM] Could not determine channel info for item');
  return 'Unknown channel';
}


function normalizeChannelIdentifier(identifier) {
  if (!identifier) return '';
  

  let normalized = identifier.trim().toLowerCase();
  

  if (normalized.startsWith('@')) {
    return normalized;
  }
  
  return normalized;
}

function isWhitelisted(item) {
  const videoTitle = getVideoTitle(item) || 'Unknown video';
  const channelInfo = getChannelInfo(item);
  
  console.log(`[YHM] Checking video: "${videoTitle}" from channel: "${channelInfo}"`);
  
  if (whitelistedChannels.length === 0) {
    console.log(`[YHM] BLOCKED - No whitelist entries`);
    return false;
  }
  
  const currentUrl = window.location.href;
  const normalizedChannelInfo = normalizeChannelIdentifier(channelInfo);
  

  for (const channel of whitelistedChannels) {
    const cleanChannel = channel.trim();
    const normalizedWhitelist = normalizeChannelIdentifier(cleanChannel);
    

    if (cleanChannel.startsWith('@')) {
      const handle = cleanChannel.substring(1).toLowerCase();
      if (currentUrl.toLowerCase().includes('/@' + handle)) {
        console.log(`[YHM] WHITELISTED (on channel page) - Channel: ${cleanChannel}`);
        return true;
      }
    } else {
      const channelLower = cleanChannel.toLowerCase();
      if (currentUrl.toLowerCase().includes('/channel/' + channelLower) || 
          currentUrl.toLowerCase().includes('/c/' + channelLower)) {
        console.log(`[YHM] WHITELISTED (on channel page) - Channel: ${cleanChannel}`);
        return true;
      }
    }
    
    if (normalizedChannelInfo === normalizedWhitelist) {
      console.log(`[YHM] WHITELISTED (direct match) - Channel: ${cleanChannel}`);
      return true;
    }
    
    if (normalizedWhitelist.startsWith('@') && normalizedChannelInfo.startsWith('@')) {
      if (normalizedWhitelist === normalizedChannelInfo) {
        console.log(`[YHM] WHITELISTED (handle match) - Channel: ${cleanChannel}`);
        return true;
      }
    }
    
    const allLinks = item.querySelectorAll('a[href]');
    for (const link of allLinks) {
      const href = link.getAttribute('href');
      if (!href) continue;
      
      const hrefLower = href.toLowerCase();
      
      if (cleanChannel.startsWith('@')) {
        const handle = cleanChannel.substring(1).toLowerCase();
        if (hrefLower.includes('/@' + handle)) {
          console.log(`[YHM] WHITELISTED (link match) - Channel: ${cleanChannel}`);
          return true;
        }
      } else {
        const channelLower = cleanChannel.toLowerCase();
        if (hrefLower.includes('/channel/' + channelLower) || 
            hrefLower.includes('/c/' + channelLower)) {
          console.log(`[YHM] WHITELISTED (link match) - Channel: ${cleanChannel}`);
          return true;
        }
      }
    }
  }
  
  console.log(`[YHM] BLOCKED - Video: "${videoTitle}" | Channel: "${channelInfo}"`);
  return false;
}

function hasMemberStarIcon(item) {
  const svgs = item.querySelectorAll('svg');
  
  for (const svg of svgs) {
    const path = svg.querySelector('path[d*="M6 .5a5.5 5.5"]');
    if (path) {
      const dAttr = path.getAttribute('d');
      if (dAttr && dAttr.includes('M6 .5a5.5 5.5') && dAttr.includes('.906 1.837')) {
        return true;
      }
    }
  }
  
  return false;
}

function hideMembersOnlyContent() {
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

  document.querySelectorAll(containers).forEach(item => {
    const videoTitle = getVideoTitle(item);
    
    if (videoTitle && blockedVideosCache.has(videoTitle)) {
      const itemId = getItemId(item);
      if (itemId && !processedItems.has(itemId)) {
        processedItems.add(itemId);
        
        if (!isWhitelisted(item)) {
          const ancestor = item.closest('ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer') || item;
          ancestor.remove();
          removed++;
          const cachedData = blockedVideosCache.get(videoTitle);
          console.log(`[YHM] CACHE FAST BLOCK - Video: "${videoTitle}" | Channel: ${cachedData.channel}`);
        }
      }
      return;
    }
    
    if (!item.querySelector(badgeClassSelectors) && !hasMemberStarIcon(item)) return;
    
    const itemId = getItemId(item);
    if (!itemId || processedItems.has(itemId)) return;
    
    processedItems.add(itemId);
    
    if (!isWhitelisted(item)) {
      const channelInfo = getChannelInfo(item);
      const ancestor = item.closest('ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer') || item;
      ancestor.remove();
      removed++;
      
      if (videoTitle) {
        saveBlockedVideo(videoTitle, channelInfo);
      }
      
      console.log(`[YHM] BLOCKED - Video: "${videoTitle}" | Channel: "${channelInfo}"`);
    }
  });

  if (removed > 0) {
    blockedNow += removed;
    browser.runtime.sendMessage({
      action: "videosBlocked",
      count: removed
    });
  }
}

function checkUrlChange() {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    processedItems.clear();
    console.log('[YHM] URL changed, clearing processed items and re-scanning');
    setTimeout(() => {
      hideMembersOnlyContent();
    }, 500);
  }
}

function startObserver() {
  if (observer) {
    observer.disconnect();
  }
  
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
    
    if (shouldProcess) {
      hideMembersOnlyContent();
    }
  });
  
  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });
  
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  checkInterval = setInterval(() => {
    checkUrlChange();
    hideMembersOnlyContent();
  }, 1000);
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
  }
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
      hideMembersOnlyContent();
      startObserver();
    } else {
      stopObserver();
    }
  }
  
  if (request.action === "updateWhitelist") {
    whitelistedChannels = request.channels || [];
    console.log('[YHM] Whitelist updated:', whitelistedChannels);
    processedItems.clear();
    hideMembersOnlyContent();
  }
  
  if (request.action === "clearCache") {
    blockedVideosCache.clear();
    browser.storage.local.remove("blockedVideosCache");
    console.log('[YHM] Cache cleared');
  }
});

Promise.all([checkIfEnabled(), getWhitelist(), loadBlockedVideosCache()]).then(() => {
  console.log('[YHM] Extension initialized');
  console.log('[YHM] Enabled:', isEnabled);
  console.log('[YHM] Whitelist:', whitelistedChannels);
  console.log('[YHM] Cache size:', blockedVideosCache.size);
  
  if (isEnabled) {
    hideMembersOnlyContent();
    startObserver();
  }
});

browser.runtime.sendMessage({ action: "contentScriptLoaded" });