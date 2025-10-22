async function updateStats() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  
  const message = await browser.runtime.sendMessage({ action: "getStats", tabId: currentTab.id });
  
  document.getElementById("pageCount").textContent = message.pageCount;
  document.getElementById("totalCount").textContent = message.totalCount;
  
  const data = await browser.storage.local.get("blockedTitlesCache");
  const cacheSize = data.blockedTitlesCache ? data.blockedTitlesCache.length : 0;
  document.getElementById("cacheSize").textContent = cacheSize;
}

async function updatePowerButton() {
  const data = await browser.storage.local.get("extensionEnabled");
  const enabled = data.extensionEnabled !== false;
  const powerBtn = document.getElementById("powerBtn");
  
  if (enabled) {
    powerBtn.classList.remove("disabled");
  } else {
    powerBtn.classList.add("disabled");
  }
}

updatePowerButton();

document.getElementById("powerBtn").addEventListener("click", async () => {
  const data = await browser.storage.local.get("extensionEnabled");
  const currentState = data.extensionEnabled !== false;
  const newState = !currentState;
  
  await browser.storage.local.set({ extensionEnabled: newState });
  await browser.runtime.sendMessage({ action: "toggleExtension", enabled: newState });
  
  updatePowerButton();
});

browser.runtime.onMessage.addListener((request) => {
  if (request.action === "statsUpdated") {
    updateStats();
  }
});

updateStats();
updatePowerButton();
loadWhitelist();
setInterval(updateStats, 500);

document.getElementById("advancedToggle").addEventListener("click", () => {
  const toggle = document.getElementById("advancedToggle");
  const content = document.getElementById("advancedContent");
  
  toggle.classList.toggle("open");
  content.classList.toggle("hidden");
  content.classList.toggle("visible");
});

async function loadWhitelist() {
  const data = await browser.storage.local.get("whitelistedChannels");
  const channels = data.whitelistedChannels || [];
  renderChannelList(channels);
}

function renderChannelList(channels) {
  const list = document.getElementById("channelList");
  list.innerHTML = "";
  
  channels.forEach(channel => {
    const item = document.createElement("div");
    item.className = "channel-item";
    
    const name = document.createElement("span");
    name.className = "channel-name";
    name.textContent = channel;
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = () => removeChannel(channel);
    
    item.appendChild(name);
    item.appendChild(removeBtn);
    list.appendChild(item);
  });
}

async function addChannel() {
  const input = document.getElementById("channelInput");
  const channel = input.value.trim();
  
  if (!channel) return;
  
  const data = await browser.storage.local.get("whitelistedChannels");
  const channels = data.whitelistedChannels || [];
  
  if (!channels.includes(channel)) {
    channels.push(channel);
    await browser.storage.local.set({ whitelistedChannels: channels });
    await browser.runtime.sendMessage({ action: "updateWhitelist", channels });
    renderChannelList(channels);
  }
  
  input.value = "";
}

async function removeChannel(channel) {
  const data = await browser.storage.local.get("whitelistedChannels");
  const channels = data.whitelistedChannels || [];
  const filtered = channels.filter(c => c !== channel);
  
  await browser.storage.local.set({ whitelistedChannels: filtered });
  await browser.runtime.sendMessage({ action: "updateWhitelist", channels: filtered });
  renderChannelList(filtered);
}

// Abrir página de títulos cacheados
document.getElementById("viewCacheBtn").addEventListener("click", () => {
  window.location.href = "cached-titles.html";
});

async function clearCache() {
  const clearBtn = document.getElementById("clearCacheBtn");
  const originalText = clearBtn.textContent;
  
  clearBtn.textContent = "Click again to confirm";
  clearBtn.style.background = "#ff6600";
  clearBtn.style.borderColor = "#ff6600";
  clearBtn.style.color = "#fff";
  
  const timeoutId = setTimeout(() => {
    clearBtn.textContent = originalText;
    clearBtn.style.background = "";
    clearBtn.style.borderColor = "";
    clearBtn.style.color = "";
    clearBtn.onclick = clearCache;
  }, 3000);
  
  clearBtn.onclick = async () => {
    clearTimeout(timeoutId);
    
    clearBtn.textContent = "Clearing...";
    clearBtn.disabled = true;
    clearBtn.style.background = "#404040";
    clearBtn.style.borderColor = "#555";
    clearBtn.style.color = "#999";
    
    await browser.storage.local.remove("blockedTitlesCache");
    
    const tabs = await browser.tabs.query({ url: "https://www.youtube.com/*" });
    tabs.forEach(tab => {
      browser.tabs.sendMessage(tab.id, { action: "clearCache" }).catch(() => {});
    });
    
    await updateStats();
    
    clearBtn.textContent = "✓ Cache cleared";
    clearBtn.style.background = "#00d4aa";
    clearBtn.style.borderColor = "#00d4aa";
    clearBtn.style.color = "#1a1a1a";
    
    setTimeout(() => {
      clearBtn.textContent = originalText;
      clearBtn.disabled = false;
      clearBtn.style.background = "";
      clearBtn.style.borderColor = "";
      clearBtn.style.color = "";
      clearBtn.onclick = clearCache;
    }, 2000);
  };
}

document.getElementById("addChannelBtn").addEventListener("click", addChannel);

document.getElementById("channelInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    addChannel();
  }
});

document.getElementById("clearCacheBtn").addEventListener("click", clearCache);