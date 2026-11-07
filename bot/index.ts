import { Bot } from "grammy";
import { listProducts, getOrCreateCustomer, createOrder, formatInvoice } from "../lib/orders";
import { addToCart, getCart, clearCart } from "../lib/cart";
import { runAgent } from "../lib/agent";
   import { registerPayments } from "./pay";
   import { askOwnerToApprove, registerApprovals } from "./approvals";
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const naira = (n: number) => `₦${n.toLocaleString()}`;

bot.command("start", (ctx) =>
  ctx.reply(
    "Welcome to Oja! Just tell me what you'd like, for example: \"I want 6 yards of the blue Ankara\".\n\nOr use:\n/catalog - see products\n/add <number> <quantity> - add to cart\n/cart - view your cart\n/checkout - get your invoice"
  )
);

bot.command("catalog", async (ctx) => {
  const products = await listProducts();
  const lines = products.map(
    (p, i) => `${i + 1}. ${p.name}: ${naira(Number(p.price_ngn))} per ${p.unit} (${p.stock} in stock)`
  );
  await ctx.reply(lines.join("\n") + "\n\nTo order: /add 1 6 (item 1, quantity 6)");
});

bot.command("add", async (ctx) => {
  const [numStr, qtyStr] = ctx.match.trim().split(/\s+/);
  const qty = Number(qtyStr);
  const products = await listProducts();
  const product = products[Number(numStr) - 1];
  if (!product || !(qty > 0)) {
    return ctx.reply("Use: /add <item number> <quantity>, for example /add 1 6");
  }
  addToCart(ctx.from!.id, product.id, qty);
  return ctx.reply(
    `Added ${qty} ${product.unit}(s) of ${product.name}. Send /cart to review or /checkout to get your invoice.`
  );
});

bot.command("whoami", (ctx) => ctx.reply(`Your Telegram ID: ${ctx.from!.id}`));
bot.command("cart", async (ctx) => {
  const cart = getCart(ctx.from!.id);
  if (cart.length === 0) return ctx.reply("Your cart is empty. Send /catalog to browse.");
  const products = await listProducts();
  let total = 0;
  const lines = cart.map((c) => {
    const p = products.find((x) => x.id === c.productId)!;
    const sub = Number(p.price_ngn) * c.qty;
    total += sub;
    return `• ${c.qty} ${p.unit}(s) ${p.name} = ${naira(sub)}`;
  });
  return ctx.reply(lines.join("\n") + `\n\nTotal: ${naira(total)}`);
});

bot.command("checkout", async (ctx) => {
  const cart = getCart(ctx.from!.id);
  if (cart.length === 0) return ctx.reply("Your cart is empty. Send /catalog to browse.");
  try {
    const customerId = await getOrCreateCustomer(ctx.from!.id, ctx.from!.first_name);
    const result = await createOrder(customerId, cart);
    clearCart(ctx.from!.id);
        if (result.needsApproval) {
      await askOwnerToApprove(bot, result.orderId, result.total, ctx.from!.first_name).catch(console.error);
    }
    return ctx.reply(formatInvoice(result));
  } catch (e) {
    return ctx.reply(e instanceof Error ? e.message : "Something went wrong. Please try again.");
  }
});
   registerPayments(bot);
   registerApprovals(bot);
// Any normal message (not a /command) goes to the AI assistant.
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  try {
    await ctx.replyWithChatAction("typing");
    const reply = await runAgent(ctx.from.id, ctx.from.first_name, ctx.message.text, (orderId, total, name) => askOwnerToApprove(bot, orderId, total, name));
    await ctx.reply(reply);
  } catch (e) {
    console.error("Agent error:", e);
    await ctx.reply("I'm having trouble thinking right now. You can still use /catalog, /add, /cart and /checkout.");
  }
});

bot.catch((err) => console.error("Bot error:", err.message));
bot.start({ onStart: (me) => console.log(`Bot @${me.username} is running`) });