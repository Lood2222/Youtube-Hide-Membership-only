let allTitles = [];

async function loadCachedTitles() {
  const container = document.getElementById("titlesContainer");
  
  try {
    const data = await browser.storage.local.get("blockedTitlesCache");
    allTitles = data.blockedTitlesCache || [];
    
    document.getElementById("totalCount").textContent = allTitles.length;
    
    if (allTitles.length === 0) {
      container.innerHTML = '<div class="no-titles">No cached titles yet</div>';
      return;
    }
    
    renderTitles(allTitles);
  } catch (error) {
    container.innerHTML = '<div class="no-titles">Error loading titles</div>';
    console.error("Error loading cached titles:", error);
  }
}

function renderTitles(titles) {
  const container = document.getElementById("titlesContainer");
  container.innerHTML = "";
  
  if (titles.length === 0) {
    container.innerHTML = '<div class="no-results">No titles match your search</div>';
    return;
  }
  
  // Ordenar alfabéticamente
  const sortedTitles = [...titles].sort((a, b) => a.localeCompare(b));
  
  sortedTitles.forEach((title, index) => {
    const item = document.createElement("div");
    item.className = "title-item";
    item.textContent = title;
    item.style.animationDelay = `${Math.min(index * 0.02, 0.5)}s`;
    container.appendChild(item);
  });
}

function filterTitles(searchTerm) {
  const filtered = allTitles.filter(title => 
    title.toLowerCase().includes(searchTerm.toLowerCase())
  );
  renderTitles(filtered);
}

// Event listeners
document.getElementById("backBtn").addEventListener("click", () => {
  window.location.href = "popup.html";
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  filterTitles(e.target.value);
});

// Cargar títulos al abrir la página
loadCachedTitles();