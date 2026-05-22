import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";

import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9-Is75uBOXiwmbd9C3ExZYphGEWRKpU0",
  authDomain: "kasirkasiran-a331b.firebaseapp.com",
  projectId: "kasirkasiran-a331b",
  storageBucket: "kasirkasiran-a331b.firebasestorage.app",
  messagingSenderId: "458030798305",
  appId: "1:458030798305:web:d3abb06ab42ff0e39f2ea0",
  measurementId: "G-WJ9LSG1VSF"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let PRODUCTS = [];
let currentUser = null;
let currentRole = "kasir";
let lastReceipt = null;

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

document.addEventListener("DOMContentLoaded", () => {
  startClock();

  onAuthStateChanged(auth, async user => {
    if (user) {
      currentUser = user;
      await loadUserRole(user.uid);
      showDashboard();
      await loadProducts();
      await loadHistory();
    } else {
      currentUser = null;
      currentRole = "kasir";
      showLogin();
    }
  });

  const barcodeInput = document.getElementById("barcodeInput");
  if (barcodeInput) {
    barcodeInput.addEventListener("keydown", e => {
      if (e.key === "Enter") addByBarcode();
    });
  }
});

async function loadUserRole(uid) {
  console.log("UID login:", uid);
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      console.log("DATA USER:", userSnap.data());
      currentRole = userSnap.data().role || "kasir";
    } else {
      console.log("USER DOC TIDAK ADA");
      currentRole = "kasir";
    }
    setText("roleInfo", `Role: ${currentRole}`);

    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = currentRole === "admin" ? "block" : "none";
    });
  } catch (err) {
    console.error(err);
    currentRole = "kasir";
    setText("roleInfo", "Role: kasir");

    document.querySelectorAll(".admin-only").forEach(el => {
      el.style.display = "none";
    });
  }
}

window.doLogin = async function () {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPass").value;

  if (!email || !password) {
    showToast("Email dan password wajib diisi.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast("Login berhasil.");
  } catch (err) {
    console.error(err);
    showToast("Login gagal. Periksa email dan password.");
  }
};

window.doLogout = async function () {
  await signOut(auth);
  clearCart();
};

function showDashboard() {
  document.getElementById("page-login").classList.remove("active");
  document.getElementById("page-dashboard").classList.add("active");
}

function showLogin() {
  document.getElementById("page-dashboard").classList.remove("active");
  document.getElementById("page-login").classList.add("active");
}

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
      stock: Number(d.data().stock || 0)
    }));

    renderProducts(PRODUCTS);
    renderProductTable(PRODUCTS);
    renderAdminProductTable(PRODUCTS);
  } catch (err) {
    console.error(err);
    productGrid.innerHTML = `<p class="empty">Gagal memuat produk dari Firebase.</p>`;
    productTable.innerHTML = `<p class="empty">Gagal memuat data produk.</p>`;
    adminProductTable.innerHTML = `<p class="empty">Gagal memuat data admin produk.</p>`;
  }
}

function renderProducts(products) {
  const grid = document.getElementById("productGrid");

  if (!products.length) {
    grid.innerHTML = `<p class="empty">Produk belum tersedia.</p>`;
    return;
  }

  grid.innerHTML = products.map(product => `
    <button class="product-card ${product.stock <= 0 ? "disabled" : ""}" onclick="addToCart('${product.firestoreId}')">
      <div class="product-name">${escapeHtml(product.name)}</div>
      <div class="product-category">${escapeHtml(product.category)}</div>
      <div class="product-price">${formatRp(product.price)}</div>
      <div class="product-stock">${product.stock > 0 ? `Stok ${product.stock}` : "Stok habis"}</div>
      <div class="product-stock">Barcode: ${escapeHtml(product.barcode || "-")}</div>
    </button>
  `).join("");
}

function renderProductTable(products) {
  const table = document.getElementById("productTable");

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

  if (currentRole !== "admin") {
    table.innerHTML = `<p class="empty">Hanya admin yang dapat mengelola produk.</p>`;
    return;
  }

  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Barcode</th>
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
          console.error(err);
        }
      }
    });
  }, 100);
}

window.filterProducts = function (keyword) {
  const q = keyword.toLowerCase();

  const filtered = PRODUCTS.filter(product =>
    product.name.toLowerCase().includes(q) ||
    product.category.toLowerCase().includes(q) ||
    product.barcode.toLowerCase().includes(q)
  );

  renderProducts(filtered);
};

