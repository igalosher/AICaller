import { useConversationMode } from "../context/ConversationModeContext";

export function ConversationModeSwitch() {
  const { mode, setMode, isSaving, isError } = useConversationMode();

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div
        className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium"
        role="group"
        aria-label="מצב שיחה"
      >
        <button
          type="button"
          disabled={isSaving}
          onClick={() => setMode("flow")}
          className={`rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-60 ${
            mode === "flow" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          מצב זרימה
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => setMode("agent")}
          className={`rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-60 ${
            mode === "agent" ? "bg-white text-violet-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          מצב סוכן
        </button>
      </div>
      {isError && (
        <span className="text-[10px] text-amber-700">שמירה עשויה להיכשל — בדוק שהשרת רץ</span>
      )}
    </div>
  );
}
