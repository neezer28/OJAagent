# Oja: an AI sales assistant for small businesses, paid with NEAR Intents

Oja is a Telegram sales assistant for small shops, for example a fabric seller in Oshodi, Nigeria. Customers browse a catalog, build a cart, get an invoice, and pay in USDC. The payment goes through the **NEAR Intents 1Click API**. The shop owner approves large orders from Telegram.

Built for the **NEAR HACKATHON**. Tracks: **Autonomous Business** and **Real-World Money**.

- Live demo bot: **@ojaaibot** on Telegram (hosted on Railway's trial credit, so it may go offline after the judging period)
- Demo video: [PASTE VIDEO LINK]
- X post: [PASTE X POST LINK]

> The demo bot makes **real mainnet** payment requests. NEAR Intents has no testnet. Only send money if you want to, and keep amounts tiny (see "Try it").

## What it does

1. Answers product questions and checks stock from the database.
2. Builds a cart and issues an invoice. Prices, stock and totals always come from the database.
3. Creates a **NEAR Intents payment request** (a deposit address and an exact USDC amount) for the customer.
4. Checks the payment status until it is confirmed, expired or refunded, then updates the order and the stock.
5. Sends orders above the owner's limit to the owner on Telegram with **Approve / Reject** buttons.
6. Logs every action in an `agent_actions` table.

## Safeguards

- The AI assistant can only call four fixed tools: list products, add to cart, view cart, checkout. It cannot set a price, change stock, mark an order paid, or approve an order.
- Prices, stock and totals always come from the database, never from the chat.
- The agent **never holds or moves funds**. It only creates payment requests and reads their status. The merchant account that receives money is set in the code and the environment, and the customer cannot change it.
- Orders above the owner's limit (₦200,000 by default, stored in `merchant_policy`) stay in `pending_approval` until the owner presses Approve. Only the Telegram account in `OWNER_TELEGRAM_ID` can press the buttons, and a customer cannot pay an order that is still pending approval.
- Every action is written to `agent_actions`.
- Supabase row level security is on with no public policies. Only the server-side secret key can read or write.

## NEAR tools used

- **NEAR Intents 1Click API** (`@defuse-protocol/one-click-sdk-typescript`, `https://1click.chaindefuser.com`): real quotes with exact-output swaps. The customer pays USDC from Ethereum, Base or Arbitrum, and the shop receives USDC inside its NEAR Intents balance (recipient type `INTENTS`, account `neezer.near`). The status endpoint confirms payment.
- **NEAR AI Cloud** (OpenAI-compatible API, `https://cloud-api.near.ai/v1`): the language model behind the chat assistant.
- **NEAR account** `neezer.near`: the merchant and payout account.

## Libraries

Next.js 16, React 19, TypeScript, grammY (Telegram), `@supabase/supabase-js`, `openai` (client for NEAR AI Cloud), `@defuse-protocol/one-click-sdk-typescript`, zod, tsx.

## AI-written code

Much of this code was written with the help of Claude (Anthropic's AI assistant), in a chat where the author described the goal, pasted files and screenshots, and tested every step. The author ran, tested and committed all of it. The payment flow was tested with a real mainnet payment (see below).

## Try it

### Option A: use the hosted bot

Open **@ojaaibot** in Telegram and follow the steps in "Do X, see Y" below. If it does not answer, it is offline. Use Option B.

### Option B: run it yourself

You need Node.js 20 or newer, a free Supabase project, and a Telegram bot token.

1. Clone and install:
   ```
   git clone https://github.com/neezer28/OJAagent
   cd OJAagent
   npm install
   ```
2. Create a Telegram bot with **@BotFather** and copy its token.
3. Create a free project at supabase.com. In **SQL Editor**, paste the contents of `schema.sql` and click **Run**. You should see "Success". This creates the tables and three sample products.
4. Copy `.env.example` to `.env.local` and fill in the values:
   - `TELEGRAM_BOT_TOKEN`: from BotFather.
   - `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: from Supabase, Project Settings, API (use the secret key, and never commit it).
   - `NEAR_USDC_ASSET_ID`: `[PASTE YOUR NEAR_USDC_ASSET_ID VALUE]`
   - `MERCHANT_NEAR_ACCOUNT`: the NEAR account that should receive payments (use your own).
   - `OWNER_TELEGRAM_ID`: your Telegram ID. Leave it empty for now, start the bot, send `/whoami`, then put the number here and restart.
   - `NGN_PER_USD`: `1500` (a fixed demo rate, not a live one).
   - `NEAR_AI_API_KEY` and `NEAR_AI_MODEL`: optional. Without them the bot answers `/commands` and replies to plain text with a fallback message.
5. Start the bot:
   ```
   npm run bot:local
   ```
   You should see `Bot @yourbot is running`. Use `npm run bot` on a host that provides the environment variables itself.

Stop any other copy of the same bot first. Two copies with the same token cause a 409 conflict.

## Do X, see Y

| Do this in Telegram | You should see |
|---|---|
| `/catalog` | The products with prices and stock |
| `/add 1 2`, then `/cart` | 2 yards of Ankara Wax Print - Blue and a total of ₦9,000 |
| `/checkout` | An invoice with an order number and the total. The cart is empty again. |
| `/add 3 17`, then `/checkout` | An invoice (₦204,000) saying the owner must approve it. The owner gets a message with **Approve** and **Reject** buttons. |
| Press **Approve** as the owner | The customer gets a message with the `/pay` instructions. **Reject** tells the customer it was not approved. |
| `/pay eth 0xYourWalletAddress` (after a normal, approved order) | "Pay exactly X USDC on Ethereum to: 0x... Send it before [date]". A row appears in the `payments` table with status `PENDING_DEPOSIT`. |

Use your own wallet address as the refund address. It must be `0x` followed by 40 hex characters. Chains: `eth`, `base`, `arb`.

### Optional: a real payment (about 0.33 USDC)

The minimum payment is about **0.30 USDC**, so a normal order is too small to test cheaply. Add a cheap product in Supabase's SQL Editor:

```sql
insert into products (name, unit, price_ngn, stock) values ('Test item', 'piece', 480, 5);
```

Then `/add 4 1`, `/checkout`, and `/pay eth 0xYourWalletAddress`. The bot asks for about 0.32 to 0.33 USDC on Ethereum. After you send it (check the gas fee first), the bot normally says **"Payment received. Your order is confirmed. Thank you!"** within a few minutes. The `payments` row changes to `SUCCESS`, the order to `paid`, and the stock drops by one. This is exactly how the author tested it on mainnet.

### Chat assistant

With a NEAR AI Cloud key that has credit, send plain text such as "Hi, what fabrics do you sell?" or "Add 2 yards of Aso Oke Gold to my cart". The assistant answers from the database and adds to the real cart. [UPDATE THIS LINE AFTER TESTING, OR REMOVE IT]

## Limits and honest notes

- **Mainnet only.** NEAR Intents has no testnet, so payment tests use real money in tiny amounts.
- **Minimum payment** is about 0.30 USDC. The quotes also show a refund fee of about 0.30 USDC; the author has not confirmed exactly when it applies.
- **Funds land in the shop's NEAR Intents balance** under the merchant account. How the owner withdraws that balance is not covered here.
- **Payment checks** run every 30 seconds for every unfinished payment until its deadline, including after a restart. Payments past the deadline are marked `EXPIRED`.
- The exchange rate is a fixed demo value (`NGN_PER_USD`), not a live rate.
- Carts are kept in memory and are lost when the bot restarts.
- Orders created through the AI assistant do not yet notify the owner for approval. They stay `pending_approval`; only `/checkout` sends the buttons.
- There is no owner dashboard yet. The owner works from Telegram and the Supabase table editor.
- The NEAR AI Cloud account needs credits for the chat assistant to work.

## What was built when

Everything in this repository was built during the hackathon window. The author's earlier fabric-shop website (morade-fabrics) is a separate project and is not part of this code.

## Project layout

- `bot/index.ts`: the Telegram bot and its commands
- `bot/pay.ts`: the `/pay` command and the background payment check
- `bot/approvals.ts`: the owner's Approve / Reject buttons
- `lib/agent.ts`: the AI assistant and its four tools
- `lib/orders.ts`, `lib/cart.ts`: orders, invoices and carts
- `lib/payments.ts`, `lib/intents.ts`: NEAR Intents payment requests and status checks
- `lib/recovery.ts`: checks all unfinished payments until their deadline
- `schema.sql`: the database setup

## License

MIT=nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1