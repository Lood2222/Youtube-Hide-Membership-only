let allVideos = [];

async function loadCachedVideos() {
  const container = document.getElementById("titlesContainer");
  
  try {
    const data = await browser.storage.local.get("blockedVideosCache");
    
    if (data.blockedVideosCache && Array.isArray(data.blockedVideosCache)) {
      allVideos = data.blockedVideosCache.map(([title, info]) => ({
        title: title,
        channel: info.channel || 'Unknown channel',
        timestamp: info.timestamp || Date.now()
      }));
    } else {
      allVideos = [];
    }
    
    document.getElementById("totalCount").textContent = allVideos.length;
    
    if (allVideos.length === 0) {
      container.innerHTML = '<div class="no-titles">No cached videos yet</div>';
      return;
    }
    
    renderVideos(allVideos);
  } catch (error) {
    container.innerHTML = '<div class="no-titles">Error loading cache</div>';
    console.error("Error loading cached videos:", error);
  }
}

function renderVideos(videos) {
  const container = document.getElementById("titlesContainer");
  container.innerHTML = "";
  
  if (videos.length === 0) {
    container.innerHTML = '<div class="no-results">No videos match your search</div>';
    return;
  }
  
  const sortedVideos = [...videos].sort((a, b) => b.timestamp - a.timestamp);
  
  sortedVideos.forEach((video, index) => {
    const item = document.createElement("div");
    item.className = "video-item";
    
    const titleDiv = document.createElement("div");
    titleDiv.className = "video-title";
    titleDiv.textContent = video.title;
    
    const channelDiv = document.createElement("div");
    channelDiv.className = "video-channel";
    channelDiv.textContent = video.channel;
    
    const timeDiv = document.createElement("div");
    timeDiv.className = "video-time";
    timeDiv.textContent = formatTimestamp(video.timestamp);
    
    item.appendChild(titleDiv);
    item.appendChild(channelDiv);
    item.appendChild(timeDiv);
    
    item.style.animationDelay = `${Math.min(index * 0.02, 0.5)}s`;
    container.appendChild(item);
  });
}

function formatTimestamp(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function filterVideos(searchTerm) {
  const filtered = allVideos.filter(video => 
    video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    video.channel.toLowerCase().includes(searchTerm.toLowerCase())
  );
  renderVideos(filtered);
}

document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "popup.html";
});


loadCachedVideos();