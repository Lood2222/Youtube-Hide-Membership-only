let blockedNow = 0;
let isEnabled = true;
let observer = null;
let whitelistedChannels = [];
let processedItems = new Set();

async function checkIfEnabled() {
  const response = await browser.runtime.sendMessage({ action: "isEnabled" });
  isEnabled = response.enabled;
}

async function getWhitelist() {
  const response = await browser.runtime.sendMessage({ action: "getWhitelist" });
  whitelistedChannels = response.channels || [];
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

function getChannelInfo(item) {
  const channelSelectors = [
    'yt-formatted-string.ytd-channel-name',
    '#channel-name #text',
    '#text.ytd-channel-name',
    'ytd-channel-name a',
    '#channel-info #channel-name',
    '.ytd-video-meta-block #channel-name',
    'a.yt-simple-endpoint.style-scope.yt-formatted-string'
  ];
  
  for (const selector of channelSelectors) {
    const element = item.querySelector(selector);
    if (element) {
      const text = element.textContent?.trim();
      if (text && text !== 'Verificada' && text.length > 0) {
        return text;
      }
    }
  }
  
  const channelLink = item.querySelector('a[href*="/@"], a[href*="/channel/"]');
  if (channelLink) {
    const href = channelLink.getAttribute('href');
    if (href) {
      const handleMatch = href.match(/\/@([^\/\?]+)/);
      if (handleMatch) return `@${handleMatch[1]}`;
      
      const channelMatch = href.match(/\/channel\/([^\/\?]+)/);
      if (channelMatch) return channelMatch[1];
    }
  }
  
  return 'Unknown channel';
}

function isWhitelisted(item) {
  if (whitelistedChannels.length === 0) return false;
  
  const videoTitle = item.querySelector('#video-title, h3, .title')?.textContent?.trim() || 'Unknown video';
  const channelName = getChannelInfo(item);
  
  const currentUrl = window.location.href;
  
  for (const channel of whitelistedChannels) {
    const cleanChannel = channel.trim();
    
    if (cleanChannel.startsWith('@')) {
      if (currentUrl.includes('/@' + cleanChannel.substring(1))) {
        console.log(`✓ WHITELISTED (on channel page) - Video: "${videoTitle}" | Channel: ${channelName} | Whitelist entry: ${cleanChannel}`);
        return true;
      }
    } else {
      if (currentUrl.includes('/channel/' + cleanChannel) || currentUrl.includes('/c/' + cleanChannel)) {
        console.log(`✓ WHITELISTED (on channel page) - Video: "${videoTitle}" | Channel: ${channelName} | Whitelist entry: ${cleanChannel}`);
        return true;
      }
    }
  }
  
  const allLinks = item.querySelectorAll('a[href]');
  
  for (const link of allLinks) {
    const href = link.getAttribute('href');
    
    for (const channel of whitelistedChannels) {
      const cleanChannel = channel.trim();
      
      if (cleanChannel.startsWith('@')) {
        const handle = cleanChannel.substring(1);
        if (href && href.includes('/@' + handle)) {
          console.log(`✓ WHITELISTED (video link match) - Video: "${videoTitle}" | Channel: ${channelName} | Whitelist entry: ${cleanChannel}`);
          return true;
        }
      } else {
        if (href && (href.includes('/channel/' + cleanChannel) || href.includes('/c/' + cleanChannel))) {
          console.log(`✓ WHITELISTED (video link match) - Video: "${videoTitle}" | Channel: ${channelName} | Whitelist entry: ${cleanChannel}`);
          return true;
        }
      }
    }
  }
  
  console.log(`✗ BLOCKED - Video: "${videoTitle}" | Channel: ${channelName}`);
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
    if (!item.querySelector(badgeClassSelectors) && !hasMemberStarIcon(item)) return;
    
    const itemId = getItemId(item);
    
    if (!itemId) return;
    
    if (processedItems.has(itemId)) return;
    
    processedItems.add(itemId);
    
    if (!isWhitelisted(item)) {
      const ancestor = item.closest('ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer') || item;
      ancestor.remove();
      removed++;
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

function startObserver() {
  if (observer) {
    observer.disconnect();
  }
  observer = new MutationObserver(hideMembersOnlyContent);
  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
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
    processedItems.clear();
    hideMembersOnlyContent();
  }
});

Promise.all([checkIfEnabled(), getWhitelist()]).then(() => {
  if (isEnabled) {
    hideMembersOnlyContent();
    startObserver();
  }
});

browser.runtime.sendMessage({ action: "contentScriptLoaded" });