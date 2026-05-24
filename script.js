import { db, auth } from "./firebase.js";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  where,
  Timestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

let PRODUCTS = [];
let currentUser = null;
let currentRole = "kasir";
let currentDisplayName = "-";
let lastReceipt = null;
let pendingPaymentMethod = null;

const state = {
  cart: [],
  subtotal: 0,
  discount: 0,
  ppn: 0,
  total: 0
};

const PPN_RATE = 0.11;
const DISCOUNT_MIN = 100000;
const DISCOUNT_RATE = 0.10;

const METHOD_LABELS = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  ewallet: "E-Wallet"
};

const METHOD_ICONS = {
  cash: '<i class="fa-solid fa-money-bill-wave"></i>',
  qris: '<i class="fa-solid fa-qrcode"></i>',
  transfer: '<i class="fa-solid fa-building-columns"></i>',
  ewallet: '<i class="fa-solid fa-wallet"></i>'
};

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  applySavedTheme();
  startClock();
  initBarcodeInput();
  initImagePreview();
  initDefaultReportDate();

  await loadProducts();
  await loadHistory();
});

window.setCurrentUserData = function (user, role, displayName) {
  currentUser = user;
  currentRole = role || "kasir";
  currentDisplayName = displayName || user?.email || "-";

  renderAdminProductTable(PRODUCTS);
};

/* =========================
   THEME / DARK MODE
========================= */
function applySavedTheme() {
  const theme = localStorage.getItem("ks-theme") || "light";
  document.documentElement.setAttribute("data-theme", theme);

  const toggle = document.getElementById("darkModeToggle");
  if (toggle) {
    toggle.innerHTML = theme === "dark"
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }

  const brandLogo = document.querySelector(".brand-logo.small img");

  if (brandLogo) {
    brandLogo.src =
      theme === "dark"
        ? "images/tc-logo-dark.png"
        : "images/tc-logo-light.png";
  }
}

window.toggleDarkMode = function () {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";

  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("ks-theme", next);

  const toggle = document.getElementById("darkModeToggle");

  if (toggle) {
    toggle.innerHTML = next === "dark"
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }

  const brandLogo = document.querySelector(".brand-logo.small img");

  if (brandLogo) {
    brandLogo.src =
      next === "dark"
        ? "images/tc-logo-dark.png"
        : "images/tc-logo-light.png";
  }
};

/* =========================
   PRODUCTS
========================= */
async function loadProducts() {
  const productGrid = document.getElementById("productGrid");
  const productTable = document.getElementById("productTable");
  const adminProductTable = document.getElementById("adminProductTable");

  try {
    const q = query(collection(db, "products"), orderBy("name"));
    const snapshot = await getDocs(q);

    PRODUCTS = snapshot.docs.map(d => ({
      firestoreId: d.id,
      barcode: d.data().barcode || "",
      name: d.data().name || "-",
      category: d.data().category || "-",
      price: Number(d.data().price || 0),
      stock: Number(d.data().stock || 0),
      imageUrl: d.data().imageUrl || ""
    }));

    renderProducts(PRODUCTS);
    renderProductTable(PRODUCTS);
    renderAdminProductTable(PRODUCTS);
  } catch (err) {
    console.error(err);
    if (productGrid) productGrid.innerHTML = `<p class="empty">Gagal memuat produk dari Firebase.</p>`;
    if (productTable) productTable.innerHTML = `<p class="empty">Gagal memuat data produk.</p>`;
    if (adminProductTable) adminProductTable.innerHTML = `<p class="empty">Gagal memuat data admin produk.</p>`;
  }
}

function renderProducts(products) {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  if (!products.length) {
    grid.innerHTML = `<p class="empty">Produk belum tersedia.</p>`;
    return;
  }

  grid.innerHTML = products.map(product => `
    <button class="product-card ${product.stock <= 0 ? "disabled" : ""}" onclick="addToCart('${product.firestoreId}')">
      ${product.imageUrl
        ? `<img class="product-img" src="${escapeAttr(product.imageUrl)}" alt="${escapeAttr(product.name)}">`
        : `<div class="product-img-placeholder">${escapeHtml(product.name.charAt(0).toUpperCase())}</div>`
      }
      <div class="product-name">${escapeHtml(product.name)}</div>
      <div class="product-category">${escapeHtml(product.category)}</div>
      <div class="product-price">${formatRp(product.price)}</div>
      <div class="product-stock">${product.stock > 0 ? `Stok ${product.stock}` : "Stok habis"}</div>
      <div class="product-stock">Barcode: ${escapeHtml(product.barcode || "-")}</div>

      ${product.barcode ? `
        <div class="product-barcode-wrap">
          <svg id="product-barcode-${product.firestoreId}"></svg>
        </div>
      ` : ""}
    </button>
  `).join("");

  setTimeout(() => {
    products.forEach(p => {
      if (p.barcode && window.JsBarcode) {
        try {
          JsBarcode(`#product-barcode-${p.firestoreId}`, String(p.barcode), {
            format: "CODE128",
            width: 1.3,
            height: 35,
            displayValue: false,
            margin: 3
          });
        } catch (err) {
          console.error("Barcode produk gagal:", err);
        }
      }
    });
  }, 100);
}

