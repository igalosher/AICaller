import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { ContactsPage } from "./pages/ContactsPage";
import { CallsPage } from "./pages/CallsPage";
import { SalesPage } from "./pages/SalesPage";
import { CallFlowPage } from "./pages/CallFlowPage";
import { FlowBuilderPage } from "./pages/FlowBuilderPage";
import { AgentPage } from "./pages/AgentPage";
import { IntentsPage } from "./pages/IntentsPage";
import { SettingsPage } from "./pages/SettingsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="agent" element={<AgentPage />} />
            <Route path="flow-builder" element={<FlowBuilderPage />} />
            <Route path="intents" element={<IntentsPage />} />
            <Route path="call-flow" element={<CallFlowPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
