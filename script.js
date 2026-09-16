const OCR_ENDPOINT =
"https://n8n.tks.co.th/webhook/hoo-hoo-ocr";

const TEXT_ENDPOINT =
"https://n8n.tks.co.th/webhook/text-proofreader";

const HOOHOO_CHAT_ENDPOINT =
"https://n8n.tks.co.th/webhook/hoohoo-chat";

const OCR_COMPARE_ENDPOINT =
"https://n8n.tks.co.th/webhook/thai-ocr-compare";

let pdfJsPromise;

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
const loginToggleButton = document.getElementById("loginToggleButton");
const landingStartButton = document.getElementById("landingStartButton");
const owlSound = document.getElementById("owlSound");
const logoutButton = document.getElementById("logoutButton");
const appShell = document.querySelector(".app-shell");

loginToggleButton.addEventListener("click", enterWorkspace);
landingStartButton.addEventListener("click", enterWorkspace);

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

  if (isLoggedIn) {
    sessionStorage.setItem("hooHooLoggedIn", "true");
  } else {
    sessionStorage.removeItem("hooHooLoggedIn");
  }
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

function isPdfFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return name.endsWith(".pdf") || type.includes("pdf");
}

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("./vendor/pdfjs/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.mjs";
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function pdfToPngFile(file) {
  const pdfjs = await loadPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  const gap = 24;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
  // PDF pages often contain Thai body text that becomes too small for OCR at
  // the old ~1,000 px render width. Render PDFs at a higher resolution while
  // keeping ordinary image uploads unchanged.
  // 1,800 px is the stable middle ground for Surya/Datalab: it preserves
  // small Thai glyphs without triggering the model's empty <div><img/></div>
  // response seen with oversized pages.
  const scale = Math.min(4, 1800 / Math.max(baseViewport.width, 1));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push(canvas);
  }

  const width = Math.max(...pages.map((page) => page.width));
  const height = pages.reduce((sum, page) => sum + page.height, 0)
    + gap * Math.max(0, pages.length - 1);
  if (height > 32000) {
    throw new Error("PDF มีจำนวนหน้ามากเกินกว่าที่จะแปลงเป็นภาพเดียว กรุณาแบ่งไฟล์ก่อนส่งตรวจ");
  }

  const combined = document.createElement("canvas");
  combined.width = width;
  combined.height = height;
  const combinedContext = combined.getContext("2d", { alpha: false });
  combinedContext.fillStyle = "#ffffff";
  combinedContext.fillRect(0, 0, width, height);

  let y = 0;
  for (const page of pages) {
    const x = Math.floor((width - page.width) / 2);
    combinedContext.drawImage(page, x, y);
    y += page.height + gap;
  }

  const blob = await new Promise((resolve, reject) => {
    combined.toBlob(
      (value) => value ? resolve(value) : reject(new Error("ไม่สามารถแปลง PDF เป็น PNG ได้")),
      "image/png"
    );
  });
  const outputName = file.name.replace(/\.pdf$/i, "") + "-pages.png";
  return new File([blob], outputName, { type: "image/png" });
}

