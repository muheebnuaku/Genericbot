import dotenv from "dotenv";
dotenv.config();

const config = {
  port: process.env.PORT || 3000,
  baseUrl: process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || "",

  // WhatsApp Business API
  whatsapp: {
    verifyToken: process.env.VERIFY_TOKEN,
    accessToken: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    apiVersion: "v22.0",
    get baseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
    },
  },

  // AI provider — any HTTP chat endpoint that accepts {message, system, history}
  // and returns {reply, sources} (or adapt the shape in src/services/aiService.js
  // to match whichever provider you use). Point AI_API_BASE_URL at it.
  ai: {
    baseUrl: process.env.AI_API_BASE_URL || "",
    apiKey: process.env.AI_API_KEY || "",
    maxTokens: 900,
    temperature: 0.5,        // lower = more consistent/factual, higher = more creative
    webSearch: "auto",       // only meaningful if your provider supports live web search
    responseLanguage: "source", // reply in whatever language the user wrote in
    historyTurns: 16,        // outer cap on how many past turns to send
    // A fixed turn COUNT isn't the real constraint — request time scales with
    // total payload SIZE, and turns vary wildly in length. This character
    // budget is the actual binding constraint for long conversations; the
    // turn count above is just an outer bound. Tune both to your provider's
    // own history/context limits.
    historyMaxChars: 3500,
  },

  // Knowledge base / claims API — your own read-only source of truth that the
  // bot searches on every incoming message to ground its replies (e.g. a
  // fact-check archive, a help-center article index, a product catalog).
  // Without an API key set, the bot still runs and chats normally using the
  // AI provider's general knowledge, it just can't cite anything from here.
  claims: {
    apiBaseUrl: process.env.CLAIMS_API_BASE_URL || "",
    apiKey: process.env.CLAIMS_API_KEY || "",
  },

  // Session — how long a conversation stays "active" before a greeting resets it
  session: {
    ttlMinutes: 1440, // 24h so users can return within a day without re-onboarding
  },

  // MongoDB
  mongodb: {
    uri: process.env.MONGODB_URI || "",
    dbName: process.env.MONGODB_DB_NAME || "whatsapp-bot",
  },

  // Rate limiting
  rateLimit: {
    windowMs: 60 * 1000,   // 1 minute
    maxRequests: 30,        // per user per window
  },

  // Admin dashboard authentication
  //
  // .trim() guards against a very common failure mode: a hosting provider's
  // env-var UI (or a copy-paste into it) silently adding a trailing newline
  // or space to a pasted secret. Because the login check compares buffer
  // *lengths* before running crypto.timingSafeEqual (required — unequal
  // lengths throw), a single stray whitespace character on the stored value
  // makes every correctly-typed password fail with no way to tell why from
  // the "Invalid credentials" response alone.
  admin: {
    username: (process.env.ADMIN_USERNAME || "admin").trim(),
    password: (process.env.ADMIN_PASSWORD || "change-me").trim(),
    jwtSecret: process.env.JWT_SECRET || "whatsapp-bot-secret-" + (process.env.WHATSAPP_TOKEN || "").slice(-8),
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
  },

  // Company info — fed into the AI system prompt and WhatsApp footers.
  // Fill these in for the business this instance is being set up for.
  company: {
    name: process.env.COMPANY_NAME || "Your Company",
    industry: process.env.COMPANY_INDUSTRY || "Customer Support",
    description:
      process.env.COMPANY_DESCRIPTION ||
      "Describe what this business does and what the WhatsApp assistant helps customers with. This text is injected directly into the AI's system prompt, so write it the way you'd want the assistant to understand its own purpose.",
    website: process.env.COMPANY_WEBSITE || "https://example.com",
    phone: process.env.COMPANY_PHONE || "+10000000000",
    escalationWhatsApp: process.env.ESCALATION_WHATSAPP || process.env.COMPANY_PHONE || "+10000000000", // human handoff number
    email: process.env.COMPANY_EMAIL || "hello@example.com",
    address: process.env.COMPANY_ADDRESS || "",
    tone: process.env.COMPANY_TONE || "friendly, clear, helpful",
    businessHours: process.env.COMPANY_BUSINESS_HOURS || "Monday – Friday, 9:00 AM – 5:00 PM (the AI itself is always on; human review follows these hours)",
    // Used for dashboard theming. Swap for the client's real brand colors.
    brandColors: { primary: "#1E3F6B", secondary: "#F7F6F1", accent: "#D4A017" },
  },
};

// Validate required env vars
const required = ["VERIFY_TOKEN", "WHATSAPP_TOKEN", "PHONE_NUMBER_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

export default config;
