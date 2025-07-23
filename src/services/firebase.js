// src/services/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAuyuZmnD-s-4GnPyOzwj80KFi4mMWR5AA",
  authDomain: "mi-finanzas-v2.firebaseapp.com",
  projectId: "mi-finanzas-v2",
  storageBucket: "mi-finanzas-v2.appspot.com", // ← CORREGIDO
  messagingSenderId: "354042827794",
  appId: "1:354042827794:web:5d95765e6d9725a41174cb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
