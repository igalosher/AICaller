import type {
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowVariableBinding,
  FlowVariableDef,
} from "./graphTypes.js";

export const STAGED_OPENING = `שלום {{customer_first_name}} {{customer_family_name}},
כאן סִגׇּל מֵחֶבְרַת YES, אני עוזרת דיגיטלית. נוצרתי על ידי יִגְאָל אֹשֶׁר לֵוִין, אגב הוא מוסר דש.
בעבר התעניינת בהצטרפות אלינו,
יש לנו הצעה במחירים אטרקטיביים ומתנה למצטרפים.
במידה ולא {{g:תרצה|תרצי}} שנפנה אליך בעתיד, {{g:אמור|אמרי}} את המילה "הסר".
בכל שלב אפשר לשאול שאלות בנוגע לחבילות, ערוצים, אינטרנט ומבצעים.
על מנת שנוכל להתאים לך את החבילה המשתלמת ביותר נשמח לדעת כמה טלויזיות יש לך בבית?`;

const STAGED_INET = `הבנתי שיש לך {{NumOfTVs}} טלויזיות בבית.
איזו תשתית אינטרנט יש לך בבית? רגיל, סיבים או לא ידוע?`;

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

  const openingSpeak = b.speak("speak_opening", "פתיחה", STAGED_OPENING, { x, y });
  const tvListen = b.listen("listen_tv", "האזנה: כמה טלוויזיות", { x, y: y + 80 });
  const tvRoute = b.route("route_tv", "ניתוב: כמה טלוויזיות", { x, y: y + 160 });
  b.link(openingSpeak, tvListen);
  b.link(tvListen, tvRoute);
  y += dy;
  const inet = b.stage("inet", "תשתית אינטרנט", STAGED_INET, { x, y });
  y += dy;
  const address = b.stage(
    "address",
    "כתובת לבדיקת סיבים",
    "נשמח לבדוק עבורך היתכנות לתשתית סיבים אצלך בכתובת, מה הכתובת שלך? (עיר, רחוב, מספר בית, וכניסה אם יש)",
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

  // Opening (includes TV question) → Internet
  b.link(tvRoute, inet.speak, { intentId: "provide_tv_count", label: "מספר טלוויזיות" });
  b.link(tvRoute, inet.speak, { isDefault: true, label: "ברירת מחדל" });

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

  // Informational announcements chain directly to the next question (no listen wait)
  b.link(fiberYes.speak, speedFiber.speak);
  b.link(fiberNo.speak, speedReg.speak);
  b.link(fiberExists.speak, speedFiber.speak);
  b.link(noInet.speak, provider.speak);
  b.link(summary.speak, callback.speak);

  // Legacy route edges (unused when auto-chain is active; kept for builder compatibility)
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
    startNodeId: openingSpeak,
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
  const sideSpeakId = "side_small_talk";
  const hasSideNode = graph.nodes.some((n) => n.id === sideSpeakId);
  const nodes = hasSideNode
    ? graph.nodes.map((n) =>
        n.id === sideSpeakId && n.type === "speak"
          ? {
              ...n,
              label: n.label ?? "שאלת שלומך",
              text:
                n.text && n.text !== "הכל טוב תודה! בוא נחזור להצעה."
                  ? n.text
                  : "תודה, אני בסדר גמור! נשמח להמשיך עם ההצעה.",
              useLlm: n.useLlm ?? true,
              returnsToMain: n.returnsToMain ?? true,
            }
          : n,
      )
    : [
        ...graph.nodes,
        {
          id: sideSpeakId,
          type: "speak" as const,
          label: "שאלת שלומך",
          text: "תודה, אני בסדר גמור! נשמח להמשיך עם ההצעה.",
          useLlm: true,
          returnsToMain: true,
          position: { x: 900, y: 50 },
        },
      ];

  const hasSmallTalkSideFlow = (graph.sideFlows ?? []).some((sf) => sf.intentId === "small_talk");
  const sideFlows = hasSmallTalkSideFlow
    ? graph.sideFlows
    : [
        ...(graph.sideFlows ?? []),
        {
          id: "sf_small_talk",
          intentId: "small_talk",
          entryNodeId: sideSpeakId,
          label: "שאלת שלומך",
        },
      ];

  const bindings = mergeAddressBinding({ ...graph, nodes });

  return {
    ...graph,
    nodes,
    variableBindings: bindings,
    variables: ensureFlowVariables({ ...graph, variableBindings: bindings }),
    lookupTables: graph.lookupTables ?? [],
    interruptQa: graph.interruptQa ?? true,
    sideFlows,
  };
}

