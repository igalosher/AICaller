import { NavLink, Outlet } from "react-router-dom";
import { OpenAiBalanceBadge } from "./OpenAiBalanceBadge";

const nav = [
  { to: "/", label: "לוח בקרה" },
  { to: "/contacts", label: "אנשי קשר" },
  { to: "/calls", label: "שיחות" },
  { to: "/sales", label: "הגדרות מכירה" },
  { to: "/flow-builder", label: "בניית זרימה" },
  { to: "/intents", label: "ניהול כוונות" },
  { to: "/call-flow", label: "זרימת שיחה" },
  { to: "/settings", label: "הגדרות" },
];

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold text-blue-700">YES AI Caller</h1>
          <div className="flex shrink-0 items-center gap-3">
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
