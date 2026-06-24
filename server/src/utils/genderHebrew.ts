export type CustomerSex = "male" | "female";

/** Resolve `{{g:זכר|נקבה}}` markers — first branch for male, second for female. */
export function resolveGenderMarkers(text: string, sex: CustomerSex = "male"): string {
  return text.replace(/\{\{g:([^|{}]+)\|([^}]+)\}\}/g, (_, male, female) =>
    (sex === "female" ? female : male).trim(),
  );
}

export function genderPromptHint(sex: CustomerSex): string {
  return sex === "female"
    ? "הלקוחה היא אישה — פני אליה בלשון נקבה (למשל: תרצי, מעוניינת, משלמת, בואי)."
    : "הלקוח הוא גבר — פנה אליו בלשון זכר (למשל: תרצה, מעוניין, משלם, בוא).";
}
