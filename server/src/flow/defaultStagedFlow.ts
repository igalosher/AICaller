import type { StagedFlowDefinition } from "./stagedFlowTypes.js";

export const STAGED_OPENING = `שלום {{customer_first_name}} {{customer_family_name}},
כאן סיגל מחברת YES, אני עוזרת דיגיטלית.
בעבר {{g:התעניין|התעניינת}} בהצטרפות אלינו,
יש לנו הצעה במחירים אטרקטיביים ומתנה למצטרפים.
במידה ולא {{g:תרצה|תרצי}} שנפנה אליך בעתיד, {{g:אמור|אמרי}} את המילה "הסר".
בכל שלב אפשר לשאול שאלות בנוגע לחבילות, ערוצים, אינטרנט ומבצעים.`;

export const OPT_OUT_GOODBYE = "תודה רבה ויום נעים";
export const LEAD_GOODBYE = "מעולה, נציג יחזור אלייך בהקדם. יום נעים!";
export const POLITE_GOODBYE = "תודה רבה על הזמן. יום נעים!";

export function createDefaultStagedFlow(): StagedFlowDefinition {
  return {
    flowType: "staged",
    stages: [
      {
        id: "opening",
        speakText: STAGED_OPENING,
        listen: { silenceAdvanceSec: 5 },
        advanceOn: ["ask_offer", "silence", "greeting_ack"],
        interruptible: true,
        nextStageId: "ask_tv_count",
      },
      {
        id: "ask_tv_count",
        speakText:
          "על מנת שנוכל להתאים לך את החבילה המשתלמת ביותר נשמח לדעת כמה טלויזיות יש לך בבית",
        waitForAnswer: true,
        listen: {},
        advanceOn: ["provide_tv_count"],
        interruptible: true,
        nextStageId: "ask_internet_type",
      },
      {
        id: "ask_internet_type",
        speakText: "איזו תשתית אינטרנט יש לך בבית? רגיל, סיבים או לא יודע?",
        waitForAnswer: true,
        listen: {},
        branchOn: {
          internet_regular: "fiber_eligibility_check",
          internet_unknown: "no_internet_flow",
          no_internet: "no_internet_flow",
          internet_fiber: "fiber_exists_flow",
        },
        interruptible: true,
      },
    ],
    subflows: {
      fiber_eligibility_check: {
        stages: [
          {
            id: "collect_address",
            speakText:
              "נשמח לבדוק עבורך היתכנות לתשתית סיבים אצלך בכתובת, מה הכתובת שלך (עיר, רחוב, מספר בית, וכניה אם יש)",
            advanceOn: ["provide_address"],
            waitForAnswer: true,
            listen: {},
            interruptible: true,
            nextStageId: "check_fiber",
          },
          {
            id: "check_fiber",
            type: "system",
            action: "fiber_availability_lookup",
          },
          {
            id: "announce_fiber_yes",
            speakText: "יש לנו חדשות מצוינות! יש תשתית סיבים בכתובת שלך.",
            showIf: "fiber_available",
            waitForAnswer: true,
            listen: {},
            advanceOn: ["greeting_ack", "silence"],
            interruptible: true,
            mergeSubflow: "sales_path",
            mergeStageId: "offer_fiber_speed",
          },
          {
            id: "announce_fiber_no",
            speakText:
              "לצערי כרגע אין תשתית סיבים בכתובת שלך, אבל אל דאגה, יש לנו פתרונות מעולים גם באינטרנט רגיל.",
            showIf: "fiber_unavailable",
            waitForAnswer: true,
            listen: {},
            advanceOn: ["greeting_ack", "silence"],
            interruptible: true,
            mergeSubflow: "sales_path",
            mergeStageId: "offer_regular_speed",
          },
        ],
      },
      fiber_exists_flow: {
        stages: [
          {
            id: "fiber_exists_ack",
            speakText:
              "מעולה, יש לך כבר תשתית סיבים — נוכל להציע לך מהירויות גבוהות במחירים אטרקטיביים.",
            advanceOn: ["greeting_ack", "silence"],
            waitForAnswer: true,
            listen: {},
            interruptible: true,
            mergeSubflow: "sales_path",
            mergeStageId: "offer_fiber_speed",
          },
        ],
      },
      no_internet_flow: {
        stages: [
          {
            id: "no_internet_ack",
            speakText:
              "אין בעיה, נשמח להציע לך חבילה הכוללת אינטרנט מהיר בנוסף לטלוויזיה — בואי נתאים לך את ההצעה הטובה ביותר.",
            advanceOn: ["greeting_ack", "silence"],
            waitForAnswer: true,
            listen: {},
            mergeSubflow: "sales_path",
            mergeStageId: "ask_current_provider",
          },
        ],
      },
      sales_path: {
        stages: [
          {
            id: "offer_fiber_speed",
            speakText: "אילו מהירות תרצה? שלוש מאות מגה, שש מאות מגה, או גיגה?",
            waitForAnswer: true,
            listen: {},
            advanceOn: ["select_speed_300", "select_speed_600", "select_speed_1000"],
            interruptible: true,
            nextStageId: "ask_current_provider",
          },
          {
            id: "offer_regular_speed",
            speakText: "אילו מהירות מתאימה לך? מאה מגה או מאתיים מגה?",
            waitForAnswer: true,
            listen: {},
            advanceOn: ["select_speed_100", "select_speed_200"],
            interruptible: true,
            nextStageId: "ask_current_provider",
          },
          {
            id: "ask_current_provider",
            speakText: "איזה ספק אינטרנט יש לך היום? בזק, הוט, פרטנר, סלקום, או אחר?",
            waitForAnswer: true,
            listen: {},
            advanceOn: [
              "provider_bezeq",
              "provider_hot",
              "provider_partner",
              "provider_cellcom",
              "provider_other",
            ],
            interruptible: true,
            nextStageId: "ask_current_price",
          },
          {
            id: "ask_current_price",
            speakText: "כמה את משלמת היום על החבילה שלך?",
            waitForAnswer: true,
            listen: {},
            advanceOn: ["provide_current_price"],
            interruptible: true,
            nextStageId: "offer_package",
          },
          {
            id: "offer_package",
            speakText:
              "יש לנו הצעה מעולה עבורך! {{package_type}} הכוללת טלוויזיה, אינטרנט וטלפון במחיר של {{package_price}} שקלים לחודש.",
            waitForAnswer: true,
            listen: {},
            advanceOn: ["agree_purchase", "greeting_ack", "price_objection"],
            interruptible: true,
            nextStageId: "ask_addons",
          },
          {
            id: "ask_addons",
            speakText: "האם תרצה להוסיף שירותים כמו VOD, ערוצי ספורט, או פרטים נוספים?",
            waitForAnswer: true,
            listen: {},
            advanceOn: ["select_addons", "decline_addons", "greeting_ack"],
            interruptible: true,
            nextStageId: "present_summary",
          },
          {
            id: "present_summary",
            speakText:
              "לסיכום, בחרת {{package_type}} במחיר {{final_price}} שקלים לחודש{{addons_summary}}.",
            waitForAnswer: true,
            listen: {},
            advanceOn: ["greeting_ack", "silence"],
            interruptible: true,
            nextStageId: "ask_callback",
          },
          {
            id: "ask_callback",
            speakText: "תרצי שאחד הנציגים שלנו יחזור אלייך לתיאום התקנה?",
            waitForAnswer: true,
            listen: {},
            branchOn: {
              agree_callback: "close_lead",
              decline_callback: "close_polite",
            },
            interruptible: true,
          },
        ],
      },
      close_lead: {
        stages: [
          {
            id: "lead_goodbye",
            speakText: LEAD_GOODBYE,
            endCall: true,
            outcome: "callback",
            contactStatus: "callback",
          },
        ],
      },
      close_polite: {
        stages: [
          {
            id: "polite_goodbye",
            speakText: POLITE_GOODBYE,
            endCall: true,
            outcome: "refused",
          },
        ],
      },
    },
  };
}
