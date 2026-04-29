import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
import.meta.env.VITE_SUPABASE_URL,
import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function App() {
const [orders, setOrders] = useState([]);
const isAdmin = new URLSearchParams(window.location.search).get("admin");

useEffect(() => {
fetchOrders();

```
const channel = supabase
  .channel("orders")
  .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetchOrders)
  .subscribe();

return () => {
  supabase.removeChannel(channel);
};
```

}, []);

async function fetchOrders() {
const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
setOrders(data || []);
}

async function addOrder() {
const table = new URLSearchParams(window.location.search).get("mesa") || "1";

```
await supabase.from("orders").insert([
  {
    table_number: table,
    items: [{ name: "Pedido demo", qty: 1 }],
    total: 100,
  },
]);
```

}

async function updateStatus(id, status) {
await supabase.from("orders").update({ status }).eq("id", id);
}

async function deleteOrder(id) {
await supabase.from("orders").delete().eq("id", id);
}

if (isAdmin) {
return (
<div style={{ padding: 20 }}> <h1>Pedidos</h1>
{orders.map((o) => (
<div key={o.id} style={{ border: "1px solid #ccc", marginBottom: 10, padding: 10 }}> <p>Mesa: {o.table_number}</p> <p>Status: {o.status}</p>
<button onClick={() => updateStatus(o.id, "Preparando")}>Preparando</button>
<button onClick={() => updateStatus(o.id, "Entregado")}>Entregado</button>
<button onClick={() => deleteOrder(o.id)}>Cancelar</button> </div>
))} </div>
);
}

return (
<div style={{ padding: 20 }}> <h1>Menú</h1> <button onClick={addOrder}>Pedir</button> </div>
);
}
