/* =====================================================
   SCANNOMER - SMART QR & DIGITAL PHONE CARD
   Firebase SDK 11.6.0
   ===================================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/* =====================================================
   1. FIREBASE CONFIGURATION
   ===================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAyeuTYfD_zUY4E8xwyMzitZe3cga0t4Z8",
  authDomain: "scannomer.firebaseapp.com",
  projectId: "scannomer",
  storageBucket: "scannomer.firebasestorage.app",
  messagingSenderId: "484868882696",
  appId: "1:484868882696:web:47961f87720b683affacbd"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* =====================================================
   2. GLOBAL STATE
   ===================================================== */

let currentUser = null;
let currentStore = null;
let confirmationResult = null;
let recaptchaVerifier = null;
let cameraStream = null;
let currentPaymentMethods = [];

/* =====================================================
   3. ELEMENT HELPER
   ===================================================== */

const $ = (id) => document.getElementById(id);

function show(element, visible = true) {
  if (element) {
    element.style.display = visible ? "" : "none";
  }
}

function message(element, text, error = false) {
  if (!element) return;

  element.textContent = text;
  element.style.color = error ? "#dc2626" : "#16a34a";
}

function normalizePhone(value) {
  let number = String(value || "").replace(/\D/g, "");

  if (number.startsWith("0")) {
    number = "62" + number.substring(1);
  } else if (number.startsWith("8")) {
    number = "62" + number;
  }

  return number;
}

function localPhone(value) {
  const number = normalizePhone(value);

  if (number.startsWith("62")) {
    return "0" + number.substring(2);
  }

  return number;
}

function phoneE164(value) {
  return "+" + normalizePhone(value);
}

function storeIdFromPhone(value) {
  return normalizePhone(value);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

/* =====================================================
   4. DIGITAL CARD
   KARTU TANPA QR CODE
   ===================================================== */

function renderDigitalCard() {
  if (!$("storeQr")) return;

  // Pastikan tidak ada QR identitas pada kartu digital.
  $("storeQr").innerHTML = "";
  $("storeQr").style.display = "none";

  const card = document.getElementById("digitalCard");

  if (card) {
    card.innerHTML = `
      <div style="
        background:linear-gradient(135deg,#7028df,#a855f7);
        color:white;
        padding:30px 20px;
        border-radius:22px;
        text-align:center;
        box-shadow:0 10px 30px #7028df30;
      ">
        <div style="font-size:12px;letter-spacing:3px;">
          SCANNOMER
        </div>

        <h2 style="margin:22px 0 12px;font-size:25px;">
          ${escapeHTML(currentStore?.name || "NAMA TOKO")}
        </h2>

        <div style="
          font-size:12px;
          opacity:.85;
          letter-spacing:2px;
        ">
          SCAN NOMER HP
        </div>

        <div style="
          font-size:27px;
          font-weight:800;
          margin:12px 0;
          letter-spacing:1px;
          word-break:break-word;
        ">
          ${escapeHTML(localPhone(currentStore?.phoneE164 || ""))}
        </div>

        <div style="font-size:12px;opacity:.8;">
          ${escapeHTML(currentStore?.address || "")}
        </div>
      </div>
    `;
  }

  const phone = $("cardPhone");
  if (phone) {
    phone.textContent = localPhone(currentStore?.phoneE164 || "");
  }

  const name = $("cardStoreName");
  if (name) {
    name.textContent = currentStore?.name || "";
  }
}

/* =====================================================
   5. LOGIN PEMILIK TOKO DENGAN SMS OTP
   ===================================================== */

function openLogin() {
  show($("loginSection"), true);
  show($("home"), false);
}

function closeLogin() {
  show($("loginSection"), false);
  show($("home"), true);
}

async function createRecaptcha() {
  if (recaptchaVerifier) {
    try {
      await recaptchaVerifier.clear();
    } catch (_) {}
  }

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "recaptcha-container",
    {
      size: "normal",
      callback: () => {},
      "expired-callback": () => {
        message($("loginMessage"), "Verifikasi CAPTCHA kedaluwarsa.", true);
      }
    }
  );

  await recaptchaVerifier.render();
}

