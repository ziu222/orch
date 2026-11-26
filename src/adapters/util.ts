export const isRateLimit = (text: string): boolean =>
  /rate.?limit|usage limit|limit reached|hit your .{0,20}limit|quota|\b429\b|too many requests/i.test(text);

// the CLI argument is always this short instruction; user text lives in the prompt file
export const instruction = (promptFile: string) => `Read ${promptFile} and follow it.`;

// "try again in 2 hours 13 minutes" → ISO time; undefined when absent or beyond a week
export function retryAfter(text: string, now = Date.now()): string | undefined {
  const m = /try again in\s+(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?/i.exec(text);
  if (!m || (!m[1] && !m[2])) return undefined;
  const ms = ((Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0)) * 60_000;
  return ms > 0 && ms < 7 * 24 * 3600_000 ? new Date(now + ms).toISOString() : undefined;
}

export const snippet = (s: string) => s.trim().slice(0, 200);
