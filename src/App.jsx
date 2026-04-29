import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { QRCodeCanvas } from "qrcode.react";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const menu = [
  { id: "ramen-shoyu", name: "Ramen Shoyu", category: "Ramen", price: 185, desc: "Caldo de soya, chashu, huevo y cebollín." },
  { id: "ramen-miso", name: "Ramen Miso", category: "Ramen", price: 195, desc: "Caldo intenso de miso, cerdo y maíz." },
  { id: "gyoza", name: "Gyozas", category: "Entradas", price: 95, desc: "6 piezas doradas con salsa ponzu." },
  { id: "karaage", name: "Karaage", category: "Entradas", price: 125, desc: "Pollo frito japonés con mayo spicy." },
  { id: "matcha", name: "Matcha Latte", category: "Bebidas", price: 75, desc: "Frío o caliente." },
  { id: "calpis", name: "Calpis Soda", category: "Bebidas", price: 65, desc: "Refresco japonés ligero y dulce." },
];

const tableNumbers = [1, 2, 3, 4, 5, 6, 7, 8];

function money(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

function getTableFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("mesa") || "1";
}

function getInitialView() {
  const params = new URLSearchParams(window.location.search);
  return params.get("admin") === "1" ? "staff" : "customer";
}

export default function App() {
  const [view, setView] = useState(getInitialView());
  const [tableNumber, setTableNumber] = useState(getTableFromUrl());
  const [cart, setCart] = useState({});
  const [notes, setNotes] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const baseUrl = window.location.origin;

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => ({ ...menu.find((item) => item.id === id), qty }))
      .filter((item) => item.qty > 0);
  }, [cart]);

  const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const categories = Array.from(new Set(menu.map((item) => item.category)));

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => loadOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      setMessage("Error cargando pedidos. Revisa Supabase y variables ENV.");
      return;
    }

    setOrders(data || []);
  }

  function addItem(id) {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }

  function removeItem(id) {
    setCart((prev) => ({ ...prev, [id]: Math.max((prev[id] || 0) - 1, 0) }));
  }

  async function placeOrder() {
    if (!cartItems.length) return;
    setLoading(true);
    setMessage("");

    const payload = {
      table_number: tableNumber,
      items: cartItems,
      notes,
      total,
      status: "Nuevo",
    };

    const { error } = await supabase.from("orders").insert(payload);

    setLoading(false);

    if (error) {
      console.error(error);
      setMessage("No se pudo enviar el pedido.");
      return;
    }

    setCart({});
    setNotes("");
    setMessage("Pedido enviado. El personal ya puede verlo.");
  }

  async function updateStatus(orderId, status) {
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderId);

    if (error) {
      console.error(error);
      setMessage("No se pudo actualizar el estado.");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>MVP restaurante</div>
            <h1 style={styles.title}>Menú dinámico por QR</h1>
            <p style={styles.subtitle}>Cada mesa tiene su propio QR y cocina recibe pedidos en tiempo real.</p>
          </div>
          <div style={styles.switcher}>
            <button style={view === "customer" ? styles.primaryButton : styles.secondaryButton} onClick={() => setView("customer")}>Cliente</button>
            <button style={view === "staff" ? styles.primaryButton : styles.secondaryButton} onClick={() => setView("staff")}>Personal</button>
            <button style={view === "qr" ? styles.primaryButton : styles.secondaryButton} onClick={() => setView("qr")}>QRs</button>
          </div>
        </header>

        {message && <div style={styles.message}>{message}</div>}

        {view === "customer" && (
          <div style={styles.layout}>
            <main>
              <section style={styles.card}>
                <h2 style={styles.sectionTitle}>Mesa {tableNumber}</h2>
                <p style={styles.helpText}>Esta mesa viene desde la URL: ?mesa={tableNumber}</p>
                <select style={styles.select} value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}>
                  {tableNumbers.map((n) => <option key={n} value={n}>Mesa {n}</option>)}
                </select>
              </section>

              {categories.map((category) => (
                <section key={category}>
                  <h2 style={styles.categoryTitle}>{category}</h2>
                  <div style={styles.menuGrid}>
                    {menu.filter((item) => item.category === category).map((item) => (
                      <div key={item.id} style={styles.card}>
                        <div style={styles.itemTop}>
                          <div>
                            <h3 style={styles.itemName}>{item.name}</h3>
                            <p style={styles.description}>{item.desc}</p>
                          </div>
                          <strong>{money(item.price)}</strong>
                        </div>
                        <div style={styles.itemActions}>
                          <span>Cantidad: {cart[item.id] || 0}</span>
                          <div style={styles.qtyButtons}>
                            <button style={styles.smallButton} onClick={() => removeItem(item.id)}>?</button>
                            <button style={styles.smallButton} onClick={() => addItem(item.id)}>+</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </main>

            <aside style={styles.cartCard}>
              <h2 style={styles.sectionTitle}>Pedido — Mesa {tableNumber}</h2>
              {cartItems.length === 0 ? <p style={styles.helpText}>Todavía no hay productos.</p> : cartItems.map((item) => (
                <div key={item.id} style={styles.cartLine}>
                  <span>{item.qty} × {item.name}</span>
                  <strong>{money(item.qty * item.price)}</strong>
                </div>
              ))}
              <textarea style={styles.textarea} placeholder="Notas: sin cebolla, poco picante, alergias..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div style={styles.totalLine}><span>Total</span><span>{money(total)}</span></div>
              <button style={cartItems.length ? styles.fullButton : styles.disabledButton} onClick={placeOrder} disabled={!cartItems.length || loading}>
                {loading ? "Enviando..." : "Enviar pedido"}
              </button>
            </aside>
          </div>
        )}

        {view === "staff" && (
          <main>
            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Panel de cocina / meseros</h2>
              <p style={styles.helpText}>URL recomendada para personal: {baseUrl}/?admin=1</p>
            </section>

            {orders.length === 0 ? <section style={styles.empty}>No hay pedidos todavía.</section> : (
              <div style={styles.ordersGrid}>
                {orders.map((order) => (
                  <div key={order.id} style={styles.card}>
                    <div style={styles.orderTop}>
                      <div>
                        <h3 style={styles.orderTable}>Mesa {order.table_number}</h3>
                        <p style={styles.helpText}>{new Date(order.created_at).toLocaleString("es-MX")}</p>
                      </div>
                      <span style={styles.badge}>{order.status}</span>
                    </div>
                    {(order.items || []).map((item) => (
                      <div key={item.id} style={styles.cartLine}>
                        <span>{item.qty} × {item.name}</span>
                        <strong>{money(item.qty * item.price)}</strong>
                      </div>
                    ))}
                    {order.notes && <p style={styles.noteBox}><strong>Notas:</strong> {order.notes}</p>}
                    <div style={styles.totalLine}><span>Total</span><span>{money(order.total)}</span></div>
                    <div style={styles.statusButtons}>
                      <button style={styles.secondaryButton} onClick={() => updateStatus(order.id, "Nuevo")}>Nuevo</button>
                      <button style={styles.secondaryButton} onClick={() => updateStatus(order.id, "Preparando")}>Preparando</button>
                      <button style={styles.primaryButton} onClick={() => updateStatus(order.id, "Entregado")}>Entregado</button>
                      <button style={styles.dangerButton} onClick={() => updateStatus(order.id, "Cancelado")}>Cancelado</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        )}

        {view === "qr" && (
          <main>
            <section style={styles.card}>
              <h2 style={styles.sectionTitle}>Generador de QR por mesa</h2>
              <p style={styles.helpText}>Imprime estos QR. Cada uno abre el menú con la mesa ya ligada.</p>
            </section>
            <div style={styles.qrGrid}>
              {tableNumbers.map((n) => {
                const url = `${baseUrl}/?mesa=${n}`;
                return (
                  <div key={n} style={styles.qrCard}>
                    <h3>Mesa {n}</h3>
                    <div style={styles.qrBox}><QRCodeCanvas value={url} size={180} /></div>
                    <p style={styles.urlText}>{url}</p>
                  </div>
                );
              })}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f4f4f5", padding: 20, fontFamily: "Arial, sans-serif", color: "#111827" },
  container: { maxWidth: 1150, margin: "0 auto" },
  header: { background: "white", borderRadius: 24, padding: 24, marginBottom: 20, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", boxShadow: "0 8px 24px rgba(0,0,0,0.06)" },
  kicker: { fontSize: 13, color: "#71717a", fontWeight: 700, textTransform: "uppercase" },
  title: { margin: "6px 0", fontSize: 34 },
  subtitle: { margin: 0, color: "#52525b" },
  switcher: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  layout: { display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 },
  card: { background: "white", borderRadius: 22, padding: 18, marginBottom: 16, boxShadow: "0 8px 20px rgba(0,0,0,0.05)" },
  cartCard: { background: "white", borderRadius: 22, padding: 18, height: "fit-content", position: "sticky", top: 20, boxShadow: "0 8px 20px rgba(0,0,0,0.05)" },
  sectionTitle: { margin: "0 0 12px", fontSize: 20 },
  categoryTitle: { margin: "20px 0 12px", fontSize: 24 },
  menuGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 },
  primaryButton: { background: "#111827", color: "white", border: "none", borderRadius: 12, padding: "10px 14px", cursor: "pointer", fontWeight: 700 },
  secondaryButton: { background: "white", color: "#111827", border: "1px solid #d4d4d8", borderRadius: 12, padding: "10px 14px", cursor: "pointer", fontWeight: 700 },
  dangerButton: { background: "#991b1b", color: "white", border: "none", borderRadius: 12, padding: "10px 14px", cursor: "pointer", fontWeight: 700 },
  smallButton: { width: 36, height: 36, borderRadius: 12, border: "1px solid #d4d4d8", background: "white", cursor: "pointer", fontSize: 20, fontWeight: 700 },
  fullButton: { width: "100%", background: "#111827", color: "white", border: "none", borderRadius: 14, padding: 14, cursor: "pointer", fontWeight: 800, fontSize: 16 },
  disabledButton: { width: "100%", background: "#d4d4d8", color: "#71717a", border: "none", borderRadius: 14, padding: 14, cursor: "not-allowed", fontWeight: 800, fontSize: 16 },
  itemTop: { display: "flex", justifyContent: "space-between", gap: 12 },
  itemName: { margin: "0 0 6px" },
  description: { margin: 0, color: "#52525b", fontSize: 14 },
  itemActions: { marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" },
  qtyButtons: { display: "flex", gap: 8 },
  helpText: { color: "#71717a", fontSize: 14, margin: "8px 0 0" },
  textarea: { width: "100%", minHeight: 80, borderRadius: 14, border: "1px solid #d4d4d8", padding: 12, marginTop: 14, boxSizing: "border-box", fontFamily: "Arial, sans-serif" },
  select: { padding: 12, borderRadius: 12, border: "1px solid #d4d4d8", marginTop: 12 },
  cartLine: { display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: "1px solid #e5e7eb", fontSize: 14 },
  totalLine: { display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 19, margin: "16px 0" },
  empty: { background: "white", borderRadius: 22, padding: 30, textAlign: "center", color: "#71717a" },
  ordersGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 },
  orderTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  orderTable: { margin: 0, fontSize: 24 },
  badge: { background: "#e5e7eb", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 },
  noteBox: { background: "#f4f4f5", borderRadius: 14, padding: 12, fontSize: 14 },
  statusButtons: { display: "flex", flexWrap: "wrap", gap: 8 },
  message: { background: "#fef3c7", padding: 14, borderRadius: 16, marginBottom: 16, fontWeight: 700 },
  qrGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 },
  qrCard: { background: "white", borderRadius: 22, padding: 18, textAlign: "center", boxShadow: "0 8px 20px rgba(0,0,0,0.05)" },
  qrBox: { background: "white", padding: 16, display: "inline-block" },
  urlText: { fontSize: 12, color: "#52525b", wordBreak: "break-all" },
};