async function sendOTP() {
  const input = $("phoneInput");
  const phone = input?.value.trim();

  if (!phone) {
    message($("loginMessage"), "Masukkan nomor HP terlebih dahulu.", true);
    return;
  }

  const normalized = normalizePhone(phone);

  if (!/^62[0-9]{8,13}$/.test(normalized)) {
    message($("loginMessage"), "Nomor HP Indonesia tidak valid.", true);
    return;
  }

  try {
    message($("loginMessage"), "Menyiapkan verifikasi...");

    await createRecaptcha();

    confirmationResult = await signInWithPhoneNumber(
      auth,
      "+" + normalized,
      recaptchaVerifier
    );

    show($("otpArea"), true);

    message($("loginMessage"), "Kode OTP telah dikirim melalui SMS.");
  } catch (error) {
    console.error(error);
    message(
      $("loginMessage"),
      error.message || "Gagal mengirim OTP.",
      true
    );
  }
}

async function verifyOTP() {
  const code = $("otpInput")?.value.trim();

  if (!code || !confirmationResult) {
    message($("loginMessage"), "Masukkan kode OTP.", true);
    return;
  }

  try {
    await confirmationResult.confirm(code);
    message($("loginMessage"), "Login berhasil.");
  } catch (error) {
    console.error(error);
    message($("loginMessage"), "Kode OTP salah atau kedaluwarsa.", true);
  }
}

/* =====================================================
   6. AUTH STATE
   ===================================================== */

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    show($("loginSection"), false);
    show($("home"), false);
    show($("dashboard"), true);

    await loadOwnerStore();
  } else {
    currentStore = null;

    show($("dashboard"), false);
    show($("loginSection"), false);
    show($("home"), true);
  }
});

/* =====================================================
   7. LOAD PROFIL TOKO
   ===================================================== */

async function loadOwnerStore() {
  if (!currentUser) return;

  const userPhone = currentUser.phoneNumber;

  if (!userPhone) {
    alert("Nomor HP akun tidak ditemukan.");
    return;
  }

  const id = storeIdFromPhone(userPhone);
  const ref = doc(db, "stores", id);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    currentStore = {
      id,
      ...snapshot.data()
    };
  } else {
    currentStore = {
      id,
      ownerUid: currentUser.uid,
      phoneE164: userPhone,
      name: "",
      address: "",
      published: false
    };

    await setDoc(ref, {
      ownerUid: currentUser.uid,
      phoneE164: userPhone,
      name: "",
      address: "",
      published: false,
      updatedAt: serverTimestamp()
    });
  }

  if ($("ownerInfo")) {
    $("ownerInfo").textContent = localPhone(userPhone);
  }

  if ($("storeName")) {
    $("storeName").value = currentStore.name || "";
  }

  if ($("storeAddress")) {
    $("storeAddress").value = currentStore.address || "";
  }

  renderDigitalCard();
  await loadPayments();
}

/* =====================================================
   8. SIMPAN PROFIL TOKO
   ===================================================== */

async function saveStore() {
  if (!currentUser || !currentStore) return;

  const name = $("storeName")?.value.trim() || "";
  const address = $("storeAddress")?.value.trim() || "";

  if (!name) {
    alert("Nama toko wajib diisi.");
    return;
  }

  try {
    await updateDoc(doc(db, "stores", currentStore.id), {
      name,
      address,
      updatedAt: serverTimestamp()
    });

    currentStore.name = name;
    currentStore.address = address;

    renderDigitalCard();

    alert("Profil toko berhasil disimpan.");
  } catch (error) {
    console.error(error);
    alert("Gagal menyimpan profil: " + error.message);
  }
}

/* =====================================================
   9. DOWNLOAD KARTU DIGITAL
   ===================================================== */

