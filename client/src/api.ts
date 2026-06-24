import axios from "axios";
import type { Call, CallFlow, Contact, DashboardSummary, SalesPacket } from "./types";

const api = axios.create({ baseURL: "/api" });

export const contactsApi = {
  list: (params?: { search?: string; status?: string }) =>
    api.get<{ items: Contact[]; total: number }>("/contacts", { params }).then((r) => r.data),
  get: (id: string) => api.get<Contact & { calls: Call[] }>(`/contacts/${id}`).then((r) => r.data),
  create: (data: {
    firstName: string;
    familyName?: string;
    phone: string;
    sex?: import("./types").ContactSex;
    notes?: string;
  }) =>
    api.post<Contact>("/contacts", data).then((r) => r.data),
  update: (id: string, data: Partial<Contact>) =>
    api.put<Contact>(`/contacts/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
};

export const callsApi = {
  list: () => api.get<{ items: Call[] }>("/calls").then((r) => r.data),
  active: () => api.get<Call | null>("/calls/active").then((r) => r.data),
  get: (id: string) => api.get<Call>(`/calls/${id}`).then((r) => r.data),
  start: (contactId: string) => api.post<Call>("/calls/start", { contactId }).then((r) => r.data),
  startTest: (contactId: string) => api.post<Call>("/calls/test-start", { contactId }).then((r) => r.data),
  hangUp: (id: string) => api.post<{ ok: boolean }>(`/calls/${id}/hangup`).then((r) => r.data),
  next: () => api.post<Call>("/calls/next").then((r) => r.data),
};

export const salesApi = {
  getCatalog: () =>
    api.get<{ catalog: unknown; importedAt?: string; scannedAt?: string; summary?: unknown }>(
      "/sales/catalog",
    ).then((r) => r.data),
  importCatalog: (catalog: unknown) =>
    api.post<{ ok: boolean; summary: { salesPackets: number; channelPackages: number; internetTiers: number } }>(
      "/sales/catalog/import",
      { catalog },
    ).then((r) => r.data),
  loadDefaultCatalog: () =>
    api.post<{ ok: boolean; summary: { salesPackets: number; channelPackages: number; internetTiers: number } }>(
      "/sales/catalog/load-default",
    ).then((r) => r.data),
  packets: () => api.get<SalesPacket[]>("/sales/packets").then((r) => r.data),
  createPacket: (data: Record<string, unknown>) =>
    api.post<SalesPacket>("/sales/packets", data).then((r) => r.data),
  updatePacket: (id: string, data: Record<string, unknown>) =>
    api.put<SalesPacket>(`/sales/packets/${id}`, data).then((r) => r.data),
  channels: () => api.get("/sales/channels").then((r) => r.data),
  internetTiers: () => api.get("/sales/internet-tiers").then((r) => r.data),
  phonePlans: () => api.get("/sales/phone-plans").then((r) => r.data),
};

export const callFlowsApi = {
  active: () => api.get<CallFlow>("/call-flows/active").then((r) => r.data),
  previewOpening: (openingTemplate: string, customerName?: string) =>
    api
      .post<{ preview: string }>("/call-flows/preview-opening", { openingTemplate, customerName })
      .then((r) => r.data),
  save: (data: { openingTemplate: string; stages: unknown[]; objections: Record<string, string> }) =>
    api.post<CallFlow>("/call-flows", data).then((r) => r.data),
  getGraph: (id: string) => api.get<import("./types").FlowGraph>(`/call-flows/${id}/graph`).then((r) => r.data),
  saveGraph: (id: string, graph: import("./types").FlowGraph) =>
    api.put<import("./types").FlowGraph>(`/call-flows/${id}/graph`, graph).then((r) => r.data),
  publish: (id: string) => api.post<CallFlow>(`/call-flows/${id}/publish`).then((r) => r.data),
  validate: (id: string) =>
    api.post<{ errors: { messageHe: string }[] }>(`/call-flows/${id}/validate`).then((r) => r.data),
  importLinear: (id: string) =>
    api.post<import("./types").FlowGraph>(`/call-flows/${id}/import-linear`).then((r) => r.data),
};

export const intentsApi = {
  list: () => api.get<import("./types").Intent[]>("/intents").then((r) => r.data),
  update: (id: string, data: Partial<import("./types").Intent>) =>
    api.put<import("./types").Intent>(`/intents/${id}`, data).then((r) => r.data),
  addExample: (id: string, phrase: string) =>
    api.post(`/intents/${id}/examples`, { phrase }).then((r) => r.data),
  relabel: (segmentId: string, intentId: string, addAsExample = false) =>
    api.post("/intents/relabel", { segmentId, intentId, addAsExample }).then((r) => r.data),
};

export const catalogApi = {
  channels: () => api.get("/catalog/channels").then((r) => r.data),
  channel: (id: string) => api.get(`/catalog/channels/${encodeURIComponent(id)}`).then((r) => r.data),
  packetChannels: (name: string) =>
    api.get(`/catalog/packets/${encodeURIComponent(name)}/channels`).then((r) => r.data),
};

export const settingsApi = {
  telephony: () => api.get("/settings/telephony").then((r) => r.data),
  saveTelephony: (data: Record<string, unknown>) =>
    api.put("/settings/telephony", data).then((r) => r.data),
  testTelephony: () => api.post<{ ok: boolean; message: string }>("/settings/telephony/test").then((r) => r.data),
  ai: () => api.get("/settings/ai").then((r) => r.data),
  saveAi: (data: Record<string, unknown>) => api.put("/settings/ai", data).then((r) => r.data),
};

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/dashboard/summary").then((r) => r.data),
};

export function connectCallEvents(onEvent: (data: unknown) => void) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/calls`);
  ws.onmessage = (e) => onEvent(JSON.parse(e.data));
  return ws;
}
