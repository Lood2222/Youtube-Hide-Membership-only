console.log("Background script loaded");

// Listen for the content script to send a message
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "contentScriptLoaded") {
    console.log("Content script loaded on tab: " + sender.tab.id);
  }
});
