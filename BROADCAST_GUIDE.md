# WhatsApp Broadcast Guide

This system lets the bot send bulk WhatsApp messages to registered members —
e.g. "we just published a new update" alerts, or a weekly digest.

## Features

✅ Send messages to any number of contacts at once
✅ Automatic rate limiting (batches of 20 with 2-second delays)
✅ Parse phone numbers from CSV/JSON files
✅ Auto-detect phone number fields
✅ Automatic local-number formatting via `DEFAULT_COUNTRY_CODE` (see .env.example)
✅ Error tracking and retry logic
✅ CLI and REST API options

---

## Method 1: Using the CLI (Fastest)

### Setup

Ensure you have your contact list as a CSV file with a phone column.

### Run Broadcast

```bash
# Using CSV file
node broadcast-cli.js --csv contacts.csv --message "We just published a new update: [link]"

# With specific phone column name
node broadcast-cli.js --csv contacts.csv --phoneField "mobile_number" --message "Your message"

# Using JSON file
node broadcast-cli.js --file contacts.json --message "Your message"
```

### CSV Format Required

The CSV file must have a phone column (auto-detected from: `phone`, `phone_number`, `whatsapp`, `mobile`):

```csv
name,email,phone_number
Jane Doe,jane@example.com,5551234567
John Smith,john@example.com,5552234567
```

**Note:** Numbers starting with `0` are converted using `DEFAULT_COUNTRY_CODE` (set in `.env` — e.g. `233` for Ghana, `1` for US/Canada). Numbers already in international `+` format are used as-is. If `DEFAULT_COUNTRY_CODE` isn't set, local-format numbers are used as-is with a warning.

---

## Method 2: Using the REST API (used by the /app dashboard's Broadcasts page)

### Option A: Send to an explicit list of numbers

```bash
curl -X POST http://localhost:3000/api/broadcast/send \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumbers": ["+15551234567", "+15552234567"],
    "message": "We just published a new update!"
  }'
```

### Option B: Send to registered members

```bash
curl -X POST http://localhost:3000/api/broadcast/send-members \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello {name}! We just published a new update."
  }'
```

### Option C: Upload a CSV/JSON file

```bash
curl -X POST http://localhost:3000/api/broadcast/upload-excel \
  -F "file=@contacts.csv" \
  -F "message=We just published a new update!"
```

### Response Example

```json
{
  "status": "broadcast_completed",
  "totalRequested": 80,
  "totalSent": 78,
  "failed": 2,
  "durationSeconds": 12.5,
  "failedNumbers": [
    { "number": "+15551111111", "reason": "Invalid phone number" }
  ]
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Phone column not found" | Ensure CSV has a column named `phone`, `phone_number`, `whatsapp`, or `mobile` |
| "Invalid phone number" | Check format — must start with `+` or `0` (e.g., `+15551234567` or `5551234567` with `DEFAULT_COUNTRY_CODE` set) |
| "Rate limit exceeded" | System automatically batches. Wait 2 seconds between batches. |
| "Failed to send to X numbers" | Check network connection. System retries automatically. |
| "File format not supported" | Use CSV or JSON. XLSX support coming soon. |

---

## Technical Details

- **Batch Size:** 20 numbers per batch (respects WhatsApp rate limits)
- **Delay Between Batches:** 2 seconds (configurable via options)
- **Retry Logic:** Built-in exponential backoff for failed messages
- **Personalisation:** `{name}` / `{first_name}` placeholders are replaced per-recipient

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/broadcast/send` | Send to an explicit phone number list |
| POST | `/api/broadcast/send-members` | Send to registered members ({name} personalisation) |
| POST | `/api/broadcast/upload-excel` | Upload CSV/JSON file of numbers |
| GET  | `/api/broadcast/members-audience` | Preview how many members a broadcast would reach |
| GET  | `/api/broadcast/status` | Check broadcast status |
