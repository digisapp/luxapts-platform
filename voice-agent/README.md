# LuxApts Voice Agent

AI-powered voice agent that answers phone calls for LuxApts using LiveKit and xAI's Grok Voice Realtime API.

**Phone Number:** +1 305 952 1533

## Prerequisites

- LiveKit Cloud account (https://cloud.livekit.io)
- xAI API key (https://console.x.ai)
- Supabase project credentials

## Setup

### 1. Configure Environment Variables

You'll need these credentials for LiveKit Cloud:

| Variable | Where to get it |
|----------|-----------------|
| `LIVEKIT_URL` | LiveKit Cloud Dashboard > Project Settings |
| `LIVEKIT_API_KEY` | LiveKit Cloud Dashboard > Project Settings > Keys |
| `LIVEKIT_API_SECRET` | LiveKit Cloud Dashboard > Project Settings > Keys |
| `XAI_API_KEY` | https://console.x.ai/ |
| `SUPABASE_URL` | Supabase Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings > API |

### 2. Deploy Agent to LiveKit Cloud

LiveKit Cloud hosts your agent 24/7 - no external hosting needed.

1. Go to [LiveKit Cloud Dashboard](https://cloud.livekit.io)
2. Select your project
3. Navigate to **Agents** > **Deploy Agent**
4. Connect your GitHub repository
5. Set the root directory to `voice-agent`
6. Add environment variables:
   - `XAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
7. Click **Deploy**

### 3. Configure Dispatch Rules

Route incoming calls to your agent:

1. In LiveKit Cloud Dashboard, go to **SIP** > **Dispatch Rules**
2. Click **Create Dispatch Rule**
3. Configure:
   - **Name:** `LuxApts Voice Agent`
   - **Phone Numbers:** Select `+1 305 952 1533`
   - **Rule Type:** `Agent Dispatch`
   - **Agent Name:** `luxapts-voice-agent`
4. Click **Save**

### 4. Test

Call +1 305 952 1533 - Aria should answer and help callers find apartments.

## How It Works

1. **Caller dials** +1 305 952 1533
2. **LiveKit SIP** receives the call and creates a room
3. **Dispatch rule** routes the call to `luxapts-voice-agent`
4. **Agent connects** to the room
5. **xAI Realtime API** handles the entire conversation:
   - Speech recognition (STT)
   - AI response generation (Grok)
   - Voice synthesis (TTS)
   - All in one native speech-to-speech model

## Local Development

For testing locally before deploying:

```bash
cd voice-agent
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
python agent.py dev
```

## Customization

### Change the AI Voice

Edit `agent.py` and modify the voice:

```python
model = xai.realtime.RealtimeModel(
    voice="Cove",  # Options: Cove, Maple, Sage, Sal, etc.
    ...
)
```

### Update the System Prompt

Modify `LUXAPTS_SYSTEM_PROMPT` in `agent.py` to change how the AI responds.

## Monitoring

View active calls and agent logs in the LiveKit Cloud Dashboard:
- **Rooms:** See active calls
- **Agents:** Monitor connected agents and deployments
- **Analytics:** Call metrics and duration

## Troubleshooting

### Agent not receiving calls

1. Verify dispatch rule is configured correctly
2. Check that phone number is assigned to the dispatch rule
3. Ensure agent is deployed and running (check Agents tab)
4. Check deployment logs for errors

### Agent not responding

1. Check XAI_API_KEY is valid and has credits
2. Review agent logs in LiveKit Cloud Dashboard

## Support

- LiveKit Docs: https://docs.livekit.io/agents/
- xAI Docs: https://docs.x.ai/
- LuxApts: https://luxapts.co