function renderProductTable(products) {
  const table = document.getElementById("productTable");
  if (!table) return;

  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Barcode</th>
          <th>Nama Produk</th>
          <th>Kategori</th>
          <th>Harga</th>
          <th>Stok</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${products.map(p => `
          <tr>
            <td>${escapeHtml(p.barcode || "-")}</td>
            <td><b>${escapeHtml(p.name)}</b></td>
            <td>${escapeHtml(p.category)}</td>
            <td>${formatRp(p.price)}</td>
            <td>${p.stock}</td>
            <td>
              <span class="badge ${p.stock > 0 ? "badge-success" : "badge-danger"}">
                ${p.stock > 0 ? "Tersedia" : "Habis"}
              </span>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAdminProductTable(products) {
  const table = document.getElementById("adminProductTable");
  if (!table) return;

  if (currentRole !== "admin") {
    table.innerHTML = `<p class="empty">Hanya admin yang dapat mengelola produk.</p>`;
    return;
  }

  if (!products.length) {
    table.innerHTML = `<p class="empty">Produk belum tersedia.</p>`;
    return;
  }

  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Barcode</th>
          <th>Gambar</th>
          <th>Nama</th>
          <th>Kategori</th>
          <th>Harga</th>
          <th>Stok</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${products.map(p => `
          <tr>
            <td>
              <b>${escapeHtml(p.barcode || "-")}</b>
              <br>
              <svg id="barcode-${p.firestoreId}"></svg>
            </td>
            <td>
              ${p.imageUrl
                ? `<img src="${escapeAttr(p.imageUrl)}" alt="${escapeAttr(p.name)}" style="width:48px;height:48px;object-fit:cover;border-radius:8px">`
                : "-"
              }
            </td>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.category)}</td>
            <td>${formatRp(p.price)}</td>
            <td>${p.stock}</td>
            <td>
              <button class="btn btn-secondary" onclick="editProduct('${p.firestoreId}')">Edit</button>
              <button class="btn btn-danger" onclick="deleteProduct('${p.firestoreId}')">Hapus</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  setTimeout(() => {
    products.forEach(p => {
      if (p.barcode && window.JsBarcode) {
        try {
          JsBarcode(`#barcode-${p.firestoreId}`, String(p.barcode), {
            format: "CODE128",
            width: 2,
            height: 40,
            displayValue: true,
            fontSize: 12,
            margin: 5
          });
        } catch (err) {
          console.error("Barcode gagal dibuat:", err);
        }
      }
    });
  }, 100);
}

window.filterProducts = function (keyword) {
  const q = String(keyword || "").toLowerCase();

  const filtered = PRODUCTS.filter(product =>
    product.name.toLowerCase().includes(q) ||
    product.category.toLowerCase().includes(q) ||
    String(product.barcode || "").toLowerCase().includes(q)
  );

  renderProducts(filtered);
};

window.addByBarcode = function () {
  const input = document.getElementById("barcodeInput");
  const barcode = input?.value.trim().toLowerCase();

  if (!barcode) {
    showToast("Masukkan barcode produk.", "info");
    return;
  }

  const product = PRODUCTS.find(p => String(p.barcode || "").toLowerCase() === barcode);

  if (!product) {
    showToast("Produk dengan barcode tersebut tidak ditemukan.", "error");
    return;
  }

  addToCart(product.firestoreId);
  input.value = "";
};

function initBarcodeInput() {
  const barcodeInput = document.getElementById("barcodeInput");
  if (!barcodeInput) return;

  barcodeInput.addEventListener("keydown", e => {
    if (e.key === "Enter") addByBarcode();
  });
}

/* =========================
   CART
========================= */
window.addToCart = function (firestoreId) {
  const product = PRODUCTS.find(p => p.firestoreId === firestoreId);

  if (!product || product.stock <= 0) {
    showToast("Produk tidak tersedia.", "error");
    return;
  }

  const existing = state.cart.find(item => item.firestoreId === product.firestoreId);

  if (existing) {
    if (existing.qty >= product.stock) {
      showToast("Jumlah produk melebihi stok.", "error");
      return;
    }

    existing.qty++;
  } else {
    state.cart.push({ ...product, qty: 1 });
  }

  renderCart();
  calculateTotal();
};

window.updateQty = function (firestoreId, change) {
  const item = state.cart.find(i => i.firestoreId === firestoreId);
  if (!item) return;

  if (change > 0 && item.qty >= item.stock) {
    showToast("Stok tidak cukup.", "error");
    return;
  }

  item.qty += change;

  if (item.qty <= 0) {
    removeCartItem(firestoreId);
    return;
  }

  renderCart();
  calculateTotal();
};

window.removeCartItem = function (firestoreId) {
  state.cart = state.cart.filter(item => item.firestoreId !== firestoreId);
  renderCart();
  calculateTotal();
};

