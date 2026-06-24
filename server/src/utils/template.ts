export function resolveTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  const vars: Record<string, string> = { agent_name: "סיגל", ...variables };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key === "customer_name" && vars.customer_full_name) {
      return vars.customer_full_name;
    }
    return vars[key] ?? "";
  });
}

export function mergeTemplateVars(
  contactVars: Record<string, string>,
  flowVars: Record<string, string>,
): Record<string, string> {
  return { ...flowVars, ...contactVars };
}
