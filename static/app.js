const recordBtn = document.getElementById("recordBtn");
const statusText = document.getElementById("statusText");
const timerEl = document.getElementById("timer");
const resultBox = document.getElementById("resultBox");
const langBadge = document.getElementById("langBadge");
const historyList = document.getElementById("historyList");
const editModal = document.getElementById("editModal");

let mediaRecorder, audioChunks = [], timerInterval, seconds = 0, editingId = null;
let recognition = null, liveTranscript = "", isRecording = false;
const MIN_SECONDS = 3;

// web speech api setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSupported = !!SpeechRecognition;

if (!speechSupported) {
  statusText.textContent = "live preview not supported in this browser. use chrome or edge.";
}

function setupRecognition() {
  if (!speechSupported) return;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "";

  recognition.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript + " ";
      } else {
        interim += transcript;
      }
    }
    liveTranscript += final;
    resultBox.innerHTML =
      `<span style="color:#1e3a8a">${escHtml(liveTranscript)}</span>` +
      `<span style="color:#93c5fd">${escHtml(interim)}</span>`;
    resultBox.style.display = "block";
  };

  recognition.onerror = (e) => {
    if (e.error !== "no-speech" && e.error !== "aborted") {
      console.warn("speech recognition error:", e.error);
    }
  };

  // auto-restart if browser cuts off after 60s
  recognition.onend = () => {
    if (isRecording) recognition.start();
  };
}

// recording controls
recordBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    liveTranscript = "";
    isRecording = true;

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();

    setupRecognition();
    if (speechSupported) recognition.start();

    recordBtn.classList.add("recording");
    recordBtn.textContent = "stop";
    statusText.textContent = "listening... speak now. click stop when done.";
    resultBox.style.display = "none";
    langBadge.style.display = "none";
    seconds = 0;
    timerEl.textContent = "0:00";
    timerInterval = setInterval(() => {
      seconds++;
      timerEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }, 1000);
  } catch {
    statusText.textContent = "microphone access denied.";
    isRecording = false;
  }
}

function stopRecording() {
  if (seconds < MIN_SECONDS) {
    statusText.textContent = "please speak for at least 2 seconds.";
    return;
  }
  isRecording = false;
  if (recognition) recognition.stop();
  if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
}

async function handleStop() {
  clearInterval(timerInterval);
  timerEl.textContent = "";
  recordBtn.classList.remove("recording");
  recordBtn.textContent = "🎤";
  recordBtn.disabled = true;
  statusText.innerHTML = '<span class="spinner"></span>processing with gemini...';

  const blob = new Blob(audioChunks, { type: "audio/webm" });
  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");

  try {
    const res = await fetch("/api/transcribe", { method: "POST", body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    resultBox.textContent = data.text;
    resultBox.style.display = "block";
    langBadge.textContent = `language: ${data.language}`;
    langBadge.style.display = "inline-block";
    statusText.textContent = "transcription complete.";
    loadHistory();
  } catch (err) {
    if (liveTranscript.trim()) {
      statusText.textContent = "gemini processing failed. showing live transcript.";
      resultBox.textContent = liveTranscript.trim();
      resultBox.style.display = "block";
    } else {
      statusText.textContent = `error: ${err.message}`;
    }
  } finally {
    recordBtn.disabled = false;
  }
}

// history
async function loadHistory() {
  const res = await fetch("/api/transcriptions");
  const data = await res.json();
  if (!data.length) {
    historyList.innerHTML = '<div id="emptyMsg">no transcriptions yet.</div>';
    return;
  }
  historyList.innerHTML = data.map(r => `
    <div class="record-item" id="item-${r.id}">
      <div class="record-item-header">
        <div>
          <div class="record-title">${escHtml(r.title)}</div>
          <div class="record-meta">${r.created_at} | lang: ${r.language}</div>
        </div>
        <div class="record-actions">
          <button class="btn-edit" onclick="openEdit(${r.id}, '${escAttr(r.title)}', '${escAttr(r.text)}')">edit</button>
          <button class="btn-delete" onclick="deleteRecord(${r.id})">delete</button>
        </div>
      </div>
      <div class="record-text">${escHtml(r.text)}</div>
    </div>
  `).join("");
}

document.getElementById("refreshBtn").addEventListener("click", loadHistory);

// delete
async function deleteRecord(id) {
  if (!confirm("delete this transcription?")) return;
  await fetch(`/api/transcriptions/${id}`, { method: "DELETE" });
  loadHistory();
}

// edit modal
function openEdit(id, title, text) {
  editingId = id;
  document.getElementById("editTitle").value = title;
  document.getElementById("editText").value = text;
  editModal.classList.add("active");
}

document.getElementById("cancelEdit").addEventListener("click", () => editModal.classList.remove("active"));

document.getElementById("saveEdit").addEventListener("click", async () => {
  const title = document.getElementById("editTitle").value.trim();
  const text = document.getElementById("editText").value.trim();
  await fetch(`/api/transcriptions/${editingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, text })
  });
  editModal.classList.remove("active");
  loadHistory();
});

// helpers
function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s) {
  return s.replace(/'/g, "\\'").replace(/\n/g, " ");
}

loadHistory();
