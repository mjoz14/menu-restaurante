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

  if (params.get("admin") === "1") return "staff";
  if (params.get("finance") === "1") return "finance";

  return "customer";
}

export default function App() {
  const [view, setView] = useState(getInitialView());
  const [tableNumber, setTableNumber] = useState(getTableFromUrl());
  const [cart, setCart] = useState({});
  const [notes, setNotes] = useState("");
  const [orders, setOrders] = useState([]);
  const [closedAccounts, setClosedAccounts] = useState([]);
  const [financeTableFilter, setFinanceTableFilter] = useState("");
  const [financeDateFilter, setFinanceDateFilter] = useState("");
  const [financeStartTime, setFinanceStartTime] = useState("");
  const [financeEndTime, setFinanceEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const ADMIN_PIN = "1234";
const [pinInput, setPinInput] = useState("");
const [isUnlocked, setIsUnlocked] = useState(false);

  const baseUrl = window.location.origin;

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => ({ ...menu.find((item) => item.id === id), qty }))
      .filter((item) => item.qty > 0);
  }, [cart]);

  const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const categories = Array.from(new Set(menu.map((item) => item.category)));
// auto refresh
  useEffect(() => {
  loadOrders();
  loadClosedAccounts();

  const channel = supabase
    .channel("orders-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      () => loadOrders()
    )
    .subscribe();

  const interval = setInterval(() => {
    loadOrders();
    loadClosedAccounts();
  }, 5000);

  return () => {
    supabase.removeChannel(channel);
    clearInterval(interval);
  };
  
}, []);

// 👇 AQUÍ

//autorefresh

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
async function loadClosedAccounts() {
  const { data, error } = await supabase
    .from("closed_accounts")
    .select("*")
    .order("closed_at", { ascending: false });

  if (error) {
    console.error(error);
    setMessage("Error cargando finanzas.");
    return;
  }

  setClosedAccounts(data || []);
}
  function addItem(id) {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }

  function removeItem(id) {
    setCart((prev) => ({ ...prev, [id]: Math.max((prev[id] || 0) - 1, 0) }));
  }
async function getOrCreateAccountCode() {
  const { data: open } = await supabase
    .from("orders")
    .select("account_code")
    .eq("table_number", tableNumber)
    .eq("account_closed", false)
    .not("account_code", "is", null)
    .limit(1);

  if (open && open.length > 0) {
    return open[0].account_code;
  }

  const now = new Date();

  const mesa = String(tableNumber).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);

  const hh = String(now.getHours()).padStart(2, "0");
const min = String(now.getMinutes()).padStart(2, "0");
const ss = String(now.getSeconds()).padStart(2, "0");

