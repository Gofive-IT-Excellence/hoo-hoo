const OCR_ENDPOINT =
"https://ruined-gender-untimely.ngrok-free.dev/webhook/thai-ocr";

const TEXT_ENDPOINT =
"https://ruined-gender-untimely.ngrok-free.dev/webhook/text-proofreader";

const HOOHOO_CHAT_ENDPOINT =
"https://ruined-gender-untimely.ngrok-free.dev/webhook/hoohoo-chat";

const OCR_COMPARE_ENDPOINT =
"https://ruined-gender-untimely.ngrok-free.dev/webhook/thai-ocr-compare";

const modeSelect = document.getElementById("mode");
const boxB = document.getElementById("boxB");
const fileAInput = document.getElementById("fileA");
const fileBInput = document.getElementById("fileB");
const previewA = document.getElementById("previewA");
const previewB = document.getElementById("previewB");
const fileALabel = document.getElementById("fileALabel");
const fileBLabel = document.getElementById("fileBLabel");
const resultBox = document.getElementById("result");
const statusText = document.getElementById("statusText");
const uploadGrid = document.getElementById("uploadGrid");
const loginForm = document.getElementById("loginForm");
const loginSection = document.getElementById("login");
const loginPanel = document.getElementById("loginPanel");
const loginToggleButton = document.getElementById("loginToggleButton");
const landingStartButton = document.getElementById("landingStartButton");
const landingTrialButton = document.getElementById("landingTrialButton");
const owlSound = document.getElementById("owlSound");
const logoutButton = document.getElementById("logoutButton");
const appShell = document.querySelector(".app-shell");

loginToggleButton.addEventListener("click", openLoginModal);

loginSection.addEventListener("click", (event) => {
  if (!loginSection.classList.contains("show-login")) return;
  if (event.target === loginToggleButton || loginPanel.contains(event.target)) return;
  closeLoginModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && loginSection.classList.contains("show-login")) {
    closeLoginModal();
  }
});

landingStartButton.addEventListener("click", enterWorkspace);
landingTrialButton.addEventListener("click", enterWorkspace);

if (owlSound) {
  let owlSoundTimer;

  owlSound.volume = 0.72;

  document.addEventListener("click", async (event) => {
    const button = event.target.closest(".owl-sound-button");
    if (!button) return;

    clearTimeout(owlSoundTimer);
    owlSound.pause();
    owlSound.currentTime = 0;
    document.querySelectorAll(".owl-sound-button").forEach((item) => {
      item.classList.remove("is-playing");
    });
    button.classList.add("is-playing");

    try {
      await owlSound.play();
    } catch (error) {
      button.classList.remove("is-playing");
      console.warn("Cannot play owl sound:", error);
      return;
    }

    owlSoundTimer = setTimeout(() => {
      button.classList.remove("is-playing");
    }, 1200);
  });

  owlSound.addEventListener("ended", () => {
    clearTimeout(owlSoundTimer);
    document.querySelectorAll(".owl-sound-button").forEach((button) => {
      button.classList.remove("is-playing");
    });
  });
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  enterWorkspace();
});

logoutButton.addEventListener("click", () => {
  setLoggedIn(false);
  window.location.hash = "login";
});

modeSelect.addEventListener("change", updateMode);
fileAInput.addEventListener("change", (event) => preview(event, previewA, fileALabel, "ไฟล์ A"));
fileBInput.addEventListener("change", (event) => preview(event, previewB, fileBLabel, "ไฟล์ B"));

