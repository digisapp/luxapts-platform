"""
LuxApts AI Voice Agent
Handles incoming phone calls via LiveKit SIP and answers apartment-related questions.
Uses xAI's native Realtime API for speech-to-speech.
"""

import logging
import os
from dotenv import load_dotenv

from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)
from livekit.agents.multimodal import MultimodalAgent
from livekit.plugins import xai
from supabase import create_client, Client

load_dotenv()

logger = logging.getLogger("luxapts-voice-agent")

# Initialize Supabase client
supabase: Client = create_client(
    os.getenv("SUPABASE_URL", ""),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
)

# System prompt for the AI assistant
LUXAPTS_SYSTEM_PROMPT = """You are Aria, an AI assistant for LuxApts, a luxury apartment rental platform.
You help callers find apartments and answer questions about our listings.

Key Information:
- LuxApts features luxury apartments in major US cities including New York, Miami, Los Angeles, Dallas, Austin, Nashville, Atlanta, and Brooklyn
- We offer AI-powered search to help find the perfect apartment
- Our platform provides real-time pricing and availability
- Users can compare buildings side-by-side
- We have listings ranging from studios to multi-bedroom luxury units

When answering calls:
1. Greet the caller warmly and introduce yourself as Aria, the LuxApts AI assistant
2. Ask how you can help them today
3. If they're looking for an apartment, ask about:
   - Their preferred city or neighborhood
   - Number of bedrooms needed
   - Budget range
   - Any must-have amenities (gym, pool, pet-friendly, etc.)
4. Provide helpful information based on their needs
5. Encourage them to visit luxapts.co to browse listings and use our AI chat for detailed searches
6. If you don't know specific listing details, direct them to the website

Be conversational, friendly, and helpful. Keep responses concise since this is a phone call.
Avoid long lists - instead, summarize and offer to provide more details if needed.
"""


async def entrypoint(ctx: JobContext):
    """Main entry point for handling incoming calls."""

    logger.info(f"Connecting to room {ctx.room.name}")

    # Connect to the room and subscribe to audio
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Wait for a participant to join (the caller)
    participant = await ctx.wait_for_participant()
    logger.info(f"Participant joined: {participant.identity}")

    # Create xAI Realtime model (speech-to-speech)
    model = xai.realtime.RealtimeModel(
        voice="Cove",  # Options: Cove, Maple, Sage, etc.
        instructions=LUXAPTS_SYSTEM_PROMPT,
        api_key=os.getenv("XAI_API_KEY"),
    )

    # Create and start the multimodal agent
    agent = MultimodalAgent(model=model)
    agent.start(ctx.room, participant)

    logger.info("Agent started, ready to handle conversation")


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
        ),
    )
