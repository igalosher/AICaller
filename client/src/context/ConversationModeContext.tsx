import { createContext, useContext, useCallback, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { settingsApi } from "../api";

export type ConversationMode = "flow" | "agent";

type ConversationModeContextValue = {
  mode: ConversationMode;
  isLoading: boolean;
  isError: boolean;
  setMode: (mode: ConversationMode) => void;
  isSaving: boolean;
};

const ConversationModeContext = createContext<ConversationModeContextValue | null>(null);

export function ConversationModeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [optimisticMode, setOptimisticMode] = useState<ConversationMode | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["conversationMode"],
    queryFn: settingsApi.getConversationMode,
    retry: 1,
    staleTime: 30_000,
    initialData: { mode: "flow" as ConversationMode },
  });

  const mutation = useMutation({
    mutationFn: settingsApi.setConversationMode,
    onSuccess: (res) => {
      qc.setQueryData(["conversationMode"], res);
      setOptimisticMode(null);
    },
    onError: () => {
      setOptimisticMode(null);
    },
  });

  const serverMode = data?.mode ?? "flow";
  const mode = optimisticMode ?? serverMode;

  const setMode = useCallback(
    (next: ConversationMode) => {
      if (next === mode && !mutation.isPending) return;
      setOptimisticMode(next);
      mutation.mutate(next);
    },
    [mode, mutation],
  );

  return (
    <ConversationModeContext.Provider
      value={{
        mode,
        isLoading,
        isError,
        setMode,
        isSaving: mutation.isPending,
      }}
    >
      {children}
    </ConversationModeContext.Provider>
  );
}

export function useConversationMode() {
  const ctx = useContext(ConversationModeContext);
  if (!ctx) throw new Error("useConversationMode must be used within ConversationModeProvider");
  return ctx;
}

export function conversationModeErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    if (err.code === "ERR_NETWORK") return "לא ניתן להתחבר לשרת. ודא ש-npm run dev רץ.";
    if (err.response?.status === 404) return "השרת לא מעודכן — הפעל מחדש את השרת לאחר עדכון הקוד.";
  }
  return "שגיאה בטעינת מצב השיחה";
}