async function downloadCard() {
  const card = $("digitalCard");

  if (!card) {
    alert("Elemen kartu digital #digitalCard tidak ditemukan.");
    return;
  }

  if (!window.html2canvas) {
    alert("Library html2canvas belum dimuat.");
    return;
  }

  try {
    const canvas = await html2canvas(card, {
      backgroundColor: null,
      scale: 3
    });

    const link = document.createElement("a");
    link.download = "SCANNOMER-Kartu-Toko.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (error) {
    console.error(error);
    alert("Gagal mengunduh kartu.");
  }
}

/* =====================================================
   10. SMART QR - DETEKSI QR DARI GAMBAR
   ===================================================== */

async function decodeQRFromFile(file) {
  if (!file) return null;

  if (!("BarcodeDetector" in window)) {
    throw new Error(
      "Browser belum mendukung pembaca QR gambar. Gunakan Chrome terbaru."
    );
  }

  const detector = new BarcodeDetector({
    formats: ["qr_code"]
  });

  const bitmap = await createImageBitmap(file);
  const results = await detector.detect(bitmap);

  if (!results.length) {
    throw new Error("QR Code tidak ditemukan pada gambar.");
  }

  return results[0].rawValue;
}

/* =====================================================
   11. SMART QR - KATEGORI QRIS ATAU URL
   ===================================================== */

function classifyQR(value) {
  const content = String(value || "").trim();

  if (content.startsWith("000201") || content.startsWith("000202")) {
    return {
      type: "qris",
      payload: content
    };
  }

  if (/^https?:\/\//i.test(content)) {
    return {
      type: "link",
      url: content
    };
  }

  return {
    type: "other",
    url: content
  };
}

/* =====================================================
   12. SIMPAN METODE PEMBAYARAN
   ===================================================== */

async function savePaymentMethod(data) {
  if (!currentUser || !currentStore) {
    throw new Error("Silakan login terlebih dahulu.");
  }

  const paymentCollection = collection(
    db,
    "stores",
    currentStore.id,
    "payment_methods"
  );

  await addDoc(paymentCollection, {
    ownerUid: currentUser.uid,
    title: data.title || "Pembayaran",
    type: data.type,
    payload: data.payload || "",
    url: data.url || "",
    active: true,
    position: currentPaymentMethods.length,
    createdAt: serverTimestamp()
  });
}

/* =====================================================
   13. UPLOAD FOTO QRIS / QR PEMBAYARAN
   ===================================================== */

async function uploadPaymentQR(file) {
  try {
    const content = await decodeQRFromFile(file);
    const detected = classifyQR(content);

    const title = prompt(
      detected.type === "qris"
        ? "Nama metode pembayaran QRIS:"
        : "Nama metode pembayaran:"
    );

    if (title === null) return;

    await savePaymentMethod({
      title: title.trim() || "Pembayaran",
      ...detected
    });

    alert(
      detected.type === "qris"
        ? "QRIS berhasil disimpan."
        : "QR berhasil dibaca dan disimpan."
    );

    await loadPayments();
  } catch (error) {
    console.error(error);
    alert(error.message || "Gagal membaca QR.");
  }
}

/* =====================================================
   14. TAMBAH LINK PEMBAYARAN MANUAL
   ===================================================== */

async function addManualPayment() {
  const title = $("paymentTitle")?.value.trim();
  const url = $("paymentUrl")?.value.trim();
  const type = $("paymentType")?.value || "link";

  if (!title || !url) {
    alert("Isi nama dan alamat pembayaran.");
    return;
  }

  if (type !== "qris" && !/^https?:\/\//i.test(url)) {
    alert("Link harus diawali https:// atau http://");
    return;
  }

  try {
    await savePaymentMethod({
      title,
      type: type === "qris" ? "other" : type,
      url
    });

    if ($("paymentTitle")) $("paymentTitle").value = "";
    if ($("paymentUrl")) $("paymentUrl").value = "";

    await loadPayments();

    alert("Metode pembayaran berhasil ditambahkan.");
  } catch (error) {
    console.error(error);
    alert("Gagal menambahkan pembayaran: " + error.message);
  }
}