function mergeAddressBinding(graph: FlowGraph): FlowVariableBinding[] {
  const bindings: FlowVariableBinding[] = graph.variableBindings?.length
    ? [...graph.variableBindings]
    : [
        {
          listenNodeId: "listen_tv",
          variableName: "NumOfTVs",
          source: "entity",
        },
      ];
  if (
    !bindings.some((b) => b.listenNodeId === "listen_address") &&
    graph.nodes.some((n) => n.id === "listen_address")
  ) {
    bindings.push({
      listenNodeId: "listen_address",
      variableName: "CustomerAddress",
      source: "raw_text",
    });
  }
  return bindings;
}

const DEFAULT_FLOW_VARIABLES: Record<string, FlowVariableDef> = {
  NumOfTVs: { name: "NumOfTVs", type: "int", defaultValue: 0 },
  CustomerAddress: { name: "CustomerAddress", type: "string", defaultValue: "" },
};

const TV_COUNT_CANONICAL = "NumOfTVs";
const TV_COUNT_ALIASES = new Set(["numOfTVs", "numoftvs"]);

/** Collapse accidental duplicate TV-count variables (e.g. numOfTVs + NumOfTVs) into NumOfTVs. */
export function patchConsolidateTvVariables(graph: FlowGraph): FlowGraph {
  const variables = graph.variables ?? [];
  const hasAlias = variables.some((v) => TV_COUNT_ALIASES.has(v.name));
  if (!hasAlias) return graph;

  const nextVariables = variables.filter((v) => !TV_COUNT_ALIASES.has(v.name));
  if (!nextVariables.some((v) => v.name === TV_COUNT_CANONICAL)) {
    nextVariables.push(DEFAULT_FLOW_VARIABLES.NumOfTVs);
  }

  const variableBindings = (graph.variableBindings ?? []).map((b) =>
    TV_COUNT_ALIASES.has(b.variableName) ? { ...b, variableName: TV_COUNT_CANONICAL } : b,
  );

  const nodes = graph.nodes.map((n) => {
    if (n.type !== "speak") return n;
    let text = n.text;
    for (const alias of TV_COUNT_ALIASES) {
      text = text.replaceAll(`{{${alias}}}`, `{{${TV_COUNT_CANONICAL}}}`);
    }
    return text === n.text ? n : { ...n, text };
  });

  const edges = graph.edges.map((e) => {
    if (!e.condition?.variable || !TV_COUNT_ALIASES.has(e.condition.variable)) return e;
    return { ...e, condition: { ...e.condition, variable: TV_COUNT_CANONICAL } };
  });

  return { ...graph, variables: nextVariables, variableBindings, nodes, edges };
}

function defaultVariableDef(name: string): FlowVariableDef {
  return (
    DEFAULT_FLOW_VARIABLES[name] ?? {
      name,
      type: "string",
      defaultValue: "",
    }
  );
}

