import { QuoteRequest } from "@defuse-protocol/one-click-sdk-typescript";
import { OneClickService } from "./intents";
import { db } from "./supabase";

// If the exact-output test in Step 2 fails, change this to "EXACT_INPUT".
const SWAP_TYPE = "EXACT_OUTPUT";

const NEAR_USDC = process.env.NEAR_USDC_ASSET_ID!;
const MERCHANT = process.env.MERCHANT_NEAR_ACCOUNT ?? "neezer.near";
// Demo exchange rate. Set NGN_PER_USD in .env.local; a real product would use a live rate.
const NGN_PER_USD = Number(process.env.NGN_PER_USD ?? "1500");

const ORIGINS: Record<string, { asset: string; label: string }> = {
  base: { asset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", label: "USDC on Base" },
  arb: { asset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", label: "USDC on Arbitrum" },
  eth: { asset: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", label: "USDC on Ethereum" },
  near: { asset: "nep141:wrap.near", label: "NEAR" },
};

export const chainOptions = () => Object.keys(ORIGINS);

export async function createPaymentRequest(orderId: string, chain: string, refundAddress: string) {
  const origin = ORIGINS[chain];
  if (!origin) throw new Error(`Choose one of: ${chainOptions().join(", ")}`);
  const validRefund =
    chain === "near"
      ? /^([a-z0-9_-]+\.)+near$|^[a-f0-9]{64}$/.test(refundAddress.trim().toLowerCase())
      : /^0x[a-fA-F0-9]{40}$/.test(refundAddress);
  if (!validRefund) {
    throw new Error(
      chain === "near"
        ? "That refund address doesn't look right. For NEAR, send your account name, like yourname.near."
        : "That refund address doesn't look right. It should start with 0x and be 42 characters long."
    );
  }

  const { data: order, error } = await db
    .from("orders")
    .select("id, total_ngn, status")
    .eq("id", orderId)
    .single();
  if (error || !order) throw new Error("Order not found.");
  if (order.status !== "awaiting_payment") throw new Error("This order isn't ready for payment.");

  const usdcUnits = Math.ceil((Number(order.total_ngn) / NGN_PER_USD) * 1_000_000);

  const res = await OneClickService.getQuote({
    dry: false,
    swapType: SWAP_TYPE as unknown as QuoteRequest["swapType"],
    slippageTolerance: 100,
    originAsset: origin.asset,
    depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
    destinationAsset: NEAR_USDC,
    amount: String(usdcUnits),
    refundTo: refundAddress.toLowerCase(),
    refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
    recipient: MERCHANT,
    recipientType: QuoteRequest.recipientType.INTENTS,
    deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  const q = res.quote;

  const { data: payment, error: payErr } = await db
    .from("payments")
    .insert({
      order_id: orderId,
      deposit_address: q.depositAddress,
      origin_asset: origin.asset,
      amount_in: q.amountInFormatted,
      amount_out: q.amountOutFormatted,
      status: "PENDING_DEPOSIT",
      quote: res,
    })
    .select("id")
    .single();
  if (payErr) throw payErr;

  await db.from("agent_actions").insert({
    order_id: orderId,
    action: "payment_requested",
    detail: { chain, amountIn: q.amountInFormatted },
  });

  return {
    paymentId: payment.id as string,
    depositAddress: q.depositAddress as string,
    amountIn: q.amountInFormatted as string,
    label: origin.label,
    deadline: (q.deadline ?? new Date(Date.now() + 20 * 60 * 1000).toISOString()) as string,
  };
}

async function markPaid(orderId: string) {
  const { data: updated } = await db
    .from("orders")
    .update({ status: "paid" })
    .eq("id", orderId)
    .neq("status", "paid")
    .select("id");
  if (!updated || updated.length === 0) return; // already handled

  const { data: items } = await db
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId);
  for (const it of items ?? []) {
    const { data: prod } = await db.from("products").select("stock").eq("id", it.product_id).single();
    if (prod) {
      await db
        .from("products")
        .update({ stock: Number(prod.stock) - Number(it.quantity) })
        .eq("id", it.product_id);
    }
  }
  await db.from("agent_actions").insert({ order_id: orderId, action: "order_paid", detail: {} });
}

export async function checkPayment(paymentId: string) {
  const { data: p } = await db.from("payments").select("*").eq("id", paymentId).single();
  if (!p) throw new Error("Payment not found.");

  const url = `https://1click.chaindefuser.com/v0/status?depositAddress=${encodeURIComponent(p.deposit_address)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  const body = (await res.json()) as { status: string };
  const status = body.status;

  if (status !== p.status) {
    await db.from("payments").update({ status, updated_at: new Date().toISOString() }).eq("id", paymentId);
    await db.from("agent_actions").insert({ order_id: p.order_id, action: "payment_status", detail: { status } });
  }
  if (status === "SUCCESS") await markPaid(p.order_id);
  return status;
}