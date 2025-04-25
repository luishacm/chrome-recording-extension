let mediaRecorder;
let recordedChunks = [];
let tabId;
let isProcessingStop = false;

window.onload = async () => {
  // Get the tab ID
  chrome.tabs.getCurrent((tab) => {
    tabId = tab.id;
  });
  
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

    // Capture only the screen video without any audio
    const desktopStream = await navigator.mediaDevices
      .getUserMedia({
        audio: false, // No audio
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: streamId
          }
        }
      });

    // Use only video tracks
    const videoStream = new MediaStream([
      ...desktopStream.getVideoTracks()
    ]);

    mediaRecorder = new MediaRecorder(videoStream);

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
    a.download = `screen-recording-${Date.now()}.webm`;
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