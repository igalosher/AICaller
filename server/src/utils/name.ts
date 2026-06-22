export function contactFullName(firstName: string, familyName: string): string {
  return [firstName.trim(), familyName.trim()].filter(Boolean).join(" ");
}
