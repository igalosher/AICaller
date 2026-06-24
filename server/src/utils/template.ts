import { resolveGenderMarkers, type CustomerSex } from "./genderHebrew.js";

export function resolveTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  const vars: Record<string, string> = { agent_name: "סיגל", ...variables };
  const resolved = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key === "customer_name" && vars.customer_full_name) {
      return vars.customer_full_name;
    }
    return vars[key] ?? "";
  });
  const sex: CustomerSex = vars.customer_sex === "female" ? "female" : "male";
  return resolveGenderMarkers(resolved, sex);
}

export function mergeTemplateVars(
  contactVars: Record<string, string>,
  flowVars: Record<string, string>,
): Record<string, string> {
  return { ...flowVars, ...contactVars };
}
