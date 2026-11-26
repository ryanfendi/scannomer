
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

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
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

// ==================================
// 1. FIREBASE CONFIGURATION
// ==================================

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

// ==================================
// 2. ELEMENTS
// ==================================

const $ = id => document.getElementById(id);

let confirmationResult = null;
let recaptchaVerifier = null;
let scanner = null;
let currentStoreId = null;

// ==================================
// 3. SCREEN MANAGEMENT
// ==================================

const sections = [
  "home",
  "scannerSection",
  "loginSection",
  "dashboard",
  "storeResult"
];

function showScreen(id) {
  sections.forEach(section => {
    $(section).classList.toggle("hidden", section !== id);
  });
}

$("scanButton").onclick = () => {
  showScreen("scannerSection");
  startScanner();
};

$("loginButton").onclick = () => {
  showScreen("loginSection");
};

$("closeLogin").onclick = () => showScreen("home");
$("backHome").onclick = () => showScreen("home");

// ==================================
// 4. PHONE OTP LOGIN
// ==================================

function setupRecaptcha() {
  if (recaptchaVerifier) return;

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "recaptcha-container",
    {
      size: "normal",
      callback: () => {
        $("loginMessage").textContent = "Verifikasi keamanan berhasil.";
      },
      "expired-callback": () => {
        $("loginMessage").textContent = "Captcha kedaluwarsa. Muat ulang halaman.";
      }
    }
  );
}

$("sendOtp").onclick = async () => {
  try {
    const phone = $("phoneInput").value.trim();

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      alert("Gunakan format internasional. Contoh: +6281234567890");
      return;
    }

    $("loginMessage").textContent = "Menyiapkan verifikasi...";

    setupRecaptcha();

    const verifier = recaptchaVerifier;
    await verifier.render();

    confirmationResult = await signInWithPhoneNumber(
      auth,
      phone,
      verifier
    );

    $("otpArea").classList.remove("hidden");
    $("loginMessage").textContent = "OTP berhasil dikirim. Masukkan kode.";

  } catch (error) {
    console.error(error);
    $("loginMessage").textContent = "Gagal: " + error.message;

    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }
  }
};

$("verifyOtp").onclick = async () => {
  try {
    const code = $("otpInput").value.trim();

    if (!confirmationResult || !code) {
      alert("Masukkan kode OTP terlebih dahulu.");
      return;
    }

    await confirmationResult.confirm(code);

    $("loginMessage").textContent = "Login berhasil.";

  } catch (error) {
    console.error(error);
    $("loginMessage").textContent = "OTP salah atau kedaluwarsa.";
  }
};

// ==================================
// 5. AUTH STATE
// ==================================

onAuthStateChanged(auth, async user => {
  if (user) {
    $("ownerInfo").textContent =
      "Nomor HP terverifikasi: " + user.phoneNumber;

    showScreen("dashboard");

    await loadStore();
  } else {
    showScreen("home");
  }
});

// ==================================
// 6. STORE PROFILE
// ==================================

function storeDocumentId(phone) {
  return phone.replace(/\D/g, "");
}

async function loadStore() {
  const user = auth.currentUser;
  if (!user || !user.phoneNumber) return;

  currentStoreId = storeDocumentId(user.phoneNumber);

  const ref = doc(db, "stores", currentStoreId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();

    if (data.ownerUid !== user.uid) {
      alert("Nomor toko ini sudah digunakan akun lain.");
      await signOut(auth);
      return;
    }

    $("storeName").value = data.name || "";
    $("storeAddress").value = data.address || "";
  }

  renderStoreQr();
  await loadPayments();
}


