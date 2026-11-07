import { Bot, InlineKeyboard } from "grammy";
import { db } from "../lib/supabase";

const ownerId = Number(process.env.OWNER_TELEGRAM_ID);

// Sends the owner a message with Approve / Reject buttons.
export async function askOwnerToApprove(
  bot: Bot,
  orderId: string,
  total: number,
  customerName: string
) {
  if (!ownerId) {
    console.error("OWNER_TELEGRAM_ID is not set");
    return;
  }
  const keyboard = new InlineKeyboard()
    .text("Approve", `approve:${orderId}`)
    .text("Reject", `reject:${orderId}`);
  await bot.api.sendMessage(
    ownerId,
    `Order #${orderId.slice(0, 8)} needs your approval.\nCustomer: ${customerName}\nTotal: ₦${total.toLocaleString()}`,
    { reply_markup: keyboard }
  );
}

// Handles the button presses. Only the owner's Telegram account is accepted.
export function registerApprovals(bot: Bot) {
  bot.callbackQuery(/^(approve|reject):(.+)$/, async (ctx) => {
    if (!ownerId || ctx.from?.id !== ownerId) {
      return ctx.answerCallbackQuery({
        text: "Only the shop owner can do this.",
        show_alert: true,
      });
    }

    const approved = ctx.match[1] === "approve";
    const orderId = ctx.match[2];

    // Only changes the order if it is still waiting for approval.
    const { data: order, error } = await db
      .from("orders")
      .update({ status: approved ? "awaiting_payment" : "rejected" })
      .eq("id", orderId)
      .eq("status", "pending_approval")
      .select("id, customer_id")
      .maybeSingle();

    if (error) {
      console.error(error);
      return ctx.answerCallbackQuery({
        text: "Something went wrong. Please try again.",
        show_alert: true,
      });
    }
    if (!order) {
      return ctx.answerCallbackQuery({
        text: "This order was already handled.",
        show_alert: true,
      });
    }

    await db.from("agent_actions").insert({
      order_id: order.id,
      action: approved ? "owner_approved" : "owner_rejected",
      detail: { by_telegram_id: ctx.from.id },
    });

    await ctx.answerCallbackQuery({ text: approved ? "Approved" : "Rejected" });
    await ctx.editMessageText(
      `Order #${orderId.slice(0, 8)}: ${approved ? "APPROVED" : "REJECTED"}`
    );

    // Tell the customer.
    try {
      const { data: customer } = await db
        .from("customers")
        .select("telegram_id")
        .eq("id", order.customer_id)
        .maybeSingle();
      if (customer?.telegram_id) {
        await bot.api.sendMessage(
          Number(customer.telegram_id),
          approved
            ? "The shop owner approved your order. To pay with USDC, send: /pay base 0xYourWalletAddress (chains: base, arb, eth)"
            : "Sorry, the shop owner did not approve this order."
        );
      }
    } catch (e) {
      console.error("Could not message the customer", e);
    }
  });
}