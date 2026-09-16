/**
 * Strip trailing '/' characters without a backtracking regex.
 * CodeQL flags `/\/+$/` on library-input strings as polynomial ReDoS
 * (js/polynomial-redos); a plain loop has no backtracking risk.
 */
export function stripTrailingSlashes(input: string): string {
  let end = input.length;
  while (end > 0 && input.charCodeAt(end - 1) === 47) end--;
  return end === input.length ? input : input.slice(0, end);
}
