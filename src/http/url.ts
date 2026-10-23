/** Strip trailing '/' with a loop: CodeQL flags `/\/+$/` as polynomial ReDoS. */
export function stripTrailingSlashes(input: string): string {
  let end = input.length;
  while (end > 0 && input.charCodeAt(end - 1) === 47) end--;
  return end === input.length ? input : input.slice(0, end);
}