window.clearCart = function () {
  state.cart = [];
  renderCart();
  calculateTotal();

  const cashInput = document.getElementById("cashInput");
  if (cashInput) cashInput.value = "";

  setText("changeEl", "Rp 0");
};

function renderCart() {
  const cartList = document.getElementById("cartList");
  if (!cartList) return;

  if (!state.cart.length) {
    cartList.innerHTML = `<p class="empty">Keranjang masih kosong.</p>`;
    return;
  }

  cartList.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <div class="cart-top">
        <div>
          <div class="cart-title">${escapeHtml(item.name)}</div>
          <div class="cart-price">${formatRp(item.price)} / item</div>
        </div>
        <button class="remove" onclick="removeCartItem('${item.firestoreId}')">Hapus</button>
      </div>

      <div class="cart-bottom">
        <div class="qty">
          <button onclick="updateQty('${item.firestoreId}', -1)">−</button>
          <b>${item.qty}</b>
          <button onclick="updateQty('${item.firestoreId}', 1)">+</button>
        </div>
        <b>${formatRp(item.price * item.qty)}</b>
      </div>
    </div>
  `).join("");
}

function calculateTotal() {
  state.subtotal = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  state.discount = state.subtotal >= DISCOUNT_MIN ? state.subtotal * DISCOUNT_RATE : 0;

  const afterDiscount = state.subtotal - state.discount;
  state.ppn = afterDiscount * PPN_RATE;
  state.total = afterDiscount + state.ppn;

  setText("subtotalEl", formatRp(state.subtotal));
  setText("discountEl", `- ${formatRp(state.discount)}`);
  setText("ppnEl", `+ ${formatRp(state.ppn)}`);
  setText("grandTotalEl", formatRp(state.total));

  calcChange();
}

window.setQuickAmount = function (amount) {
  const cashInput = document.getElementById("cashInput");
  if (!cashInput) return;

  cashInput.value = amount > 0 ? amount : "";
  calcChange();
};

window.calcChange = function () {
  const paid = Number(document.getElementById("cashInput")?.value || 0);
  const change = paid - state.total;

  if (paid > 0 && change >= 0) {
    setText("changeEl", formatRp(change));
  } else if (paid > 0 && change < 0) {
    setText("changeEl", `Kurang ${formatRp(Math.abs(change))}`);
  } else {
    setText("changeEl", "Rp 0");
  }
};

/* =========================
   PAYMENT
========================= */
window.processPayment = async function (method) {
  if (!state.cart.length) {
    showToast("Keranjang masih kosong.", "error");
    return;
  }

  if (method === "cash") {
    const paid = Number(document.getElementById("cashInput")?.value || 0);

    if (paid < state.total) {
      showToast("Uang bayar kurang.", "error");
      return;
    }

    await saveTransaction(method, paid, paid - state.total);
    return;
  }

  openPaymentConfirm(method);
};

function openPaymentConfirm(method) {
  pendingPaymentMethod = method;

  document.getElementById("confirmIcon").innerHTML =
    METHOD_ICONS[method] || '<i class="fa-solid fa-qrcode"></i>';
  setText("confirmMethodLabel", METHOD_LABELS[method] || method.toUpperCase());
  setText("confirmAmount", formatRp(state.total));

  const qrisImage = document.getElementById("qrisImage");
  if (qrisImage) {
    qrisImage.style.display = method === "qris" ? "block" : "none";
  }

  const modal = document.getElementById("paymentConfirmModal");
  if (modal) modal.classList.add("show");
}

window.closePaymentConfirm = function () {
  pendingPaymentMethod = null;
  const modal = document.getElementById("paymentConfirmModal");
  if (modal) modal.classList.remove("show");
};

window.confirmPayment = async function () {
  if (!pendingPaymentMethod) {
    showToast("Metode pembayaran tidak valid.", "error");
    return;
  }

  const method = pendingPaymentMethod;
  closePaymentConfirm();

  await saveTransaction(method, state.total, 0);
};

async function saveTransaction(method, paid, change) {
  const transaction = {
    cashierUid: currentUser?.uid || null,
    cashierEmail: currentUser?.email || null,
    cashierName: currentDisplayName || "-",
    cashierRole: currentRole,
    items: state.cart.map(item => ({
      productId: item.firestoreId,
      barcode: item.barcode || "",
      name: item.name,
      price: Math.round(item.price),
      qty: item.qty,
      subtotal: Math.round(item.price * item.qty)
    })),
    subtotal: Math.round(state.subtotal),
    discount: Math.round(state.discount),
    ppn: Math.round(state.ppn),
    total: Math.round(state.total),
    paid: Math.round(paid),
    change: Math.round(change),
    method,
    createdAt: serverTimestamp()
  };

  try {
    const transactionRef = await addDoc(collection(db, "transactions"), transaction);

    const batch = writeBatch(db);
    state.cart.forEach(item => {
      batch.update(doc(db, "products", item.firestoreId), {
        stock: item.stock - item.qty
      });
    });
    await batch.commit();

    lastReceipt = {
      id: transactionRef.id,
      ...transaction,
      createdAtLocal: new Date()
    };

    showReceipt(lastReceipt);
    showToast("Transaksi berhasil disimpan.", "success");

    clearCart();
    await loadProducts();
    await loadHistory();
  } catch (err) {
    console.error(err);
    showToast("Transaksi gagal disimpan.", "error");
  }
}

/* =========================
   RECEIPT
========================= */
function showReceipt(transaction) {
  const receiptArea = document.getElementById("receiptArea");
  const modal = document.getElementById("receiptModal");
  if (!receiptArea || !modal) return;

  receiptArea.innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <div class="receipt-brand">
        <img 
          src="${
            document.documentElement.getAttribute('data-theme') === 'dark'
              ? 'images/tc-logo-dark.png'
              : 'images/tc-logo-light.png'
          }"
          alt="TannCave Logo"
        >
          <h2>TannCave</h2>
          <p>Point of Sale</p>
        </div>
      </div>

      <hr>

      <div class="receipt-meta">
        <div><span>ID</span>: ${escapeHtml(transaction.id.slice(0, 8))}</div>
        <div><span>Tanggal</span>: ${transaction.createdAtLocal.toLocaleString("id-ID")}</div>
        <div><span>Kasir</span>: ${escapeHtml(transaction.cashierName || transaction.cashierEmail || "-")}</div>
        <div><span>Metode</span>: ${escapeHtml(METHOD_LABELS[transaction.method] || transaction.method)}</div>
      </div>

      <hr>

      <div class="receipt-items">
        ${transaction.items.map(item => `
          <div class="receipt-row">
            <span>${escapeHtml(item.name)} x${item.qty}</span>
            <b>${formatRp(item.subtotal)}</b>
          </div>
        `).join("")}
      </div>

      <hr>

      <div class="receipt-row">
        <span>Subtotal</span>
        <b>${formatRp(transaction.subtotal)}</b>
      </div>

      <div class="receipt-row">
        <span>Diskon</span>
        <b>- ${formatRp(transaction.discount)}</b>
      </div>

      <div class="receipt-row">
        <span>PPN 11%</span>
        <b>+ ${formatRp(transaction.ppn)}</b>
      </div>

      <div class="receipt-row total">
        <span>Total</span>
        <b>${formatRp(transaction.total)}</b>
      </div>

      <div class="receipt-row">
        <span>Bayar</span>
        <b>${formatRp(transaction.paid)}</b>
      </div>

      <div class="receipt-row change">
        <span>Kembalian</span>
        <b>${formatRp(transaction.change)}</b>
      </div>

      <hr>

      <div class="receipt-barcode">
        <svg id="receiptBarcode"></svg>
        <p>${escapeHtml(transaction.id.slice(0, 12))}</p>
      </div>

      <div class="receipt-footer">
        <p class="thanks">Terima kasih sudah berbelanja.</p>
        <p>TannCave — Simpan struk ini sebagai bukti transaksi.</p>
      </div>
    </div>
  `;

  modal.classList.add("show");
  setTimeout(() => {
    if (window.JsBarcode) {
      JsBarcode("#receiptBarcode", transaction.id.slice(0, 12), {
        format: "CODE128",
        width: 1.5,
        height: 45,
        displayValue: false,
        margin: 4
      });
    }
  }, 100);
}

