export function resolveTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key === "customer_name" && variables.customer_full_name) {
      return variables.customer_full_name;
    }
    return variables[key] ?? "";
  });
}
