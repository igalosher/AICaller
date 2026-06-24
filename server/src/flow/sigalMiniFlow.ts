import type { FlowEdge, FlowGraph, FlowNode } from "./graphTypes.js";

export const STAGED_OPENING = `שלום {{customer_first_name}} {{customer_family_name}},
כאן סיגל מחברת YES, אני עוזרת דיגיטלית.
בעבר {{g:התעניין|התעניינת}} בהצטרפות אלינו,
יש לנו הצעה במחירים אטרקטיביים ומתנה למצטרפים.
במידה ולא {{g:תרצה|תרצי}} שנפנה אליך בעתיד, {{g:אמור|אמרי}} את המילה "הסר".
בכל שלב אפשר לשאול שאלות בנוגע לחבילות, ערוצים, אינטרנט ומבצעים.`;

export const OPT_OUT_GOODBYE = "תודה רבה ויום נעים";
export const LEAD_GOODBYE = "מעולה, נציג יחזור אלייך בהקדם. יום נעים!";
export const POLITE_GOODBYE = "תודה רבה על הזמן. יום נעים!";

type Pos = { x: number; y: number };

class GraphBuilder {
  nodes: FlowNode[] = [];
  edges: FlowEdge[] = [];
  private edgeSeq = 0;

  speak(id: string, label: string, text: string, pos: Pos, useLlm = false) {
    this.nodes.push({ id, type: "speak", label, text, useLlm, position: pos });
    return id;
  }

  listen(id: string, label: string, pos: Pos) {
    this.nodes.push({ id, type: "listen", label, position: pos });
    return id;
  }

  route(id: string, label: string, pos: Pos) {
    this.nodes.push({ id, type: "intent_route", label, position: pos });
    return id;
  }

  end(id: string, label: string, outcome: "sold" | "refused" | "callback" | "none", pos: Pos) {
    this.nodes.push({ id, type: "end", label, outcome, position: pos });
    return id;
  }

  link(source: string, target: string, opts?: { intentId?: string; label?: string; isDefault?: boolean }) {
    this.edges.push({
      id: `e${++this.edgeSeq}`,
      source,
      target,
      intentId: opts?.intentId,
      label: opts?.label,
      isDefault: opts?.isDefault,
    });
  }

  /** speak → listen → route (one question per stage) */
  stage(
    prefix: string,
    label: string,
    text: string,
    pos: Pos,
    useLlm = false,
  ): { speak: string; listen: string; route: string } {
    const speak = this.speak(`speak_${prefix}`, label, text, pos, useLlm);
    const listen = this.listen(`listen_${prefix}`, `האזנה: ${label}`, { x: pos.x, y: pos.y + 80 });
    const route = this.route(`route_${prefix}`, `ניתוב: ${label}`, { x: pos.x, y: pos.y + 160 });
    this.link(speak, listen);
    this.link(listen, route);
    return { speak, listen, route };
  }
}