window.closeReceipt = function () {
  document.getElementById("receiptModal")?.classList.remove("show");
};

window.printReceipt = function () {
  const receiptContent = document.getElementById("receiptArea")?.innerHTML || "";

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Popup cetak diblokir browser.", "error");
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Cetak Struk</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .receipt { width: 280px; margin: auto; font-family: 'Courier New', monospace; }
          .receipt-header, .receipt-footer { text-align: center; }
          h2, p { margin: 4px 0; }
          hr { border: none; border-top: 1px dashed #000; margin: 10px 0; }
          .receipt-meta { font-size: 12px; line-height: 1.8; }
          .receipt-meta span { display: inline-block; min-width: 70px; }
          .receipt-row { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; margin: 6px 0; }
          .total { font-size: 16px; font-weight: bold; }
          .thanks { margin-top: 12px; font-weight: bold; }

          .receipt-brand {
            text-align: center;
            margin-bottom: 12px;
          }

          .receipt-brand img {
            width: 52px;
            height: 52px;
            object-fit: contain;
            margin: 0 auto 10px;
          }

          .receipt-brand h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 800;
          }

          .receipt-brand p {
            margin-top: 3px;
            font-size: 11px;
            color: #555;
          }
        </style>
      </head>
      <body>
        ${receiptContent}
        <script>
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
};

