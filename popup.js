async function updateStats() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  
  const message = await browser.runtime.sendMessage({ action: "getStats", tabId: currentTab.id });
  
  document.getElementById("pageCount").textContent = message.pageCount;
  document.getElementById("totalCount").textContent = message.totalCount;
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

document.getElementById("addChannelBtn").addEventListener("click", addChannel);

document.getElementById("channelInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    addChannel();
  }
});