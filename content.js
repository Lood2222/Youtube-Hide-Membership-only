function hideMembersOnlyContent() {
    const containers = [
        'ytd-rich-item-renderer',
        'yt-lockup-view-model',
        'ytd-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-compact-video-renderer'
    ].join(',');

    const badgeClassSelectors = [
        '.badge-style-type-members-only',
        '.yt-badge-shape--commerce',
        '.badge-style-type-membership',
        '.yt-badge-shape--membership'
    ].join(',');

    document.querySelectorAll(containers).forEach(item => {
        if (item.querySelector(badgeClassSelectors)) {
            const ancestor = item.closest('ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer') || item;
            ancestor.remove();
        }
    });
}

hideMembersOnlyContent();

const observer = new MutationObserver(hideMembersOnlyContent);
observer.observe(document.body, { childList: true, subtree: true });

browser.runtime.sendMessage({ action: "contentScriptLoaded" });