/* =========================
   ADMIN PRODUCT CRUD
========================= */
window.saveProduct = async function () {
  console.log("Tombol simpan diklik");

  if (currentRole !== "admin") {
    showToast("Hanya admin yang dapat menyimpan produk.", "error");
    return;
  }

  const productDocId = document.getElementById("productDocId")?.value || "";
  let barcode = document.getElementById("productBarcode")?.value.trim() || "";
  const name = document.getElementById("productName")?.value.trim() || "";
  const category = document.getElementById("productCategory")?.value.trim() || "";
  const price = Number(document.getElementById("productPrice")?.value || 0);
  const stock = Number(document.getElementById("productStock")?.value || 0);
  const imageUrl = document.getElementById("productImage")?.value.trim() || "";

  if (!barcode) {
    barcode = "PRD-" + Date.now();
  }

  if (!name || !category || price <= 0 || stock < 0) {
    showToast("Data produk belum valid.", "error");
    return;
  }

  const duplicate = PRODUCTS.find(p =>
    String(p.barcode || "").toLowerCase() === barcode.toLowerCase() &&
    p.firestoreId !== productDocId
  );

  if (duplicate) {
    showToast("Barcode sudah digunakan produk lain.", "error");
    return;
  }

  const oldProduct = PRODUCTS.find(p => p.firestoreId === productDocId);

  const productData = {
    barcode,
    name,
    category,
    price,
    stock,
    imageUrl: imageUrl || oldProduct?.imageUrl || ""
  };

  try {

    if (productDocId) {
      await updateDoc(doc(db, "products", productDocId), productData);
      showToast("Produk berhasil diperbarui.", "success");
    } else {
      await addDoc(collection(db, "products"), productData);
      showToast("Produk berhasil ditambahkan.", "success");
    }

    resetProductForm();
    await loadProducts();

  } catch (err) {
    console.error("Gagal simpan produk:", err);
    showToast("Gagal simpan: " + err.message, "error");
  }
};

window.editProduct = function (firestoreId) {
  if (currentRole !== "admin") {
    showToast("Hanya admin yang dapat edit produk.", "error");
    return;
  }

  const product = PRODUCTS.find(p => p.firestoreId === firestoreId);
  if (!product) return;

  document.getElementById("productDocId").value = product.firestoreId;
  document.getElementById("productBarcode").value = product.barcode || "";
  document.getElementById("productName").value = product.name || "";
  document.getElementById("productCategory").value = product.category || "";
  document.getElementById("productPrice").value = product.price || 0;
  document.getElementById("productStock").value = product.stock || 0;

  const preview = document.getElementById("imgPreview");
  if (preview && product.imageUrl) {
    preview.src = product.imageUrl;
    preview.style.display = "block";
  } else if (preview) {
    preview.src = "";
    preview.style.display = "none";
  }

  showToast("Data produk masuk ke form edit.", "info");
};

window.deleteProduct = async function (firestoreId) {
  if (currentRole !== "admin") {
    showToast("Hanya admin yang dapat hapus produk.", "error");
    return;
  }

  const yakin = confirm("Yakin ingin menghapus produk ini?");
  if (!yakin) return;

  try {
    await deleteDoc(doc(db, "products", firestoreId));
    showToast("Produk berhasil dihapus.", "success");
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast("Gagal menghapus produk.", "error");
  }
};

window.resetProductForm = function () {
  const ids = ["productDocId", "productBarcode", "productName", "productCategory", "productPrice", "productStock"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const imageInput = document.getElementById("productImage");
  if (imageInput) imageInput.value = "";

  const preview = document.getElementById("imgPreview");
  if (preview) {
    preview.src = "";
    preview.style.display = "none";
  }
};

function initImagePreview() {
  const input = document.getElementById("productImage");
  const preview = document.getElementById("imgPreview");

  if (!input || !preview) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];

    if (!file) {
      preview.src = "";
      preview.style.display = "none";
      return;
    }

    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  });
}

/* =========================
   HISTORY
========================= */
window.loadHistory = loadHistory;

async function loadHistory() {
  const historyTable = document.getElementById("historyTable");
  if (!historyTable) return;

  try {
    const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    const rows = snapshot.docs.map(d => {
      const data = d.data();
      const date = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString("id-ID") : "-";

      return `
        <tr>
          <td>${d.id.slice(0, 8)}</td>
          <td>${date}</td>
          <td>${escapeHtml(METHOD_LABELS[data.method] || data.method || "-")}</td>
          <td>${formatRp(data.total)}</td>
          <td>${data.items?.length || 0} item</td>
          <td>${escapeHtml(data.cashierName || data.cashierEmail || "-")}</td>
        </tr>
      `;
    }).join("");

    historyTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Tanggal</th>
            <th>Metode</th>
            <th>Total</th>
            <th>Jumlah Item</th>
            <th>Kasir</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6">Belum ada transaksi.</td></tr>`}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
    historyTable.innerHTML = `<p class="empty">Gagal memuat riwayat transaksi.</p>`;
  }
}

/* =========================
   LAPORAN
========================= */
function initDefaultReportDate() {
  const input = document.getElementById("laporanDate");
  if (!input) return;

  input.value = toDateInputValue(new Date());

  const monthInput = document.getElementById("laporanMonth");
  if (monthInput) monthInput.value = toDateInputValue(new Date()).slice(0, 7);
}

