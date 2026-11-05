import { QuoteRequest } from "@defuse-protocol/one-click-sdk-typescript";
import { OneClickService } from "@/lib/intents";

const ASSETS: Record<string, string> = {
  base: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  arb: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  eth: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
  near: process.env.NEAR_USDC_ASSET_ID!,
  usdt: "nep141:usdt.tether-token.near",
};
const EVM_ADDRESS = "0xf2c2e2d04ffb929e09f401deed9666af0c82b215";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.searchParams.get("origin") ?? "base";
  const dest = url.searchParams.get("dest") ?? "near";
  const swapType = url.searchParams.get("type") === "output" ? "EXACT_OUTPUT" : "EXACT_INPUT";
  const amount = url.searchParams.get("amount") ?? "1000000";
  const onNear = dest === "near" || dest === "usdt";
  const recipient =
    url.searchParams.get("recipient") ?? (onNear ? "neezer.near" : EVM_ADDRESS);

  try {
    const quote = await OneClickService.getQuote({
      dry: true,
      swapType: swapType as unknown as QuoteRequest["swapType"],
      slippageTolerance: 100,
      originAsset: ASSETS[origin],
      depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
      destinationAsset: ASSETS[dest],
      amount,
      refundTo: EVM_ADDRESS,
      refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
      recipient,
      recipientType: url.searchParams.get("rtype") === "intents" ? QuoteRequest.recipientType.INTENTS : QuoteRequest.recipientType.DESTINATION_CHAIN,
      deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    return Response.json(quote);
  } catch (e) {
    return Response.json({ error: String(e), details: e }, { status: 500 });
  }
}