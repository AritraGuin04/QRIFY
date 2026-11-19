const $ = id => document.getElementById(id);

// External libraries are loaded only when their feature is used.
const LIBRARIES = {
  qr: "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js",
  scanner: "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js",
  pdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
};

const loadedScripts = new Map();

function loadScript(src) {
  if (loadedScripts.has(src)) return loadedScripts.get(src);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      loadedScripts.delete(src);
      reject(new Error("A required library could not be loaded. Check your internet connection."));
    };
    document.head.appendChild(script);
  });

  loadedScripts.set(src, promise);
  return promise;
}

const readStore = (key, fallback = []) => {

  try {

    const value = JSON.parse(localStorage.getItem(key));

    return value ?? fallback;

  } catch {

    return fallback;

  }

};

const writeStore = (key, value) => localStorage.setItem(key, JSON.stringify(value));

let created = readStore("qrify_created", 0);

let scans = readStore("qrify_scans", []);

let saved = readStore("qrify_saved", []);

let currentQR = null;

let currentSVG = "";

let currentType = "text";

let currentStyle = "classic";

let logoData = "";

let camera = null;

let contactDataURL = "";

function toast(message) {

  const el = $("toast");

  el.textContent = message;

  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => el.classList.remove("show"), 2400);

}

function escapeHTML(value) {

  return String(value).replace(/[&<>"']/g, c => ({

    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"

  }[c]));

}

function goTo(tab) {

  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === tab));

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

  const titles = {

    dashboard:"Dashboard", scanner:"QR Scanner", maker:"QR Maker",

    bulk:"Bulk Generator", contact:"Contact QR",

    saved:"Favorites & Saved", history:"Scan History"

  };

  $("page-title").textContent = titles[tab] || "QRIFY";

  if (tab === "dashboard") renderDashboard();

  if (tab === "history") renderHistory();

  if (tab === "saved") renderSaved();

}

document.querySelectorAll("[data-tab]").forEach(btn =>

  btn.addEventListener("click", () => goTo(btn.dataset.tab))

);
// Hamburger Menu
const menuToggle = $("menu-toggle");
const sidebarOverlay = $("sidebar-overlay");

function closeSidebar() {
  document.body.classList.remove("sidebar-open");

  menuToggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
  menuToggle.setAttribute("aria-expanded", "false");
}

menuToggle.addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("sidebar-open");

  menuToggle.innerHTML = isOpen
    ? '<i class="fa-solid fa-xmark"></i>'
    : '<i class="fa-solid fa-bars"></i>';

  menuToggle.setAttribute("aria-expanded", isOpen);
});

sidebarOverlay.addEventListener("click", closeSidebar);

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", closeSidebar);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeSidebar();
});

document.querySelectorAll("[data-go]").forEach(btn =>

  btn.addEventListener("click", () => goTo(btn.dataset.go))

);

async function makeQR(text, size = 240, style = currentStyle, dark = $("dark-color").value, light = $("light-color").value, logo = "") {
  await loadScript(LIBRARIES.qr);

  if (!text.trim()) throw new Error("Please enter some content first.");

  const qr = qrcode(0, "H");

  qr.addData(text);

  qr.make();

  const count = qr.getModuleCount();

  const quiet = 4;

  const cell = size / (count + quiet * 2);

  const canvas = document.createElement("canvas");

  canvas.width = size;

  canvas.height = size;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = light;

  ctx.fillRect(0, 0, size, size);

  let gradient = null;

  if (style === "gradient") {

    gradient = ctx.createLinearGradient(0, 0, size, size);

    gradient.addColorStop(0, dark);

    gradient.addColorStop(1, "#6f8df4");

  }

  for (let r = 0; r < count; r++) {

    for (let c = 0; c < count; c++) {

      if (!qr.isDark(r, c)) continue;

      const x = (c + quiet) * cell;

      const y = (r + quiet) * cell;

      ctx.fillStyle = gradient || dark;

      if (style === "dotted") {

        ctx.beginPath();

        ctx.arc(x + cell / 2, y + cell / 2, cell * .38, 0, Math.PI * 2);

        ctx.fill();

      } else if (style === "rounded") {

        const radius = cell * .22;

        ctx.beginPath();

        ctx.roundRect(x + .2, y + .2, cell - .4, cell - .4, radius);

        ctx.fill();

      } else {

        ctx.fillRect(x, y, cell + .1, cell + .1);

      }

    }

  }

  // Keep the three finder patterns square for better scanning.
  ctx.fillStyle = dark;

  [[0,0],[count-7,0],[0,count-7]].forEach(([r,c]) => {

    const x = (c + quiet) * cell;

    const y = (r + quiet) * cell;

    ctx.fillRect(x, y, cell * 7, cell * 7);

    ctx.fillStyle = light;

    ctx.fillRect(x + cell, y + cell, cell * 5, cell * 5);

    ctx.fillStyle = dark;

    ctx.fillRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3);

  });

  if (logo) {
    const img = new Image();
    img.src = logo;

    try {
      if (img.decode) {
        await img.decode();
      } else {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
      }

      const box = size * .21;
      const x = (size - box) / 2;
      const y = (size - box) / 2;

      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.roundRect(x - 5, y - 5, box + 10, box + 10, 10);
      ctx.fill();
      ctx.drawImage(img, x, y, box, box);
    } catch {
      throw new Error("The selected logo could not be loaded. Please choose another image.");
    }
  }

  return { canvas, qr, text, size, style, dark, light, logo };

}