/* =====================================================
   15. LOAD METODE PEMBAYARAN
   ===================================================== */

async function loadPayments() {
  if (!currentStore) return;

  try {
    const ref = collection(
      db,
      "stores",
      currentStore.id,
      "payment_methods"
    );

    const snapshot = await getDocs(ref);

    currentPaymentMethods = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    currentPaymentMethods.sort(
      (a, b) => (a.position ?? 9999) - (b.position ?? 9999)
    );

    renderPayments();
  } catch (error) {
    console.error(error);
    message($("loginMessage"), "Gagal memuat metode pembayaran.", true);
  }
}

/* =====================================================
   16. TAMPILKAN METODE PEMBAYARAN
   ===================================================== */

function renderPayments() {
  const container = $("paymentList");
  if (!container) return;

  container.innerHTML = "";

  if (!currentPaymentMethods.length) {
    container.innerHTML = "<p>Belum ada metode pembayaran.</p>";
    return;
  }

  currentPaymentMethods.forEach((item, index) => {
    const div = document.createElement("div");

    div.style.cssText = `
      padding:14px;
      margin:10px 0;
      border:1px solid #ddd;
      border-radius:12px;
      background:white;
    `;

    const isQRIS = item.type === "qris" && item.payload;

    div.innerHTML = `
      <strong>${escapeHTML(item.title || "Pembayaran")}</strong>
      <p style="font-size:12px;color:#666;">
        ${isQRIS ? "QRIS" : escapeHTML(item.type || "Link")}
      </p>

      <div class="payment-preview"></div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
        <button data-action="edit">Edit</button>
        <button data-action="up" ${index === 0 ? "disabled" : ""}>↑</button>
        <button data-action="down" ${index === currentPaymentMethods.length - 1 ? "disabled" : ""}>↓</button>
        <button data-action="delete">Hapus</button>
      </div>
    `;

    const preview = div.querySelector(".payment-preview");

    if (isQRIS && window.QRCode) {
      new QRCode(preview, {
        text: item.payload,
        width: 170,
        height: 170
      });
    } else if (item.url && /^https?:\/\//i.test(item.url)) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Buka link pembayaran";
      preview.appendChild(link);
    } else if (item.url) {
      preview.textContent = item.url;
    }

    div.querySelector('[data-action="delete"]').onclick =
      () => deletePayment(item.id);

    div.querySelector('[data-action="edit"]').onclick =
      () => editPayment(item);

    div.querySelector('[data-action="up"]').onclick =
      () => movePayment(index, -1);

    div.querySelector('[data-action="down"]').onclick =
      () => movePayment(index, 1);

    container.appendChild(div);
  });
}

/* =====================================================
   17. EDIT METODE PEMBAYARAN
   ===================================================== */

async function editPayment(item) {
  const title = prompt("Nama pembayaran baru:", item.title || "");

  if (title === null) return;

  const ref = doc(
    db,
    "stores",
    currentStore.id,
    "payment_methods",
    item.id
  );

  try {
    await updateDoc(ref, {
      title: title.trim() || "Pembayaran"
    });

    await loadPayments();
  } catch (error) {
    alert("Gagal mengedit: " + error.message);
  }
}

/* =====================================================
   18. HAPUS METODE PEMBAYARAN
   ===================================================== */

async function deletePayment(id) {
  if (!confirm("Hapus metode pembayaran ini?")) return;

  try {
    await deleteDoc(
      doc(db, "stores", currentStore.id, "payment_methods", id)
    );

    await loadPayments();
  } catch (error) {
    alert("Gagal menghapus: " + error.message);
  }
}

/* =====================================================
   19. ATUR URUTAN PEMBAYARAN
   ===================================================== */

