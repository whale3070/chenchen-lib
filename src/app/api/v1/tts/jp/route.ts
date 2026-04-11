import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type TtsRequest = {
  text?: unknown;
  speed?: unknown;
  checkOnly?: unknown;
};

const MIN_SPEED = 0.6;
const MAX_SPEED = 1.8;
const DEFAULT_SPEED = 1.0;
const MAX_TEXT_CHARS = 5_000;
const ENGINE_VERSION = "elevenlabs-v1";
const DEFAULT_MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "Xb7hH8MSUJpSbSDYk0k2";
const DEFAULT_VOICE_STABILITY = Number(process.env.ELEVENLABS_VOICE_STABILITY ?? "0.52");
const DEFAULT_VOICE_SIMILARITY_BOOST = Number(
  process.env.ELEVENLABS_VOICE_SIMILARITY_BOOST ?? "0.78",
);
const DEFAULT_VOICE_STYLE = Number(process.env.ELEVENLABS_VOICE_STYLE ?? "0.22");
const DEFAULT_USE_SPEAKER_BOOST =
  (process.env.ELEVENLABS_USE_SPEAKER_BOOST ?? "true").toLowerCase() !== "false";
const DEFAULT_VOICE_SPEED = Number(process.env.ELEVENLABS_VOICE_SPEED ?? "0.94");
const CACHE_DIR = path.join(process.cwd(), ".data", "tts-cache");

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n/g, "\n").trim();
}

function normalizeSpeed(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_SPEED;
  if (raw < MIN_SPEED) return MIN_SPEED;
  if (raw > MAX_SPEED) return MAX_SPEED;
  return raw;
}

function normalizeCheckOnly(raw: unknown): boolean {
  return raw === true;
}

function hashKey(text: string, speed: number): string {
  const h = crypto.createHash("sha256");
  h.update(text);
  h.update("|");
  h.update(String(speed));
  h.update("|");
  h.update(ENGINE_VERSION);
  h.update("|");
  h.update(DEFAULT_MODEL_ID);
  h.update("|");
  h.update(DEFAULT_VOICE_ID);
  h.update("|");
  h.update(String(DEFAULT_VOICE_STABILITY));
  h.update("|");
  h.update(String(DEFAULT_VOICE_SIMILARITY_BOOST));
  h.update("|");
  h.update(String(DEFAULT_VOICE_STYLE));
  h.update("|");
  h.update(String(DEFAULT_USE_SPEAKER_BOOST));
  h.update("|");
  h.update(String(DEFAULT_VOICE_SPEED));
  return h.digest("hex");
}

