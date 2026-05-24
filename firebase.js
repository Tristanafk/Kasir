import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

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

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);