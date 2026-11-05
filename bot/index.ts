import { Bot } from "grammy";
import { db } from "../lib/supabase";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

bot.command("start", (ctx) =>
  ctx.reply("Welcome to Oja! Send /catalog to see what we have in stock.")
);

bot.command("catalog", async (ctx) => {
  const { data, error } = await db
    .from("products")
    .select("name, unit, price_ngn, stock")
    .eq("active", true);

  if (error || !data) {
    return ctx.reply("Sorry, I couldn't load the catalog right now.");
  }

  const lines = data.map(
    (p) => `• ${p.name}: ₦${Number(p.price_ngn).toLocaleString()} per ${p.unit} (${p.stock} in stock)`
  );
  return ctx.reply(lines.join("\n"));
});

bot.start({ onStart: (me) => console.log(`Bot @${me.username} is running`) });