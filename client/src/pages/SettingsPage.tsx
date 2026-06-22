import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { settingsApi } from "../api";

export function SettingsPage() {
  const { data: telephony } = useQuery({ queryKey: ["telephonySettings"], queryFn: settingsApi.telephony });
  const { data: ai } = useQuery({ queryKey: ["aiSettings"], queryFn: settingsApi.ai });
  const [testResult, setTestResult] = useState("");

  const [telephonyForm, setTelephonyForm] = useState({
    provider: "mock",
    accountSid: "",
    authToken: "",
    phoneNumber: "",
    webhookBaseUrl: "http://localhost:3001",
  });

  const [aiForm, setAiForm] = useState({
    openaiApiKey: "",
    deepgramApiKey: "",
    elevenLabsApiKey: "",
  });

  const saveTelephony = useMutation({
    mutationFn: () => settingsApi.saveTelephony(telephonyForm),
  });

  const saveAi = useMutation({
    mutationFn: () => settingsApi.saveAi(aiForm),
  });

  const testTelephony = useMutation({
    mutationFn: settingsApi.testTelephony,
    onSuccess: (data) => setTestResult(data.message),
  });

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">הגדרות</h2>

      <section className="rounded-xl border bg-white p-4">
        <h3 className="mb-4 font-semibold">טלפוניה</h3>
        <p className="mb-3 text-sm text-slate-500">
          ספק נוכחי: {telephony?.provider ?? "mock"} · מוגדר: {telephony?.configured ? "כן" : "לא"}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <select
            className="rounded-lg border px-3 py-2"
            value={telephonyForm.provider}
            onChange={(e) => setTelephonyForm({ ...telephonyForm, provider: e.target.value })}
          >
            <option value="mock">מדומה (פיתוח)</option>
            <option value="twilio">Twilio</option>
          </select>
          <input
            className="rounded-lg border px-3 py-2"
            placeholder="מספר טלפון יוצא"
            value={telephonyForm.phoneNumber}
            onChange={(e) => setTelephonyForm({ ...telephonyForm, phoneNumber: e.target.value })}
          />
          <input
            className="rounded-lg border px-3 py-2"
            placeholder="Account SID"
            value={telephonyForm.accountSid}
            onChange={(e) => setTelephonyForm({ ...telephonyForm, accountSid: e.target.value })}
          />
          <input
            className="rounded-lg border px-3 py-2"
            placeholder="Auth Token"
            type="password"
            value={telephonyForm.authToken}
            onChange={(e) => setTelephonyForm({ ...telephonyForm, authToken: e.target.value })}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => saveTelephony.mutate()}>
            שמור טלפוניה
          </button>
          <button className="rounded-lg border px-4 py-2" onClick={() => testTelephony.mutate()}>
            בדיקת חיבור
          </button>
        </div>
        {testResult && <p className="mt-2 text-sm">{testResult}</p>}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h3 className="mb-4 font-semibold">ספקי AI</h3>
        <p className="mb-3 text-sm text-slate-500">
          OpenAI: {ai?.openaiConfigured ? "מוגדר" : "לא"} · Deepgram: {ai?.deepgramConfigured ? "מוגדר" : "לא"} ·
          ElevenLabs: {ai?.elevenLabsConfigured ? "מוגדר" : "לא"}
        </p>
        <div className="grid gap-3">
          <input
            className="rounded-lg border px-3 py-2"
            placeholder="OpenAI API Key"
            type="password"
            value={aiForm.openaiApiKey}
            onChange={(e) => setAiForm({ ...aiForm, openaiApiKey: e.target.value })}
          />
          <input
            className="rounded-lg border px-3 py-2"
            placeholder="Deepgram API Key"
            type="password"
            value={aiForm.deepgramApiKey}
            onChange={(e) => setAiForm({ ...aiForm, deepgramApiKey: e.target.value })}
          />
          <input
            className="rounded-lg border px-3 py-2"
            placeholder="ElevenLabs API Key"
            type="password"
            value={aiForm.elevenLabsApiKey}
            onChange={(e) => setAiForm({ ...aiForm, elevenLabsApiKey: e.target.value })}
          />
        </div>
        <button className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => saveAi.mutate()}>
          שמור הגדרות AI
        </button>
      </section>
    </div>
  );
}
