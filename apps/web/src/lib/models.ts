/**
 * Default model names per provider, shared by the settings screen and the
 * relay so the two cannot disagree about what "leave it blank" means.
 */
export const DEFAULT_MODEL_NAMES: Record<string, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4.1",
  google: "gemini-2.0-flash",
  "openai-compatible": "",
};
