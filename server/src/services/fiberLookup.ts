/** Stub fiber availability — replace with real address API when available. */
export async function lookupFiberAvailability(address: string): Promise<boolean> {
  const norm = address.toLowerCase().trim();
  if (!norm || norm.length < 5) return false;
  // Deterministic stub: addresses containing "סיב" or "fiber" test as available
  if (norm.includes("סיב") || norm.includes("fiber")) return true;
  // ~50% based on simple hash for demo variety
  let hash = 0;
  for (let i = 0; i < norm.length; i++) hash = (hash + norm.charCodeAt(i)) % 100;
  return hash >= 45;
}
