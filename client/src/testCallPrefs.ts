const STORAGE_KEY = "aicaller.testCall.skipVoice";

export function readTestCallSkipVoice(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeTestCallSkipVoice(skip: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, skip ? "true" : "false");
  } catch {
    // ignore private mode / quota errors
  }
}