const prefix = `${mesa}${dd}${mm}${yy}${hh}${min}${ss}`;

  return prefix;
}
  async function placeOrder() {
    if (!cartItems.length) return;
    setLoading(true);
    setMessage("");

   const accountCode = await getOrCreateAccountCode();

const payload = {
  table_number: tableNumber,
  account_code: accountCode,
  account_closed: false,
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


async function callWaiter() {
  const { error } = await supabase.from("orders").insert({
    table_number: tableNumber,
    account_code: `WAITER-${tableNumber}-${Date.now()}`,
    account_closed: false,
    items: [
      {
        id: "call-waiter",
        name: "Llamar mesero",
        qty: 1,
        price: 0,
        service_call: true,
      },
    ],
    notes: "La mesa solicita al mesero.",
    total: 0,
    status: "Nuevo",
  });

  if (error) {
    console.error(error);
    setMessage("No se pudo llamar al mesero.");
    return;
  }

  setMessage("");
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
  async function cancelItem(order, itemId) {
  const confirmed = window.confirm("¿Seguro que quieres cancelar este item?");
  if (!confirmed) return;

  const updatedItems = (order.items || []).map((item) =>
    item.id === itemId ? { ...item, cancelled: true } : item
  );

  const newTotal = updatedItems
    .filter((item) => !item.cancelled)
    .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

  const { error } = await supabase
    .from("orders")
    .update({
      items: updatedItems,
      total: newTotal,
    })
    .eq("id", order.id);

  if (error) {
    console.error(error);
    setMessage("No se pudo cancelar el item.");
    return;
  }

  loadOrders();
}
{/*async function closeAccount(group) {
  const confirm = window.confirm("¿Confirmas que la cuenta fue pagada?");
  if (!confirm) return;

  // Solo pedidos entregados cuentan
  const deliveredOrders = group.orders.filter(
    (order) => order.status === "Entregado"
  );

  const paidTotal = deliveredOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );

  // Hora de apertura (primer pedido)
  const openedAt = group.orders
    .map((order) => new Date(order.created_at))
    .sort((a, b) => a - b)[0];

  // Guardar en tabla de finanzas
  const { error: insertError } = await supabase
    .from("closed_accounts")
    .insert({
      account_code: group.account_code,
      table_number: group.table_number,
      total: paidTotal,
      opened_at: openedAt,
      orders: group.orders,
    });

  if (insertError) {
    console.error(insertError);
    setMessage("Error guardando en finanzas");
    return;
  }

  // Cerrar cuenta
  const { error: updateError } = await supabase
    .from("orders")
    .update({ account_closed: true })
    .eq("account_code", group.account_code);

  if (updateError) {
    console.error(updateError);
    setMessage("Error cerrando cuenta");
    return;
  }

  setMessage("Cuenta cerrada correctamente 💸");
  loadOrders();
}*/}
async function closeAccount(group) {
  const confirmed = window.confirm("¿Confirmas que la cuenta está cerrada?");
  if (!confirmed) return;

  const { error } = await supabase
    .from("orders")
    .update({ account_closed: true })
    .eq("account_code", group.account_code);

  if (error) {
    console.error(error);
    setMessage("Error cerrando cuenta");
    return;
  }

  setMessage("Cuenta cerrada. Pendiente de pago.");
  loadOrders();
}
async function payAccount(group) {
  const confirmed = window.confirm("¿Confirmas que la cuenta fue pagada?");
  if (!confirmed) return;

  const deliveredOrders = group.orders.filter(
    (order) => order.status === "Entregado"
  );

  const paidTotal = deliveredOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );

  const openedAt = group.orders
    .map((order) => new Date(order.created_at))
    .sort((a, b) => a - b)[0];

  const { error: insertError } = await supabase
    .from("closed_accounts")
    .insert({
      account_code: group.account_code,
      table_number: group.table_number,
      total: paidTotal,
      opened_at: openedAt,
      orders: group.orders,
    });

  if (insertError) {
    console.error(insertError);
    setMessage("Error guardando en finanzas");
    return;
  }

  const { error: deleteError } = await supabase
    .from("orders")
    .delete()
    .eq("account_code", group.account_code);

  if (deleteError) {
    console.error(deleteError);
    setMessage("Se guardó en finanzas, pero no se pudo quitar del admin.");
    return;
  }

  setMessage("Cuenta pagada y guardada en finanzas.");
  loadOrders();
}
const groupedOrders = Object.values(
  orders.reduce((acc, order) => {
	  if ((order.items || []).some((item) => item.service_call)) {
      return acc;
    }
    const key = order.account_code || `Sin cuenta - Mesa ${order.table_number}`;

    if (!acc[key]) {
      acc[key] = {
        account_code: key,
        table_number: order.table_number,
        orders: [],
        total: 0,
        latest_status: order.status,
      };
    }
	const hasActiveWaiterCall = orders.some(
  (order) =>
    String(order.table_number) === String(tableNumber) &&
    (order.items || []).some((item) => item.service_call)
);

    if (!(order.items || []).some((item) => item.service_call)) {
  acc[key].orders.push(order);
}
    if (order.status === "Entregado") {
  acc[key].total += Number(order.total || 0);
}

    return acc;
  }, {})
);
  const filteredClosedAccounts = closedAccounts.filter((account) => {
  const closedDate = new Date(account.closed_at);

  const matchesTable =
    !financeTableFilter ||
    String(account.table_number) === String(financeTableFilter);

  const matchesDate =
    !financeDateFilter ||
    closedDate.toISOString().slice(0, 10) === financeDateFilter;

  const closedTime = closedDate.toTimeString().slice(0, 5);

  const matchesStartTime =
    !financeStartTime || closedTime >= financeStartTime;

  const matchesEndTime =
    !financeEndTime || closedTime <= financeEndTime;

  return matchesTable && matchesDate && matchesStartTime && matchesEndTime;
});

const filteredFinanceTotal = filteredClosedAccounts.reduce(
  (sum, account) => sum + Number(account.total || 0),
  0
);

const waiterCalls = orders.filter((order) =>
  (order.items || []).some((item) => item.service_call)
);

function hasWaiterCall(table) {
  return waiterCalls.some(
    (call) => String(call.table_number) === String(table)
  );
}

async function clearWaiterCall(table) {
  const callsToClear = waiterCalls.filter(
    (call) => String(call.table_number) === String(table)
  );

  for (const call of callsToClear) {
    await supabase.from("orders").delete().eq("id", call.id);
  }

  loadOrders();
}
if ((view === "staff" || view === "finance") && !isUnlocked) {
  return (
    <div style={styles.page}>
      <div style={{ ...styles.card, maxWidth: 400, margin: "80px auto" }}>
        <h2 style={styles.sectionTitle}>Acceso restringido</h2>
        <p style={styles.helpText}>Ingresa el PIN para continuar.</p>

        <input
          style={styles.select}
          type="password"
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value)}
          placeholder="PIN"
        />

        <button
          style={{ ...styles.primaryButton, marginTop: 12, width: "100%" }}
          onClick={() => {
            if (pinInput === ADMIN_PIN) {
              setIsUnlocked(true);
              setMessage("");
            } else {
              setMessage("PIN incorrecto.");
            }
          }}
        >
          Entrar
        </button>

        {message && <div style={styles.message}>{message}</div>}
      </div>
    </div>
  );
}
return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>MVP restaurante</div>
            <h1 style={styles.title}>Menú dinámico</h1>
            <p style={styles.subtitle}>Si no quieres hablar con un mesero hazlo tu solo.</p>
          </div>
         {!new URLSearchParams(window.location.search).get("mesa") && (
  <div style={styles.switcher}>
    <button
      style={view === "customer" ? styles.primaryButton : styles.secondaryButton}
      onClick={() => setView("customer")}
    >
      Cliente
    </button>

    <button
      style={view === "staff" ? styles.primaryButton : styles.secondaryButton}
      onClick={() => setView("staff")}
    >
      Personal
    </button>

    <button
      style={view === "qr" ? styles.primaryButton : styles.secondaryButton}
      onClick={() => setView("qr")}
    >
      QRs
    </button>

    <button
      style={view === "finance" ? styles.primaryButton : styles.secondaryButton}
      onClick={() => setView("finance")}
    >
      Finanzas
    </button>
  </div>
)}
        </header>

        {message && <div style={styles.message}>{message}</div>}

        {view === "customer" && (
          <div style={styles.layout}>
            <main>
              <section style={styles.card}>
                <h2 style={styles.sectionTitle}>Mesa {tableNumber}</h2>
                <p style={styles.helpText}>Tu pedido quedará ligado a esta mesa.</p>
				<button
  style={{ ...styles.secondaryButton, marginTop: 12 }}
  onClick={callWaiter}
>
  Llamar mesero
</button>

{orders.some(
  (order) =>
    String(order.table_number) === String(tableNumber) &&
    (order.items || []).some((item) => item.service_call)
) && (
  <p style={{ color: "#dc2626", fontWeight: "bold", marginTop: 8 }}>
    🔔 Mesero solicitado
  </p>
)}

{orders
  .filter((order) => String(order.table_number) === String(tableNumber))
  .filter((order) => order.account_closed === false)
  .filter((order) => !(order.items || []).some((item) => item.service_call))
  .slice(0, 1)
  .map((order) => {
	  {/*const totalCuenta = orders
      .filter((o) =>
        String(o.table_number) === String(tableNumber) &&
  o.account_code === order.account_code &&
  o.account_closed === false &&
  o.status === "Entregado"
      )
      .reduce((sum, o) => sum + Number(o.total || 0), 0);*/}
const pedidosDeCuenta = orders.filter(
  (o) =>
    String(o.table_number) === String(tableNumber) &&
    o.account_code === order.account_code &&
    o.account_closed === false &&
    !(o.items || []).some((item) => item.service_call)
);

const totalPedido = pedidosDeCuenta.reduce(
  (sum, o) => sum + Number(o.total || 0),
  0
);

const totalEntregado = pedidosDeCuenta
  .filter((o) => o.status === "Entregado")
  .reduce((sum, o) => sum + Number(o.total || 0), 0);
    return (
      <div key={order.id} style={styles.accountCode}>
        <p>Cuenta: {order.account_code}</p>
			{/* <p style={{ fontWeight: "bold", marginTop: 6 }}>
          Total cuenta: {money(totalCuenta)}
			</p>*/}
			<p style={{ marginTop: 6 }}>
  Total pedido: <strong>{money(totalPedido)}</strong>
</p>

<p style={{ color: "#16a34a", fontWeight: "bold" }}>
  Total entregado: {money(totalEntregado)}
</p>
      </div>
    );
  })}
					{/* <select style={styles.select} value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}>
                  {tableNumbers.map((n) => <option key={n} value={n}>Mesa {n}</option>)}
					</select>*/}
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
                            <button style={styles.smallButton} onClick={() => removeItem(item.id)}>−</button>
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
             {cartItems.length === 0 ? (
  <p style={styles.helpText}>Todavía no hay productos.</p>
) : (
  cartItems.map((item) => (
    <div key={item.id} style={styles.cartLine}>
      <span>{item.qty} × {item.name}</span>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <strong>{money(item.qty * item.price)}</strong>

        <button
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "none",
            background: "#ef4444",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => {
            setCart((prev) => ({
              ...prev,
              [item.id]: 0,
            }));
          }}
        >
          ×
        </button>
      </div>
    </div>
  ))
)}
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

  <div style={styles.tableButtonGrid}>
    {tableNumbers.map((table) => {
      const active = hasWaiterCall(table);

      return (
        <button
          key={table}
          style={{
            ...styles.tableButton,
            background: active ? "#dc2626" : "#16a34a",
          }}
          onClick={() => clearWaiterCall(table)}
        >
          Mesa {table}
        </button>
      );
    })}
  </div>
</section>

			 {orders.length === 0 ? <section style={styles.empty}>No hay pedidos todavía.</section> : (
              <div style={styles.ordersGrid}>
				  {/*{orders.map((order) => (
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
			 ))}*/}
			 {groupedOrders.map((group) => (
  <div key={group.account_code} style={styles.card}>
    <div style={styles.orderTop}>
      <div>
        <h3 style={styles.orderTable}>Mesa {group.table_number}</h3>
        <p style={styles.accountCode}>Cuenta: {group.account_code}</p>
      </div>
      <span
  style={{
    ...styles.badge,
    background: group.orders.some(o => o.account_closed)
      ? "#d1fae5"
      : "#fef3c7",
    color: group.orders.some(o => o.account_closed)
      ? "#065f46"
      : "#92400e"
  }}
>
  {group.orders.some(o => o.account_closed)
    ? "Cuenta cerrada"
    : "Cuenta abierta"}
</span>
    </div>

    {group.orders.map((order) => (
      <div
  key={order.id}
  style={{
    ...styles.noteBox,
    borderLeft: `6px solid ${
      order.status === "Nuevo"
        ? "#3b82f6"
        : order.status === "Preparado"
        ? "#f59e0b"
        : order.status === "Entregado"
        ? "#10b981"
        : order.status === "Cancelado"
        ? "#ef4444"
        : "#e5e7eb"
    }`
  }}
>
        <strong>Pedido:</strong> {new Date(order.created_at).toLocaleString("es-MX")}

			{/*{(order.items || []).map((item) => (
          <div key={item.id} style={styles.cartLine}>
            <span>{item.qty} × {item.name}</span>
            <strong>{money(item.qty * item.price)}</strong>
          </div>
			))}*/}
			{(order.items || []).map((item) => (
  <div
    key={item.id}
    style={{
      ...styles.cartLine,
      opacity: item.cancelled ? 0.45 : 1,
      textDecoration: item.cancelled ? "line-through" : "none",
    }}
  >
    <span>
      {item.qty} × {item.name}
      {item.cancelled ? " — Cancelado" : ""}
    </span>

    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <strong>{money(item.qty * item.price)}</strong>

      {!item.cancelled && !order.account_closed && (
        <button
  style={{
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "none",
    background: "#ef4444",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  }}
  onClick={() => {
    const confirmed = window.confirm("¿Cancelar este item?");
    if (confirmed) {
      cancelItem(order, item.id);
    }
  }}
>
  ×
</button>
      )}
    </div>
  </div>
))}

        {order.notes && <p><strong>Notas:</strong> {order.notes}</p>}

        <div style={styles.statusButtons}>
 <button
  style={styles.secondaryButton}
  onClick={() => updateStatus(order.id, "Preparado")}
>
  Preparado
</button>

<button
  style={styles.primaryButton}
  onClick={() => updateStatus(order.id, "Entregado")}
>
  Entregado
</button>
</div>
      </div>
    ))}
	

    <div style={styles.totalLine}>
      <span>Total cuenta</span>
      <span>{money(group.total)}</span>
    </div>
	{group.orders.every((o) => o.account_closed) ? (
  <button
    style={{ ...styles.primaryButton, marginTop: 10, width: "100%" }}
    onClick={() => payAccount(group)}
  >
    Cuenta pagada
  </button>
) : (
  <button
    style={{ ...styles.primaryButton, marginTop: 10, width: "100%" }}
    onClick={() => closeAccount(group)}
  >
    Cerrar cuenta
  </button>
)}
	{/*<button
  style={{ ...styles.primaryButton, marginTop: 10, width: "100%" }}
  onClick={() => closeAccount(group)}
>
  Cerrar cuenta
			 </button>*/}
  </div>
))}
              </div>
            )}
          </main>
        )}
        {view === "finance" && (
  <main>
    <section style={styles.card}>
      <h2 style={styles.sectionTitle}>Finanzas</h2>
      <p style={styles.helpText}>
        Cuentas cerradas y pagadas. URL: {baseUrl}/?finance=1
      </p>
	  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
  <select
    style={styles.select}
    value={financeTableFilter}
    onChange={(e) => setFinanceTableFilter(e.target.value)}
  >
    <option value="">Todas las mesas</option>
    {tableNumbers.map((n) => (
      <option key={n} value={n}>Mesa {n}</option>
    ))}
  </select>

  <input
    style={styles.select}
    type="date"
    value={financeDateFilter}
    onChange={(e) => setFinanceDateFilter(e.target.value)}
  />

  <input
    style={styles.select}
    type="time"
    value={financeStartTime}
    onChange={(e) => setFinanceStartTime(e.target.value)}
  />

  <input
    style={styles.select}
    type="time"
    value={financeEndTime}
    onChange={(e) => setFinanceEndTime(e.target.value)}
  />

  <button
    style={styles.secondaryButton}
    onClick={() => {
      setFinanceTableFilter("");
      setFinanceDateFilter("");
      setFinanceStartTime("");
      setFinanceEndTime("");
    }}
  >
    Limpiar filtros
  </button>
</div>

<div style={styles.totalLine}>
  <span>Total filtrado</span>
  <span>{money(filteredFinanceTotal)}</span>
</div>
    </section>

    {filteredClosedAccounts.length === 0 ? (
      <section style={styles.empty}>No hay cuentas pagadas todavía.</section>
    ) : (
      <div style={styles.ordersGrid}>
        {filteredClosedAccounts.map((account) => (
          <div key={account.id} style={styles.card}>
            <h3 style={styles.orderTable}>Mesa {account.table_number}</h3>
            <p style={styles.accountCode}>Cuenta: {account.account_code}</p>

            <p>
              <strong>Total pagado:</strong> {money(account.total)}
            </p>

            <p>
              <strong>Abierta:</strong>{" "}
              {account.opened_at
                ? new Date(account.opened_at).toLocaleString("es-MX")
                : "N/A"}
            </p>

            <p>
              <strong>Cerrada:</strong>{" "}
              {new Date(account.closed_at).toLocaleString("es-MX")}
            </p>

            <details>
              <summary>Ver pedidos</summary>

              {(account.orders || []).map((order) => (
                <div key={order.id} style={styles.noteBox}>
                  <p>
                    <strong>Status:</strong> {order.status}
                  </p>

                  {(order.items || []).map((item) => (
                    <div key={item.id} style={styles.cartLine}>
                      <span>
                        {item.qty} × {item.name}
                        {item.cancelled ? " — Cancelado" : ""}
                      </span>
                      <strong>{money(item.qty * item.price)}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </details>
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
 // layout: { display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 },
 layout: {display: "grid", gridTemplateColumns: window.innerWidth < 768 ? "1fr" : "1fr 340px", gap: 20,},
  card: { background: "white", borderRadius: 22, padding: 18, marginBottom: 16, boxShadow: "0 8px 20px rgba(0,0,0,0.05)" },
 // cartCard: { background: "white", borderRadius: 22, padding: 18, height: "fit-content", position: "sticky", top: 20, boxShadow: "0 8px 20px rgba(0,0,0,0.05)" },
 cartCard: {background: "white", borderRadius: 22, padding: 18, height: "fit-content", position: window.innerWidth < 768 ? "static" : "sticky", top: 20, boxShadow: "0 8px 20px rgba(0,0,0,0.05)",},
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
  mobileNote: {  fontSize: 13,  color: "#71717a",},
  tableButtonGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
  gap: 10,
  marginTop: 16,
},

tableButton: {
  color: "white",
  border: "none",
  borderRadius: 12,
  padding: "14px 10px",
  fontWeight: 800,
  cursor: "pointer",
},
};
