import { Bot } from "grammy";
import { db } from "../lib/supabase";
import { getOrCreateCustomer } from "../lib/orders";
import { createPaymentRequest, checkPayment, chainOptions } from "../lib/payments";
import { checkPendingPayments } from "../lib/recovery";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs in the background so the bot keeps answering other customers.
async function watchPayment(bot: Bot, chatId: number, paymentId: string) {
  const end = Date.now() + 30 * 60 * 1000;
  while (Date.now() < end) {
    await sleep(10_000);
    try {
      const status = await checkPayment(paymentId);
      if (status === "SUCCESS") {
        await bot.api.sendMessage(chatId, "Payment received. Your order is confirmed. Thank you!");
        return;
      }
      if (status === "REFUNDED" || status === "FAILED") {
        await bot.api.sendMessage(
          chatId,
          `The payment ${status.toLowerCase()}. Your funds go back to your refund address. Send /pay to try again.`
        );
        return;
      }
    } catch (e) {
      console.error("Status check error:", e);
    }
  }
  await bot.api.sendMessage(chatId, "I didn't see your payment in time. Send /pay again if you still want to pay.");
}

export function registerPayments(bot: Bot) {
      // Checks every unfinished payment until its deadline, even after a restart.
  let polling = false;
  setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      await checkPendingPayments((id, text) => bot.api.sendMessage(id, text));
    } catch (e) {
      console.error("Payment check error:", e);
    } finally {
      polling = false;
    }
  }, 30_000);
  bot.command("pay", async (ctx) => {
    const [chain, address] = ctx.match.trim().split(/\s+/);
    if (!chain || !address) {
      return ctx.reply(
        `To pay, send:\n/pay <chain> <your refund address>\n\nChains: ${chainOptions().join(", ")}\nExamples:\n/pay base 0xYourWalletAddress\n/pay near yourname.near\n\nThe refund address is where your money goes back if the payment fails.`
      );
    }
    try {
      const customerId = await getOrCreateCustomer(ctx.from!.id, ctx.from!.first_name);
      const { data: order } = await db
        .from("orders")
        .select("id")
        .eq("customer_id", customerId)
        .eq("status", "awaiting_payment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!order) return ctx.reply("You have no order waiting for payment. Send /checkout first.");

      const p = await createPaymentRequest(order.id, chain.toLowerCase(), address.trim());
      await ctx.reply(
        `Send at least ${p.amountIn} ${p.label} (round UP if your wallet limits decimals) to:\n\n${p.depositAddress}\n\nSend it before ${new Date(p.deadline).toUTCString()}.\nOnly send ${p.label}. Anything else may be lost.\n\nI'll confirm here as soon as it arrives.`
      );
    } catch (e) {
      await ctx.reply(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  });
}