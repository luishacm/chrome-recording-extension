let mediaRecorder;
let recordedChunks = [];
let tabId;
let isProcessingStop = false;
let recordingSettings = {
  resolution: { width: 1920, height: 1080 },
  bitrate: 15000000,
  frameRate: 24
};

// Track the streams for proper cleanup
let activeStreams = [];

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
      console.log("Received stop command from popup", message);
      
      // If this is a force stop, handle it more aggressively
      if (message.forceStop) {
        console.log("Force stop requested, immediately stopping all media");
        
        // Stop all tracks immediately
        stopAllMediaTracks();
        
        // Force cleanup
        cleanupAndClose();
        
        // Respond immediately
        if (sendResponse) {
          sendResponse({ success: true, forceStop: true });
        }
        
        return true;
      }
      
      // Normal stop handling
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
  
  // Update recording info to show we're stopping
  const infoElement = document.getElementById('recording-info');
  if (infoElement) {
    infoElement.innerHTML = '<strong>Stopping recording and preparing download...</strong>';
  }
  
  // Stop all tracks to ensure screen sharing is completely stopped
  stopAllMediaTracks();
  
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    // The ondataavailable and onstop events will handle the rest
  } else {
    // If already stopped, force download
    downloadRecording();
  }
}

// New function to stop all media tracks
function stopAllMediaTracks() {
  console.log("Stopping all media tracks...");
  activeStreams.forEach(stream => {
    if (stream && stream.getTracks) {
      stream.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          console.log(`Stopping track: ${track.kind}`);
          track.stop();
        }
      });
    }
  });
  // Clear the streams array
  activeStreams = [];
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
    
    // Store the stream for later cleanup
    activeStreams.push(desktopStream);

    // Use only video tracks
    const videoStream = new MediaStream([
      ...desktopStream.getVideoTracks()
    ]);
    
    // Store this stream too
    activeStreams.push(videoStream);

    // Set up video preview
    const videoPreview = document.getElementById('recording-preview');
    videoPreview.srcObject = videoStream;
    videoPreview.style.display = 'block';
    
    // Get information about what's being recorded
    const videoTrack = videoStream.getVideoTracks()[0];
    let recordingSource = "Unknown";
    let recordingDetails = {};
    
    if (videoTrack) {
      recordingSource = videoTrack.label || "Screen";
      recordingDetails = videoTrack.getSettings();
      
      // Apply constraints to ensure the desired resolution and frame rate
      await videoTrack.applyConstraints({
        width: { ideal: width, exact: width },
        height: { ideal: height, exact: height },
        frameRate: { ideal: frameRate, exact: frameRate }
      });
    }
    
    // Update recording information in the UI
    updateRecordingInfo(recordingSource, recordingDetails);

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
      console.log("MediaRecorder stopped, preparing to download");
      
      // Update status
      updateStatus("Recording stopped, preparing download...");
      
      // Update preview UI
      const videoPreview = document.getElementById('recording-preview');
      if (videoPreview && videoPreview.srcObject) {
        // Keep the last frame visible but indicate recording stopped
        const infoElement = document.getElementById('recording-info');
        if (infoElement) {
          infoElement.innerHTML += '<br><strong>Recording stopped, preparing download...</strong>';
        }
      }
      
      // Proceed with download
      downloadRecording();
    };

    mediaRecorder.start(1000); // Collect chunks every second
    updateStatus("Recording...");
  } catch (error) {
    console.error("Error starting recording:", error);
    updateStatus(`Recording error: ${error.message}`);
  }
}

// New function to update recording information in the UI
function updateRecordingInfo(source, details) {
  const infoElement = document.getElementById('recording-info');
  if (!infoElement) return;
  
  // Format the recording information
  let formattedDetails = '';
  if (details) {
    const { width, height, frameRate, deviceId } = details;
    formattedDetails = `
      <strong>Source:</strong> ${source}<br>
      <strong>Resolution:</strong> ${width || '-'} × ${height || '-'}<br>
      <strong>Frame Rate:</strong> ${frameRate || recordingSettings.frameRate} fps<br>
      <strong>Bitrate:</strong> ${(recordingSettings.bitrate / 1000000).toFixed(1)} Mbps<br>
    `;
    
    // Try to determine what type of content is being recorded
    if (source.includes('screen')) {
      formattedDetails += '<strong>Content Type:</strong> Entire Screen<br>';
    } else if (source.includes('window')) {
      formattedDetails += '<strong>Content Type:</strong> Window<br>';
    } else if (source.includes('tab')) {
      formattedDetails += '<strong>Content Type:</strong> Browser Tab<br>';
    }
  }
  
  infoElement.innerHTML = formattedDetails || 'Recording in progress...';
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
    
    // Even with no data, notify background and close the tab
    cleanupAndClose();
    return;
  }

  try {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    
    // Get codec info for filename
    let codecName = "webm";
    if (mediaRecorder && mediaRecorder.mimeType) {
      if (mediaRecorder.mimeType.includes('vp9')) {
        codecName = "vp9";
      } else if (mediaRecorder.mimeType.includes('vp8')) {
        codecName = "vp8";
      }
    }
    
    // Add resolution and bitrate to filename
    const { width, height } = recordingSettings.resolution;
    const bitrateInMbps = (recordingSettings.bitrate / 1000000).toFixed(1);
    a.download = `screen-recording-${width}x${height}-${bitrateInMbps}Mbps-${codecName}-${Date.now()}.webm`;
    
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    
    updateStatus("Recording downloaded!");
    
    // Clear memory
    recordedChunks = [];
    
    // Cleanup and close the tab
    cleanupAndClose();
  } catch (err) {
    console.error("Download error:", err);
    updateStatus(`Error downloading: ${err.message}`);
    
    // Even on error, try to clean up and close
    cleanupAndClose();
  }
}

// New function to handle cleanup and tab closing
function cleanupAndClose() {
  console.log("Cleaning up and preparing to close tab");
  
  // Stop all tracks to make sure screen sharing is disabled
  stopAllMediaTracks();
  
  // Clear video preview
  const videoPreview = document.getElementById('recording-preview');
  if (videoPreview && videoPreview.srcObject) {
    videoPreview.srcObject = null;
    videoPreview.style.display = 'none';
  }
  
  // Update recording info
  const infoElement = document.getElementById('recording-info');
  if (infoElement) {
    infoElement.innerHTML = 'Recording stopped';
  }
  
  // Notify the background script that recording has been downloaded
  if (tabId) {
    chrome.runtime.sendMessage({
      action: "recordingDownloaded",
      tabId: tabId,
      streamStopped: true
    }, () => {
      // Delay tab close to allow the browser to complete the download
      setTimeout(closeCurrentTab, 3000);
    });
  } else {
    // Delay tab close to allow the browser to complete the download
    setTimeout(closeCurrentTab, 3000);
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