document.querySelectorAll(".upload-box").forEach((box) => {
  ["dragenter", "dragover"].forEach((eventName) => {
    box.addEventListener(eventName, (event) => {
      event.preventDefault();
      box.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    box.addEventListener(eventName, (event) => {
      event.preventDefault();
      box.classList.remove("is-dragging");
    });
  });
});

function updateMode() {
  const mode = modeSelect.value;

  if (mode === "single") {
    boxB.classList.add("is-hidden");
    boxB.style.display = "none";

    fileALabel.textContent = "เลือกภาพหลักสำหรับ OCR";
    statusText.textContent = "โหมด OCR + ตรวจคำผิด";

    fileAInput.accept = "image/*,.pdf";
  }

  else if (mode === "compare") {
    boxB.classList.remove("is-hidden");
    boxB.style.display = "";

    fileALabel.textContent = "เลือกไฟล์ A";
    fileBLabel.textContent = "เลือกไฟล์ B";

    statusText.textContent = "โหมดเทียบ 2 ไฟล์";

    fileAInput.accept = "image/*,.pdf";
    fileBInput.accept = "image/*,.pdf";
  }

  else if (mode === "text-proofreader") {
    boxB.classList.add("is-hidden");
    boxB.style.display = "none";

    fileALabel.textContent = "เลือกไฟล์ TXT, DOCX หรือ PDF";
    statusText.textContent = "โหมดตรวจ TXT / DOCX / PDF";

    fileAInput.accept = ".txt,.doc,.docx,.pdf,application/pdf";
    fileBInput.value = "";
    previewB.removeAttribute("src");
    previewB.style.display = "none";
  }

  uploadGrid.classList.toggle("is-compare", mode === "compare");
}

function setLoggedIn(isLoggedIn) {
  document.body.classList.toggle("logged-in", isLoggedIn);
  document.body.classList.toggle("logged-out", !isLoggedIn);
  appShell.setAttribute("aria-hidden", String(!isLoggedIn));
  closeLoginModal();

  if (isLoggedIn) {
    sessionStorage.setItem("hooHooLoggedIn", "true");
  } else {
    sessionStorage.removeItem("hooHooLoggedIn");
  }
}

function openLoginModal() {
  loginSection.classList.add("show-login");
  document.getElementById("loginEmail")?.focus();
}

function closeLoginModal() {
  loginSection.classList.remove("show-login");
}

function enterWorkspace() {
  sessionStorage.setItem("hooHooLoggedIn", "true");
  setLoggedIn(true);
  window.location.hash = "workspace";
  setTimeout(() => {
    document.getElementById("workspace")?.scrollIntoView({ block: "start" });
  }, 50);
}

function preview(event, imageElement, labelElement, label) {
  const file = event.target.files[0];
  if (!file) return;

  labelElement.textContent = `${label}: ${file.name}`;

  if (!file.type.startsWith("image/")) {
    imageElement.removeAttribute("src");
    imageElement.style.display = "none";
    return;
  }

  const reader = new FileReader();
  reader.onload = (readerEvent) => {
    imageElement.src = readerEvent.target.result;
    imageElement.style.display = "block";
  };
  reader.readAsDataURL(file);
}

function isDocumentFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();

  return (
    name.endsWith(".pdf") ||
    name.endsWith(".txt") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    type.includes("pdf") ||
    type.includes("text/plain") ||
    type.includes("wordprocessingml") ||
    type.includes("msword")
  );
}

async function sendToN8N() {
  const fileA = fileAInput.files[0];
  const fileB = fileBInput.files[0];
  const mode = modeSelect.value;
  const effectiveMode =
    mode !== "compare" && isDocumentFile(fileA)
      ? "text-proofreader"
      : mode;

  if (!fileA) {
    resultBox.innerHTML = "กรุณาเลือกไฟล์ A ก่อนส่งตรวจ";
    statusText.textContent = "ยังไม่ได้เลือกไฟล์ A";
    return;
  }

  if (mode === "compare" && !fileB) {
    resultBox.innerHTML = "กรุณาเลือกไฟล์ B สำหรับโหมดเทียบข้อความ";
    statusText.textContent = "ยังไม่ได้เลือกไฟล์ B";
    return;
  }

  const form = new FormData();
  form.append("mode", effectiveMode);
  form.append("fileA", fileA);

  if (mode === "compare") {
    form.append("fileB", fileB);
  }

  showCheckingState();
  resultBox.classList.remove("has-result");
  statusText.textContent = "กำลังประมวลผล";

  try {
    const endpoint =
     effectiveMode === "compare"
       ? OCR_COMPARE_ENDPOINT
       : effectiveMode === "text-proofreader"
         ? TEXT_ENDPOINT
         : OCR_ENDPOINT;

const response = await fetch(endpoint, {
      method: "POST",
      body: form,
    });

    const responseText = await response.text();
    let json;

    try {
      json = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      throw new Error(
        responseText
          ? `n8n ตอบกลับไม่ใช่ JSON: ${responseText.slice(0, 500)}`
          : "n8n ตอบกลับว่างเปล่า"
      );
    }

    console.log("N8N RESPONSE:", json);

    const html = Array.isArray(json) ? json[0]?.html : json?.html;

    if (html) {
      resultBox.classList.remove("is-loading");
      renderResultHtml(html);
      statusText.textContent = "ตรวจเสร็จแล้ว";
    } else {
      resultBox.classList.remove("is-loading");
      resultBox.innerHTML = `
ไม่พบผลลัพธ์ที่แสดงผลได้

${JSON.stringify(json, null, 2)}
      `;
      statusText.textContent = "ไม่พบผลลัพธ์";
    }
  } catch (error) {
    resultBox.classList.remove("is-loading");
    resultBox.innerHTML = `ERROR:\n${error}`;
    statusText.textContent = "ประมวลผลไม่สำเร็จ";
  }
}

function showCheckingState() {
  resultBox.classList.add("is-loading");
  resultBox.innerHTML = `
    <div class="checking-state" aria-live="polite">
      <div class="checking-owl">
        <img src="assets/hooq-logo-animation-alpha.png" alt="" />
      </div>
      <button class="owl-sound-button owl-sound-button-checking" type="button" aria-label="เล่นเสียงฮูกฮูก" title="เล่นเสียงฮูกฮูก">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="M15 9.5a4 4 0 0 1 0 5" />
          <path d="M18 7a8 8 0 0 1 0 10" />
        </svg>
        <span>ฟังเสียงฮูกฮูก</span>
      </button>
      <div class="checking-copy">
        <strong>ฮูก ฮูก กำลังตรวจเอกสาร</strong>
        <span>กำลังอ่านภาพ ค้นหาคำผิด และเตรียมคำแนะนำ...</span>
      </div>
      <div class="checking-dots" aria-hidden="true">
        <i></i><i></i><i></i>
      </div>
    </div>
  `;
}

function renderResultHtml(html) {
  resultBox.innerHTML = `
    <div class="n8n-frame-wrap">
      <iframe class="n8n-result-frame" title="ผลลัพธ์การตรวจ" scrolling="no"></iframe>
    </div>
  `;

  resultBox.classList.add("has-result");
  const frame = resultBox.querySelector(".n8n-result-frame");
  frame.srcdoc = buildResultFrameHtml(html);
  frame.addEventListener("load", () => {
    setupResultCoordinates(frame);
    resizeResultFrame(frame);
    requestAnimationFrame(() => resizeResultFrame(frame));
    setTimeout(() => resizeResultFrame(frame), 250);
    setTimeout(() => resizeResultFrame(frame), 800);
  });
}

function buildResultFrameHtml(html) {
  const frameStyle = `
    <style>
      html,
      body {
        width: 100%;
        margin: 0;
        padding: 0;
        overflow: visible;
        background: transparent;
      }

      body {
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        align-items: stretch !important;
        box-sizing: border-box;
        padding: 0 !important;
      }

      .coordinate-toolbar {
        position: sticky;
        top: 0;
        z-index: 100;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 14px;
        width: min(100%, 1080px);
        box-sizing: border-box;
        margin: 0 auto 10px;
        padding: 8px 12px;
        border: 1px solid #d9dee3;
        border-radius: 10px;
        color: #2f3a4a;
        background: rgba(255, 255, 255, 0.96);
        font: 13px/1.4 Arial, Tahoma, sans-serif;
        text-align: left;
      }

      .coordinate-toolbar strong {
        color: #008f87;
      }

      .coordinate-toolbar label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        cursor: pointer;
      }

      .result-wrap {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        justify-content: flex-start !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 auto !important;
        box-sizing: border-box !important;
        overflow: visible !important;
        text-align: center !important;
      }

      .wrapper {
        position: relative !important;
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        line-height: 0 !important;
        overflow: visible !important;
        text-align: left !important;
        transform-origin: top left !important;
      }

      .wrapper img {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        object-fit: contain !important;
      }

      .coordinate-grid {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: none;
        box-sizing: border-box;
        border-top: 2px solid rgba(0, 143, 135, 0.8);
        border-left: 2px solid rgba(0, 143, 135, 0.8);
        background-image:
          repeating-linear-gradient(
            to right,
            rgba(0, 143, 135, 0.28) 0,
            rgba(0, 143, 135, 0.28) 1px,
            transparent 1px,
            transparent 100px
          ),
          repeating-linear-gradient(
            to bottom,
            rgba(0, 143, 135, 0.28) 0,
            rgba(0, 143, 135, 0.28) 1px,
            transparent 1px,
            transparent 100px
          );
        pointer-events: none;
      }

      .coordinate-grid.is-visible {
        display: block;
      }

      .ocr-fix-line {
        position: absolute !important;
        z-index: 2 !important;
        pointer-events: none !important;
      }

      .ocr-fix-text {
        position: absolute !important;
        z-index: 3 !important;
        pointer-events: none !important;
      }

      .correction-panel,
      .n8n-correction-panel {
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 16px auto 0 !important;
        opacity: 1 !important;
        visibility: visible !important;
        transform: none !important;
        animation: none !important;
        transition: none !important;
      }
    </style>
  `;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${frameStyle}</head>`);
  }

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    ${frameStyle}
  </head>
  <body>${html}</body>
</html>`;
}

function setupResultCoordinates(frame) {
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  if (!frameDocument || !frameWindow) return;

  const wrapper = frameDocument.querySelector(".wrapper");
  const image = wrapper?.querySelector("img");
  if (!wrapper || !image) return;

  const initialize = () => {
    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    if (!imageWidth || !imageHeight) return;

    wrapper.dataset.imageWidth = String(imageWidth);
    wrapper.dataset.imageHeight = String(imageHeight);
    wrapper.style.setProperty("width", "100%", "important");
    wrapper.style.setProperty("max-width", `${imageWidth}px`, "important");
    wrapper.style.setProperty("aspect-ratio", `${imageWidth} / ${imageHeight}`, "important");
    image.style.setProperty("width", "100%", "important");
    image.style.setProperty("height", "100%", "important");
    image.style.setProperty("max-width", "100%", "important");
    image.style.setProperty("object-fit", "contain", "important");

    let grid = wrapper.querySelector(".coordinate-grid");
    if (!grid) {
      grid = frameDocument.createElement("div");
      grid.className = "coordinate-grid";
      grid.setAttribute("aria-hidden", "true");
      wrapper.appendChild(grid);
    }

    let toolbar = frameDocument.querySelector(".coordinate-toolbar");
    if (!toolbar) {
      toolbar = frameDocument.createElement("div");
      toolbar.className = "coordinate-toolbar";
      toolbar.innerHTML = `
        <span>ขนาดภาพ <strong data-image-size></strong></span>
        <span>พิกัด <strong data-coordinate>X 0, Y 0 px</strong></span>
        <span>สัดส่วน <strong data-percent>X 0.00%, Y 0.00%</strong></span>
        <label><input type="checkbox" data-grid-toggle> แสดง Grid 100 px</label>
      `;
      frameDocument.body.prepend(toolbar);
    }

    toolbar.querySelector("[data-image-size]").textContent =
      `${imageWidth} x ${imageHeight} px`;

    toolbar.querySelector("[data-grid-toggle]").addEventListener("change", (event) => {
      grid.classList.toggle("is-visible", event.target.checked);
    });

    wrapper.addEventListener("pointermove", (event) => {
      const rect = image.getBoundingClientRect();
      const x = Math.max(0, Math.min(imageWidth, (event.clientX - rect.left) * imageWidth / rect.width));
      const y = Math.max(0, Math.min(imageHeight, (event.clientY - rect.top) * imageHeight / rect.height));

      toolbar.querySelector("[data-coordinate]").textContent =
        `X ${Math.round(x)}, Y ${Math.round(y)} px`;
      toolbar.querySelector("[data-percent]").textContent =
        `X ${(x / imageWidth * 100).toFixed(2)}%, Y ${(y / imageHeight * 100).toFixed(2)}%`;
    });

    const fitResultToFrame = () => {
      const horizontalPadding = 8;
      const availableWidth = Math.max(1, frameDocument.documentElement.clientWidth - horizontalPadding);
      const scale = Math.min(1, availableWidth / imageWidth);
      wrapper.style.setProperty("--ocr-scale", String(scale), "important");
      requestAnimationFrame(() => resizeResultFrame(frame));
    };

    fitResultToFrame();
    frameWindow.addEventListener("resize", fitResultToFrame);
  };

  if (image.complete) {
    initialize();
  } else {
    image.addEventListener("load", initialize, { once: true });
  }
}

function resizeResultFrame(frame) {
  const documentElement = frame.contentDocument?.documentElement;
  const body = frame.contentDocument?.body;
  if (!documentElement || !body) return;

  const height = Math.max(
    420,
    documentElement.scrollHeight,
    body.scrollHeight,
    body.offsetHeight,
  );

  frame.style.height = `${height}px`;
}

updateMode();

sessionStorage.removeItem("hooHooLoggedIn");
setLoggedIn(false);

const chatbotWidget = document.getElementById("chatbotWidget");
const chatbotToggle = document.getElementById("chatbotToggle");
const chatbotClose = document.getElementById("chatbotClose");

chatbotToggle.addEventListener("click", function () {
  chatbotWidget.classList.toggle("open");
  chatbotToggle.setAttribute(
    "aria-expanded",
    chatbotWidget.classList.contains("open")
  );
});

chatbotClose.addEventListener("click", function () {
  chatbotWidget.classList.remove("open");
  chatbotToggle.setAttribute("aria-expanded", "false");
});

const chatbotForm = document.getElementById("chatbotForm");
const chatbotInput = document.getElementById("chatbotInput");
const chatbotMessages = document.getElementById("chatbotMessages");



chatbotForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = chatbotInput.value.trim();

  if (!message) return;

  addChatMessage(message, "user");

  chatbotInput.value = "";

const typingIndicator = document.createElement("div");
typingIndicator.id = "typing-indicator";
typingIndicator.className = "chat-message bot typing-indicator";
typingIndicator.innerHTML = "<span></span><span></span><span></span>";

chatbotMessages.appendChild(typingIndicator);
chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

try {

  const response = await fetch(HOOHOO_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message
      })
    });

    const raw = await response.text();

let answer = raw;

try {
  const data = JSON.parse(raw);
  answer = data.text || data.reply || data.html || raw;
} catch (e) {
  answer = raw;
}


typingIndicator.remove();

addChatMessage(
  answer || "HOO HOO ยังไม่มีคำตอบ",
  "bot"
);

} catch (err) {

  typingIndicator.remove();

  console.error(err);

    addChatMessage(
      "เชื่อมต่อ HOO HOO ไม่สำเร็จ",
      "bot"
    );
  }
});

function addChatMessage(text, type) {

  const div = document.createElement("div");

  div.className = "chat-message " + type;

  div.innerText = text;

  chatbotMessages.appendChild(div);

  chatbotMessages.scrollTop =
  chatbotMessages.scrollHeight;
}