async function movePayment(index, direction) {
  const target = index + direction;

  if (target < 0 || target >= currentPaymentMethods.length) return;

  const first = currentPaymentMethods[index];
  const second = currentPaymentMethods[target];

  try {
    await updateDoc(
      doc(db, "stores", currentStore.id, "payment_methods", first.id),
      { position: target }
    );

    await updateDoc(
      doc(db, "stores", currentStore.id, "payment_methods", second.id),
      { position: index }
    );

    await loadPayments();
  } catch (error) {
    alert("Gagal mengubah urutan: " + error.message);
  }
}

/* =====================================================
   20. PENCARIAN TOKO DARI NOMOR HP
   ===================================================== */

async function findStoreByPhone(phone) {
  const id = storeIdFromPhone(phone);

  if (!/^62[0-9]{8,13}$/.test(id)) {
    throw new Error("Nomor HP Indonesia tidak valid.");
  }

  const snapshot = await getDoc(doc(db, "stores", id));

  if (!snapshot.exists()) {
    throw new Error("Toko belum terdaftar di SCANNOMER.");
  }

  const data = snapshot.data();

  if (data.published === false) {
    throw new Error("Toko belum dipublikasikan.");
  }

  currentStore = {
    id,
    ...data
  };

  show($("storeResult"), true);
  show($("home"), false);

  if ($("resultStoreName")) {
    $("resultStoreName").textContent = data.name || "Nama Toko";
  }

  if ($("resultStorePhone")) {
    $("resultStorePhone").textContent =
      localPhone(data.phoneE164 || id);
  }

  await loadPublicPayments(id);

  return data;
}

/* =====================================================
   21. LOAD PEMBAYARAN PUBLIK
   ===================================================== */

async function loadPublicPayments(id) {
  const container = $("publicPayments");
  if (!container) return;

  container.innerHTML = "";

  const snapshot = await getDocs(
    collection(db, "stores", id, "payment_methods")
  );

  const methods = snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.active !== false)
    .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));

  methods.forEach(item => {
    const card = document.createElement("div");

    card.style.cssText = `
      padding:15px;
      margin:10px 0;
      border-radius:12px;
      background:white;
      border:1px solid #ddd;
    `;

    const title = document.createElement("strong");
    title.textContent = item.title || "Pembayaran";
    card.appendChild(title);

    if (item.type === "qris" && item.payload && window.QRCode) {
      const qr = document.createElement("div");
      qr.style.marginTop = "12px";
      card.appendChild(qr);

      new QRCode(qr, {
        text: item.payload,
        width: 210,
        height: 210
      });

      const info = document.createElement("p");
      info.textContent = "Scan QRIS menggunakan aplikasi bank atau e-wallet.";
      card.appendChild(info);
    } else if (item.url && /^https?:\/\//i.test(item.url)) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Buka pembayaran";
      link.style.display = "block";
      link.style.marginTop = "12px";
      card.appendChild(link);
    }

    container.appendChild(card);
  });
}

/* =====================================================
   22. OCR NOMOR HP DARI FOTO
   ===================================================== */

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return window.Tesseract;
}

async function scanPhoneFromImage(file) {
  try {
    message($("loginMessage"), "Membaca nomor HP dari gambar...");

    const Tesseract = await loadTesseract();

    const result = await Tesseract.recognize(file, "eng");
    const text = result.data.text || "";

    console.log("OCR:", text);

    const matches = text.match(/(?:\+?62|0)?[\s().-]*8(?:[\s().-]*\d){7,12}/g);

    if (!matches || !matches.length) {
      throw new Error("Nomor HP tidak ditemukan. Coba foto lebih jelas.");
    }

    const phone = normalizePhone(matches[0]);

    await findStoreByPhone(phone);
  } catch (error) {
    console.error(error);
    alert(error.message || "Gagal membaca nomor HP.");
  }
}

/* =====================================================
   23. KAMERA UNTUK OCR NOMOR HP
   ===================================================== */