function makeSVG(qrData) {

  const { qr, size, dark, light, style } = qrData;

  const count = qr.getModuleCount();

  const quiet = 4;

  const total = count + quiet * 2;

  const cell = size / total;

  let shapes = "";

  for (let r = 0; r < count; r++) {

    for (let c = 0; c < count; c++) {

      if (!qr.isDark(r,c)) continue;

      const x = (c + quiet) * cell;

      const y = (r + quiet) * cell;

      if (style === "dotted") {

        shapes += `<circle cx="${x + cell/2}" cy="${y + cell/2}" r="${cell*.38}" fill="${dark}"/>`;

      } else {

        const radius = style === "rounded" ? cell*.2 : 0;

        shapes += `<rect x="${x}" y="${y}" width="${cell+.1}" height="${cell+.1}" rx="${radius}" fill="${dark}"/>`;

      }

    }

  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="${light}"/>${shapes}</svg>`;

}

function showCanvas(container, canvas, label = "") {

  container.innerHTML = "";

  const frame = document.createElement("div");

  frame.style.display = "grid";

  frame.style.justifyItems = "center";

  frame.style.gap = "10px";

  frame.appendChild(canvas);

  if (label) {

    const caption = document.createElement("strong");

    caption.textContent = label;

    caption.style.cssText = "font-size:11px;letter-spacing:1.5px;color:#51446f";

    frame.appendChild(caption);

  }

  container.appendChild(frame);

}

function contentValue() {

  let value = $("qr-content").value.trim();

  if (currentType === "email" && value && !value.startsWith("mailto:")) value = "mailto:" + value;

  if (currentType === "phone" && value && !value.startsWith("tel:")) value = "tel:" + value;

  return value;

}

async function generateMainQR() {

  try {

    const text = contentValue();

    const label = $("qr-frame").value;

    const data = await makeQR(text, 260, currentStyle, $("dark-color").value, $("light-color").value, logoData);

    currentQR = data;

    currentSVG = makeSVG(data);

    showCanvas($("qr-preview"), data.canvas, label);

    created++;

    writeStore("qrify_created", created);

    updateStats();

    toast("QR code generated successfully!");

  } catch (err) {

    toast(err.message || "Could not generate QR code.");

  }

}

$("generate-btn").addEventListener("click", generateMainQR);

document.querySelectorAll(".type-btn").forEach(btn => {

  btn.addEventListener("click", () => {

    currentType = btn.dataset.type;

    document.querySelectorAll(".type-btn").forEach(b => b.classList.toggle("active", b === btn));

  });

});

document.querySelectorAll(".template").forEach(btn => {

  btn.addEventListener("click", () => {

    currentStyle = btn.dataset.style;

    document.querySelectorAll(".template").forEach(b => b.classList.toggle("active", b === btn));

    if (currentQR) generateMainQR();

  });

});

$("logo-file").addEventListener("change", event => {

  const file = event.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) return toast("Please choose an image file.");

  const reader = new FileReader();

  reader.onload = () => {

    logoData = reader.result;

    toast("Logo uploaded. Generate your QR again.");

  };

  reader.readAsDataURL(file);

});

function downloadBlob(blob, filename) {

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;

  a.download = filename;

  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

}

function downloadCanvas(canvas, name) {

  canvas.toBlob(blob => {

    if (blob) downloadBlob(blob, name);

    else toast("Could not export this image.");

  }, "image/png");

}

$("download-png").addEventListener("click", () => {

  if (!currentQR) return toast("Generate a QR code first.");

  downloadCanvas(currentQR.canvas, "qrify-code.png");

});

$("download-svg").addEventListener("click", () => {

  if (!currentQR) return toast("Generate a QR code first.");

  downloadBlob(new Blob([currentSVG], {type:"image/svg+xml"}), "qrify-code.svg");

});

$("download-pdf").addEventListener("click", async () => {
  if (!currentQR) return toast("Generate a QR code first.");

  try {
    await loadScript(LIBRARIES.pdf);
    const pdf = new window.jspdf.jsPDF();
    const image = currentQR.canvas.toDataURL("image/png");

    pdf.text("QRIFY", 20, 20);
    pdf.addImage(image, "PNG", 45, 35, 120, 120);
    pdf.save("qrify-code.pdf");
  } catch (err) {
    toast(err.message || "PDF export failed.");
  }
});

$("save-qr").addEventListener("click", () => {

  if (!currentQR) return toast("Generate a QR code first.");

  const name = $("qr-name").value.trim() || "My QR Code";

  saved.unshift({

    id: Date.now(),

    name,

    text: currentQR.text,

    image: currentQR.canvas.toDataURL("image/png"),

    favorite: true,

    date: new Date().toLocaleString()

  });

  saved = saved.slice(0, 40);

  writeStore("qrify_saved", saved);

  updateStats();

  toast("QR saved to your collection!");

});

function recordScan(text) {

  scans.unshift({text, date:new Date().toLocaleString()});

  scans = scans.slice(0, 60);

  writeStore("qrify_scans", scans);

  updateStats();

  renderHistory();

  renderDashboard();

  $("scan-result").innerHTML = "";

  const p = document.createElement("p");

  p.textContent = text;

  $("scan-result").appendChild(p);

  if (/^https?:\/\//i.test(text)) {

    const a = document.createElement("a");

    a.href = text;

    a.target = "_blank";

    a.rel = "noopener noreferrer";

    a.textContent = "Open link ↗";

    $("scan-result").appendChild(a);

  }

  const copy = document.createElement("button");

  copy.className = "secondary-btn";

  copy.textContent = "Copy result";

  copy.addEventListener("click", () => copyText(text));

  $("scan-result").appendChild(copy);

}

async function copyText(text) {

  try {

    await navigator.clipboard.writeText(text);

    toast("Copied!");

  } catch {

    toast("Clipboard permission unavailable.");

  }

}

async function startCamera() {

  if (camera) return toast("Camera is already running.");

  try {
    await loadScript(LIBRARIES.scanner);
    camera = new Html5Qrcode("reader");

    await camera.start(

      { facingMode:"environment" },

      { fps:10, qrbox:{width:230,height:230} },

      text => {

        recordScan(text);

        stopCamera();

      },

      () => {}

    );

    toast("Camera started.");

  } catch (err) {

    camera = null;

    toast("Camera unavailable. Check permission and HTTPS/localhost.");

  }

}

async function stopCamera() {

  if (!camera) return;

  try {

    if (camera.isScanning) await camera.stop();

    await camera.clear();

  } catch {}

  camera = null;

}

$("camera-start").addEventListener("click", startCamera);

$("camera-stop").addEventListener("click", stopCamera);

$("scan-file").addEventListener("change", async event => {

  const file = event.target.files[0];

  if (!file) return;

  try {
    await loadScript(LIBRARIES.scanner);
    const scanner = new Html5Qrcode("reader");

    const text = await scanner.scanFile(file, true);

    recordScan(text);

    toast("QR image scanned!");

  } catch {

    toast("No readable QR code found in this image.");

  }

  event.target.value = "";

});

$("bulk-input").addEventListener("input", () => {

  const count = $("bulk-input").value.split("\n").map(s=>s.trim()).filter(Boolean).length;

  $("bulk-count").textContent = count + (count === 1 ? " item" : " items");

});

$("bulk-generate").addEventListener("click", async () => {
  const items = $("bulk-input").value.split("\n").map(s => s.trim()).filter(Boolean);
  if (!items.length) return toast("Enter at least one item.");
  if (items.length > 30) return toast("Maximum 30 QR codes per batch.");

  const area = $("bulk-results");
  area.innerHTML = "";
  let generated = 0;

  for (let index = 0; index < items.length; index++) {
    const text = items[index];

    try {
      const data = await makeQR(text, 180, "classic", "#27204c", "#ffffff");
      const card = document.createElement("div");
      card.className = "glass bulk-card";

      const title = document.createElement("b");
      title.textContent = "QR " + (index + 1);

      const p = document.createElement("p");
      p.textContent = text;

      card.append(title, data.canvas, p);

      const button = document.createElement("button");
      button.textContent = "Download PNG";
      button.addEventListener("click", () => downloadCanvas(data.canvas, `qrify-${index + 1}.png`));

      card.appendChild(button);
      area.appendChild(card);
      created++;
      generated++;
    } catch (err) {
      console.error("Could not generate bulk QR:", err);
    }
  }

  writeStore("qrify_created", created);
  updateStats();
  toast(generated + " QR codes generated!");
});

function createVCard() {

  const name = $("contact-name").value.trim();

  if (!name) throw new Error("Please enter a name.");

  const phone = $("contact-phone").value.trim();

  const email = $("contact-email").value.trim();

  const url = $("contact-url").value.trim();

  const org = $("contact-org").value.trim();

  const clean = s => s.replace(/\\\\/g,"\\\\\\\\").replace(/;/g,"\\\\;").replace(/,/g,"\\\\,").replace(/\n/g,"\\\n");

  return [

    "BEGIN:VCARD","VERSION:3.0","FN:"+clean(name),

    phone ? "TEL;TYPE=CELL:"+clean(phone) : "",

    email ? "EMAIL:"+clean(email) : "",

    url ? "URL:"+clean(url) : "",

    org ? "ORG:"+clean(org) : "",

    "END:VCARD"

  ].filter(Boolean).join("\n");

}

$("contact-generate").addEventListener("click", async () => {

  try {

    const text = createVCard();

    const data = await makeQR(text, 260, "classic", "#27204c", "#ffffff");

    contactDataURL = data.canvas.toDataURL("image/png");

    showCanvas($("contact-preview"), data.canvas);

    created++;

    writeStore("qrify_created", created);

    updateStats();

    toast("Contact QR generated!");

  } catch (err) {

    toast(err.message);

  }

});

$("contact-download").addEventListener("click", () => {

  if (!contactDataURL) return toast("Generate a contact QR first.");

  const a = document.createElement("a");

  a.href = contactDataURL;

  a.download = "qrify-contact.png";

  a.click();

});

function renderSaved() {

  const list = $("saved-list");

  list.innerHTML = "";

  if (!saved.length) {

    list.innerHTML = '<div class="glass empty">No saved QR codes yet. Create one and save it here.</div>';

    return;

  }

  saved.forEach(item => {

    const card = document.createElement("div");

    card.className = "glass saved-card";

    const img = document.createElement("img");

    img.src = item.image;

    img.alt = "Saved QR";

    const title = document.createElement("b");

    title.textContent = item.name;

    const p = document.createElement("p");

    p.textContent = item.text;

    const download = document.createElement("button");

    download.textContent = "Download";

    download.addEventListener("click", () => {

      const a = document.createElement("a");

      a.href = item.image;

      a.download = "qrify-saved.png";

      a.click();

    });

    const remove = document.createElement("button");

    remove.textContent = "Remove";

    remove.addEventListener("click", () => {

      saved = saved.filter(s => s.id !== item.id);

      writeStore("qrify_saved", saved);

      renderSaved();

      updateStats();

      toast("Removed from saved QR.");

    });

    card.append(img, title, p, download, remove);

    list.appendChild(card);

  });

}

function renderHistory() {

  const list = $("history-list");

  list.innerHTML = "";

  if (!scans.length) {

    list.innerHTML = '<p class="empty">No scan history yet.</p>';

    return;

  }

  scans.forEach(item => {

    const row = document.createElement("div");

    row.className = "activity-row";

    const icon = document.createElement("span");

    icon.className = "activity-icon";

    icon.textContent = "⌗";

    const details = document.createElement("div");

    const value = document.createElement("b");

    value.textContent = item.text;

    const date = document.createElement("small");

    date.textContent = item.date;

    details.append(value, date);

    const copy = document.createElement("button");

    copy.className = "secondary-btn";

    copy.textContent = "Copy";

    copy.addEventListener("click", () => copyText(item.text));

    row.append(icon, details, copy);

    list.appendChild(row);

  });

}

$("clear-history").addEventListener("click", () => {

  if (!scans.length) return toast("History is already empty.");

  if (!confirm("Clear all scan history?")) return;

  scans = [];

  writeStore("qrify_scans", scans);

  renderHistory();

  renderDashboard();

  updateStats();

  toast("History cleared.");

});

function renderDashboard() {

  const recent = $("dashboard-recent");

  recent.innerHTML = "";

  if (!scans.length) {

    recent.innerHTML = '<p class="empty">No recent scans yet.</p>';

    return;

  }

  scans.slice(0,4).forEach(item => {

    const row = document.createElement("div");

    row.className = "activity-row";

    const icon = document.createElement("span");

    icon.className = "activity-icon";

    icon.textContent = "⌗";

    const details = document.createElement("div");

    const value = document.createElement("b");

    value.textContent = item.text;

    const date = document.createElement("small");

    date.textContent = item.date;

    details.append(value,date);

    row.append(icon,details);

    recent.appendChild(row);

  });

}

function updateStats() {

  $("stat-created").textContent = created;

  $("stat-scans").textContent = scans.length;

  $("stat-favorites").textContent = saved.length;

}

updateStats();

renderDashboard();
