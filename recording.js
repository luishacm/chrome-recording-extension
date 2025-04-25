let mediaRecorder;
let recordedChunks = [];
let tabId;
let isProcessingStop = false;
let recordingSettings = {
  resolution: { width: 1920, height: 1080 },
  bitrate: 15000000,
  frameRate: 24
};

window.onload = async () => {
  // Get the tab ID
  chrome.tabs.getCurrent((tab) => {
    tabId = tab.id;
  });
  
  // Get recording settings from background script
  await getRecordingSettings();
  
  // Display settings on the UI
  updateSettingsDisplay();
  
  // Removed microphone access
  startRecording();

  document.getElementById("stopRecording").addEventListener("click", () => {
    stopAndDownload();
  });
  
  // Listen for stop commands from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "stopRecording") {
      console.log("Received stop command from popup");
      stopAndDownload();
      // Send acknowledgment back
      if (sendResponse) {
        sendResponse({ success: true });
      }
      return true;
    }
  });
};

// Get recording settings from the background script
async function getRecordingSettings() {
  try {
    // Try to get settings from URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const settingsKey = urlParams.get('settings');
    
    if (settingsKey) {
      // Get settings from chrome.storage.local
      return new Promise((resolve) => {
        chrome.storage.local.get([settingsKey], (result) => {
          if (result && result[settingsKey]) {
            recordingSettings = result[settingsKey];
            console.log("Retrieved settings from storage:", recordingSettings);
          }
          resolve();
        });
      });
    }
    
    // Fall back to requesting from background script
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        action: "getRecordingSettings",
        settingsKey: settingsKey // Pass the settings key if available
      }, (response) => {
        if (response && response.settings) {
          recordingSettings = response.settings;
          console.log("Retrieved settings from background:", recordingSettings);
        }
        resolve();
      });
    });
  } catch (err) {
    console.error("Error getting recording settings:", err);
    // Continue with default settings
  }
}

// Update UI to show current settings
function updateSettingsDisplay() {
  const statusElement = document.getElementById("status");
  if (statusElement) {
    const { width, height } = recordingSettings.resolution;
    const bitrateInMbps = (recordingSettings.bitrate / 1000000).toFixed(1);
    
    // Create a variable to hold codec info, will be updated when recording starts
    window.codecInfo = "VP9 (preferred)";
    
    const settingsInfo = document.createElement("div");
    settingsInfo.id = "settings-info";
    settingsInfo.innerHTML = `
      <p>Settings: ${width}x${height} @ ${recordingSettings.frameRate}fps, ${bitrateInMbps} Mbps</p>
      <p>Codec: <span id="codec-info">${window.codecInfo}</span></p>
    `;
    statusElement.parentNode.insertBefore(settingsInfo, statusElement);
  }
}

function stopAndDownload() {
  if (isProcessingStop) return;
  
  isProcessingStop = true;
  updateStatus("Stopping recording...");
  
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    // The ondataavailable and onstop events will handle the rest
  } else {
    // If already stopped, force download
    downloadRecording();
  }
}

async function startRecording() {
  try {
    const streamId = await getStreamId();

    // Extract settings
    const { width, height } = recordingSettings.resolution;
    const frameRate = recordingSettings.frameRate;

    // Capture the screen with custom constraints
    const desktopStream = await navigator.mediaDevices
      .getUserMedia({
        audio: false, // No audio
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: streamId,
            maxWidth: width,
            maxHeight: height,
            minWidth: width,
            minHeight: height,
            frameRate: frameRate
          }
        }
      });

    // Use only video tracks
    const videoStream = new MediaStream([
      ...desktopStream.getVideoTracks()
    ]);

    // Set up video track with specific constraints
    const videoTrack = videoStream.getVideoTracks()[0];
    if (videoTrack) {
      // Apply constraints to ensure the desired resolution and frame rate
      await videoTrack.applyConstraints({
        width: { ideal: width, exact: width },
        height: { ideal: height, exact: height },
        frameRate: { ideal: frameRate, exact: frameRate }
      });
    }

    // Create media recorder with specified bitrate
    const options = {
      mimeType: 'video/webm;codecs=vp9', // Using VP9 for better quality
      videoBitsPerSecond: recordingSettings.bitrate
    };

    // Check if the browser supports VP9
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.warn('VP9 not supported, trying VP8 codec');
      options.mimeType = 'video/webm;codecs=vp8';
      
      // If VP8 is also not supported, fall back to default codec
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('VP8 also not supported, falling back to default codec');
        options.mimeType = 'video/webm';
      }
    }

    mediaRecorder = new MediaRecorder(videoStream, options);
    
    console.log(`Recording with codec: ${options.mimeType}, bitrate: ${options.videoBitsPerSecond} bps`);
    
    // Update codec info in the UI
    let codecDisplay = "Unknown";
    if (options.mimeType.includes('vp9')) {
      codecDisplay = "VP9 (high quality)";
    } else if (options.mimeType.includes('vp8')) {
      codecDisplay = "VP8 (standard)";
    } else {
      codecDisplay = "Default WebM";
    }
    
    const codecInfoElement = document.getElementById("codec-info");
    if (codecInfoElement) {
      codecInfoElement.textContent = codecDisplay;
    }
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      console.log("MediaRecorder stopped, downloading recording...");
      downloadRecording();
    };

    mediaRecorder.start(1000); // Collect chunks every second
    updateStatus("Recording...");
  } catch (err) {
    console.error("Error: ", err);
    updateStatus(`Error: ${err.message}`);
  }
}

function getStreamId() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "getStreamId" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.streamId) {
        reject(new Error(response?.error || chrome.runtime.lastError?.message || "Failed to get stream ID"));
      } else {
        resolve(response.streamId);
      }
    });
  });
}

function downloadRecording() {
  if (recordedChunks.length === 0) {
    console.error("No recorded chunks to download");
    updateStatus("Error: No data to download");
    return;
  }

  try {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    
    // Add resolution and bitrate to filename
    const { width, height } = recordingSettings.resolution;
    const bitrateInMbps = (recordingSettings.bitrate / 1000000).toFixed(1);
    
    // Get codec info for filename
    let codecName = "webm";
    if (mediaRecorder && mediaRecorder.mimeType) {
      if (mediaRecorder.mimeType.includes('vp9')) {
        codecName = "vp9";
      } else if (mediaRecorder.mimeType.includes('vp8')) {
        codecName = "vp8";
      }
    }
    
    a.download = `screen-recording-${width}x${height}-${bitrateInMbps}Mbps-${codecName}-${Date.now()}.webm`;
    
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    
    updateStatus("Recording downloaded!");
    
    // Notify background script that download completed
    chrome.runtime.sendMessage({ 
      action: "recordingDownloaded", 
      tabId: tabId 
    });

    // Close the tab after initiating the download
    setTimeout(() => closeCurrentTab(), 2000);
  } catch (err) {
    console.error("Download error:", err);
    updateStatus(`Error downloading: ${err.message}`);
  }
}

function closeCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.remove(tabs[0].id);
  });
}

function updateStatus(status) {
  console.log("Status update:", status);
  document.getElementById("status").innerText = status;
}