window.loadLaporan = async function () {
  const type = document.getElementById("laporanType")?.value || "harian";
  const selectedDate = document.getElementById("laporanDate")?.value;
  const selectedMonth = document.getElementById("laporanMonth")?.value;

  if (type === "harian" && !selectedDate) {
    showToast("Pilih tanggal laporan.", "error");
    return;
  }

  if (type === "bulanan" && !selectedMonth) {
    showToast("Pilih bulan laporan.", "error");
    return;
  }

  try {
    const { start, end } = type === "harian"
      ? getDateRange(selectedDate)
      : getMonthRange(selectedMonth);

    const q = query(
      collection(db, "transactions"),
      where("createdAt", ">=", Timestamp.fromDate(start)),
      where("createdAt", "<", Timestamp.fromDate(end)),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    renderLaporan(type === "harian" ? selectedDate : selectedMonth, transactions, type);
  } catch (err) {
    console.error(err);
    showToast("Gagal memuat laporan.", "error");
  }
};

function renderLaporan(dateString, transactions, type = "harian") {
  const totalOmzet = transactions.reduce((sum, t) => sum + Number(t.total || 0), 0);
  const totalDiscount = transactions.reduce((sum, t) => sum + Number(t.discount || 0), 0);
  const count = transactions.length;
  const avg = count ? totalOmzet / count : 0;

  setText("statOmzet", formatRp(totalOmzet));
  setText("statCount", count);
  setText("statAvg", formatRp(avg));
  setText("statDiscount", formatRp(totalDiscount));
  setText("statDate", type === "harian" ? formatDisplayDate(dateString) : formatDisplayMonth(dateString));

  renderMethodBreakdown(transactions);
  renderLaporanTable(transactions);
}

function renderMethodBreakdown(transactions) {
  const target = document.getElementById("laporanMethod");
  if (!target) return;

  const methods = ["cash", "qris", "transfer", "ewallet"];

  target.innerHTML = methods.map(method => {
    const data = transactions.filter(t => t.method === method);
    const total = data.reduce((sum, t) => sum + Number(t.total || 0), 0);

    return `
      <div class="method-item">
        <div class="method-icon">${METHOD_ICONS[method]}</div>
        <div class="method-name">${METHOD_LABELS[method]}</div>
        <div class="method-count">${data.length}</div>
        <div class="method-total">${formatRp(total)}</div>
      </div>
    `;
  }).join("");
}

function renderLaporanTable(transactions) {
  const table = document.getElementById("laporanTable");
  if (!table) return;

  const rows = transactions.map(t => {
    const date = t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString("id-ID") : "-";

    return `
      <tr>
        <td>${escapeHtml(t.id.slice(0, 8))}</td>
        <td>${date}</td>
        <td>${escapeHtml(METHOD_LABELS[t.method] || t.method || "-")}</td>
        <td>${formatRp(t.subtotal)}</td>
        <td>${formatRp(t.discount)}</td>
        <td>${formatRp(t.ppn)}</td>
        <td><b>${formatRp(t.total)}</b></td>
        <td>${escapeHtml(t.cashierName || t.cashierEmail || "-")}</td>
      </tr>
    `;
  }).join("");

  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Tanggal</th>
          <th>Metode</th>
          <th>Subtotal</th>
          <th>Diskon</th>
          <th>PPN</th>
          <th>Total</th>
          <th>Kasir</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="8">Tidak ada transaksi pada tanggal ini.</td></tr>`}
      </tbody>
    </table>
  `;
}

window.downloadLaporanPDF = async function () {
  const type = document.getElementById("laporanType")?.value || "harian";
  const selectedDate = document.getElementById("laporanDate")?.value;
  const selectedMonth = document.getElementById("laporanMonth")?.value;

  if (type === "harian" && !selectedDate) {
    showToast("Pilih tanggal laporan dulu.", "error");
    return;
  }

  if (type === "bulanan" && !selectedMonth) {
    showToast("Pilih bulan laporan dulu.", "error");
    return;
  }

  try {
    const { start, end } = type === "harian"
      ? getDateRange(selectedDate)
      : getMonthRange(selectedMonth);

    const q = query(
      collection(db, "transactions"),
      where("createdAt", ">=", Timestamp.fromDate(start)),
      where("createdAt", "<", Timestamp.fromDate(end)),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!transactions.length) {
      showToast("Tidak ada transaksi.", "info");
      return;
    }

    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF("p", "mm", "a4");

    const totalOmzet = transactions.reduce((sum, t) => sum + Number(t.total || 0), 0);
    const totalDiscount = transactions.reduce((sum, t) => sum + Number(t.discount || 0), 0);
    const totalPpn = transactions.reduce((sum, t) => sum + Number(t.ppn || 0), 0);
    const totalTransaksi = transactions.length;
    const rataRata = totalTransaksi ? totalOmzet / totalTransaksi : 0;

    const periode = type === "harian"
      ? formatDisplayDate(selectedDate)
      : formatDisplayMonth(selectedMonth);

    // ===== HEADER =====
    docPdf.setFillColor(15, 23, 42);
    docPdf.rect(0, 0, 210, 34, "F");

    try {
      const logoBase64 = await imageToBase64("images/tc-logo-dark.png");
      docPdf.addImage(logoBase64, "PNG", 14, 7, 18, 18);
    } catch (err) {
      console.warn("Logo PDF gagal dimuat:", err);
    }

    docPdf.setTextColor(255, 255, 255);
    docPdf.setFontSize(18);
    docPdf.setFont(undefined, "bold");
    docPdf.text("TannCave", 36, 15);

    docPdf.setFontSize(10);
    docPdf.setFont(undefined, "normal");
    docPdf.text("Laporan Penjualan Point of Sale", 36, 22);

    docPdf.setFontSize(9);
    docPdf.text(`Periode: ${periode}`, 150, 14);
    docPdf.text(`Dicetak: ${new Date().toLocaleString("id-ID")}`, 150, 20);

    // ===== TITLE =====
    docPdf.setTextColor(15, 23, 42);
    docPdf.setFontSize(15);
    docPdf.setFont(undefined, "bold");
    docPdf.text(
      type === "harian" ? "Laporan Penjualan Harian" : "Laporan Penjualan Bulanan",
      14,
      48
    );

    docPdf.setFontSize(10);
    docPdf.setFont(undefined, "normal");
    docPdf.setTextColor(100, 116, 139);
    docPdf.text(`Kasir / Pencetak: ${currentDisplayName || "-"}`, 14, 55);

    // ===== SUMMARY CARDS =====
    const cards = [
      ["Total Omzet", formatRp(totalOmzet)],
      ["Jumlah Transaksi", `${totalTransaksi} transaksi`],
      ["Rata-rata", formatRp(rataRata)],
      ["Total Diskon", formatRp(totalDiscount)]
    ];

    let x = 14;
    cards.forEach(([label, value]) => {
      docPdf.setFillColor(248, 250, 252);
      docPdf.setDrawColor(226, 232, 240);
      docPdf.roundedRect(x, 64, 43, 22, 3, 3, "FD");

      docPdf.setFontSize(8);
      docPdf.setTextColor(100, 116, 139);
      docPdf.text(label, x + 3, 71);

      docPdf.setFontSize(10);
      docPdf.setFont(undefined, "bold");
      docPdf.setTextColor(15, 23, 42);
      docPdf.text(value, x + 3, 80);

      docPdf.setFont(undefined, "normal");
      x += 47;
    });

    // ===== TABLE =====
    const rows = transactions.map(t => {
      const date = t.createdAt?.toDate
        ? t.createdAt.toDate().toLocaleString("id-ID")
        : "-";

      return [
        t.id.slice(0, 8),
        date,
        METHOD_LABELS[t.method] || t.method || "-",
        formatRp(t.subtotal),
        formatRp(t.discount),
        formatRp(t.ppn),
        formatRp(t.total),
        t.cashierName || t.cashierEmail || "-"
      ];
    });

    docPdf.autoTable({
      startY: 96,
      head: [[
        "ID",
        "Tanggal",
        "Metode",
        "Subtotal",
        "Diskon",
        "PPN",
        "Total",
        "Kasir"
      ]],
      body: rows,
      styles: {
        fontSize: 7.5,
        cellPadding: 2.5,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold"
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        6: { fontStyle: "bold" }
      },
      didDrawPage: function () {
        const pageHeight = docPdf.internal.pageSize.height;

        docPdf.setFontSize(8);
        docPdf.setTextColor(148, 163, 184);
        docPdf.text("TannCave POS — Laporan ini dibuat otomatis oleh sistem.", 14, pageHeight - 10);

        docPdf.text(
          `Halaman ${docPdf.internal.getNumberOfPages()}`,
          180,
          pageHeight - 10
        );
      }
    });

    // ===== FOOTER SUMMARY =====
    const finalY = docPdf.lastAutoTable.finalY + 10;

    if (finalY < 270) {
      docPdf.setDrawColor(226, 232, 240);
      docPdf.line(14, finalY, 196, finalY);

      docPdf.setFontSize(10);
      docPdf.setTextColor(15, 23, 42);
      docPdf.setFont(undefined, "bold");
      docPdf.text("Ringkasan Akhir", 14, finalY + 8);

      docPdf.setFont(undefined, "normal");
      docPdf.setFontSize(9);
      docPdf.text(`Total PPN: ${formatRp(totalPpn)}`, 14, finalY + 15);
      docPdf.text(`Total Omzet Bersih: ${formatRp(totalOmzet)}`, 14, finalY + 21);
    }

    const fileName = type === "harian"
      ? `laporan-harian-tanncave-${selectedDate}.pdf`
      : `laporan-bulanan-tanncave-${selectedMonth}.pdf`;

    docPdf.save(fileName);
    showToast("PDF laporan berhasil dibuat.", "success");

  } catch (err) {
    console.error(err);
    showToast("Gagal membuat PDF laporan.", "error");
  }
};

function imageToBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = reject;
    img.src = url;
  });
}

