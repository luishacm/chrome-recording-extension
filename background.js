// Keep track of active recording tabs
const activeRecordings = {};

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: "popup.html" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getStreamId") {
    chrome.desktopCapture.chooseDesktopMedia(
      ["screen", "window", "tab"],
      sender.tab,
      (streamId, ...others) => {
        if (streamId) {
          sendResponse({ streamId: streamId });
        } else {
          sendResponse({ error: "Failed to get stream ID", streamId, others, test: "Sample" });
        }
      }
    );
    return true;
  }

  if (message.action === "startRecording") {
    // Create URL with recording settings
    let url = chrome.runtime.getURL("recording-screen.html");
    
    // If settings exist, store them
    if (message.settings) {
      const settingsKey = `recording_settings_${Date.now()}`;
      
      // Store settings in chrome.storage.local
      chrome.storage.local.set({ [settingsKey]: message.settings }, () => {
        // After storing, create tab with settings key as parameter
        url += `?settings=${settingsKey}`;
        
        chrome.tabs.create({ url: url }, (tab) => {
          // Store reference to the recording tab and settings
          activeRecordings[tab.id] = {
            startTime: new Date(),
            status: "recording",
            settings: message.settings || {},
            settingsKey: settingsKey
          };
          console.log(`Started recording in tab ${tab.id}`, activeRecordings);
          sendResponse({ success: true, tabId: tab.id });
        });
      });
    } else {
      // No settings, just create the tab
      chrome.tabs.create({ url: url }, (tab) => {
        activeRecordings[tab.id] = {
          startTime: new Date(),
          status: "recording"
        };
        console.log(`Started recording in tab ${tab.id}`, activeRecordings);
        sendResponse({ success: true, tabId: tab.id });
      });
    }
    return true;
  }

  if (message.action === "getRecordingSettings") {
    const tabId = sender.tab.id;
    
    // If we have settings stored for this tab
    if (tabId && activeRecordings[tabId] && activeRecordings[tabId].settings) {
      sendResponse({ settings: activeRecordings[tabId].settings });
      return true;
    }
    
    // If we have a settings key from URL parameter
    if (message.settingsKey) {
      chrome.storage.local.get([message.settingsKey], (result) => {
        if (result && result[message.settingsKey]) {
          sendResponse({ settings: result[message.settingsKey] });
        } else {
          // Default settings if nothing found
          sendResponse({ 
            settings: {
              resolution: { width: 1920, height: 1080 },
              bitrate: 15000000,
              frameRate: 24
            } 
          });
        }
      });
      return true;
    }
    
    // Default settings if nothing found
    sendResponse({ 
      settings: {
        resolution: { width: 1920, height: 1080 },
        bitrate: 15000000,
        frameRate: 24
      } 
    });
    return true;
  }

  if (message.action === "recordingDownloaded") {
    const tabId = message.tabId || (sender.tab && sender.tab.id);
    if (tabId && activeRecordings[tabId]) {
      console.log(`Recording completed in tab ${tabId}, stream stopped: ${message.streamStopped}`, activeRecordings);
      
      // Mark as completed
      activeRecordings[tabId].status = "completed";
      activeRecordings[tabId].streamStopped = message.streamStopped || false;
      
      // Clean up storage if we have a settings key
      if (activeRecordings[tabId].settingsKey) {
        chrome.storage.local.remove(activeRecordings[tabId].settingsKey);
      }
      
      // Set a timeout to remove this recording from tracking after some time
      setTimeout(() => {
        if (activeRecordings[tabId]) {
          console.log(`Removing completed recording ${tabId} from tracking`);
          delete activeRecordings[tabId];
        }
      }, 5000); // Clean up after 5 seconds
    }
    return true;
  }

  if (message.action === "getActiveRecordings") {
    console.log("Sending active recordings:", activeRecordings);
    sendResponse({ activeRecordings });
    return true;
  }

  if (message.action === "stopRecording") {
    const tabId = message.tabId;
    if (tabId && activeRecordings[tabId]) {
      console.log(`Stopping recording in tab ${tabId}`);
      
      // Send stop command to the tab
      chrome.tabs.sendMessage(tabId, { 
        action: "stopRecording",
        forceStop: true
      }, (response) => {
        const success = !chrome.runtime.lastError && response && response.success;
        activeRecordings[tabId].status = success ? "stopping" : "error";
        console.log(`Stop response for tab ${tabId}:`, success ? "Success" : chrome.runtime.lastError || "Failed");
        
        // If there was an error or no response, force close the tab after a timeout
        if (!success) {
          console.log(`No response from tab ${tabId}, forcing close after timeout`);
          setTimeout(() => {
            try {
              chrome.tabs.get(tabId, (tab) => {
                if (tab && !chrome.runtime.lastError) {
                  chrome.tabs.remove(tabId);
                }
              });
            } catch (e) {
              console.error(`Error force-closing tab ${tabId}:`, e);
            }
          }, 3000);
        }
        
        sendResponse({ success: success });
      });
      return true;
    } else {
      console.error(`Recording tab ${tabId} not found in active recordings`, activeRecordings);
      sendResponse({ success: false, error: "Recording not found" });
      return true;
    }
  }
});

// Clean up when a recording tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeRecordings[tabId]) {
    console.log(`Tab ${tabId} closed, removing from active recordings`);
    
    // Clean up storage if we have a settings key
    if (activeRecordings[tabId].settingsKey) {
      chrome.storage.local.remove(activeRecordings[tabId].settingsKey);
    }
    
    delete activeRecordings[tabId];
  }
});
