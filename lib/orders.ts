import { db } from "./supabase";

export type CartItem = { productId: string; qty: number };

export async function listProducts() {
  const { data, error } = await db
    .from("products")
    .select("id, name, unit, price_ngn, stock")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getOrCreateCustomer(telegramId: number, name?: string) {
  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from("customers")
    .insert({ telegram_id: telegramId, name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function createOrder(customerId: string, cart: CartItem[]) {
  if (cart.length === 0) throw new Error("Your cart is empty.");

  // Prices and stock always come from the database, never from the chat.
  const products = await listProducts();
  let total = 0;
  const lines = cart.map((c) => {
    const p = products.find((x) => x.id === c.productId);
    if (!p) throw new Error("That product is no longer available.");
    if (!(c.qty > 0)) throw new Error("Quantity must be more than zero.");
    if (Number(p.stock) < c.qty) {
      throw new Error(`Only ${p.stock} ${p.unit}(s) of ${p.name} in stock.`);
    }
    const price = Number(p.price_ngn);
    total += price * c.qty;
    return { product: p, qty: c.qty, price };
  });

  // The owner's rule: big orders need approval before payment.
  const { data: policy } = await db
    .from("merchant_policy")
    .select("approval_above_ngn")
    .eq("id", 1)
    .single();
  const needsApproval = policy ? total > Number(policy.approval_above_ngn) : false;

  const { data: order, error } = await db
    .from("orders")
    .insert({
      customer_id: customerId,
      total_ngn: total,
      status: needsApproval ? "pending_approval" : "awaiting_payment",
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: itemsError } = await db.from("order_items").insert(
    lines.map((l) => ({
      order_id: order.id,
      product_id: l.product.id,
      quantity: l.qty,
      unit_price_ngn: l.price,
    }))
  );
  if (itemsError) throw itemsError;

  await db.from("agent_actions").insert({
    order_id: order.id,
    action: "order_created",
    detail: { total, needsApproval },
  });

  return { orderId: order.id as string, total, needsApproval, lines };
}

export function formatInvoice(r: Awaited<ReturnType<typeof createOrder>>) {
  const naira = (n: number) => `₦${n.toLocaleString()}`;
  const lines = r.lines.map(
    (l) => `• ${l.qty} ${l.product.unit}(s) ${l.product.name} @ ${naira(l.price)} = ${naira(l.price * l.qty)}`
  );
  const status = r.needsApproval
    ? "This order is above the shop's limit, so the owner must approve it before payment."
    : "Payment options coming next.";
  return `INVOICE #${r.orderId.slice(0, 8)}\n\n${lines.join("\n")}\n\nTotal: ${naira(r.total)}\n\n${status}`;
}