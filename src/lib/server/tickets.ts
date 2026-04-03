import crypto from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { isAddress } from "viem";

export type TicketStatus = "open" | "done" | "closed" | "ignored";

export type TicketRecord = {
  id: string;
  createdBy: string;
  title: string;
  content: string;
  imageUrls: string[];
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  closedBy: string | null;
  adminNote: string;
};

const TICKETS_DIR = path.join(process.cwd(), ".data", "tickets");

function ticketPath(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
  return path.join(TICKETS_DIR, `${safe}.json`);
}

function parseDotEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;
  const key = trimmed.slice(0, idx).trim();
  let val = trimmed.slice(idx + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return [key, val];
}

async function readFallbackEnv(): Promise<Record<string, string>> {
  const fp = path.join(process.cwd(), "..", "..", ".env.production");
  try {
    const raw = await fs.readFile(fp, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const kv = parseDotEnvLine(line);
      if (!kv) continue;
      out[kv[0]] = kv[1];
    }
    return out;
  } catch {
    return {};
  }
}

export async function resolveAdminAddress(): Promise<string | null> {
  const envFallback = await readFallbackEnv();
  const raw = process.env.ADMIN_ADDRESS || envFallback.ADMIN_ADDRESS || "";
  const addr = raw.trim().toLowerCase();
  if (!isAddress(addr)) return null;
  return addr;
}

export async function isAdminWallet(walletLower: string): Promise<boolean> {
  const admin = await resolveAdminAddress();
  return Boolean(admin && admin === walletLower);
}

export async function listTickets(): Promise<TicketRecord[]> {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(TICKETS_DIR, { withFileTypes: true });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return [];
    throw e;
  }
  const out: TicketRecord[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(TICKETS_DIR, e.name), "utf8");
      const parsed = JSON.parse(raw) as Partial<TicketRecord>;
      if (
        typeof parsed.id === "string" &&
        typeof parsed.createdBy === "string" &&
        typeof parsed.title === "string" &&
        typeof parsed.content === "string" &&
        typeof parsed.status === "string" &&
        typeof parsed.createdAt === "string" &&
        typeof parsed.updatedAt === "string"
      ) {
        out.push({
          id: parsed.id,
          createdBy: parsed.createdBy.toLowerCase(),
          title: parsed.title,
          content: parsed.content,
          imageUrls: Array.isArray(parsed.imageUrls)
            ? parsed.imageUrls
                .filter((x): x is string => typeof x === "string")
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 8)
            : [],
          status: normalizeTicketStatus(parsed.status),
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt,
          closedBy:
            typeof parsed.closedBy === "string"
              ? parsed.closedBy.toLowerCase()
              : null,
          adminNote:
            typeof parsed.adminNote === "string" ? parsed.adminNote : "",
        });
      }
    } catch {
      // ignore broken file
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function normalizeTicketStatus(raw: string): TicketStatus {
  if (raw === "done" || raw === "closed" || raw === "ignored") return raw;
  return "open";
}

export async function createTicket(params: {
  createdBy: string;
  title: string;
  content: string;
  imageUrls?: string[];
}): Promise<TicketRecord> {
  const now = new Date().toISOString();
  const ticket: TicketRecord = {
    id: `tkt_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`,
    createdBy: params.createdBy.toLowerCase(),
    title: params.title.trim().slice(0, 120),
    content: params.content.trim().slice(0, 5000),
    imageUrls: (params.imageUrls ?? [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 8),
    status: "open",
    createdAt: now,
    updatedAt: now,
    closedBy: null,
    adminNote: "",
  };
  await fs.mkdir(TICKETS_DIR, { recursive: true });
  await fs.writeFile(ticketPath(ticket.id), JSON.stringify(ticket, null, 2), "utf8");
  return ticket;
}

export async function readTicket(id: string): Promise<TicketRecord | null> {
  try {
    const raw = await fs.readFile(ticketPath(id), "utf8");
    const parsed = JSON.parse(raw) as TicketRecord;
    return {
      ...parsed,
      createdBy: parsed.createdBy.toLowerCase(),
      imageUrls: Array.isArray(parsed.imageUrls)
        ? parsed.imageUrls
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
      status: normalizeTicketStatus(parsed.status),
      closedBy: parsed.closedBy ? parsed.closedBy.toLowerCase() : null,
      adminNote: parsed.adminNote ?? "",
    };
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOENT") return null;
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}

export async function updateTicket(
  id: string,
  updaterWallet: string,
  patch: { status: TicketStatus; adminNote?: string },
): Promise<TicketRecord | null> {
  const existing = await readTicket(id);
  if (!existing) return null;
  const next: TicketRecord = {
    ...existing,
    status: patch.status,
    adminNote:
      typeof patch.adminNote === "string"
        ? patch.adminNote.trim().slice(0, 2000)
        : existing.adminNote,
    updatedAt: new Date().toISOString(),
    closedBy: patch.status === "open" ? null : updaterWallet.toLowerCase(),
  };
  await fs.mkdir(TICKETS_DIR, { recursive: true });
  await fs.writeFile(ticketPath(id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

