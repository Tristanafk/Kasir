import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

import {
  doc, getDoc, collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// Apply dark mode immediately to prevent flash
(function () {
  const theme = localStorage.getItem("ks-theme") || "light";
  document.documentElement.setAttribute("data-theme", theme);
})();

window.doLogin = async function () {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPass").value;

  if (!username || !password) {
    showToast("Username dan password wajib diisi.", "error");
    return;
  }

  const btn = document.getElementById("loginBtn");
  if (btn) { btn.textContent = "Memuat..."; btn.disabled = true; }

  try {
    const q = query(collection(db, "users"), where("username", "==", username));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      showToast("Username tidak ditemukan.", "error");
      return;
    }

    const userData = snapshot.docs[0].data();

    if (!userData.email) {
      showToast("Email user tidak ditemukan.", "error");
      return;
    }

    await signInWithEmailAndPassword(auth, userData.email, password);
    showToast("Login berhasil! Mengalihkan...", "success");

    setTimeout(() => { window.location.href = "index.html"; }, 1000);

  } catch (err) {
    console.error(err);
    const msg = err.code === "auth/wrong-password" || err.code === "auth/invalid-credential"
      ? "Password salah." : err.message;
    showToast(msg, "error");
  } finally {
    if (btn) { btn.innerHTML = 'Masuk <i class="fa-solid fa-right-to-bracket"></i>'; btn.disabled = false; }
  }
};

window.doLogout = async function () {
  await signOut(auth);
  window.location.href = "login.html";
};

onAuthStateChanged(auth, async user => {
  const isLoginPage = window.location.pathname.includes("login.html");

  if (user && isLoginPage) { window.location.href = "index.html"; return; }
  if (!user && !isLoginPage) { window.location.href = "login.html"; return; }

  if (user && !isLoginPage) {
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const data = userSnap.exists() ? userSnap.data() : {};
      const role = data.role || "kasir";
      const displayName = data.username || data.name || user.email;

      if (window.setCurrentUserData) window.setCurrentUserData(user, role, displayName);

      const roleInfo = document.getElementById("roleInfo");
      if (roleInfo) roleInfo.textContent = `${displayName} · ${role.toUpperCase()}`;

      document.querySelectorAll(".admin-only").forEach(el => {
        el.style.display = role === "admin" ? "block" : "none";
      });

      // Apply dark mode icon
      const toggle = document.getElementById("darkModeToggle");
      if (toggle) {
        const theme = localStorage.getItem("ks-theme") || "light";
        toggle.innerHTML = theme === "dark"
          ? '<i class="fa-solid fa-sun"></i>'
          : '<i class="fa-solid fa-moon"></i>';
      }

    } catch (err) {
      console.error(err);
    }
  }
});

function showToast(message, type = "") {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show${type ? " toast-" + type : ""}`;
  setTimeout(() => { toast.className = "toast"; }, 3000);
}