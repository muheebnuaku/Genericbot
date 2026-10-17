# WhatsApp AI Bot Template

A reusable starting point for a WhatsApp AI assistant: Node/Express backend,
MongoDB persistence, a React admin dashboard, and a pluggable AI provider +
knowledge-base API. Built from a real production fact-checking bot and
stripped of that project's specific branding — the architecture, the
WhatsApp-formatting fixes, and the operational patterns are all still here;
what's left to do is point it at a new business.

## How it works

```
WhatsApp user  →  Meta WhatsApp Cloud API  →  this server (webhook)
                                                     │
                                    ┌────────────────┼────────────────┐
                                    ▼                ▼                ▼
                         Your Claims API        Your AI provider   Member lookup
                        (live knowledge base)   (reply text)       (MongoDB, by
                                                                     phone number)
                                    └────────────────┬────────────────┘
                                                     ▼
                                          Reply sent back on WhatsApp
```

Knowledge-base records are **not** stored in this project's own database —
they're fetched live from your own Claims API on every incoming message, so
whatever you publish there is what the bot can surface, automatically, with
no manual syncing. MongoDB is used only for things that belong to *this bot
specifically*: conversation sessions, registered members, and broadcast
history.

## Prerequisites

You'll need accounts/access for all of these before the bot can go live:

