# YouTube Hide Membership Only

A Firefox extension that automatically hides members-only content on YouTube, providing a cleaner browsing experience by filtering out videos you cannot access.

<img src="https://i.ibb.co/qFYXXXmV/2025-10-09-004259.png" alt="Demo" width="200" height="auto">

## Features

- **Automatic Blocking**: Hides all members-only videos from YouTube feeds, search results, and channel pages
- **Statistics Tracking**: Displays blocked video count per session and globally
- **Toggle On/Off**: Easy enable/disable button
- **Channel Whitelist**: Add specific channels to whitelist, allowing their members-only content to remain visible

## Installation

### From Firefox Add-ons 
[![Firefox Store](https://blog.mozilla.org/addons/files/2015/11/get-the-addon.png)](https://addons.mozilla.org/firefox/addon/youtube-hide-membership-only/)

## Usage

### Popup Interface
- **Power Button**: Large circular button to enable/disable the extension
- **Statistics**: View blocked videos on current page and total blocked count
- **Advanced Settings**: Expandable section for channel whitelist management

### Whitelisting Channels
1. Click the extension icon
2. Click "Advanced settings" to expand the section
3. Enter a channel handle (e.g., `@channelname`)
4. Click "Add" or press Enter
5. The channel will appear in your whitelist
6. Members-only videos from whitelisted channels will no longer be blocked

### Detection Method
The extension identifies members-only content by searching for YouTube's membership badge classes:
- `.badge-style-type-members-only`
- `.badge-style-type-membership`
- `.yt-badge-shape--membership`


## Privacy

This extension operates entirely locally in your browser. No data is collected, transmitted, or stored externally. All settings and statistics remain on your device.


## License

This project is under the Mozilla Public License Version 2.0.