/** Ensure flow-level variables exist for bindings and known listen nodes. */
export function ensureFlowVariables(graph: FlowGraph): FlowVariableDef[] {
  const variables = [...(graph.variables ?? [])];
  const names = new Set(variables.map((v) => v.name));

  const ensure = (name: string) => {
    if (names.has(name)) return;
    variables.push(defaultVariableDef(name));
    names.add(name);
  };

  for (const binding of graph.variableBindings ?? []) {
    ensure(binding.variableName);
  }

  if (graph.nodes.some((n) => n.id === "listen_address")) {
    ensure("CustomerAddress");
  }
  const hasTvVariable = variables.some(
    (v) => v.name === TV_COUNT_CANONICAL || TV_COUNT_ALIASES.has(v.name),
  );
  if (graph.nodes.some((n) => n.id === "listen_tv") && !hasTvVariable) {
    ensure(TV_COUNT_CANONICAL);
  }

  if (variables.length === 0) {
    return [DEFAULT_FLOW_VARIABLES.NumOfTVs, DEFAULT_FLOW_VARIABLES.CustomerAddress];
  }
  return variables;
}

const BLACKLIST_SPEAK = "goodbye_blacklist";

function speakRepeatTarget(routeId: string, outgoing: FlowEdge[]): string | undefined {
  const stage = routeId.replace(/^route_/, "");
  const stageSpeak = `speak_${stage}`;
  if (outgoing.some((e) => e.target === stageSpeak)) return stageSpeak;
  return outgoing.find((e) => e.target.startsWith("speak_") && e.target !== "speak_hi")?.target;
}

/** Announcement speaks that should chain to the next question without waiting for customer input. */
const AUTO_ADVANCE_SPEAK_TARGETS: Record<string, string> = {
  speak_fiber_yes: "speak_speed_fiber",
  speak_fiber_no: "speak_speed_reg",
  speak_fiber_exists: "speak_speed_fiber",
  speak_no_inet: "speak_provider",
  speak_summary: "speak_callback",
};

export function patchSigalAutoAdvanceSpeaks(graph: FlowGraph): FlowGraph {
  if (!isSigalMiniFlowGraph(graph)) return graph;

  let edges = [...graph.edges];
  let nodes = graph.nodes.map((node) => {
    if (node.type !== "speak" || !AUTO_ADVANCE_SPEAK_TARGETS[node.id]) return node;
    return { ...node, autoAdvance: true };
  });

  const orphanIds = new Set<string>();

  for (const [speakId, targetId] of Object.entries(AUTO_ADVANCE_SPEAK_TARGETS)) {
    if (!nodes.some((n) => n.id === speakId) || !nodes.some((n) => n.id === targetId)) continue;

    const suffix = speakId.replace(/^speak_/, "");
    const listenId = `listen_${suffix}`;
    const routeId = `route_${suffix}`;

    edges = edges.filter(
      (e) => !(e.source === speakId && (e.target === listenId || e.target === routeId)),
    );

    const otherSpeakOut = edges.filter(
      (e) => e.source === speakId && e.target.startsWith("speak_") && e.target !== targetId,
    );
    if (otherSpeakOut.length > 0) {
      edges = edges.filter((e) => !otherSpeakOut.includes(e));
    }

    if (!edges.some((e) => e.source === speakId && e.target === targetId)) {
      edges.push({
        id: `e_auto_${speakId}_${targetId}`,
        source: speakId,
        target: targetId,
        label: "המשך אוטומטי",
      });
    }

    orphanIds.add(listenId);
    orphanIds.add(routeId);
  }

  edges = edges.filter((e) => !orphanIds.has(e.source) && !orphanIds.has(e.target));
  nodes = nodes.filter((n) => !orphanIds.has(n.id));

  return { ...graph, nodes, edges };
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
  return patchSigalFlowVariables(
    patchConsolidateTvVariables(patchSigalAutoAdvanceSpeaks(patchSigalGraphRouting(graph))),
  );
}

export function isSigalMiniFlowGraph(graph: FlowGraph): boolean {
  return graph.nodes.some((n) => n.id === "speak_opening" && n.type === "speak");
}
