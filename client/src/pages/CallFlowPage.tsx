import { Navigate } from "react-router-dom";

export function CallFlowPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
        עורך הזרימה הלינארי הוחלף בעורך הגרפי.{" "}
        <a href="/flow-builder" className="font-medium text-blue-700 underline">
          עבור לבניית זרימה
        </a>
      </div>
      <Navigate to="/flow-builder" replace />
    </div>
  );
}
