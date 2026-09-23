"""
Staycio phone agent: Stacy on a LiveKit phone number, speaking through xAI's
Grok realtime voice model.

The agent is deliberately thin. Stacy's prompt, her tool list and everything
the tools do live in the Staycio platform (/api/voice/call and
/api/voice/tools), so behavior changes ship with a normal Vercel deploy and the
phone agent shares one data and lead pipeline with web chat. This process only:

  1. asks the platform for the prompt + tool schemas when a call starts,
  2. forwards each tool call to the platform,
  3. posts the transcript when the call ends (it shows at /admin/conversations).
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import aiohttp
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    cli,
    function_tool,
)
from livekit.agents.llm import ChatMessage, FunctionCall, FunctionCallOutput
from livekit.plugins import xai

load_dotenv()

logger = logging.getLogger("staycio-voice-agent")

AGENT_NAME = "staycio-voice-agent"
PLATFORM_URL = os.getenv("STAYCIO_API_URL", "https://staycio.com").rstrip("/")
VOICE_AGENT_SECRET = os.getenv("VOICE_AGENT_SECRET", "")
VOICE = os.getenv("STACY_VOICE", "ara")
TOOL_TIMEOUT = aiohttp.ClientTimeout(total=20)

# Used only if the platform can't be reached when a call starts: no tools, so
# Stacy must not pretend to look anything up.
FALLBACK_INSTRUCTIONS = """You are Stacy from Staycio, an apartment search service, on a phone call.
Our systems are briefly unavailable, so you cannot look up listings, prices, or tour times.
Apologize briefly, tell the caller they can search at staycio dot com or call back in a few
minutes, and keep the call short and friendly. Never make up prices or availability."""
FALLBACK_GREETING = "Hi, this is Stacy with Staycio."


def _call_info(ctx: JobContext, participant: rtc.RemoteParticipant) -> dict[str, Any]:
    attrs = participant.attributes or {}
    return {
        "id": ctx.room.name,
        "caller": attrs.get("sip.phoneNumber"),
        "dialed": attrs.get("sip.trunkPhoneNumber"),
    }


class Platform:
    """The Staycio API, authenticated with the shared voice-agent secret."""

    def __init__(self, http: aiohttp.ClientSession, call: dict[str, Any]) -> None:
        self._http = http
        self._call = call

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        async with self._http.post(
            f"{PLATFORM_URL}{path}",
            json={**body, "call": self._call},
            headers={"Authorization": f"Bearer {VOICE_AGENT_SECRET}"},
            timeout=TOOL_TIMEOUT,
        ) as resp:
            if resp.status != 200:
                raise RuntimeError(f"{path} returned {resp.status}: {(await resp.text())[:200]}")
            return await resp.json()

    async def start(self) -> dict[str, Any]:
        return await self._post("/api/voice/call", {"event": "start"})

    async def tool(self, name: str, args: dict[str, Any]) -> Any:
        return (await self._post("/api/voice/tools", {"name": name, "args": args})).get("result")

    async def end(self, transcript: list[dict[str, Any]]) -> None:
        await self._post("/api/voice/call", {"event": "end", "transcript": transcript})


def _remote_tool(platform: Platform, schema: dict[str, Any]):
    """A LiveKit tool whose schema and behavior come from the platform."""
    name = schema["name"]

    async def handler(raw_arguments: dict[str, Any], context: RunContext) -> str:
        try:
            result = await platform.tool(name, raw_arguments)
        except Exception:
            logger.exception("tool %s failed", name)
            result = {"error": "That lookup failed. Apologize and offer to have the team follow up."}
        return json.dumps(result, default=str)

    return function_tool(handler, raw_schema=schema)


def _transcript(session: AgentSession) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for item in session.history.items:
        if isinstance(item, ChatMessage) and item.role in ("user", "assistant"):
            text = item.text_content
            if text:
                items.append({"role": item.role, "text": text})
        elif isinstance(item, FunctionCall):
            try:
                args = json.loads(item.arguments or "{}")
            except ValueError:
                args = item.arguments
            items.append({"role": "tool", "name": item.name, "args": args})
        elif isinstance(item, FunctionCallOutput) and item.is_error and items:
            # Attach the failure to the call it answers.
            for prev in reversed(items):
                if prev.get("role") == "tool" and prev.get("name") == item.name:
                    prev["error"] = str(item.output)[:500]
                    break
    return items


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    participant = await ctx.wait_for_participant()
    call = _call_info(ctx, participant)
    logger.info("call %s from %s to %s", call["id"], call["caller"], call["dialed"])

    http = aiohttp.ClientSession()
    platform = Platform(http, call)

    instructions, greeting, tools = FALLBACK_INSTRUCTIONS, FALLBACK_GREETING, []
    platform_ok = False
    if VOICE_AGENT_SECRET:
        try:
            config = await platform.start()
            instructions = config["instructions"]
            greeting = config.get("greeting") or FALLBACK_GREETING
            tools = [_remote_tool(platform, s) for s in config.get("tools", [])]
            platform_ok = True
        except Exception:
            logger.exception("platform unreachable; answering in fallback mode")
    else:
        logger.error("VOICE_AGENT_SECRET is not set; answering in fallback mode")

    session = AgentSession(llm=xai.realtime.RealtimeModel(voice=VOICE))

    async def on_shutdown() -> None:
        try:
            if platform_ok:
                await platform.end(_transcript(session))
        except Exception:
            logger.exception("failed to store transcript for %s", call["id"])
        finally:
            await http.close()

    ctx.add_shutdown_callback(on_shutdown)

    await session.start(
        room=ctx.room,
        agent=Agent(instructions=instructions, tools=tools),
    )
    await session.generate_reply(
        instructions=f'Greet the caller with exactly: "{greeting}"'
    )


if __name__ == "__main__":
    cli.run_app(server)
