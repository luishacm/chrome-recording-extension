// popup.js

let mediaRecorder;
let recordedChunks = [];
let activeRecordings = {};
let refreshInterval;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startRecording").addEventListener("click", () => {
    startNewRecording();
  });
  
  // Get active recordings and update UI
  updateRecordingsList();
  
  // Refresh the recordings list every 3 seconds
  refreshInterval = setInterval(updateRecordingsList, 3000);
  
  // Ensure we stop refreshing when popup closes
  window.addEventListener('beforeunload', () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
});

function startNewRecording() {
  const startButton = document.getElementById("startRecording");
  startButton.textContent = "Starting...";
  startButton.disabled = true;
  
  chrome.runtime.sendMessage({ action: "startRecording" }, (response) => {
    startButton.disabled = false;
    startButton.textContent = "Start Recording";
    
    if (!response || !response.success) {
      console.error("Failed to open recording tab", response);
      showError("Failed to start recording");
    } else {
      // Refresh the recording list immediately
      updateRecordingsList();
    }
  });
}

function showError(message) {
  const errorDiv = document.getElementById("error") || createErrorElement();
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
  
  // Hide after 5 seconds
  setTimeout(() => {
    errorDiv.style.display = "none";
  }, 5000);
}

function createErrorElement() {
  const container = document.createElement("div");
  container.id = "error";
  container.className = "error-message";
  container.style.display = "none";
  container.style.backgroundColor = "#ffeeee";
  container.style.color = "#cc0000";
  container.style.padding = "8px";
  container.style.marginTop = "10px";
  container.style.borderRadius = "4px";
  
  // Insert after the start recording button
  const startButton = document.getElementById("startRecording");
  startButton.parentNode.insertBefore(container, startButton.nextSibling);
  
  return container;
}

function updateRecordingsList() {
  chrome.runtime.sendMessage({ action: "getActiveRecordings" }, (response) => {
    if (response && response.activeRecordings) {
      activeRecordings = response.activeRecordings;
      renderRecordingList();
    } else {
      console.error("Failed to get active recordings", response);
    }
  });
}

function renderRecordingList() {
  const recordingsList = document.getElementById("recordingsList") || createRecordingsList();
  recordingsList.innerHTML = "";
  
  const recordingCount = Object.keys(activeRecordings).length;
  
  if (recordingCount === 0) {
    recordingsList.innerHTML = "<p>No active recordings</p>";
    return;
  }
  
  for (const tabId in activeRecordings) {
    const recording = activeRecordings[tabId];
    const recordingItem = document.createElement("div");
    recordingItem.className = "recording-item";
    
    const startTime = new Date(recording.startTime);
    const duration = Math.floor((new Date() - startTime) / 1000);
    
    // Determine button state based on status
    let buttonHtml = '';
    if (recording.status === "recording") {
      buttonHtml = `<button class="stop-recording" data-tab-id="${tabId}">Stop</button>`;
    } else if (recording.status === "stopping" || recording.status === "completed") {
      buttonHtml = `<button class="stop-recording" data-tab-id="${tabId}" disabled>Processing...</button>`;
    } else if (recording.status === "error") {
      buttonHtml = `<button class="retry-recording" data-tab-id="${tabId}">Retry</button>`;
    }
    
    recordingItem.innerHTML = `
      <div>Recording #${tabId}</div>
      <div>Status: ${recording.status}</div>
      <div>Duration: ${formatDuration(duration)}</div>
      ${buttonHtml}
    `;
    
    recordingsList.appendChild(recordingItem);
  }
  
  // Add event listeners to buttons
  const stopButtons = document.querySelectorAll(".stop-recording:not([disabled])");
  stopButtons.forEach(button => {
    button.addEventListener("click", (e) => {
      const tabId = parseInt(e.target.getAttribute("data-tab-id"));
      stopRecording(tabId, e.target);
    });
  });
  
  const retryButtons = document.querySelectorAll(".retry-recording");
  retryButtons.forEach(button => {
    button.addEventListener("click", (e) => {
      const tabId = parseInt(e.target.getAttribute("data-tab-id"));
      stopRecording(tabId, e.target); // Try stopping again
    });
  });
}

function createRecordingsList() {
  const container = document.createElement("div");
  container.id = "recordingsList";
  container.className = "recordings-list";
  
  // Insert after the start recording button or error element
  const errorElement = document.getElementById("error");
  const insertAfter = errorElement || document.getElementById("startRecording");
  insertAfter.parentNode.insertBefore(container, insertAfter.nextSibling);
  
  return container;
}

function stopRecording(tabId, buttonElement) {
  if (buttonElement) {
    buttonElement.disabled = true;
    buttonElement.textContent = "Processing...";
  }
  
  chrome.runtime.sendMessage({ 
    action: "stopRecording", 
    tabId: tabId 
  }, (response) => {
    if (response && response.success) {
      // Update status in local list until next refresh
      if (activeRecordings[tabId]) {
        activeRecordings[tabId].status = "stopping";
        renderRecordingList();
      }
    } else {
      console.error("Failed to stop recording:", response?.error);
      if (buttonElement) {
        buttonElement.disabled = false;
        buttonElement.textContent = "Retry";
        buttonElement.className = "retry-recording";
      }
      if (activeRecordings[tabId]) {
        activeRecordings[tabId].status = "error";
        renderRecordingList();
      }
      showError("Failed to stop recording. Please try again.");
    }
  });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function startRecording() {
  try {
    const streamId = await getStreamId();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false, // Ensure audio is disabled
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId
        }
      }
    });

    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      downloadRecording();
    };

    mediaRecorder.start();
    updateUI(true);
  } catch (err) {
    console.error("Error:", err);
    updateUI(false);
  }
}

function getStreamId() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "getStreamId" }, (response) => {
      console.log("response:getStreamId", response);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.streamId) {
        resolve(response.streamId);
      } else {
        reject(new Error(response.error || "Failed to get stream ID"));
      }
    });
  });
}

function downloadRecording() {
  const blob = new Blob(recordedChunks, {
    type: "video/webm"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = "screen-recording.webm";
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
}

function updateUI(isRecording) {
  document.getElementById("startRecording").disabled = isRecording;
}

// Initialize UI
updateUI(false);