function splitTextForTts(text: string, maxChars = MAX_TEXT_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let current = "";
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pushCurrent = () => {
    const v = current.trim();
    if (v) chunks.push(v);
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        pushCurrent();
        current = paragraph;
      }
      continue;
    }

    // Fallback for very long single paragraph: split by sentence/punctuation.
    const parts = paragraph.split(/(?<=[。！？!?\.])\s*/);
    for (const partRaw of parts) {
      const part = partRaw.trim();
      if (!part) continue;
      if (part.length <= maxChars) {
        const candidate = current ? `${current}\n${part}` : part;
        if (candidate.length <= maxChars) {
          current = candidate;
        } else {
          pushCurrent();
          current = part;
        }
        continue;
      }

      // Final fallback: hard split to guarantee upper bound.
      pushCurrent();
      for (let i = 0; i < part.length; i += maxChars) {
        chunks.push(part.slice(i, i + maxChars));
      }
    }
  }
  pushCurrent();
  return chunks;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return badRequest("Invalid JSON");
  }

  const text = normalizeText(body?.text);
  if (!text) {
    return badRequest("text is required");
  }
  const textChunks = splitTextForTts(text);
  if (textChunks.length === 0) return badRequest("text is required");

  const speed = normalizeSpeed(body?.speed);
  const checkOnly = normalizeCheckOnly(body?.checkOnly);
  const key = hashKey(text, speed);

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cachePath = path.join(CACHE_DIR, `${key}.mp3`);
    try {
      const cached = await fs.readFile(cachePath);
      if (checkOnly) {
        return NextResponse.json(
          {
            ok: true,
            cacheHit: true,
            cacheKey: key,
          },
          { status: 200 },
        );
      }
      return new NextResponse(cached, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Disposition": `inline; filename=\"tts-eleven-${key.slice(0, 12)}.mp3\"`,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-TTS-Provider": "elevenlabs",
          "X-TTS-Cache-Key": key,
          "X-TTS-Cache-Hit": "1",
        },
      });
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? (e as NodeJS.ErrnoException).code
          : undefined;
      if (code !== "ENOENT") throw e;
    }

    if (checkOnly) {
      return NextResponse.json(
        {
          ok: true,
          cacheHit: false,
          cacheKey: key,
        },
        { status: 200 },
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY is missing" },
        { status: 500 },
      );
    }

    const client = new ElevenLabsClient({ apiKey });
    const chunkBuffers: Buffer[] = [];
    let lastCharacterCount = "";
    let lastRequestId = "";
    for (const chunk of textChunks) {
      const { data, rawResponse } = await client.textToSpeech
        .convert(DEFAULT_VOICE_ID, {
          text: chunk,
          modelId: DEFAULT_MODEL_ID,
          outputFormat: "mp3_44100_128",
          voiceSettings: {
            stability: DEFAULT_VOICE_STABILITY,
            similarityBoost: DEFAULT_VOICE_SIMILARITY_BOOST,
            style: DEFAULT_VOICE_STYLE,
            useSpeakerBoost: DEFAULT_USE_SPEAKER_BOOST,
            speed: DEFAULT_VOICE_SPEED,
          },
        })
        .withRawResponse();
      chunkBuffers.push(Buffer.from(await new Response(data).arrayBuffer()));
      lastCharacterCount = rawResponse.headers.get("x-character-count") ?? "";
      lastRequestId = rawResponse.headers.get("request-id") ?? "";
    }
    const audioBuffer = Buffer.concat(chunkBuffers);
    try {
      await fs.writeFile(cachePath, audioBuffer);
    } catch {
      // Best-effort cache write; generation success should still return audio.
    }
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `inline; filename=\"tts-eleven-${key.slice(0, 12)}.mp3\"`,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-TTS-Provider": "elevenlabs",
        "X-TTS-Cache-Key": key,
        "X-TTS-Cache-Hit": "0",
        "X-TTS-Chunk-Count": String(textChunks.length),
        "X-ElevenLabs-Character-Count": lastCharacterCount,
        "X-ElevenLabs-Request-Id": lastRequestId,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "tts failed";
    return NextResponse.json({ error: `TTS generation failed: ${msg}` }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      ok: true,
      usage: "POST /api/v1/tts/jp",
      body: {
        text: "string (required)",
        speed: `number optional, ${MIN_SPEED}-${MAX_SPEED}`,
      },
      env: {
        ELEVENLABS_API_KEY: "required",
        ELEVENLABS_VOICE_ID: `optional, default=${DEFAULT_VOICE_ID}`,
        ELEVENLABS_MODEL_ID: `optional, default=${DEFAULT_MODEL_ID}`,
        ELEVENLABS_VOICE_STABILITY: `optional, default=${DEFAULT_VOICE_STABILITY}`,
        ELEVENLABS_VOICE_SIMILARITY_BOOST: `optional, default=${DEFAULT_VOICE_SIMILARITY_BOOST}`,
        ELEVENLABS_VOICE_STYLE: `optional, default=${DEFAULT_VOICE_STYLE}`,
        ELEVENLABS_USE_SPEAKER_BOOST: `optional, default=${DEFAULT_USE_SPEAKER_BOOST}`,
        ELEVENLABS_VOICE_SPEED: `optional, default=${DEFAULT_VOICE_SPEED}`,
      },
      note: `ElevenLabs SDK TTS with server file cache (.data/tts-cache). Max input length ${MAX_TEXT_CHARS} chars per request.`,
    },
    { status: 200 },
  );
}