| What | Where | Why |
|---|---|---|
| Meta Business Portfolio + WhatsApp Business Account | [business.facebook.com](https://business.facebook.com) | Hosts the WhatsApp number this bot sends/receives on |
| Meta Developer App (WhatsApp product added) | [developers.facebook.com](https://developers.facebook.com) | Gives you `WHATSAPP_TOKEN` and `PHONE_NUMBER_ID`, and is where you configure the webhook |
| Business Verification (Meta) | Inside Business Settings → Security Center | Required before a custom display name is reviewed/approved |
| MongoDB Atlas cluster | [mongodb.com/atlas](https://www.mongodb.com/atlas) | Session/member/broadcast persistence |
| An AI provider | your choice | Powers the actual conversational replies — see `src/services/aiService.js` |
| A knowledge-base / claims API (optional) | your own system | Lets the bot cite specific published records instead of only general AI knowledge |
| A Node hosting provider | e.g. [render.com](https://render.com) | Runs the Express server + webhook publicly |

## Setup steps

1. **Install dependencies**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

2. **Create a Meta Developer App** with the WhatsApp product added, and a
   WhatsApp Business number registered under your Business Portfolio. Copy
   the permanent access token and the Phone Number ID from the app's
   WhatsApp → API Setup page.

3. **Copy `.env.example` to `.env`** and fill in every value — see the
   comments in that file for what each one does and where to get it. At
   minimum you need `VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`,
   `MONGODB_URI`, and an AI provider (`AI_API_BASE_URL`/`AI_API_KEY`) for
   the bot to actually hold a conversation.

4. **Build and run**
   ```bash
   npm run build    # builds the React dashboard into public/app
   npm run dev      # local dev, auto-restarts on change
   npm start        # production
   ```
   - Webhook: `http://localhost:3000/webhook`
   - Dashboard: `http://localhost:3000/app`
   - Health check: `http://localhost:3000/api/health`

5. **Deploy the server** (or use a tunnel like ngrok for local testing) and
   set the webhook Callback URL in Meta's app dashboard to
   `https://your-domain/webhook`, with the verify token matching
   `VERIFY_TOKEN`.

6. **Customize for the new business** — the three places that matter:
   - **`.env`** — `COMPANY_NAME`, `COMPANY_DESCRIPTION`, `COMPANY_INDUSTRY`,
     etc. This is the fastest way to reskin the bot's identity, since the
     system prompt and most user-facing messages pull from here.
   - **`src/services/aiService.js`** — the `HOW TO RESPOND` rules in
     `buildSystemPrompt()` are written as a fact-check-assistant example.
     Rewrite rules 1-10 for your actual domain (support, bookings, sales,
     etc.); keep rules 11-12 as-is, they're WhatsApp formatting fixes, not
     domain-specific.
   - **`client/src/`** — dashboard branding (Sidebar, Login) currently uses
     a generic icon placeholder instead of a logo image. Add your own logo
     file under `client/src/assets/` and swap it in, and update
     `client/tailwind.config.js`'s `brand` palette to match.

7. **Submit the WhatsApp display name for review** in WhatsApp Manager once
   the number is set up. This can take a while and is rate-limited, so do
   it early rather than right before launch.

## What's genuinely reusable here (not just boilerplate)

A few things in this codebase came from hard lessons in a real production
deployment and are worth keeping as-is regardless of which business this
becomes:

- **`parseAIResponse()` in `aiService.js`** — a set of defensive fixes for
  how LLMs tend to format text vs. what WhatsApp actually renders: converting
  stray `**bold**` to WhatsApp's `*bold*`, forcing bold headers and bullet
  lists onto their own lines even when the model returns everything as one
  glued block, and normalizing blank-line spacing between sections.
- **`trimHistory()`** — bounds conversation history by total character
  count, not just turn count, since request time scales with payload size
  and turns vary wildly in length.
- **The two-stage "still checking" interim message** in
  `messageHandler.js` — since the webhook ACKs Meta immediately and
  processing runs fire-and-forget, the AI call can safely run long (up to
  5 minutes) for a genuinely slow query without ever blocking the webhook;
  the interim messages keep the user from thinking the bot died during a
  multi-minute wait.
- **BSUID handling** in `whatsapp.js` — WhatsApp's "usernames" privacy
  feature sends a business-scoped user ID instead of a phone number for
  some senders; outbound sends to those users need the `recipient` field
  instead of `to`, or they silently never get a reply.
- **Fire-and-forget webhook processing** (`webhook.js`) — Meta is ACK'd
  with a 200 immediately, then `handleIncomingMessage()` runs without being
  awaited, so one slow/failing message never blocks or delays others.

## Project structure

- **`server.js`** — Express app: webhook, API, static dashboard.
- **`src/routes/webhook.js`** — receives/verifies WhatsApp messages from Meta.
- **`src/handlers/messageHandler.js`** — the conversation flow (greetings,
  claim lookup, registration, escalation to a human).
- **`src/services/aiService.js`** — talks to your AI provider; also owns
  the system prompt and the WhatsApp-formatting defensive fixes.
- **`src/services/claimsApi.js`** — talks to your knowledge-base/claims API.
- **`src/services/memberService.js`** + **`src/db/models/Member.js`** —
  links a WhatsApp phone number to a registered member identity.
- **`src/services/session.js`** + **`src/db/models/Session.js`** —
  per-user conversation state and history, with a 24h TTL.
- **`src/services/broadcast.js`** + **`broadcast-cli.js`** — bulk WhatsApp
  sends to registered members or an uploaded contact list (see
  `BROADCAST_GUIDE.md`).
- **`src/config/index.js`** — all configuration in one place, almost
  entirely env-var driven.
- **`client/`** — the React admin dashboard (Overview, Claims, Members,
  Conversations, Escalations, Broadcasts, Settings), served at `/app`.

## Registered members & the "Chat on WhatsApp" link

If your own website has a "Chat on WhatsApp" button, it can open WhatsApp
pre-greeted by name: `GET /api/members/:id/whatsapp-link?botNumber=<digits>`
returns the deep link to use. Members can also just type **register** in
WhatsApp to link their number directly, without any website integration.

## Broadcasts

See [`BROADCAST_GUIDE.md`](./BROADCAST_GUIDE.md) for sending bulk WhatsApp
messages to registered members or an uploaded contact list.

## Deployment notes

- This app needs persistent background processing (fire-and-forget message
  handling, a keep-alive `setInterval`, pooled MongoDB connections) — a
  traditional Node host (Render, Railway, a VPS) fits better than a
  serverless platform.
- Env vars on your hosting provider's dashboard should be **typed in by
  hand, not pasted** — some providers' UIs silently corrupt bulk-pasted
  secrets (trailing newline/space), which is a very confusing bug to debug
  later since it just makes auth fail with no clear error.