/** Sigal MiniFlow — each question is speak → listen → route (visible in בניית זרימה). */
export function createSigalMiniFlowGraph(): FlowGraph {
  const b = new GraphBuilder();
  const x = 320;
  let y = 0;
  const dy = 220;

  const opening = b.stage("opening", "פתיחה", STAGED_OPENING, { x, y: y });
  b.speak("speak_hi", "ברכה", "היוש", { x: x - 220, y: y + 80 });
  y += dy;
  const tv = b.stage(
    "tv",
    "כמה טלוויזיות",
    "על מנת שנוכל להתאים לך את החבילה המשתלמת ביותר נשמח לדעת כמה טלויזיות יש לך בבית",
    { x, y },
  );
  y += dy;
  const inet = b.stage(
    "inet",
    "תשתית אינטרנט",
    "איזו תשתית אינטרנט יש לך בבית? רגיל, סיבים או לא יודע?",
    { x, y },
  );
  y += dy;
  const address = b.stage(
    "address",
    "כתובת לבדיקת סיבים",
    "נשמח לבדוק עבורך היתכנות לתשתית סיבים אצלך בכתובת, מה הכתובת שלך (עיר, רחוב, מספר בית, וכניה אם יש)",
    { x: x - 200, y },
  );
  const fiberYes = b.stage(
    "fiber_yes",
    "יש סיבים בכתובת",
    "יש לנו חדשות מצוינות! יש תשתית סיבים בכתובת שלך.",
    { x: x - 200, y: y + dy },
  );
  const fiberNo = b.stage(
    "fiber_no",
    "אין סיבים בכתובת",
    "לצערי כרגע אין תשתית סיבים בכתובת שלך, אבל אל דאגה, יש לנו פתרונות מעולים גם באינטרנט רגיל.",
    { x: x + 200, y: y + dy },
  );
  const fiberExists = b.stage(
    "fiber_exists",
    "יש כבר סיבים",
    "מעולה, יש לך כבר תשתית סיבים — נוכל להציע לך מהירויות גבוהות במחירים אטרקטיביים.",
    { x, y: y + dy },
  );
  const noInet = b.stage(
    "no_inet",
    "אין אינטרנט",
    "אין בעיה, נשמח להציע לך חבילה הכוללת אינטרנט מהיר בנוסף לטלוויזיה — {{g:בוא|בואי}} נתאים לך את ההצעה הטובה ביותר.",
    { x: x + 280, y },
  );
  y += dy * 2;
  const speedFiber = b.stage(
    "speed_fiber",
    "מהירות סיבים",
    "אילו מהירות {{g:תרצה|תרצי}}? שלוש מאות מגה, שש מאות מגה, או גיגה?",
    { x, y },
  );
  const speedReg = b.stage(
    "speed_reg",
    "מהירות רגיל",
    "אילו מהירות מתאימה לך? מאה מגה או מאתיים מגה?",
    { x: x + 280, y },
  );
  y += dy;
  const provider = b.stage(
    "provider",
    "ספק נוכחי",
    "איזה ספק אינטרנט יש לך היום? בזק, הוט, פרטנר, סלקום, או אחר?",
    { x, y },
  );
  y += dy;
  const price = b.stage(
    "price",
    "מחיר נוכחי",
    "כמה {{g:אתה משלם|את משלמת}} היום על החבילה שלך?",
    { x, y },
  );
  y += dy;
  const offer = b.stage(
    "offer",
    "הצעת חבילה",
    "יש לנו הצעה מעולה עבורך! חבילת טריפל הכוללת טלוויזיה, אינטרנט וטלפון במחיר של 149 שקלים לחודש.",
    { x, y },
    true,
  );
  y += dy;
  const addons = b.stage(
    "addons",
    "תוספות",
    "האם {{g:תרצה|תרצי}} להוסיף שירותים כמו VOD, ערוצי ספורט, או פרטים נוספים?",
    { x, y },
  );
  y += dy;
  const summary = b.stage(
    "summary",
    "סיכום",
    "לסיכום, בחרת חבילת טריפל במחיר 149 שקלים לחודש.",
    { x, y },
  );
  y += dy;
  const callback = b.stage(
    "callback",
    "שיחה חוזרת",
    "{{g:תרצה|תרצי}} שאחד הנציגים שלנו יחזור {{g:אליך|אליך}} לתיאום התקנה?",
    { x, y },
  );

  b.speak("goodbye_blacklist", "פרידה הסר", OPT_OUT_GOODBYE, { x: x - 400, y: 200 });
  b.speak("goodbye_lead", "פרידה ליד", LEAD_GOODBYE, { x: x + 200, y: y + 80 });
  b.speak("goodbye_polite", "פרידה מנומסת", POLITE_GOODBYE, { x: x - 200, y: y + 80 });
  b.end("end_callback", "ליד", "callback", { x: x + 200, y: y + 200 });
  b.end("end_refused", "סירוב", "refused", { x: x - 200, y: y + 200 });
  b.end("end_blacklist", "הוסר", "refused", { x: x - 400, y: 320 });

  // Opening → TV
  b.link(opening.route, tv.speak, { intentId: "ask_offer", label: "מה ההצעה" });
  b.link(opening.route, tv.speak, { intentId: "silence", label: "שתיקה" });
  b.link(opening.route, "speak_hi", { intentId: "greeting_hi", label: "ברכה" });
  b.link(opening.route, tv.speak, { intentId: "greeting_ack", label: "המשך" });
  b.link("speak_hi", tv.speak);
  b.link(opening.route, tv.speak, { isDefault: true, label: "ברירת מחדל" });
  b.link(opening.route, "goodbye_blacklist", { intentId: "opt_out_remove", label: "הסר" });

  // TV → Internet
  b.link(tv.route, inet.speak, { intentId: "provide_tv_count", label: "מספר טלוויזיות" });
  b.link(tv.route, tv.speak, { intentId: "silence", label: "שתיקה" });
  b.link(tv.route, tv.speak, { intentId: "greeting_ack", label: "המשך" });
  b.link(tv.route, tv.speak, { isDefault: true, label: "חזרה על שאלה" });
  b.link(tv.route, "goodbye_blacklist", { intentId: "opt_out_remove", label: "הסר" });

  // Internet branches
  b.link(inet.route, address.speak, { intentId: "internet_regular", label: "רגיל" });
  b.link(inet.route, fiberExists.speak, { intentId: "internet_fiber", label: "סיבים" });
  b.link(inet.route, noInet.speak, { intentId: "internet_unknown", label: "לא יודע" });
  b.link(inet.route, noInet.speak, { intentId: "no_internet", label: "אין אינטרנט" });
  b.link(inet.route, inet.speak, { intentId: "silence", label: "שתיקה" });
  b.link(inet.route, inet.speak, { isDefault: true, label: "חזרה על שאלה" });

  // Address → fiber yes/no (callService maps provide_address → fiber_available / fiber_unavailable)
  b.link(address.route, fiberYes.speak, { intentId: "fiber_available", label: "יש סיבים" });
  b.link(address.route, fiberNo.speak, { intentId: "fiber_unavailable", label: "אין סיבים" });
  b.link(address.route, address.speak, { intentId: "silence", label: "שתיקה" });
  b.link(address.route, address.speak, { isDefault: true, label: "חזרה על שאלה" });
  b.link(address.route, "goodbye_blacklist", { intentId: "opt_out_remove", label: "הסר" });

  // After fiber check announcement → speed
  b.link(fiberYes.route, speedFiber.speak, { intentId: "greeting_ack", label: "המשך" });
  b.link(fiberYes.route, speedFiber.speak, { intentId: "silence", label: "שתיקה" });
  b.link(fiberYes.route, speedFiber.speak, { isDefault: true });
  b.link(fiberNo.route, speedReg.speak, { intentId: "greeting_ack", label: "המשך" });
  b.link(fiberNo.route, speedReg.speak, { intentId: "silence", label: "שתיקה" });
  b.link(fiberNo.route, speedReg.speak, { isDefault: true });

  b.link(fiberExists.route, speedFiber.speak, { intentId: "greeting_ack", label: "המשך" });
  b.link(fiberExists.route, speedFiber.speak, { intentId: "silence", label: "שתיקה" });
  b.link(fiberExists.route, speedFiber.speak, { isDefault: true });

  b.link(noInet.route, provider.speak, { intentId: "greeting_ack", label: "המשך" });
  b.link(noInet.route, provider.speak, { intentId: "silence", label: "שתיקה" });
  b.link(noInet.route, provider.speak, { isDefault: true });

  // Speed → provider
  b.link(speedFiber.route, provider.speak, { intentId: "select_speed_300" });
  b.link(speedFiber.route, provider.speak, { intentId: "select_speed_600" });
  b.link(speedFiber.route, provider.speak, { intentId: "select_speed_1000" });
  b.link(speedFiber.route, speedFiber.speak, { intentId: "silence", label: "שתיקה" });
  b.link(speedFiber.route, speedFiber.speak, { isDefault: true, label: "חזרה על שאלה" });
  b.link(speedReg.route, provider.speak, { intentId: "select_speed_100" });
  b.link(speedReg.route, provider.speak, { intentId: "select_speed_200" });
  b.link(speedReg.route, speedReg.speak, { intentId: "silence", label: "שתיקה" });
  b.link(speedReg.route, speedReg.speak, { isDefault: true, label: "חזרה על שאלה" });

  // Sales path
  b.link(provider.route, price.speak, { intentId: "provider_bezeq" });
  b.link(provider.route, price.speak, { intentId: "provider_hot" });
  b.link(provider.route, price.speak, { intentId: "provider_partner" });
  b.link(provider.route, price.speak, { intentId: "provider_cellcom" });
  b.link(provider.route, price.speak, { intentId: "provider_other" });
  b.link(provider.route, provider.speak, { intentId: "silence", label: "שתיקה" });
  b.link(provider.route, provider.speak, { isDefault: true, label: "חזרה על שאלה" });

  b.link(price.route, offer.speak, { intentId: "provide_current_price" });
  b.link(price.route, price.speak, { intentId: "silence", label: "שתיקה" });
  b.link(price.route, price.speak, { isDefault: true, label: "חזרה על שאלה" });

  b.link(offer.route, addons.speak, { intentId: "agree_purchase" });
  b.link(offer.route, addons.speak, { intentId: "greeting_ack" });
  b.link(offer.route, addons.speak, { intentId: "price_objection" });
  b.link(offer.route, addons.speak, { isDefault: true });

  b.link(addons.route, summary.speak, { intentId: "select_addons" });
  b.link(addons.route, summary.speak, { intentId: "decline_addons" });
  b.link(addons.route, summary.speak, { intentId: "greeting_ack" });
  b.link(addons.route, summary.speak, { isDefault: true });

  b.link(summary.route, callback.speak, { intentId: "greeting_ack" });
  b.link(summary.route, callback.speak, { intentId: "silence" });
  b.link(summary.route, callback.speak, { isDefault: true });

  b.link(callback.route, "goodbye_lead", { intentId: "agree_callback" });
  b.link(callback.route, "goodbye_polite", { intentId: "decline_callback" });
  b.link(callback.route, callback.speak, { intentId: "silence", label: "שתיקה" });
  b.link(callback.route, callback.speak, { isDefault: true, label: "חזרה על שאלה" });
  b.link(callback.route, "goodbye_blacklist", { intentId: "opt_out_remove" });

  b.link("goodbye_lead", "end_callback");
  b.link("goodbye_polite", "end_refused");
  b.link("goodbye_blacklist", "end_blacklist");

  return enhanceSigalGraph({
    startNodeId: opening.speak,
    nodes: b.nodes,
    edges: b.edges,
    variables: [{ name: "NumOfTVs", type: "int", defaultValue: 0 }],
    lookupTables: [
      {
        name: "Channels",
        rows: [
          { name: "ספורט 5", tier: "premium" },
          { name: "ערוץ 12", tier: "basic" },
        ],
      },
    ],
  });
}