$("saveStore").onclick = async () => {
  try {
    const user = auth.currentUser;

    if (!user) {
      alert("Silakan login terlebih dahulu.");
      return;
    }

    if (!user.phoneNumber) {
      alert("Nomor HP belum terverifikasi.");
      return;
    }

    const name = $("storeName").value.trim();
    const address = $("storeAddress").value.trim();

    if (!name || !address) {
      alert("Nama dan alamat toko wajib diisi.");
      return;
    }

    currentStoreId = user.phoneNumber.replace(/\D/g, "");

    const ref = doc(db, "stores", currentStoreId);

    // Periksa dokumen toko
    const old = await getDoc(ref);

    if (old.exists()) {
      if (old.data().ownerUid !== user.uid) {
        alert("Nomor toko sudah dimiliki akun lain.");
        return;
      }
    }

    // Simpan profil toko
    await setDoc(ref, {
      ownerUid: user.uid,
      phoneE164: user.phoneNumber,
      name: name,
      address: address,
      published: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Pastikan data berhasil tersimpan
    const verify = await getDoc(ref);

    if (!verify.exists()) {
      throw new Error("Dokumen toko belum berhasil dibuat.");
    }

    renderStoreQr();

    alert("BERHASIL! Profil toko SCANNOMER tersimpan.");

  } catch (error) {
    console.error("SCANNOMER SAVE ERROR:", error);

    alert(
      "Gagal menyimpan profil toko.\n\n" +
      "Kode: " + (error.code || "unknown") +
      "\nPesan: " + error.message
    );
  }
};



// ==================================
// 7. SCANNOMER BUSINESS CARD
// ==================================

function renderStoreQr() {
  const user = auth.currentUser;

  if (!user || !user.phoneNumber || !currentStoreId) {
    return;
  }

  const name = $("storeName").value.trim() || "NAMA TOKO";
  const address = $("storeAddress").value.trim() || "Alamat toko";

  $("cardShopName").textContent = name;
  $("cardAddress").textContent = address;
  $("cardPhone").textContent = user.phoneNumber;

  const qrContainer = $("storeQr");
  qrContainer.innerHTML = "";

  // QR berisi nomor HP toko tanpa tanda +
  const phoneQR = currentStoreId;

  new QRCode(qrContainer, {
    text: phoneQR,
    width: 180,
    height: 180,
    correctLevel: QRCode.CorrectLevel.H
  });
}

// ==================================
// 8. BUSINESS CARD DESIGN
// ==================================

function updateBusinessCard() {
  const card = $("storeCard");

  const design = $("cardDesign").value;
  const primary = $("cardColor").value;
  const background = $("cardBgColor").value;

  card.dataset.design = design;

  card.style.setProperty(
    "--card-primary",
    primary
  );

  card.style.setProperty(
    "--card-background",
    background
  );

  renderStoreQr();
}

$("cardDesign").onchange = updateBusinessCard;
$("cardColor").oninput = updateBusinessCard;
$("cardBgColor").oninput = updateBusinessCard;

$("storeName").addEventListener("input", renderStoreQr);
$("storeAddress").addEventListener("input", renderStoreQr);

// ==================================
// 9. DOWNLOAD BUSINESS CARD
// ==================================

$("downloadQr").onclick = async () => {
  try {
    if (!currentStoreId) {
      alert("Simpan profil toko terlebih dahulu.");
      return;
    }

    const canvas = await html2canvas(
      $("storeCard"),
      {
        scale: 3,
        backgroundColor: null,
        useCORS: true
      }
    );

    const link = document.createElement("a");

    link.download =
      "SCANNOMER-" +
      currentStoreId +
      ".png";

    link.href = canvas.toDataURL("image/png");

    link.click();

  } catch (error) {
    console.error(error);
    alert("Gagal mengunduh kartu: " + error.message);
  }
};

// ==================================
// 10. PRINT BUSINESS CARD
// ==================================

$("printCard").onclick = () => {
  if (!currentStoreId) {
    alert("Simpan profil toko terlebih dahulu.");
    return;
  }

  window.print();
};

// ==================================
// 11. SCANNOMER BUSINESS CARD INIT
// ==================================

$("cardDesign").value = "purple";
updateBusinessCard();

// ==================================
// 8. ADD PAYMENT METHODS
// ==================================

$("addPayment").onclick = async () => {
  try {
    const user = auth.currentUser;

    if (!user || !currentStoreId) return;

    const title = $("paymentTitle").value.trim();
    const type = $("paymentType").value;
    const url = $("paymentUrl").value.trim();

    if (!title || !url) {
      alert("Nama dan link wajib diisi.");
      return;
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch {
      alert("Link tidak valid.");
      return;
    }

    if (parsedUrl.protocol !== "https:") {
      alert("Gunakan link HTTPS.");
      return;
    }

    const storeRef = doc(db, "stores", currentStoreId);
    const storeSnap = await getDoc(storeRef);

    if (!storeSnap.exists() ||
        storeSnap.data().ownerUid !== user.uid) {
      alert("Simpan profil toko terlebih dahulu.");
      return;
    }

    await addDoc(
      collection(db, "stores", currentStoreId, "payment_methods"),
      {
        ownerUid: user.uid,
        title,
        type,
        url,
        active: true,
        createdAt: serverTimestamp()
      }
    );

    $("paymentTitle").value = "";
    $("paymentUrl").value = "";

    await loadPayments();

    alert("Pembayaran berhasil ditambahkan!");

  } catch (error) {
    console.error(error);
    alert("Gagal menambahkan: " + error.message);
  }
};

// ==================================
// 9. LOAD PAYMENT METHODS
// ==================================

async function loadPayments() {
  if (!currentStoreId) return;

  const ref = collection(
    db,
    "stores",
    currentStoreId,
    "payment_methods"
  );

  const snapshot = await getDocs(ref);

  $("paymentList").innerHTML = "";

  snapshot.forEach(item => {
    const data = item.data();

    if (data.ownerUid !== auth.currentUser?.uid) return;

    const box = document.createElement("div");
    box.className = "result";

    const title = document.createElement("strong");
    title.textContent = data.title;

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = data.type + " - " + data.url;

    const remove = document.createElement("button");
    remove.textContent = "HAPUS";
    remove.style.background = "#dc2626";

    remove.onclick = async () => {
      if (!confirm("Hapus pembayaran ini?")) return;

      await deleteDoc(item.ref);
      await loadPayments();
    };

    box.append(title, detail, remove);
    $("paymentList").appendChild(box);
  });
}

// ==================================
// 10. QR SCANNER
// ==================================

async function startScanner() {
  try {
    if (scanner) return;

    scanner = new Html5Qrcode("reader");

    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 230, height: 230 } },
      async decodedText => {
        await scanner.stop();
        scanner.clear();
        scanner = null;

        let storeId = decodedText.trim();

        if (storeId.startsWith("SCANNOMER:")) {
          storeId = storeId.replace("SCANNOMER:", "");
        } else {
          storeId = storeId.replace(/\D/g, "");
        }

        await findStore(storeId);
      },
      () => {}
    );

  } catch (error) {
    scanner = null;
    alert("Kamera tidak dapat dibuka: " + error);
  }
}

