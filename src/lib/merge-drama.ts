import type { CharacterDramaCore, Persona } from "@chenchen/shared/types";

/** 将服务端返回的 updated_dramas 合并回角色列表（整卡替换 drama，保证类型一致） */
export function applyUpdatedDramas(
  personas: Persona[],
  updated: Record<string, CharacterDramaCore> | undefined | null,
): Persona[] {
  if (!updated || typeof updated !== "object") return personas;
  return personas.map((p) => {
    const next = updated[p.id];
    return next ? { ...p, drama: next } : p;
  });
}

export function safeUpdatedDramas(
  raw: unknown,
): Record<string, CharacterDramaCore> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, CharacterDramaCore> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const d = v as Partial<CharacterDramaCore>;
    if (
      d.stance &&
      d.motivation &&
      d.current_conflict &&
      typeof d.stance.summary === "string" &&
      Array.isArray(d.stance.toward) &&
      typeof d.motivation.goal === "string" &&
      typeof d.motivation.stakes === "string" &&
      typeof d.current_conflict.type === "string" &&
      typeof d.current_conflict.description === "string"
    ) {
      out[id] = d as CharacterDramaCore;
    }
  }
  return Object.keys(out).length ? out : undefined;
}
