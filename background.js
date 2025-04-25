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
    chrome.tabs.create({ url: chrome.runtime.getURL("recording-screen.html") }, (tab) => {
      // Store reference to the recording tab
      activeRecordings[tab.id] = {
        startTime: new Date(),
        status: "recording"
      };
      console.log(`Started recording in tab ${tab.id}`, activeRecordings);
      sendResponse({ success: true, tabId: tab.id });
    });
    return true;
  }

  if (message.action === "recordingDownloaded") {
    const tabId = message.tabId || (sender.tab && sender.tab.id);
    if (tabId && activeRecordings[tabId]) {
      activeRecordings[tabId].status = "completed";
      console.log(`Recording downloaded in tab ${tabId}`, activeRecordings);
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
      chrome.tabs.sendMessage(tabId, { action: "stopRecording" }, (response) => {
        const success = !chrome.runtime.lastError && response && response.success;
        activeRecordings[tabId].status = success ? "stopping" : "error";
        console.log(`Stop response for tab ${tabId}:`, success ? "Success" : chrome.runtime.lastError || "Failed");
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
    delete activeRecordings[tabId];
  }
});