$("stopScan").onclick = async () => {
  if (scanner) {
    await scanner.stop();
    scanner.clear();
    scanner = null;
  }

  showScreen("home");
};

// ==================================
// 11. PUBLIC STORE SEARCH
// ==================================

async function findStore(storeId) {
  try {
    const ref = doc(db, "stores", storeId);
    const snap = await getDoc(ref);

    if (!snap.exists() || !snap.data().published) {
      alert("Toko tidak ditemukan atau belum dipublikasikan.");
      showScreen("home");
      return;
    }

    const store = snap.data();

    $("resultStoreName").textContent = store.name;
    $("resultStorePhone").textContent = store.phoneE164 || "";

    const list = $("publicPayments");
    list.innerHTML = "";

    const methods = await getDocs(
      collection(db, "stores", storeId, "payment_methods")
    );

    methods.forEach(item => {
      const data = item.data();

      if (data.active !== true) return;

      const box = document.createElement("div");
      box.className = "result";

      const title = document.createElement("h3");
      title.textContent = data.title;

      box.appendChild(title);

      if (data.type === "qris") {
        const image = document.createElement("img");
        image.src = data.url;
        image.alt = "QRIS " + data.title;
        image.style.width = "100%";
        image.style.maxWidth = "300px";
        image.style.display = "block";
        image.style.margin = "15px auto";
        image.onerror = () => {
          image.alt = "Gambar QRIS tidak dapat ditampilkan";
        };
        box.appendChild(image);
      }

      const link = document.createElement("a");
      link.href = data.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = data.type === "qris"
        ? "BUKA QRIS"
        : "BUKA " + data.title.toUpperCase();

      link.style.display = "block";
      link.style.padding = "14px";
      link.style.background = "#7028df";
      link.style.color = "white";
      link.style.textAlign = "center";
      link.style.borderRadius = "10px";
      link.style.marginTop = "10px";

      box.appendChild(link);
      list.appendChild(box);
    });

    if (!list.children.length) {
      list.textContent = "Toko belum menambahkan metode pembayaran.";
    }

    showScreen("storeResult");

  } catch (error) {
    console.error(error);
    alert("Gagal mencari toko: " + error.message);
  }
}

// ==================================
// 12. LOGOUT
// ==================================

$("logoutButton").onclick = async () => {
  await signOut(auth);
  alert("Berhasil logout.");
};

showScreen("home");

console.log("SCANNOMER berhasil dimuat.");
