# Screen Recorder Extension

A Chrome extension that allows you to easily record your screen, browser tab, or application window directly from your browser.

## Features

- Record your entire screen
- Record a specific browser tab
- Record a specific application window
- Customizable recording settings
- Easy-to-use interface
- Download recordings as video files
- Records both video and audio (when permitted)

## Installation

### Load Unpacked Extension (For Development)

1. Clone or download this repository to your local machine
2. Open Google Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click the "Load unpacked" button
5. Browse to the directory where you cloned/downloaded this extension and select it
6. The extension should now appear in your extensions list and in the toolbar

## How to Use

1. Click on the extension icon in your Chrome toolbar
2. Choose what you want to record:
   - Entire screen
   - Application window
   - Browser tab
3. Configure any settings if needed
4. Click "Start Recording"
5. Grant necessary permissions when prompted
6. A recording interface will appear
7. When finished, click "Stop Recording"
8. The recording will be processed and a download will begin automatically

## Permissions Explained

This extension requires the following permissions:

- `activeTab`: To access the current tab for recording
- `desktopCapture`: To capture your screen, windows, or tabs
- `tabs`: To access tab information for recording
- `tabCapture`: To capture specific tabs' audio and video
- `storage`: To save user preferences
- `host_permissions` for `<all_urls>`: To work on all websites

## Privacy

This extension:
- Does not transmit your recordings to any server
- Processes all recordings locally in your browser
- Does not collect any personal information
- Requires permissions only for the core functionality of screen recording

## Troubleshooting

- **Audio not recording**: Make sure you've granted microphone permissions
- **Black screen**: Try selecting a different capture source
- **Extension not working on certain sites**: Some websites with strict security policies may prevent recording