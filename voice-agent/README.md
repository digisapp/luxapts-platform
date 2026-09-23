# Staycio Voice Agent

Stacy on the phone: a LiveKit phone number answered by xAI's Grok realtime voice model.

The agent is a thin shell. Stacy's prompt, her tools, and everything those tools do live in the platform:

| Platform route | What it does |
|---|---|
| `POST /api/voice/call` `{event:"start"}` | Returns Stacy's instructions, greeting and tool schemas; opens the call's transcript session |
| `POST /api/voice/tools` | Runs one tool (find_building, search_listings, get_building_details, search_knowledge, get_tour_slots, book_tour, create_lead) |
| `POST /api/voice/call` `{event:"end"}` | Stores the transcript; it appears at `/admin/conversations` (surface: voice) |

So **prompt and tool changes ship with a normal Vercel deploy**. Redeploy this agent only when `agent.py` changes.

What the phone tools guarantee (see `src/lib/voice/`):

- **Only verified pricing is spoken.** Units whose price wasn't captured in the last 45 days (the same cutoff the microsites use) are removed before Stacy sees them.
- **One lead per call**, attributed `source=voice`, `source_detail=phone:<dialed number>`, with the caller ID as the phone number.
- **Tours are booked against the real slot calendar.** If a building has no certified-shower availability, the booking becomes a request the team confirms.
- Building tools take the **building name**, because models garble 36-character ids.

## Environment

| Variable | Where |
|---|---|
| `XAI_API_KEY` | console.x.ai |
| `VOICE_AGENT_SECRET` | Any long random string. Set the **same value** in Vercel (Production) |
| `STAYCIO_API_URL` | `https://staycio.com` (default) |
| `STACY_VOICE` | Optional Grok voice, default `ara` |

`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are provided automatically on LiveKit Cloud; set them in `.env` only for local runs.

If the platform can't be reached when a call starts, Stacy answers in a fallback mode with no tools. She apologizes and points callers to staycio.com, and never makes up listings.

## Deploy

Deploy the platform first (with `VOICE_AGENT_SECRET` set in Vercel), then the agent:

```bash
cd voice-agent
lk agent deploy --project staycio --secrets-file .env   # .env holds XAI_API_KEY, VOICE_AGENT_SECRET, STAYCIO_API_URL
```

The agent registers as **`staycio-voice-agent`** and only takes calls that are explicitly dispatched to it. Route a number to it:

**Live setup (2026-09-23):** LiveKit project `staycio` (staycio-m5zeiqz9), agent `CA_mrJmAuUYh8Pn`, number **+1 305 952 1558** (`PN_PPN_kAQQJGYRXhQ3`), dispatch rule `SDR_v4nH3G7q8Nq3`, as in `dispatch-rule.json`. Numbers bought in the dashboard get a rule with no agent, so after adding a number put it in `trunkIds` and run:

```bash
lk sip dispatch update --project staycio --id SDR_v4nH3G7q8Nq3 dispatch-rule.json
```

## Numbers per building

Stacy knows the microsite buildings that aren't in the listings catalog from `src/lib/voice/building-briefs.ts` (facts copied from each page; keep them in sync). All microsites currently show the main line. To give one its own number: buy it (the free plan allows one number, so this needs billing on the LiveKit project), add it to `trunkIds` in `dispatch-rule.json` and run the update command above, then map it in `VOICE_NUMBER_DOMAINS` in `src/lib/voice/prompt.ts` (for example `"+13059521561": "downtown6miami.com"`) and put it on that page. Callers on it are greeted with the building's name, and leads carry the number in `source_detail`.

## Local testing

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # point STAYCIO_API_URL at your local `next dev`
python agent.py console  # talk to Stacy through your mic
```
