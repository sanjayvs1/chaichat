// Rough count, about 4 characters per token. Every model tokenizes differently and
// this only sizes the prompt, so a real tokenizer wouldn't be worth carrying.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function formatTokens(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}
