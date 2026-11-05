import { OneClickService } from "@/lib/intents";

export async function GET() {
  const tokens = await OneClickService.getTokens();
  return Response.json(tokens);
}
