/* eslint-disable @typescript-eslint/no-explicit-any */
import { ai, MODEL } from "./ai";
import { listProducts, getOrCreateCustomer, createOrder, formatInvoice } from "./orders";
import { addToCart, getCart, clearCart } from "./cart";

const naira = (n: number) => `₦${n.toLocaleString()}`;

const SYSTEM = `You are Oja, the friendly sales assistant for a fabric shop in Nigeria (Ankara and Aso Oke).
Rules:
- Always use the tools for products, prices, stock and totals. Never guess or invent them.
- You cannot change prices, give discounts or issue refunds. If asked, say the shop owner must approve that.
- Keep replies short and warm. Prices are in naira.
- Only call checkout when the customer clearly says they want to buy. If the quantity is unclear, ask.
- Talk only about the shop's products and the customer's order.`;

const tools: any[] = [
  { type: "function", function: { name: "list_products", description: "List products with their numbers, prices and stock.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "add_to_cart", description: "Add a product to the cart using its number from the product list.", parameters: { type: "object", properties: { product_number: { type: "integer" }, quantity: { type: "number" } }, required: ["product_number", "quantity"] } } },
  { type: "function", function: { name: "view_cart", description: "Show the cart and its total.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "checkout", description: "Turn the cart into an invoice.", parameters: { type: "object", properties: {} } } },
];

const history = new Map<number, any[]>();

async function runTool(name: string, args: any, userId: number, firstName?: string): Promise<string> {
  try {
    if (name === "list_products") {
      const ps = await listProducts();
      return ps
        .map((p, i) => `${i + 1}. ${p.name}: ${naira(Number(p.price_ngn))} per ${p.unit} (${p.stock} in stock)`)
        .join("\n");
    }
    if (name === "add_to_cart") {
      const ps = await listProducts();
      const p = ps[Number(args.product_number) - 1];
      const qty = Number(args.quantity);
      if (!p || !(qty > 0)) return "Invalid product number or quantity.";
      addToCart(userId, p.id, qty);
      return `Added ${qty} ${p.unit}(s) of ${p.name} to the cart.`;
    }
    if (name === "view_cart") {
      const cart = getCart(userId);
      if (cart.length === 0) return "The cart is empty.";
      const ps = await listProducts();
      let total = 0;
      const lines = cart.map((c) => {
        const p = ps.find((x) => x.id === c.productId)!;
        const sub = Number(p.price_ngn) * c.qty;
        total += sub;
        return `${c.qty} ${p.unit}(s) ${p.name} = ${naira(sub)}`;
      });
      return `${lines.join("\n")}\nTotal: ${naira(total)}`;
    }
    if (name === "checkout") {
      const cart = getCart(userId);
      if (cart.length === 0) return "The cart is empty.";
      const customerId = await getOrCreateCustomer(userId, firstName);
      const result = await createOrder(customerId, cart);
      clearCart(userId);
      return formatInvoice(result);
    }
    return "Unknown tool.";
  } catch (e) {
    return e instanceof Error ? e.message : "That action failed.";
  }
}

export async function runAgent(userId: number, firstName: string | undefined, text: string): Promise<string> {
  if (!process.env.NEAR_AI_API_KEY || !MODEL) {
    return "My AI assistant isn't switched on yet. You can still use /catalog, /add, /cart and /checkout.";
  }
  const past = history.get(userId) ?? [];
  const messages: any[] = [{ role: "system", content: SYSTEM }, ...past, { role: "user", content: text }];
  let reply = "";
  let invoice: string | null = null;

  for (let step = 0; step < 5; step++) {
    const res = await ai.chat.completions.create({ model: MODEL, messages, tools });
    const msg: any = res.choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      reply = msg.content ?? "";
      break;
    }
    for (const call of msg.tool_calls) {
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await runTool(call.function.name, args, userId, firstName);
      if (call.function.name === "checkout" && result.startsWith("INVOICE")) invoice = result;
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    if (invoice) break;
  }

  const finalText = invoice ?? (reply.trim() || "Sorry, I didn't catch that. Could you say it another way?");
  history.set(userId, [...past, { role: "user", content: text }, { role: "assistant", content: finalText }].slice(-8));
  return finalText;
}