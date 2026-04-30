// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyA816TaOX9VloSgQv2I_ZAU02nowFK2Nas",
  authDomain: "mis-finanzas-p.firebaseapp.com",
  projectId: "mis-finanzas-p",
  storageBucket: "mis-finanzas-p.firebasestorage.app",
  messagingSenderId: "714582865563",
  appId: "1:714582865563:web:57bacbc366de7f0b53383e",
  measurementId: "G-7D4997WVGD"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const functions = getFunctions(app);