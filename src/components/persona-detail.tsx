"use client";

import type {
  ConflictType,
  Persona,
  StanceAttitude,
  StanceVisibility,
} from "@chenchen/shared/types";

type Props = {
  persona: Persona | null;
  /** 传入后在详情区启用编辑并回写父级状态 */
  onPersonaChange?: (persona: Persona) => void;
};

const CONFLICT_ACCENTS: Record<string, string> = {
  interpersonal:
    "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
  internal: "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  societal: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  environmental:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  systemic: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
};

const ATTITUDE_OPTIONS: StanceAttitude[] = [
  "support",
  "oppose",
  "neutral",
  "ambivalent",
  "unknown",
];

const CONFLICT_OPTIONS: ConflictType[] = [
  "interpersonal",
  "internal",
  "societal",
  "environmental",
  "systemic",
];

const VIS_OPTIONS: StanceVisibility[] = ["public", "hidden", "deceptive"];

const inputCls =
  "mt-0.5 w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-violet-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500";

const labelCls = "text-xs text-neutral-500 dark:text-neutral-400";

function StanceRadar({ personaName }: { personaName: string }) {
  return (
    <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
      {personaName} · 立场强度示意（相对值）
    </p>
  );
}

function IntensityBars({
  toward,
}: {
  toward: { target: string; intensity?: number }[];
}) {
  return (
    <ul className="mt-2 space-y-2">
      {toward.map((t, i) => {
        const v =
          typeof t.intensity === "number"
            ? Math.min(1, Math.max(0, t.intensity))
            : 0.45;
        return (
          <li key={i} className="text-xs">
            <div className="flex justify-between gap-2 text-neutral-600 dark:text-neutral-400">
              <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">
                {t.target}
              </span>
              <span className="tabular-nums text-neutral-500">
                {Math.round(v * 100)}%
              </span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
              role="progressbar"
              aria-valuenow={Math.round(v * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 dark:from-amber-400 dark:to-orange-400"
                style={{ width: `${v * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TowardRadar({
  toward,
}: {
  toward: { target: string; intensity?: number }[];
}) {
  if (toward.length < 2) return null;
  const cx = 50;
  const cy = 50;
  const rMax = 38;
  const n = toward.length;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (-Math.PI) / 2 + (i * 2 * Math.PI) / n;
    const raw =
      typeof toward[i].intensity === "number" ? toward[i].intensity! : 0.5;
    const mag = Math.min(1, Math.max(0.08, raw));
    const x = cx + rMax * mag * Math.cos(ang);
    const y = cy + rMax * mag * Math.sin(ang);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  const poly = pts.join(" ");
  const ring = [];
  for (let i = 0; i < n; i++) {
    const ang = (-Math.PI) / 2 + (i * 2 * Math.PI) / n;
    const x = cx + rMax * Math.cos(ang);
    const y = cy + rMax * Math.sin(ang);
    ring.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <div className="mt-3 flex justify-center">
      <svg
        viewBox="0 0 100 100"
        className="h-28 w-28 text-neutral-300 dark:text-neutral-600"
        aria-hidden
      >
        <polygon
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          points={ring.join(" ")}
        />
        <polygon
          fill="rgba(251, 191, 36, 0.25)"
          stroke="rgb(245, 158, 11)"
          strokeWidth="1"
          points={poly}
          className="dark:fill-amber-500/20 dark:stroke-amber-400"
        />
      </svg>
    </div>
  );
}

export function PersonaDetailCard({ persona, onPersonaChange }: Props) {
  if (!persona) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
        在左侧选择一名角色，查看并编辑「立场 · 动机 · 冲突」（对应{" "}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
          character-drama-core.schema.json
        </code>
        ）。
      </div>
    );
  }

  const editable = typeof onPersonaChange === "function";
  const setP = (next: Persona) => {
    if (editable) onPersonaChange!(next);
  };

  const { stance, motivation, current_conflict: c } = persona.drama;

  const updateTowardRow = (
    index: number,
    patch: Partial<(typeof stance.toward)[0]>,
  ) => {
    const toward = stance.toward.map((t, i) =>
      i === index ? { ...t, ...patch } : t,
    );
    setP({
      ...persona,
      drama: {
        ...persona.drama,
        stance: { ...stance, toward },
      },
    });
  };

  const removeTowardRow = (index: number) => {
    setP({
      ...persona,
      drama: {
        ...persona.drama,
        stance: {
          ...stance,
          toward: stance.toward.filter((_, i) => i !== index),
        },
      },
    });
  };

  const addTowardRow = () => {
    setP({
      ...persona,
      drama: {
        ...persona.drama,
        stance: {
          ...stance,
          toward: [
            ...stance.toward,
            { target: "", attitude: "neutral", intensity: 0.5 },
          ],
        },
      },
    });
  };

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500">
          基本信息
        </h3>
        {editable ? (
          <div className="mt-2 space-y-2">
            <div>
              <label className={labelCls}>姓名</label>
              <input
                type="text"
                className={inputCls}
                value={persona.name}
                onChange={(e) => setP({ ...persona, name: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>职能标签</label>
              <input
                type="text"
                className={inputCls}
                value={persona.roleLabel ?? ""}
                onChange={(e) =>
                  setP({ ...persona, roleLabel: e.target.value || undefined })
                }
                placeholder="如：主角 / 史官"
              />
            </div>
            <div>
              <label className={labelCls}>人设摘要</label>
              <textarea
                className={`${inputCls} min-h-[4rem] resize-y`}
                value={persona.bio ?? ""}
                onChange={(e) =>
                  setP({ ...persona, bio: e.target.value || undefined })
                }
                rows={3}
              />
            </div>
          </div>
        ) : (
          <div className="mt-1 text-neutral-800 dark:text-neutral-200">
            <p className="font-medium text-neutral-900 dark:text-neutral-50">
              {persona.name}
            </p>
            {persona.roleLabel && (
              <p className="text-xs text-neutral-500">{persona.roleLabel}</p>
            )}
            {persona.bio && <p className="mt-1 text-xs">{persona.bio}</p>}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500">
          立场
        </h3>
        {editable ? (
          <div className="mt-2 space-y-2">
            <div>
              <label className={labelCls}>立场摘要</label>
              <textarea
                className={`${inputCls} min-h-[4rem] resize-y`}
                value={stance.summary}
                onChange={(e) =>
                  setP({
                    ...persona,
                    drama: {
                      ...persona.drama,
                      stance: { ...stance, summary: e.target.value },
                    },
                  })
                }
                rows={3}
              />
            </div>
            <div>
              <label className={labelCls}>可见性</label>
              <select
                className={inputCls}
                value={stance.visibility ?? "hidden"}
                onChange={(e) =>
                  setP({
                    ...persona,
                    drama: {
                      ...persona.drama,
                      stance: {
                        ...stance,
                        visibility: e.target.value as StanceVisibility,
                      },
                    },
                  })
                }
              >
                {VIS_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-neutral-900 dark:text-neutral-100">
            {stance.summary}
          </p>
        )}
        <StanceRadar personaName={persona.name} />
        <IntensityBars toward={stance.toward} />
        <TowardRadar toward={stance.toward} />
        {editable ? (
          <div className="mt-3 space-y-2 border-t border-neutral-100 pt-2 dark:border-neutral-800">
            <p className={labelCls}>立场对象（对事与态度）</p>
            {stance.toward.map((t, i) => (
              <div
                key={i}
                className="flex flex-col gap-1.5 rounded-md border border-neutral-200 p-2 dark:border-neutral-700"
              >
                <input
                  type="text"
                  className={inputCls}
                  placeholder="对象 / 议题"
                  value={t.target}
                  onChange={(e) => updateTowardRow(i, { target: e.target.value })}
                />
                <div className="flex flex-wrap gap-2">
                  <select
                    className={`${inputCls} min-w-[8rem]`}
                    value={t.attitude}
                    onChange={(e) =>
                      updateTowardRow(i, {
                        attitude: e.target.value as StanceAttitude,
                      })
                    }
                  >
                    {ATTITUDE_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-1 items-center gap-1 min-w-[6rem]">
                    <label className={`${labelCls} whitespace-nowrap`}>
                      强度 0–1
                    </label>
                    <input
                      type="number"
                      className={inputCls}
                      step={0.05}
                      min={0}
                      max={1}
                      value={t.intensity ?? ""}
                      placeholder="0.5"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        updateTowardRow(i, {
                          intensity: Number.isFinite(v)
                            ? Math.min(1, Math.max(0, v))
                            : undefined,
                        });
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTowardRow(i)}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addTowardRow}
              className="w-full rounded-lg border border-dashed border-neutral-300 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-900"
            >
              + 添加立场对象
            </button>
          </div>
        ) : (
          <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-2 dark:border-neutral-800">
            {stance.toward.map((t, i) => (
              <li
                key={i}
                className="flex flex-wrap gap-2 text-xs text-neutral-600 dark:text-neutral-400"
              >
                <span className="font-medium">{t.target}</span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                  {t.attitude}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500">
          动机
        </h3>
        {editable ? (
          <dl className="mt-2 space-y-2 text-neutral-800 dark:text-neutral-200">
            <div>
              <dt className={labelCls}>目标</dt>
              <dd>
                <textarea
                  className={`${inputCls} min-h-[3rem]`}
                  value={motivation.goal}
                  onChange={(e) =>
                    setP({
                      ...persona,
                      drama: {
                        ...persona.drama,
                        motivation: {
                          ...motivation,
                          goal: e.target.value,
                        },
                      },
                    })
                  }
                  rows={2}
                />
              </dd>
            </div>
            <div>
              <dt className={labelCls}>为何此刻</dt>
              <dd>
                <textarea
                  className={`${inputCls} min-h-[2.5rem]`}
                  value={motivation.why_now ?? ""}
                  onChange={(e) =>
                    setP({
                      ...persona,
                      drama: {
                        ...persona.drama,
                        motivation: {
                          ...motivation,
                          why_now: e.target.value || undefined,
                        },
                      },
                    })
                  }
                  rows={2}
                />
              </dd>
            </div>
            <div>
              <dt className={labelCls}>内在需求</dt>
              <dd>
                <textarea
                  className={`${inputCls} min-h-[2.5rem]`}
                  value={motivation.internal_need ?? ""}
                  onChange={(e) =>
                    setP({
                      ...persona,
                      drama: {
                        ...persona.drama,
                        motivation: {
                          ...motivation,
                          internal_need: e.target.value || undefined,
                        },
                      },
                    })
                  }
                  rows={2}
                />
              </dd>
            </div>
            <div>
              <dt className={labelCls}>得失 / stakes</dt>
              <dd>
                <textarea
                  className={`${inputCls} min-h-[3rem]`}
                  value={motivation.stakes}
                  onChange={(e) =>
                    setP({
                      ...persona,
                      drama: {
                        ...persona.drama,
                        motivation: {
                          ...motivation,
                          stakes: e.target.value,
                        },
                      },
                    })
                  }
                  rows={2}
                />
              </dd>
            </div>
            <div>
              <dt className={labelCls}>误念 misbelief</dt>
              <dd>
                <textarea
                  className={`${inputCls} min-h-[2.5rem]`}
                  value={motivation.misbelief ?? ""}
                  onChange={(e) =>
                    setP({
                      ...persona,
                      drama: {
                        ...persona.drama,
                        motivation: {
                          ...motivation,
                          misbelief: e.target.value || undefined,
                        },
                      },
                    })
                  }
                  rows={2}
                />
              </dd>
            </div>
          </dl>
        ) : (
          <dl className="mt-1 space-y-1 text-neutral-800 dark:text-neutral-200">
            <div>
              <dt className="text-xs text-neutral-500">目标</dt>
              <dd>{motivation.goal}</dd>
            </div>
            {motivation.why_now && (
              <div>
                <dt className="text-xs text-neutral-500">为何此刻</dt>
                <dd>{motivation.why_now}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-neutral-500">得失</dt>
              <dd>{motivation.stakes}</dd>
            </div>
          </dl>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500">
          当前冲突
        </h3>
        {editable ? (
          <div className="mt-2 space-y-2">
            <div>
              <label className={labelCls}>类型</label>
              <select
                className={inputCls}
                value={c.type}
                onChange={(e) =>
                  setP({
                    ...persona,
                    drama: {
                      ...persona.drama,
                      current_conflict: {
                        ...c,
                        type: e.target.value as ConflictType,
                      },
                    },
                  })
                }
              >
                {CONFLICT_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>描述</label>
              <textarea
                className={`${inputCls} min-h-[4rem]`}
                value={c.description}
                onChange={(e) =>
                  setP({
                    ...persona,
                    drama: {
                      ...persona.drama,
                      current_conflict: {
                        ...c,
                        description: e.target.value,
                      },
                    },
                  })
                }
                rows={4}
              />
            </div>
            <div>
              <label className={labelCls}>对立面</label>
              <input
                type="text"
                className={inputCls}
                value={c.opposing_force ?? ""}
                onChange={(e) =>
                  setP({
                    ...persona,
                    drama: {
                      ...persona.drama,
                      current_conflict: {
                        ...c,
                        opposing_force: e.target.value || undefined,
                      },
                    },
                  })
                }
              />
            </div>
            <div>
              <label className={labelCls}>升级钩子</label>
              <input
                type="text"
                className={inputCls}
                value={c.escalation_hook ?? ""}
                onChange={(e) =>
                  setP({
                    ...persona,
                    drama: {
                      ...persona.drama,
                      current_conflict: {
                        ...c,
                        escalation_hook: e.target.value || undefined,
                      },
                    },
                  })
                }
              />
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                CONFLICT_ACCENTS[c.type] ??
                "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100"
              }`}
            >
              {c.type}
            </span>
            <p className="text-neutral-900 dark:text-neutral-100">
              {c.description}
            </p>
            {c.opposing_force && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                对立面：{c.opposing_force}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