window.toggleLaporanInput = function () {
  const type = document.getElementById("laporanType")?.value || "harian";
  document.getElementById("laporanDate").style.display = type === "harian" ? "block" : "none";
  document.getElementById("laporanMonth").style.display = type === "bulanan" ? "block" : "none";
};

function getMonthRange(monthString) {
  const start = new Date(`${monthString}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

/* =========================
   ARCHIVE / RESET
========================= */
window.archiveTodayTransactions = async function () {
  if (currentRole !== "admin") {
    showToast("Hanya admin yang dapat archive data.", "error");
    return;
  }

  const yakin = confirm("Archive transaksi hari ini?");
  if (!yakin) return;

  const today = toDateInputValue(new Date());
  await archiveTransactionsByDate(today);
};

window.archiveAllTransactions = async function () {
  if (currentRole !== "admin") {
    showToast("Hanya admin yang dapat archive data.", "error");
    return;
  }

  const yakin = confirm("Archive SEMUA transaksi aktif?");
  if (!yakin) return;

  try {
    const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    await moveSnapshotsToArchive(snapshot);

    showToast("Semua transaksi berhasil di-archive.", "success");
    await loadHistory();
    await loadLaporan();
  } catch (err) {
    console.error(err);
    showToast("Gagal archive semua transaksi.", "error");
  }
};

window.resetTodaySales = async function () {
  if (currentRole !== "admin") {
    showToast("Hanya admin yang dapat reset penjualan.", "error");
    return;
  }

  const yakin = confirm("Reset transaksi hari ini? Data akan dihapus dari transaksi aktif.");
  if (!yakin) return;

  const today = toDateInputValue(new Date());

  try {
    const snapshot = await getTransactionsSnapshotByDate(today);
    const batch = writeBatch(db);

    snapshot.docs.forEach(d => {
      batch.delete(doc(db, "transactions", d.id));
    });

    await batch.commit();

    showToast("Transaksi hari ini berhasil di-reset.", "success");
    await loadHistory();
    await loadLaporan();
  } catch (err) {
    console.error(err);
    showToast("Gagal reset transaksi hari ini.", "error");
  }
};

async function archiveTransactionsByDate(dateString) {
  try {
    const snapshot = await getTransactionsSnapshotByDate(dateString);
    await moveSnapshotsToArchive(snapshot);

    showToast("Transaksi hari ini berhasil di-archive.", "success");
    await loadHistory();
    await loadLaporan();
  } catch (err) {
    console.error(err);
    showToast("Gagal archive transaksi.", "error");
  }
}

async function getTransactionsSnapshotByDate(dateString) {
  const { start, end } = getDateRange(dateString);

  const q = query(
    collection(db, "transactions"),
    where("createdAt", ">=", Timestamp.fromDate(start)),
    where("createdAt", "<", Timestamp.fromDate(end)),
    orderBy("createdAt", "desc")
  );

  return await getDocs(q);
}

async function moveSnapshotsToArchive(snapshot) {
  if (snapshot.empty) {
    showToast("Tidak ada transaksi untuk di-archive.", "info");
    return;
  }

  const batch = writeBatch(db);

  snapshot.docs.forEach(d => {
    const data = d.data();

    const archiveRef = doc(collection(db, "transactionArchives"));
    batch.set(archiveRef, {
      ...data,
      originalTransactionId: d.id,
      archivedAt: serverTimestamp(),
      archivedBy: currentUser?.email || null
    });

    batch.delete(doc(db, "transactions", d.id));
  });

  await batch.commit();
}

/* =========================
   TAB
========================= */
window.switchTab = function (tabName, btn) {
  if (tabName === "admin" && currentRole !== "admin") {
    showToast("Menu ini hanya untuk role admin.", "error");
    return;
  }

  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".menu-item").forEach(item => item.classList.remove("active"));

  const tab = document.getElementById(`tab-${tabName}`);
  if (tab) tab.classList.add("active");

  if (btn) btn.classList.add("active");

  if (tabName === "laporan") {
    loadLaporan();
  }
  document.querySelector(".sidebar")?.classList.remove("show-mobile");
};

/* =========================
   CLOCK
========================= */
function startClock() {
  function updateClock() {
    const now = new Date();

    setText("clockTime", now.toLocaleTimeString("id-ID", { hour12: false }));
    setText("clockDate", now.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }));
  }

  updateClock();
  setInterval(updateClock, 1000);
}

/* =========================
   HELPERS
========================= */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatRp(number) {
  return "Rp " + Math.round(Number(number || 0)).toLocaleString("id-ID");
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast show toast-${type}`;

  setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(text) {
  return escapeHtml(text);
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDateRange(dateString) {
  const start = new Date(`${dateString}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function formatDisplayDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatDisplayMonth(monthString) {
  const date = new Date(`${monthString}-01T00:00:00`);
  return date.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric"
  });
}