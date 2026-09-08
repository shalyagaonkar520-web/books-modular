import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAtKTW0NCNNHbDZSW4t6UMfeD06dCZsD-E",
  authDomain: "rooman-books.firebaseapp.com",
  projectId: "rooman-books",
  storageBucket: "rooman-books.firebasestorage.app",
  messagingSenderId: "558124571854",
  appId: "1:558124571854:web:75e4cd270d2d670b03c49f"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
