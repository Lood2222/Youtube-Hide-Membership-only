console.log("Background script loaded");

let blockedPerTab = {};
let extensionEnabled = true;
let whitelistedChannels = [];

async function initializeExtension() {
  const data = await browser.storage.local.get(["extensionEnabled", "whitelistedChannels"]);
  extensionEnabled = data.extensionEnabled !== false;
  whitelistedChannels = data.whitelistedChannels || [];
  updateAllIcons();
}

function updateAllIcons() {
  if (extensionEnabled) {
    browser.browserAction.setIcon({ path: "icons/icon-48.png" });
  } else {
    const canvas = new OffscreenCanvas(48, 48);
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = browser.runtime.getURL("icons/icon-48.png");
    img.onload = () => {
      ctx.filter = 'grayscale(100%) brightness(0.6) contrast(0.8)';
      ctx.drawImage(img, 0, 0, 48, 48);
      canvas.convertToBlob().then(blob => {
        const reader = new FileReader();
        reader.onload = () => {
          browser.browserAction.setIcon({ path: reader.result });
        };
        reader.readAsDataURL(blob);
      });
    };
  }
}

initializeExtension();

browser.runtime.onMessage.addListener(async (request, sender) => {
  const tabId = sender.tab ? sender.tab.id : null;

  if (request.action === "contentScriptLoaded") {
    if (tabId !== null) {
      blockedPerTab[tabId] = 0;
      browser.browserAction.setBadgeText({ text: "0", tabId });
      browser.browserAction.setBadgeBackgroundColor({ color: "#FF0000", tabId });
    }
  }

  if (request.action === "videosBlocked") {
    const count = request.count || 0;
    if (tabId !== null) {
      blockedPerTab[tabId] = (blockedPerTab[tabId] || 0) + count;
      browser.browserAction.setBadgeText({ text: blockedPerTab[tabId].toString(), tabId });
      browser.browserAction.setBadgeBackgroundColor({ color: "#FF0000", tabId });
    }

    const data = await browser.storage.local.get("blockedCount");
    const newCount = (data.blockedCount || 0) + count;
    await browser.storage.local.set({ blockedCount: newCount });
    console.log(`Total blocked globally: ${newCount}`);
    
    browser.runtime.sendMessage({ action: "statsUpdated" }).catch(() => {});
  }

  if (request.action === "getStats") {
    const requestedTabId = request.tabId;
    const data = await browser.storage.local.get("blockedCount");
    return {
      pageCount: blockedPerTab[requestedTabId] || 0,
      totalCount: data.blockedCount || 0
    };
  }

  if (request.action === "toggleExtension") {
    extensionEnabled = request.enabled;
    await browser.storage.local.set({ extensionEnabled: extensionEnabled });
    
    updateAllIcons();
    
    const tabs = await browser.tabs.query({ url: "https://www.youtube.com/*" });
    tabs.forEach(tab => {
      browser.tabs.sendMessage(tab.id, { 
        action: "toggleBlocking", 
        enabled: extensionEnabled 
      }).catch(() => {});
    });
  }

  if (request.action === "isEnabled") {
    return { enabled: extensionEnabled };
  }

  if (request.action === "updateWhitelist") {
    whitelistedChannels = request.channels || [];
    const tabs = await browser.tabs.query({ url: "https://www.youtube.com/*" });
    tabs.forEach(tab => {
      browser.tabs.sendMessage(tab.id, {
        action: "updateWhitelist",
        channels: whitelistedChannels
      }).catch(() => {});
    });
  }

  if (request.action === "getWhitelist") {
    return { channels: whitelistedChannels };
  }
});

browser.tabs.onRemoved.addListener(tabId => {
  delete blockedPerTab[tabId];
});