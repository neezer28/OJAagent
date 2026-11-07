import { db } from "./supabase";
import { checkPayment } from "./payments";

const DONE = ["SUCCESS", "REFUNDED", "FAILED", "EXPIRED"];

type Notify = (telegramId: number, text: string) => Promise<unknown>;

async function telegramIdForOrder(orderId: string) {
  const { data: order } = await db
    .from("orders")
    .select("customer_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;
  const { data: customer } = await db
    .from("customers")
    .select("telegram_id")
    .eq("id", order.customer_id)
    .maybeSingle();
  return customer?.telegram_id ? Number(customer.telegram_id) : null;
}

// Checks every unfinished payment. Safe to call repeatedly.
export async function checkPendingPayments(notify: Notify) {
  const { data: pending, error } = await db
    .from("payments")
    .select("id, order_id, quote")
    .not("status", "in", `(${DONE.join(",")})`);
  if (error) throw error;

  for (const p of pending ?? []) {
    try {
      const status = await checkPayment(p.id);
      const telegramId = await telegramIdForOrder(p.order_id);

      if (status === "SUCCESS") {
        if (telegramId) await notify(telegramId, "Payment received. Your order is confirmed. Thank you!");
      } else if (status === "REFUNDED" || status === "FAILED") {
        if (telegramId) await notify(telegramId, `The payment ${status.toLowerCase()}. Your funds go back to your refund address. Send /pay to try again.`);
      } else {
        const deadline = new Date(p.quote?.quote?.deadline ?? "");
        if (!isNaN(deadline.getTime()) && Date.now() > deadline.getTime()) {
          await db
            .from("payments")
            .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
            .eq("id", p.id);
          await db.from("agent_actions").insert({
            order_id: p.order_id,
            action: "payment_expired",
            detail: {},
          });
          if (telegramId) await notify(telegramId, "Your payment request has expired. Send /pay again if you still want to pay.");
        }
      }
    } catch (e) {
      console.error("Payment check error for", p.id, e);
    }
  }
}