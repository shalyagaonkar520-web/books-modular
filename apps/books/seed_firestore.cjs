const { initializeApp } = require("firebase/app");
const { getFirestore, doc, setDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyAtKTW0NCNNHbDZSW4t6UMfeD06dCZsD-E",
  authDomain: "rooman-books.firebaseapp.com",
  projectId: "rooman-books",
  storageBucket: "rooman-books.firebasestorage.app",
  messagingSenderId: "558124571854",
  appId: "1:558124571854:web:75e4cd270d2d670b03c49f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const seedItems = [
  {
    id: "item-101",
    name: "Dell UltraSharp 27\" 4K Monitor",
    type: "goods",
    sku: "MON-DELL-4K27",
    unit: "pcs",
    sellingPrice: 38500,
    costPrice: 29000,
    openingStock: 25,
    reorderLevel: 5,
    warehouseLocation: "Main Warehouse - Shelf A3",
    description: "4K IPS Monitor with USB-C Hub for workstation setups",
    createdAt: new Date().toISOString()
  },
  {
    id: "item-102",
    name: "Ergonomic Mesh Office Chair",
    type: "goods",
    sku: "FUR-CHR-ERG01",
    unit: "pcs",
    sellingPrice: 14500,
    costPrice: 9200,
    openingStock: 12,
    reorderLevel: 3,
    warehouseLocation: "Main Warehouse - Bay B",
    description: "High-back ergonomic mesh chair with adjustable lumbar support",
    createdAt: new Date().toISOString()
  },
  {
    id: "item-103",
    name: "Custom Web Application Development",
    type: "service",
    sku: "SRV-WEB-DEV",
    unit: "hrs",
    sellingPrice: 2500,
    costPrice: 1200,
    openingStock: 0,
    description: "Professional full-stack software development per hour",
    createdAt: new Date().toISOString()
  },
  {
    id: "item-104",
    name: "Logitech MX Master 3S Wireless Mouse",
    type: "goods",
    sku: "ACC-LOG-MX3S",
    unit: "pcs",
    sellingPrice: 8995,
    costPrice: 6400,
    openingStock: 4,
    reorderLevel: 10,
    warehouseLocation: "Main Warehouse - Drawer C1",
    description: "Performance wireless mouse with 8K DPI sensor",
    createdAt: new Date().toISOString()
  }
];

async function seed() {
  console.log("Starting Firestore Database Seeding into 'rooman-books'...");
  let successCount = 0;
  for (const item of seedItems) {
    try {
      await setDoc(doc(db, "items", item.id), item);
      console.log(`✓ Inserted item: ${item.name} (${item.id})`);
      successCount++;
    } catch (err) {
      console.error(`✗ Failed to insert item ${item.id}:`, err.code, err.message);
    }
  }

  // Also seed a sample company profile
  try {
    await setDoc(doc(db, "organization", "profile"), {
      companyName: "Rooman Technologies Pvt Ltd",
      email: "finance@rooman.net",
      phone: "+91 80 4123 4567",
      gstin: "29AABCR1234F1Z5",
      address: "Rooman House, #12 Rajajinagar, Bengaluru - 560010, Karnataka",
      currency: "INR (₹)",
      updatedAt: new Date().toISOString()
    });
    console.log("✓ Inserted organization/profile entry");
    successCount++;
  } catch (err) {
    console.error("✗ Failed to insert organization profile:", err.code, err.message);
  }

  console.log(`\nSeeding finished. Successfully wrote ${successCount} entries.`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