let comparisonBusy = false;
async function sendToN8N() {
  if (comparisonBusy) return;
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

  showCheckingState();
  resultBox.classList.remove("has-result");
  statusText.textContent = "กำลังประมวลผล";

  try {
    if (mode === 'compare') {
      comparisonBusy = true;
      const result = await HooHooCompare.compare(fileA, fileB, message => {
        statusText.textContent = message;
      });
      resultBox.classList.remove('is-loading');
      renderResultHtml(HooHooCompare.render(result));
      statusText.textContent = result.uncertain.length ? 'ตรวจเสร็จ — มีรายการต้องตรวจเพิ่มเติม' : 'ตรวจเสร็จแล้ว';
      return;
    }
    let uploadFileA = fileA;
    let uploadFileB = fileB;

    if (mode === "compare" && (isPdfFile(fileA) || isPdfFile(fileB))) {
      statusText.textContent = "กำลังแปลง PDF เป็นภาพสำหรับ Datalab";
      [uploadFileA, uploadFileB] = await Promise.all([
        isPdfFile(fileA) ? pdfToPngFile(fileA) : Promise.resolve(fileA),
        isPdfFile(fileB) ? pdfToPngFile(fileB) : Promise.resolve(fileB),
      ]);
    }

    const form = new FormData();
    form.append("mode", effectiveMode);
    form.append("fileA", uploadFileA);
    if (mode === "compare") form.append("fileB", uploadFileB);

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


    const html = Array.isArray(json) ? json[0]?.html : json?.html;

    if (html) {
      let finalHtml = html;
      let needsReview = effectiveMode === 'single';
      if (effectiveMode === 'single' && /^image\//.test(fileA.type)) {
        statusText.textContent = 'กำลังยืนยันตำแหน่งคำจากภาพจริง';
        let ocr = null;
        try { ocr = await HooHooWordLocator.read(fileA); }
        catch (error) { console.warn('Native OCR location unavailable', error.message); }
        const checked = HooHooWordLocator.reanchor(html, ocr);
        finalHtml = checked.html;
        needsReview = checked.reviewCount > 0;
      } else if (effectiveMode === 'single' && /\.pdf$/i.test(fileA.name)) {
        try {
          const checked = await HooHooWordLocator.annotatePdf(html,fileA,message=>{statusText.textContent=message;});
          finalHtml = checked.html;
        } catch (error) {
          finalHtml = HooHooWordLocator.preserveOriginal(html);
          const warning = document.createElement('p');warning.textContent='ยังไม่ได้ยืนยันตำแหน่ง: '+error.message;
          finalHtml += warning.outerHTML;
        }
      } else if (effectiveMode === 'single') {
        finalHtml = HooHooWordLocator.preserveOriginal(html);
      }
      resultBox.classList.remove("is-loading");
      renderResultHtml(finalHtml);
      statusText.textContent = needsReview ? 'ประมวลผลแล้ว — โปรดตรวจทานคำแนะนำกับต้นฉบับ' : 'ประมวลผลเสร็จแล้ว';
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
    resultBox.textContent = `ERROR:\n${error}`;
    statusText.textContent = "ประมวลผลไม่สำเร็จ";
  } finally {
    comparisonBusy = false;
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

function normalizeChatRequest(message) {
  const normalized = String(message || "").normalize("NFC").trim();
  const isMeaningQuestion =
    /(หมายความว่า|ความหมาย|แปลว่าอะไร|นิยาม)/u.test(normalized);
  const isSpellingQuestion =
    /(สอนเขียน|เขียน|สะกด|ถูกไหม|ถูกหรือไม่|คำที่ถูก|แก้เป็น)/u.test(normalized);

  if (isMeaningQuestion) {
    const meaningTarget = normalized
      .replace(/^(?:ช่วย)?\s*(?:คำว่า|คำ)?\s*/u, "")
      .split(/(?:ใช่|ใช้)(?:ไหม|หรือ|หรอ)?|เขียน|สะกด|ความหมาย|หมายความ|แปลว่า|คืออะไร/u)[0]
      .replace(/[\s?!。.]+$/u, "")
      .trim();

    // บังคับให้ Router เข้าโหมดอธิบายคำ ไม่หลงไปตอบคำสั่งในประโยค
    return meaningTarget
      ? `คำว่า ${meaningTarget} เขียนอย่างไร และหมายความว่าอะไร`
      : normalized;
  }

  if (!isSpellingQuestion) return normalized;

  const target = normalized
    .replace(/^(?:ช่วย)?\s*(?:คำว่า|คำ)?\s*/u, "")
    .replace(/^(?:ช่วย)?\s*(?:เขียน|สะกด)\s*/u, "")
    .replace(/(?:สอน)?(?:เขียน|สะกด)(?:ว่า|ยังไง|อย่างไร|ไง)?[\s?!。.]*$/u, "")
    .replace(/(?:ถูกไหม|ถูกหรือไม่|คำที่ถูก|แก้เป็น).*$/u, "")
    .trim();

  // ส่งรูปแบบเดียวให้ Workflow เพื่อไม่ให้โมเดลหยิบคำสั่ง เช่น "สอน/เขียน/ไง" มาตอบ
  return target ? `${target} เขียนอย่างไร` : normalized;
}



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
        message: normalizeChatRequest(message)
      })
    });

    const raw = await response.text();

let answer = raw;

try {
  const data = JSON.parse(raw);
  if (data.message === "Workflow execution failed") {
    answer = "ขออภัยค่ะ ระบบประมวลผลไม่สำเร็จ กรุณาลองส่งคำถามอีกครั้ง";
  } else {
    answer = data.text || data.reply || data.html || data.message || raw;
  }
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