async function startPhoneCamera() {
  const section = $("scannerSection");
  if (!section) return;

  show(section, true);

  section.innerHTML = `
    <h3>Scan Nomer HP</h3>
    <p>Arahkan kamera ke kartu digital SCANNOMER.</p>
    <video id="phoneCamera" autoplay playsinline
      style="width:100%;border-radius:15px;"></video>
    <button id="capturePhone">Ambil Foto</button>
    <button id="closePhoneCamera">Tutup Kamera</button>
    <canvas id="phoneCanvas" style="display:none;"></canvas>
  `;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    $("phoneCamera").srcObject = cameraStream;

    $("capturePhone").onclick = async () => {
      const video = $("phoneCamera");
      const canvas = $("phoneCanvas");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      canvas.getContext("2d").drawImage(video, 0, 0);

      canvas.toBlob(async blob => {
        await stopPhoneCamera();
        await scanPhoneFromImage(blob);
      }, "image/jpeg", 0.95);
    };

    $("closePhoneCamera").onclick = stopPhoneCamera;
  } catch (error) {
    console.error(error);
    alert("Tidak dapat membuka kamera: " + error.message);
  }
}

async function stopPhoneCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  show($("scannerSection"), false);
}

/* =====================================================
   24. TAMBAHKAN KONTROL UPLOAD SMART QR DAN OCR
   ===================================================== */

function installExtraControls() {
  // Upload QR pembayaran
  if ($("paymentList") && !$("paymentQRUpload")) {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "paymentQRUpload";
    input.accept = "image/*";
    input.style.display = "block";
    input.style.margin = "12px 0";

    const label = document.createElement("label");
    label.textContent = "Upload Foto QRIS / QR Pembayaran";
    label.style.display = "block";
    label.style.fontWeight = "bold";
    label.style.marginTop = "15px";

    input.onchange = event => {
      const file = event.target.files?.[0];
      if (file) uploadPaymentQR(file);
      input.value = "";
    };

    $("paymentList").parentElement.insertBefore(
      label,
      $("paymentList")
    );

    $("paymentList").parentElement.insertBefore(
      input,
      $("paymentList")
    );
  }

  // Upload foto nomor HP
  if ($("scanButton") && !$("phoneImageUpload")) {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "phoneImageUpload";
    input.accept = "image/*";
    input.style.display = "none";

    input.onchange = event => {
      const file = event.target.files?.[0];
      if (file) scanPhoneFromImage(file);
      input.value = "";
    };

    document.body.appendChild(input);

    const uploadButton = document.createElement("button");
    uploadButton.textContent = "Scan dari Galeri";
    uploadButton.type = "button";
    uploadButton.onclick = () => input.click();

    $("scanButton").insertAdjacentElement("afterend", uploadButton);

    const cameraButton = document.createElement("button");
    cameraButton.textContent = "Scan Nomer HP dengan Kamera";
    cameraButton.type = "button";
    cameraButton.onclick = startPhoneCamera;

    uploadButton.insertAdjacentElement("afterend", cameraButton);
  }
}

/* =====================================================
   25. EVENT LISTENERS
   ===================================================== */

function bind(id, event, callback) {
  const element = $(id);
  if (element) element.addEventListener(event, callback);
}

bind("loginButton", "click", openLogin);
bind("closeLogin", "click", closeLogin);
bind("sendOtp", "click", sendOTP);
bind("verifyOtp", "click", verifyOTP);
bind("saveStore", "click", saveStore);
bind("addPayment", "click", addManualPayment);
bind("downloadQr", "click", downloadCard);

bind("logoutButton", "click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert(error.message);
  }
});

bind("backHome", "click", () => {
  show($("storeResult"), false);
  show($("home"), true);
});

bind("scanButton", "click", startPhoneCamera);

bind("stopScan", "click", stopPhoneCamera);

/* =====================================================
   26. INIT
   ===================================================== */

document.addEventListener("DOMContentLoaded", () => {
  installExtraControls();

  show($("otpArea"), false);
  show($("dashboard"), false);
  show($("storeResult"), false);

  // Kartu digital tidak boleh menampilkan QR identitas.
  if ($("storeQr")) {
    $("storeQr").innerHTML = "";
    $("storeQr").style.display = "none";
  }

  console.log("SCANNOMER Smart QR siap dijalankan.");
});

