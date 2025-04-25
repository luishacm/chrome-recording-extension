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

### Method 1: Load Unpacked Extension (For Development)

1. Clone or download this repository to your local machine
2. Open Google Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click the "Load unpacked" button
5. Browse to the directory where you cloned/downloaded this extension and select it
6. The extension should now appear in your extensions list and in the toolbar

### Method 2: Install Packed Extension

1. Download the `.crx` file (if available)
2. Open Google Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Drag and drop the `.crx` file onto the extensions page
5. Click "Add extension" when prompted
6. The extension should now appear in your extensions list and in the toolbar

### Method 3: Install from Chrome Web Store (When Published)

1. Visit the Chrome Web Store page for this extension (link to be added when published)
2. Click the "Add to Chrome" button
3. Click "Add extension" when prompted
4. The extension should now appear in your toolbar

## How to Pack the Extension

If you want to pack the extension yourself:

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top-right corner
3. Click "Pack extension" button
4. In the dialog, browse to your extension directory (where manifest.json is located)
5. Click "Pack Extension" button
6. Chrome will generate two files in the parent directory:
   - `.crx` file: The packed extension
   - `.pem` file: Your private key (keep this safe for future updates)

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

## Contributing

Contributions are welcome! Feel free to submit pull requests or open issues to improve the extension.

## License

[Add your license information here] 