export function patchSigalFlowVariables(graph: FlowGraph): FlowGraph {
  return {
    ...graph,
    variableBindings: graph.variableBindings?.length
      ? graph.variableBindings
      : [
          {
            listenNodeId: "listen_tv",
            variableName: "NumOfTVs",
            source: "entity",
          },
        ],
    variables: graph.variables?.length
      ? graph.variables
      : [{ name: "NumOfTVs", type: "int" as const, defaultValue: 0 }],
    lookupTables: graph.lookupTables ?? [],
    interruptQa: graph.interruptQa ?? true,
  };
}

const BLACKLIST_SPEAK = "goodbye_blacklist";

function speakRepeatTarget(routeId: string, outgoing: FlowEdge[]): string | undefined {
  const stage = routeId.replace(/^route_/, "");
  const stageSpeak = `speak_${stage}`;
  if (outgoing.some((e) => e.target === stageSpeak)) return stageSpeak;
  return outgoing.find((e) => e.target.startsWith("speak_") && e.target !== "speak_hi")?.target;
}

/** Fix corrupted defaults (e.g. blacklist as default) and clean up greeting routing. */
export function patchSigalGraphRouting(graph: FlowGraph): FlowGraph {
  if (!isSigalMiniFlowGraph(graph)) return graph;

  let nodes = [...graph.nodes];
  let edges = [...graph.edges];

  const hasSpeakHi = nodes.some((n) => n.id === "speak_hi");
  const tvSpeak = nodes.some((n) => n.id === "speak_tv") ? "speak_tv" : undefined;

  if (!hasSpeakHi) {
    edges = edges.filter((e) => e.source !== "speak_hi" && e.target !== "speak_hi");
    if (tvSpeak) {
      edges = edges.map((e) =>
        e.source === "route_opening" && e.intentId === "greeting_hi"
          ? { ...e, target: tvSpeak, label: e.label ?? "ברכה" }
          : e,
      );
    }
  } else if (tvSpeak && !edges.some((e) => e.source === "speak_hi" && e.target === tvSpeak)) {
    edges.push({ id: "e_speak_hi_tv", source: "speak_hi", target: tvSpeak });
  }

  for (const routeId of ["route_opening"]) {
    if (!nodes.some((n) => n.id === routeId)) continue;
    edges = edges.filter(
      (e) =>
        !(
          e.source === routeId &&
          e.intentId === "greeting_ack" &&
          e.target === "speak_hi"
        ),
    );
    if (!hasSpeakHi) continue;
    const hasGreetingHi = edges.some(
      (e) => e.source === routeId && e.intentId === "greeting_hi" && e.target === "speak_hi",
    );
    if (!hasGreetingHi) {
      edges = edges.map((e) =>
        e.source === routeId && e.intentId === "greeting_ack" && e.target === "speak_hi"
          ? { ...e, intentId: "greeting_hi", label: e.label ?? "ברכה" }
          : e,
      );
      if (!edges.some((e) => e.source === routeId && e.intentId === "greeting_hi")) {
        edges.push({
          id: `e_${routeId}_greeting_hi`,
          source: routeId,
          target: "speak_hi",
          intentId: "greeting_hi",
          label: "ברכה",
        });
      }
    }
  }

  if (nodes.some((n) => n.id === "route_tv") && tvSpeak) {
    edges = edges
      .filter(
        (e) =>
          !(
            e.source === "route_tv" &&
            e.intentId === "greeting_ack" &&
            e.target === "speak_hi"
          ),
      )
      .map((e) =>
        e.source === "route_tv" && e.intentId === "greeting_ack" && e.target === "speak_hi"
          ? { ...e, target: tvSpeak, label: e.label ?? "המשך" }
          : e,
      );
    if (!edges.some((e) => e.source === "route_tv" && e.intentId === "greeting_ack")) {
      edges.push({
        id: "e_route_tv_greeting_ack",
        source: "route_tv",
        target: tvSpeak,
        intentId: "greeting_ack",
        label: "המשך",
      });
    }
  }

  const routeIds = new Set(nodes.filter((n) => n.type === "intent_route").map((n) => n.id));
  edges = edges.map((e) => {
    if (!routeIds.has(e.source) || !e.isDefault || e.target !== BLACKLIST_SPEAK) return e;
    const outgoing = edges.filter((x) => x.source === e.source);
    const repeat = speakRepeatTarget(e.source, outgoing);
    if (!repeat) return e;
    return {
      ...e,
      target: repeat,
      intentId: undefined,
      label: e.label?.includes("חזרה") ? e.label : "חזרה על שאלה",
    };
  });

  return { ...graph, nodes, edges };
}

export function enhanceSigalGraph(graph: FlowGraph): FlowGraph {
  return patchSigalFlowVariables(patchSigalGraphRouting(graph));
}

export function isSigalMiniFlowGraph(graph: FlowGraph): boolean {
  return graph.nodes.some((n) => n.id === "speak_opening" && n.type === "speak");
}
