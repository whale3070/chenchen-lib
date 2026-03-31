import type { Persona } from "@chenchen/shared/types";

export const DEMO_PERSONAS: Persona[] = [
  {
    id: "p-lin",
    name: "林砚",
    roleLabel: "主角 / 史官",
    bio: "表面谦抑，习惯把结论藏在史料排列里。",
    drama: {
      stance: {
        summary: "反对以暴力清洗异见，但承认体制惰性难以单靠改良扭转。",
        toward: [
          { target: "廷议上的削藩提案", attitude: "oppose", intensity: 0.9 },
          { target: "旧友一派", attitude: "ambivalent", intensity: 0.5 },
        ],
        evidence_in_story: ["删改承旨时的停顿", "对同年的称呼从「子期」改回表字"],
        visibility: "hidden",
      },
      motivation: {
        goal: "在不影响族人的前提下保住匿名信线索。",
        why_now: "御前提审排期提前三日。",
        internal_need: "证明自己当年退守文献不是懦弱。",
        stakes: "失败则线索者被灭口、史书此页将只剩赞语。",
        misbelief: "以为只要证据够硬，权力会自行纠正。",
      },
      current_conflict: {
        type: "interpersonal",
        description: "旧友以「大局」施压，要他交出藏匿的手抄副本。",
        opposing_force: "担任枢密副使的同年",
        escalation_hook: "廷上若当众点名，林砚必须在忠诚与保全证人之间二选一。",
      },
    },
  },
  {
    id: "p-shang",
    name: "尚淳",
    roleLabel: "对手 / 实务派",
    bio: "做事讲政绩数字，不信「人心可诛笔」。",
    drama: {
      stance: {
        summary: "支持削藩并同步清洗流言源头，认为阵痛可换十年稳定。",
        toward: [
          { target: "清流史官", attitude: "oppose", intensity: 0.85 },
          { target: "边镇兵权整合", attitude: "support", intensity: 0.9 },
        ],
        visibility: "public",
      },
      motivation: {
        goal: "在本轮廷议中通过枢密院方案，排挤台谏。",
        stakes: "失败则边患与粮运问责落到自己头上。",
        internal_need: "摆脱出身污名。",
      },
      current_conflict: {
        type: "systemic",
        description: "台谏抓住一封匿名信，试图关联到尚淳早年举荐的人选。",
        opposing_force: "台谏 + 舆论场",
        escalation_hook: "若林砚公开副本，尚淳会抢先栽赃为伪造。",
      },
    },
  },
];

export const DEMO_MANUSCRIPT = `林砚把奏副本按日期重排第三遍时，窗外梆子敲过二更。\n\n尚淳进来没带随从，袖里却鼓出一角硬封——那是枢密院誊抄用的黄皮纸。两人对视，谁也没有先开口。`;
