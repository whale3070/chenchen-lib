import type { Persona } from "@chenchen/shared/types";

/** 兼容无 randomUUID 的环境（如部分 HTTP / 旧浏览器） */
function newPersonaSuffix(): string {
  const c =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint8Array(16);
    c.getRandomValues(buf);
    buf[6] = (buf[6]! & 0x0f) | 0x40;
    buf[8] = (buf[8]! & 0x3f) | 0x80;
    const hex = [...buf].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 新建空白角色卡片（可随后在详情区编辑文案）。 */
export function createEmptyPersona(): Persona {
  return {
    id: `p-${newPersonaSuffix()}`,
    name: "未命名角色",
    roleLabel: "新角色",
    bio: "",
    drama: {
      stance: {
        summary: "",
        toward: [],
        visibility: "hidden",
      },
      motivation: {
        goal: "",
        stakes: "",
      },
      current_conflict: {
        type: "interpersonal",
        description: "",
      },
    },
  };
}