window.addByBarcode = function () {
  const barcode = document.getElementById("barcodeInput").value.trim().toLowerCase();

  if (!barcode) {
    showToast("Masukkan barcode produk.");
    return;
  }

  const product = PRODUCTS.find(p => p.barcode.toLowerCase() === barcode);

  if (!product) {
    showToast("Produk dengan barcode tersebut tidak ditemukan.");
    return;
  }

  addToCart(product.firestoreId);
  document.getElementById("barcodeInput").value = "";
};

window.addToCart = function (firestoreId) {
  const product = PRODUCTS.find(p => p.firestoreId === firestoreId);

  if (!product || product.stock <= 0) {
    showToast("Produk tidak tersedia.");
    return;
  }

  const existing = state.cart.find(item => item.firestoreId === product.firestoreId);

  if (existing) {
    if (existing.qty >= product.stock) {
      showToast("Jumlah produk melebihi stok.");
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
    showToast("Stok tidak cukup.");
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

window.processPayment = async function (method) {
  if (!state.cart.length) {
    showToast("Keranjang masih kosong.");
    return;
  }

  let paid = null;
  let change = null;

  if (method === "cash") {
    paid = Number(document.getElementById("cashInput").value || 0);

    if (paid < state.total) {
      showToast("Uang bayar kurang.");
      return;
    }

    change = paid - state.total;
  } else {
    paid = Math.round(state.total);
    change = 0;
  }

  const transaction = {
    cashierUid: currentUser?.uid || null,
    cashierEmail: currentUser?.email || null,
    cashierRole: currentRole,
    items: state.cart.map(item => ({
      productId: item.firestoreId,
      barcode: item.barcode,
      name: item.name,
      price: item.price,
      qty: item.qty,
      subtotal: item.price * item.qty
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

    for (const item of state.cart) {
      await updateDoc(doc(db, "products", item.firestoreId), {
        stock: item.stock - item.qty
      });
    }

    lastReceipt = {
      id: transactionRef.id,
      ...transaction,
      createdAtLocal: new Date()
    };

    showReceipt(lastReceipt);

    showToast("Transaksi berhasil disimpan.");
    clearCart();
    await loadProducts();
    await loadHistory();
  } catch (err) {
    console.error(err);
    showToast("Transaksi gagal disimpan.");
  }
};

function showReceipt(transaction) {
  const receiptArea = document.getElementById("receiptArea");
  const modal = document.getElementById("receiptModal");

  receiptArea.innerHTML = `
    <div class="receipt">
      <h2>Kantin Sekolah</h2>
      <p>Sistem Kasir Digital</p>
      <hr>

      <p><b>ID:</b> ${transaction.id.slice(0, 8)}</p>
      <p><b>Tanggal:</b> ${transaction.createdAtLocal.toLocaleString("id-ID")}</p>
      <p><b>Kasir:</b> ${escapeHtml(transaction.cashierEmail || "-")}</p>
      <p><b>Metode:</b> ${transaction.method.toUpperCase()}</p>

      <hr>

      ${transaction.items.map(item => `
        <div class="receipt-row">
          <span>${escapeHtml(item.name)} x${item.qty}</span>
          <b>${formatRp(item.subtotal)}</b>
        </div>
      `).join("")}

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
      <div class="receipt-row">
        <span>Kembalian</span>
        <b>${formatRp(transaction.change)}</b>
      </div>

      <hr>

      <p class="thanks">Terima kasih sudah berbelanja.</p>
    </div>
  `;

  modal.classList.add("show");
};

window.closeReceipt = function () {
  document.getElementById("receiptModal").classList.remove("show");
};

window.printReceipt = function () {
  const receiptContent = document.getElementById("receiptArea").innerHTML;

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html>
      <head>
        <title>Cetak Struk</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
          }

          .receipt {
            width: 280px;
            margin: auto;
          }

          h2, p {
            text-align: center;
            margin: 4px 0;
          }

          hr {
            border: none;
            border-top: 1px dashed #000;
            margin: 10px 0;
          }

          .receipt-row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            font-size: 14px;
            margin: 6px 0;
          }

          .total {
            font-size: 16px;
            font-weight: bold;
          }

          .thanks {
            margin-top: 12px;
          }
        </style>
      </head>
      <body>
        ${receiptContent}
        <script>
          window.onload = function() {
            window.print();
          };
        <\/script>
      </body>
    </html>
  `);

  printWindow.document.close();
};

window.saveProduct = async function () {
  if (currentRole !== "admin") {
    showToast("Hanya admin yang dapat menyimpan produk.");
    return;
  }

  const productDocId = document.getElementById("productDocId").value;
  let barcode = document.getElementById("productBarcode").value.trim();

  if (!barcode) {
    barcode = "PRD-" + Date.now();
  }
  const name = document.getElementById("productName").value.trim();
  const category = document.getElementById("productCategory").value.trim();
  const price = Number(document.getElementById("productPrice").value || 0);
  const stock = Number(document.getElementById("productStock").value || 0);

  if (!name || !category || price <= 0 || stock < 0) {
    showToast("Data produk belum valid.");
    return;
  }

  const duplicate = PRODUCTS.find(p =>
    p.barcode.toLowerCase() === barcode.toLowerCase() &&
    p.firestoreId !== productDocId
  );

  if (duplicate) {
    showToast("Barcode sudah digunakan produk lain.");
    return;
  }

  const productData = {
    barcode,
    name,
    category,
    price,
    stock
  };

  try {
    if (productDocId) {
      await updateDoc(doc(db, "products", productDocId), productData);
      showToast("Produk berhasil diperbarui.");
    } else {
      await addDoc(collection(db, "products"), productData);
      showToast("Produk berhasil ditambahkan.");
    }

    resetProductForm();
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast("Gagal menyimpan produk.");
  }
};

window.editProduct = function (firestoreId) {
  if (currentRole !== "admin") {
    showToast("Hanya admin yang dapat edit produk.");
    return;
  }

  const product = PRODUCTS.find(p => p.firestoreId === firestoreId);
  if (!product) return;

  document.getElementById("productDocId").value = product.firestoreId;
  document.getElementById("productBarcode").value = product.barcode;
  document.getElementById("productName").value = product.name;
  document.getElementById("productCategory").value = product.category;
  document.getElementById("productPrice").value = product.price;
  document.getElementById("productStock").value = product.stock;

  showToast("Data produk masuk ke form edit.");
};

window.deleteProduct = async function (firestoreId) {
  if (currentRole !== "admin") {
    showToast("Hanya admin yang dapat hapus produk.");
    return;
  }

  const yakin = confirm("Yakin ingin menghapus produk ini?");
  if (!yakin) return;

  try {
    await deleteDoc(doc(db, "products", firestoreId));
    showToast("Produk berhasil dihapus.");
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast("Gagal menghapus produk.");
  }
};

window.resetProductForm = function () {
  document.getElementById("productDocId").value = "";
  document.getElementById("productBarcode").value = "";
  document.getElementById("productName").value = "";
  document.getElementById("productCategory").value = "";
  document.getElementById("productPrice").value = "";
  document.getElementById("productStock").value = "";
};

async function loadHistory() {
  const historyTable = document.getElementById("historyTable");

  try {
    const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    const rows = snapshot.docs.map(d => {
      const data = d.data();

      return `
        <tr>
          <td>${d.id.slice(0, 8)}</td>
          <td>${escapeHtml(data.method || "-").toUpperCase()}</td>
          <td>${formatRp(data.total)}</td>
          <td>${data.items?.length || 0} item</td>
          <td>${escapeHtml(data.cashierEmail || "-")}</td>
        </tr>
      `;
    }).join("");

    historyTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Metode</th>
            <th>Total</th>
            <th>Jumlah Item</th>
            <th>Kasir</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5">Belum ada transaksi.</td></tr>`}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
    historyTable.innerHTML = `<p class="empty">Gagal memuat riwayat transaksi.</p>`;
  }
}

window.switchTab = function (tabName, btn) {
  if (tabName === "admin" && currentRole !== "admin") {
    showToast("Menu admin hanya untuk role admin.");
    return;
  }

  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".menu-item").forEach(item => item.classList.remove("active"));

  document.getElementById(`tab-${tabName}`).classList.add("active");

  if (btn) btn.classList.add("active");
};

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

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatRp(number) {
  return "Rp " + Math.round(Number(number || 0)).toLocaleString("id-ID");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
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