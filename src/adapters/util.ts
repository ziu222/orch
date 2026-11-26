export const isRateLimit = (text: string): boolean =>
  /rate.?limit|usage limit|quota|\b429\b|too many requests/i.test(text);

// the CLI argument is always this short instruction; user text lives in the prompt file
export const instruction = (promptFile: string) => `Read ${promptFile} and follow it.`;
