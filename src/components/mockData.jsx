import { 
  Home, 
  PlusCircle, 
  Sparkles, 
  User, 
  ShieldCheck,
  BarChart3,
  ShoppingCart,
  MapPin
} from "lucide-react";

export const MOCK_STORES = [
  "Fresh Market",
  "SuperSaver",
  "Organic Choice",
  "City Grocers",
  "MegaMart"
];

export const MOCK_CATEGORIES = [
  "Produce",
  "Dairy",
  "Bakery",
  "Meat",
  "Pantry",
  "Beverages",
  "Household"
];

export const MOCK_ITEMS = [
  { name: "Organic Bananas", category: "Produce", price: 2.99 },
  { name: "Whole Milk", category: "Dairy", price: 3.49 },
  { name: "Sourdough Bread", category: "Bakery", price: 4.99 },
  { name: "Chicken Breast", category: "Meat", price: 9.99 },
  { name: "Pasta Sauce", category: "Pantry", price: 3.29 },
  { name: "Orange Juice", category: "Beverages", price: 4.49 },
  { name: "Paper Towels", category: "Household", price: 7.99 },
  { name: "Avocados (3pk)", category: "Produce", price: 5.99 },
  { name: "Greek Yogurt", category: "Dairy", price: 1.29 },
  { name: "Ground Beef", category: "Meat", price: 6.99 }
];

export const generateMockReceipt = () => {
  const store = MOCK_STORES[Math.floor(Math.random() * MOCK_STORES.length)];
  const itemCount = Math.floor(Math.random() * 5) + 3; // 3-8 items
  const items = [];
  let total = 0;

  for (let i = 0; i < itemCount; i++) {
    const template = MOCK_ITEMS[Math.floor(Math.random() * MOCK_ITEMS.length)];
    const quantity = Math.floor(Math.random() * 2) + 1;
    const itemTotal = template.price * quantity;
    
    items.push({
      name: template.name,
      category: template.category,
      quantity,
      price: template.price,
      total: Number(itemTotal.toFixed(2))
    });
    total += itemTotal;
  }

  return {
    storeName: store,
    date: new Date().toISOString().split('T')[0],
    totalAmount: Number(total.toFixed(2)),
    items,
    insights: [
      { 
        type: "warning", 
        message: `Prices at ${store} are 5% higher than average this week.` 
      },
      { 
        type: "saving", 
        message: "You could save $4.50 by switching to generic brands for dairy." 
      }
    ]
  };
};

export const NAV_ITEMS = [
  { label: "Home", path: "/", icon: Home },
  { label: "Scan", path: "/upload", icon: PlusCircle },
  { label: "Cart", path: "/smartcart", icon: ShoppingCart },
  { label: "Stores", path: "/nearbystores", icon: MapPin },
  { label: "Tips", path: "/recommendations", icon: Sparkles },
  { label: "Compare", path: "/pricecomparison", icon: BarChart3 },
];