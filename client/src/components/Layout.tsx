import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { OpenAiBalanceBadge } from "./OpenAiBalanceBadge";
import { ConversationModeSwitch } from "./ConversationModeSwitch";
import { ActiveTestCallProvider, useActiveTestCall } from "../context/ActiveTestCallContext";
import { ConversationModeProvider } from "../context/ConversationModeContext";
import { connectCallEvents } from "../api";

const nav = [
  { to: "/", label: "לוח בקרה" },
  { to: "/contacts", label: "אנשי קשר" },
  { to: "/calls", label: "שיחות" },
  { to: "/sales", label: "הגדרות מכירה" },
  { to: "/agent", label: "סוכן" },
  { to: "/flow-builder", label: "בניית זרימה" },
  { to: "/intents", label: "ניהול כוונות" },
  { to: "/settings", label: "הגדרות" },
];

export function Layout() {
  return (
    <ConversationModeProvider>
      <ActiveTestCallProvider>
        <LayoutShell />
      </ActiveTestCallProvider>
    </ConversationModeProvider>
  );
}

function ActiveCallChip() {
  const { isTestCallActive } = useActiveTestCall();
  const location = useLocation();
  if (!isTestCallActive || location.pathname === "/calls") return null;
  return (
    <NavLink
      to="/calls"
      className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
    >
      שיחת טסט פעילה — חזרה לשיחות
    </NavLink>
  );
}

function TunnelStatusBanner() {
  const [tunnelDown, setTunnelDown] = useState(false);

  useEffect(() => {
    const ws = connectCallEvents((data) => {
      const e = data as { type?: string; reachable?: boolean };
      if (e.type === "tunnel_status") {
        setTunnelDown(e.reachable === false);
      }
    });
    return () => ws.close();
  }, []);

  if (!tunnelDown) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
      מנהרת Twilio לא זמינה — המערכת מנסה לתקן אוטומטית. אם השיחה נכשלת, המתן כמה שניות ונסה שוב.
    </div>
  );
}

function LayoutShell() {
  return (
    <div className="min-h-screen">
      <TunnelStatusBanner />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-blue-700">YES AI Caller</h1>
            <ConversationModeSwitch />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ActiveCallChip />
            <OpenAiBalanceBadge />
            <nav className="flex flex-wrap justify-end gap-2">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`
                }
                end={item.to === "/"}
              >
                {item.label}
              </NavLink>
            ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
