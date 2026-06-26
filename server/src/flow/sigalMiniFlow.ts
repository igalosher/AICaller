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
export const LEAD_GOODBYE = "נהדר, נציג שלנו יתקשר בקרוב לקבלת פרטים.";
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
  const addressConfirm = b.stage(
    "address_confirm",
    "אישור כתובת",
    "רשמתי {{CustomerAddress}}. האם הכתובת נכונה?",
    { x: x - 200, y: y + 100 },
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
  b.nodes.push({
    id: "decide_price",
    type: "decision",
    label: "יש תשובת מחיר?",
    position: { x, y: y + 240 },
  });
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
  b.nodes.push({
    id: "decide_callback",
    type: "decision",
    label: "תשובת שיחה חוזרת",
    position: { x, y: y + 240 },
  });

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

  // Address → confirm → fiber check (lookup runs only after customer confirms)
  b.link(address.route, addressConfirm.speak, { intentId: "provide_address", label: "קיבלתי כתובת" });
  b.link(address.route, address.speak, { intentId: "silence", label: "שתיקה" });
  b.link(address.route, address.speak, { isDefault: true, label: "חזרה על שאלה" });
  b.link(address.route, "goodbye_blacklist", { intentId: "opt_out_remove", label: "הסר" });

  b.route("route_fiber", "ניתוב זמינות סיבים", { x: x - 200, y: y + 280 });
  b.nodes.push({
    id: "decide_address_confirm",
    type: "decision",
    label: "אישור כתובת?",
    position: { x: x - 200, y: y + 260 },
  });

  b.link(addressConfirm.route, "route_fiber", { intentId: "greeting_ack", label: "כן" });
  b.link(addressConfirm.route, "route_fiber", { intentId: "agree_purchase", label: "מסכים" });
  b.link(addressConfirm.route, address.speak, { intentId: "decline_callback", label: "לא" });
  b.link(addressConfirm.route, address.speak, { intentId: "decline_addons", label: "לא תודה" });
  b.link(addressConfirm.route, addressConfirm.speak, { intentId: "silence", label: "שתיקה" });
  b.link(addressConfirm.route, "decide_address_confirm", { isDefault: true, label: "בדיקת תשובה" });

  b.edges.push(
    {
      id: "e_decide_addr_yes",
      source: "decide_address_confirm",
      target: "route_fiber",
      label: "כן",
      condition: { op: "var_eq", variable: "AddressConfirmAnswerText", literal: "כן" },
    },
    {
      id: "e_decide_addr_no",
      source: "decide_address_confirm",
      target: address.speak,
      label: "לא",
      condition: { op: "var_eq", variable: "AddressConfirmAnswerText", literal: "לא" },
    },
    {
      id: "e_decide_addr_repeat",
      source: "decide_address_confirm",
      target: addressConfirm.speak,
      isDefault: true,
      label: "חזרה על שאלה",
    },
  );

  b.link("route_fiber", fiberYes.speak, { intentId: "fiber_available", label: "יש סיבים" });
  b.link("route_fiber", fiberNo.speak, { intentId: "fiber_unavailable", label: "אין סיבים" });

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
  b.link(speedFiber.route, provider.speak, { isDefault: true, label: "המשך" });
  b.link(speedReg.route, provider.speak, { intentId: "select_speed_100" });
  b.link(speedReg.route, provider.speak, { intentId: "select_speed_200" });
  b.link(speedReg.route, speedReg.speak, { intentId: "silence", label: "שתיקה" });
  b.link(speedReg.route, provider.speak, { isDefault: true, label: "המשך" });

  // Sales path
  b.link(provider.route, price.speak, { intentId: "provider_bezeq" });
  b.link(provider.route, price.speak, { intentId: "provider_hot" });
  b.link(provider.route, price.speak, { intentId: "provider_partner" });
  b.link(provider.route, price.speak, { intentId: "provider_cellcom" });
  b.link(provider.route, price.speak, { intentId: "provider_other" });
  b.link(provider.route, provider.speak, { intentId: "silence", label: "שתיקה" });
  b.link(provider.route, provider.speak, { isDefault: true, label: "חזרה על שאלה" });

  b.link(price.route, offer.speak, { intentId: "provide_current_price" });
  b.link(price.route, offer.speak, { intentId: "ask_options_compare", label: "השוואת אפשרויות" });
  b.link(price.route, offer.speak, { intentId: "price_objection", label: "התנגדות מחיר" });
  b.link(price.route, offer.speak, { intentId: "greeting_ack", label: "אישור" });
  b.link(price.route, "decide_price", { isDefault: true, label: "בדיקת תשובה" });
  b.link(price.route, price.speak, { intentId: "silence", label: "שתיקה" });
  b.link("decide_price", offer.speak, {
    condition: { op: "var_not_empty", variable: "PriceAnswerText" },
    label: "יש תשובה",
  });
  b.link("decide_price", price.speak, { isDefault: true, label: "חזרה על שאלה" });

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

  b.link(callback.route, "goodbye_lead", { intentId: "agree_callback", label: "כן לשיחה חוזרת" });
  b.link(callback.route, "goodbye_lead", { intentId: "greeting_ack", label: "כן" });
  b.link(callback.route, "goodbye_lead", { intentId: "agree_purchase", label: "מסכים" });
  b.link(callback.route, "goodbye_polite", { intentId: "decline_callback", label: "לא לשיחה חוזרת" });
  b.link(callback.route, "goodbye_polite", { intentId: "not_interested", label: "לא מעוניין" });
  b.link(callback.route, "goodbye_polite", { intentId: "decline_addons", label: "לא תודה" });
  b.link(callback.route, "decide_callback", { isDefault: true, label: "בדיקת תשובה" });
  b.link(callback.route, callback.speak, { intentId: "silence", label: "שתיקה" });
  b.link(callback.route, "goodbye_blacklist", { intentId: "opt_out_remove" });
  b.link("decide_callback", "goodbye_lead", {
    condition: { op: "var_eq", variable: "CallbackAnswerText", literal: "כן" },
    label: "כן",
  });
  b.link("decide_callback", "goodbye_polite", {
    condition: { op: "var_eq", variable: "CallbackAnswerText", literal: "לא" },
    label: "לא",
  });
  b.link("decide_callback", "goodbye_polite", {
    condition: { op: "var_eq", variable: "CallbackAnswerText", literal: "לא תודה" },
    label: "לא תודה",
  });
  b.link("decide_callback", callback.speak, { isDefault: true, label: "חזרה על שאלה" });

  b.link("goodbye_lead", "end_callback");
  b.link("goodbye_polite", "end_refused");
  b.link("goodbye_blacklist", "end_blacklist");

  return enhanceSigalGraph({
    startNodeId: openingSpeak,
    nodes: b.nodes,
    edges: b.edges,
    interruptQa: false,
    variables: [
      { name: "NumOfTVs", type: "int", defaultValue: 0 },
      { name: "MonthlyPrice", type: "int", defaultValue: 0 },
      { name: "PriceAnswerText", type: "string", defaultValue: "" },
      { name: "SpeedAnswerText", type: "string", defaultValue: "" },
      { name: "CallbackAnswerText", type: "string", defaultValue: "" },
    ],
    variableBindings: [
      { listenNodeId: "listen_tv", variableName: "NumOfTVs", source: "entity" },
      { listenNodeId: "listen_speed_fiber", variableName: "SpeedAnswerText", source: "raw_text" },
      { listenNodeId: "listen_speed_reg", variableName: "SpeedAnswerText", source: "raw_text" },
      { listenNodeId: "listen_price", variableName: "PriceAnswerText", source: "raw_text" },
      { listenNodeId: "listen_price", variableName: "MonthlyPrice", source: "entity", path: "monthly_price" },
      { listenNodeId: "listen_callback", variableName: "CallbackAnswerText", source: "raw_text" },
    ],
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

  return patchSigalProductSideFlows({
    ...graph,
    nodes,
    variableBindings: bindings,
    variables: ensureFlowVariables({ ...graph, variableBindings: bindings }),
    lookupTables: graph.lookupTables ?? [],
    interruptQa: graph.interruptQa ?? true,
    sideFlows,
  });
}

const PRODUCT_QA_INTENTS = [
  "ask_channel",
  "ask_packet",
  "ask_internet",
  "ask_router_rental",
  "ask_options_compare",
  "price_objection",
] as const;

export function patchSigalProductSideFlows(graph: FlowGraph): FlowGraph {
  const speakId = "side_product_qa_speak";

  let nodes = [...graph.nodes];
  let edges = [...graph.edges];

  if (!nodes.some((n) => n.id === speakId)) {
    nodes.push({
      id: speakId,
      type: "speak",
      label: "מוצרים: תשובה AI",
      text: "עני בקצרה בעברית על חבילות טלוויזיה, ערוצים, אינטרנט, מבצעים ומחירים לפי הקטלוג. הזכירי רק מוצרים שקיימים בנתונים.",
      useLlm: true,
      returnsToMain: true,
      position: { x: 1100, y: 50 },
    });
  } else {
    nodes = nodes.map((n) =>
      n.id === speakId && n.type === "speak"
        ? {
            ...n,
            useLlm: (n as { useLlm?: boolean }).useLlm ?? true,
            returnsToMain: true,
          }
        : n,
    );
  }

  // Single-turn product Q&A: answer once, then resume main flow (no listen loop).
  const legacyProductIds = new Set([
    "side_product_qa_listen",
    "side_product_qa_route",
    "side_product_qa_farewell",
  ]);
  edges = edges.filter(
    (e) =>
      e.source !== speakId &&
      e.target !== speakId &&
      !legacyProductIds.has(e.source) &&
      !legacyProductIds.has(e.target),
  );
  nodes = nodes.filter((n) => !legacyProductIds.has(n.id));

  const sideFlows = [...(graph.sideFlows ?? [])];
  for (const intentId of PRODUCT_QA_INTENTS) {
    if (!sideFlows.some((sf) => sf.intentId === intentId)) {
      sideFlows.push({
        id: `sf_product_${intentId}`,
        intentId,
        entryNodeId: speakId,
        label: `שאלת מוצרים (${intentId})`,
      });
    }
  }

  return { ...graph, nodes, edges, sideFlows };
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
  if (
    !bindings.some((b) => b.listenNodeId === "listen_address_confirm") &&
    graph.nodes.some((n) => n.id === "listen_address_confirm")
  ) {
    bindings.push({
      listenNodeId: "listen_address_confirm",
      variableName: "AddressConfirmAnswerText",
      source: "raw_text",
    });
  }
  if (graph.nodes.some((n) => n.id === "listen_price")) {
    if (!bindings.some((b) => b.listenNodeId === "listen_price" && b.variableName === "PriceAnswerText")) {
      bindings.push({
        listenNodeId: "listen_price",
        variableName: "PriceAnswerText",
        source: "raw_text",
      });
    }
    if (!bindings.some((b) => b.listenNodeId === "listen_price" && b.variableName === "MonthlyPrice")) {
      bindings.push({
        listenNodeId: "listen_price",
        variableName: "MonthlyPrice",
        source: "entity",
        path: "monthly_price",
      });
    }
  }
  if (graph.nodes.some((n) => n.id === "listen_callback")) {
    if (!bindings.some((b) => b.listenNodeId === "listen_callback" && b.variableName === "CallbackAnswerText")) {
      bindings.push({
        listenNodeId: "listen_callback",
        variableName: "CallbackAnswerText",
        source: "raw_text",
      });
    }
  }
  for (const listenId of ["listen_speed_fiber", "listen_speed_reg"] as const) {
    if (
      graph.nodes.some((n) => n.id === listenId) &&
      !bindings.some((b) => b.listenNodeId === listenId && b.variableName === "SpeedAnswerText")
    ) {
      bindings.push({
        listenNodeId: listenId,
        variableName: "SpeedAnswerText",
        source: "raw_text",
      });
    }
  }
  return bindings;
}

const DEFAULT_FLOW_VARIABLES: Record<string, FlowVariableDef> = {
  NumOfTVs: { name: "NumOfTVs", type: "int", defaultValue: 0 },
  CustomerAddress: { name: "CustomerAddress", type: "string", defaultValue: "" },
  AddressConfirmAnswerText: { name: "AddressConfirmAnswerText", type: "string", defaultValue: "" },
  MonthlyPrice: { name: "MonthlyPrice", type: "int", defaultValue: 0 },
  PriceAnswerText: { name: "PriceAnswerText", type: "string", defaultValue: "" },
  SpeedAnswerText: { name: "SpeedAnswerText", type: "string", defaultValue: "" },
  CallbackAnswerText: { name: "CallbackAnswerText", type: "string", defaultValue: "" },
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
  if (graph.nodes.some((n) => n.id === "listen_address_confirm")) {
    ensure("AddressConfirmAnswerText");
  }
  const hasTvVariable = variables.some(
    (v) => v.name === TV_COUNT_CANONICAL || TV_COUNT_ALIASES.has(v.name),
  );
  if (graph.nodes.some((n) => n.id === "listen_tv") && !hasTvVariable) {
    ensure(TV_COUNT_CANONICAL);
  }
  if (graph.nodes.some((n) => n.id === "listen_price")) {
    ensure("MonthlyPrice");
    ensure("PriceAnswerText");
  }
  if (graph.nodes.some((n) => n.id === "listen_callback")) {
    ensure("CallbackAnswerText");
  }

  if (variables.length === 0) {
    return [
      DEFAULT_FLOW_VARIABLES.NumOfTVs,
      DEFAULT_FLOW_VARIABLES.CustomerAddress,
      DEFAULT_FLOW_VARIABLES.MonthlyPrice,
      DEFAULT_FLOW_VARIABLES.PriceAnswerText,
      DEFAULT_FLOW_VARIABLES.CallbackAnswerText,
    ];
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

  if (nodes.some((n) => n.id === "route_tv")) {
    const tvRepeat =
      nodes.some((n) => n.id === "speak_opening")
        ? "speak_opening"
        : tvSpeak;
    if (tvSpeak) {
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
    if (tvRepeat && !edges.some((e) => e.source === "route_tv" && e.intentId === "greeting_hi")) {
      edges.push({
        id: "e_route_tv_greeting_hi",
        source: "route_tv",
        target: tvRepeat,
        intentId: "greeting_hi",
        label: "ברכה — חזרה על שאלה",
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

/** After price question: advance on any spoken answer (e.g. bare "200"), not only classified provide_current_price. */
export function patchSigalPriceRouting(graph: FlowGraph): FlowGraph {
  if (!isSigalMiniFlowGraph(graph)) return graph;
  if (!graph.nodes.some((n) => n.id === "route_price")) return graph;

  let nodes = [...graph.nodes];
  let edges = [...graph.edges];

  if (!nodes.some((n) => n.id === "decide_price")) {
    const routePrice = nodes.find((n) => n.id === "route_price");
    const pos = routePrice?.position ?? { x: 320, y: 880 };
    nodes.push({
      id: "decide_price",
      type: "decision",
      label: "יש תשובת מחיר?",
      position: { x: pos.x, y: (pos.y ?? 0) + 80 },
    });
  }

  const offerIntents: Array<{ intentId: string; label: string }> = [
    { intentId: "provide_current_price", label: "מחיר נוכחי" },
    { intentId: "ask_options_compare", label: "השוואת אפשרויות" },
    { intentId: "price_objection", label: "התנגדות מחיר" },
    { intentId: "greeting_ack", label: "אישור" },
  ];
  for (const { intentId, label } of offerIntents) {
    if (!edges.some((e) => e.source === "route_price" && e.intentId === intentId)) {
      edges.push({
        id: `e_route_price_${intentId}`,
        source: "route_price",
        target: "speak_offer",
        intentId,
        label,
      });
    }
  }

  edges = edges.filter(
    (e) => !(e.source === "route_price" && e.isDefault && e.target === "speak_price"),
  );
  if (!edges.some((e) => e.source === "route_price" && e.isDefault)) {
    edges.push({
      id: "e_route_price_default_decide",
      source: "route_price",
      target: "decide_price",
      isDefault: true,
      label: "בדיקת תשובה",
    });
  } else {
    edges = edges.map((e) =>
      e.source === "route_price" && e.isDefault
        ? { ...e, target: "decide_price", label: e.label ?? "בדיקת תשובה" }
        : e,
    );
  }

  edges = edges.filter((e) => e.source !== "decide_price");
  edges.push(
    {
      id: "e_decide_price_has_answer",
      source: "decide_price",
      target: "speak_offer",
      label: "יש תשובה",
      condition: { op: "var_not_empty", variable: "PriceAnswerText" },
    },
    {
      id: "e_decide_price_repeat",
      source: "decide_price",
      target: "speak_price",
      isDefault: true,
      label: "חזרה על שאלה",
    },
  );

  const withBindings = patchSigalFlowVariables({ ...graph, nodes, edges, interruptQa: false });
  const variables = (withBindings.variables ?? []).map((v) =>
    v.name === "MonthlyPrice" ? { ...v, type: "int" as const, defaultValue: 0 } : v,
  );
  return { ...withBindings, variables };
}

/** Speed question: any spoken answer (e.g. "200 מגה") advances — only silence repeats the question. */
export function patchSigalSpeedRouting(graph: FlowGraph): FlowGraph {
  if (!isSigalMiniFlowGraph(graph)) return graph;

  let nodes = graph.nodes.filter(
    (n) => n.id !== "decide_speed_reg" && n.id !== "decide_speed_fiber",
  );
  let edges = graph.edges.filter(
    (e) => e.source !== "decide_speed_reg" && e.source !== "decide_speed_fiber",
  );

  const patchOne = (routeId: string, repeatSpeakId: string, providerSpeakId: string) => {
    if (!nodes.some((n) => n.id === routeId)) return;

    edges = edges.filter(
      (e) => !(e.source === routeId && e.isDefault && e.target === repeatSpeakId),
    );
    const existingDefault = edges.find((e) => e.source === routeId && e.isDefault);
    if (existingDefault) {
      edges = edges.map((e) =>
        e.source === routeId && e.isDefault
          ? { ...e, target: providerSpeakId, label: e.label ?? "המשך" }
          : e,
      );
    } else {
      edges.push({
        id: `e_${routeId}_default_provider`,
        source: routeId,
        target: providerSpeakId,
        isDefault: true,
        label: "המשך",
      });
    }
  };

  patchOne("route_speed_reg", "speak_speed_reg", "speak_provider");
  patchOne("route_speed_fiber", "speak_speed_fiber", "speak_provider");

  const withBindings = patchSigalFlowVariables({ ...graph, nodes, edges, interruptQa: false });
  const variables = withBindings.variables ?? [];
  if (!variables.some((v) => v.name === "SpeedAnswerText")) {
    variables.push(DEFAULT_FLOW_VARIABLES.SpeedAnswerText);
  }
  return { ...withBindings, variables };
}

/** Callback yes/no: "כן" is classified as greeting_ack, not agree_callback — route both to goodbye_lead. */
export function patchSigalCallbackRouting(graph: FlowGraph): FlowGraph {
  if (!isSigalMiniFlowGraph(graph)) return graph;
  if (!graph.nodes.some((n) => n.id === "route_callback")) return graph;

  let nodes = graph.nodes.map((n) =>
    n.id === "goodbye_lead" && n.type === "speak"
      ? { ...n, text: LEAD_GOODBYE, label: n.label ?? "פרידה ליד" }
      : n,
  );
  let edges = [...graph.edges];

  if (!nodes.some((n) => n.id === "decide_callback")) {
    const routeCallback = nodes.find((n) => n.id === "route_callback");
    const pos = routeCallback?.position ?? { x: 320, y: 1320 };
    nodes.push({
      id: "decide_callback",
      type: "decision",
      label: "תשובת שיחה חוזרת",
      position: { x: pos.x, y: (pos.y ?? 0) + 80 },
    });
  }

  const ensureRoute = (intentId: string, target: string, label: string) => {
    const existing = edges.find((e) => e.source === "route_callback" && e.intentId === intentId);
    if (existing) {
      edges = edges.map((e) =>
        e.source === "route_callback" && e.intentId === intentId ? { ...e, target, label } : e,
      );
    } else {
      edges.push({
        id: `e_route_callback_${intentId}`,
        source: "route_callback",
        target,
        intentId,
        label,
      });
    }
  };

  ensureRoute("agree_callback", "goodbye_lead", "כן לשיחה חוזרת");
  ensureRoute("greeting_ack", "goodbye_lead", "כן");
  ensureRoute("agree_purchase", "goodbye_lead", "מסכים");
  ensureRoute("decline_callback", "goodbye_polite", "לא לשיחה חוזרת");
  ensureRoute("not_interested", "goodbye_polite", "לא מעוניין");
  ensureRoute("decline_addons", "goodbye_polite", "לא תודה");

  edges = edges.filter(
    (e) => !(e.source === "route_callback" && e.isDefault && e.target === "speak_callback"),
  );
  if (!edges.some((e) => e.source === "route_callback" && e.isDefault)) {
    edges.push({
      id: "e_route_callback_default_decide",
      source: "route_callback",
      target: "decide_callback",
      isDefault: true,
      label: "בדיקת תשובה",
    });
  } else {
    edges = edges.map((e) =>
      e.source === "route_callback" && e.isDefault
        ? { ...e, target: "decide_callback", label: e.label ?? "בדיקת תשובה" }
        : e,
    );
  }

  edges = edges.filter((e) => e.source !== "decide_callback");
  edges.push(
    {
      id: "e_decide_callback_yes",
      source: "decide_callback",
      target: "goodbye_lead",
      label: "כן",
      condition: { op: "var_eq", variable: "CallbackAnswerText", literal: "כן" },
    },
    {
      id: "e_decide_callback_no",
      source: "decide_callback",
      target: "goodbye_polite",
      label: "לא",
      condition: { op: "var_eq", variable: "CallbackAnswerText", literal: "לא" },
    },
    {
      id: "e_decide_callback_no_thanks",
      source: "decide_callback",
      target: "goodbye_polite",
      label: "לא תודה",
      condition: { op: "var_eq", variable: "CallbackAnswerText", literal: "לא תודה" },
    },
    {
      id: "e_decide_callback_repeat",
      source: "decide_callback",
      target: "speak_callback",
      isDefault: true,
      label: "חזרה על שאלה",
    },
  );

  return { ...graph, nodes, edges };
}

const ADDRESS_CONFIRM_SPEAK_TEXT = "רשמתי {{CustomerAddress}}. האם הכתובת נכונה?";

/** After address: repeat it back, confirm yes/no, re-ask on no, then fiber lookup. */
export function patchSigalAddressConfirmRouting(graph: FlowGraph): FlowGraph {
  if (!isSigalMiniFlowGraph(graph)) return graph;
  if (!graph.nodes.some((n) => n.id === "listen_address")) return graph;

  let nodes = [...graph.nodes];
  let edges = [...graph.edges];

  const addressSpeak = nodes.find((n) => n.id === "speak_address");
  const pos = addressSpeak?.position ?? { x: 120, y: 440 };

  if (!nodes.some((n) => n.id === "speak_address_confirm")) {
    nodes.push(
      {
        id: "speak_address_confirm",
        type: "speak",
        label: "אישור כתובת",
        text: ADDRESS_CONFIRM_SPEAK_TEXT,
        position: { x: pos.x, y: (pos.y ?? 0) + 100 },
      },
      {
        id: "listen_address_confirm",
        type: "listen",
        label: "האזנה: אישור כתובת",
        position: { x: pos.x, y: (pos.y ?? 0) + 180 },
      },
      {
        id: "route_address_confirm",
        type: "intent_route",
        label: "ניתוב: אישור כתובת",
        position: { x: pos.x, y: (pos.y ?? 0) + 260 },
      },
    );
    edges.push(
      { id: "e_speak_address_confirm_listen", source: "speak_address_confirm", target: "listen_address_confirm" },
      { id: "e_listen_address_confirm_route", source: "listen_address_confirm", target: "route_address_confirm" },
    );
  } else {
    nodes = nodes.map((n) =>
      n.id === "speak_address_confirm" && n.type === "speak"
        ? { ...n, text: ADDRESS_CONFIRM_SPEAK_TEXT, label: n.label ?? "אישור כתובת" }
        : n,
    );
  }

  if (!nodes.some((n) => n.id === "route_fiber")) {
    nodes.push({
      id: "route_fiber",
      type: "intent_route",
      label: "ניתוב זמינות סיבים",
      position: { x: pos.x, y: (pos.y ?? 0) + 340 },
    });
  }

  if (!nodes.some((n) => n.id === "decide_address_confirm")) {
    nodes.push({
      id: "decide_address_confirm",
      type: "decision",
      label: "אישור כתובת?",
      position: { x: pos.x, y: (pos.y ?? 0) + 320 },
    });
  }

  edges = edges.filter(
    (e) =>
      !(
        e.source === "route_address" &&
        (e.intentId === "fiber_available" || e.intentId === "fiber_unavailable")
      ),
  );

  const ensureRoute = (source: string, intentId: string | undefined, target: string, label: string, isDefault?: boolean) => {
    const existing = edges.find(
      (e) => e.source === source && e.intentId === intentId && Boolean(e.isDefault) === Boolean(isDefault),
    );
    if (existing) {
      edges = edges.map((e) => (e.id === existing.id ? { ...e, target, label } : e));
    } else {
      edges.push({
        id: `e_${source}_${intentId ?? "default"}_${target}`,
        source,
        target,
        intentId,
        label,
        isDefault,
      });
    }
  };

  ensureRoute("route_address", "provide_address", "speak_address_confirm", "קיבלתי כתובת");
  ensureRoute("route_address", "silence", "speak_address", "שתיקה");
  ensureRoute("route_address", undefined, "speak_address", "חזרה על שאלה", true);

  ensureRoute("route_address_confirm", "greeting_ack", "route_fiber", "כן");
  ensureRoute("route_address_confirm", "agree_purchase", "route_fiber", "מסכים");
  ensureRoute("route_address_confirm", "decline_callback", "speak_address", "לא");
  ensureRoute("route_address_confirm", "decline_addons", "speak_address", "לא תודה");
  ensureRoute("route_address_confirm", "silence", "speak_address_confirm", "שתיקה");
  ensureRoute("route_address_confirm", undefined, "decide_address_confirm", "בדיקת תשובה", true);

  ensureRoute("route_fiber", "fiber_available", "speak_fiber_yes", "יש סיבים");
  ensureRoute("route_fiber", "fiber_unavailable", "speak_fiber_no", "אין סיבים");

  edges = edges.filter((e) => e.source !== "decide_address_confirm");
  edges.push(
    {
      id: "e_decide_addr_yes",
      source: "decide_address_confirm",
      target: "route_fiber",
      label: "כן",
      condition: { op: "var_eq", variable: "AddressConfirmAnswerText", literal: "כן" },
    },
    {
      id: "e_decide_addr_no",
      source: "decide_address_confirm",
      target: "speak_address",
      label: "לא",
      condition: { op: "var_eq", variable: "AddressConfirmAnswerText", literal: "לא" },
    },
    {
      id: "e_decide_addr_repeat",
      source: "decide_address_confirm",
      target: "speak_address_confirm",
      isDefault: true,
      label: "חזרה על שאלה",
    },
  );

  const withBindings = patchSigalFlowVariables({ ...graph, nodes, edges, interruptQa: false });
  return withBindings;
}

export function enhanceSigalGraph(graph: FlowGraph): FlowGraph {
  return patchSigalFlowVariables(
    patchConsolidateTvVariables(
      patchSigalAddressConfirmRouting(
        patchSigalCallbackRouting(
          patchSigalSpeedRouting(
            patchSigalPriceRouting(patchSigalAutoAdvanceSpeaks(patchSigalGraphRouting(graph))),
          ),
        ),
      ),
    ),
  );
}

export function isSigalMiniFlowGraph(graph: FlowGraph): boolean {
  return graph.nodes.some((n) => n.id === "speak_opening" && n.type === "speak");
}
