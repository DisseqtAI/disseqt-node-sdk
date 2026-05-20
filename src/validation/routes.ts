import type { ValidatorDomain } from './enums.js';

export function buildValidatorUrl(
  baseUrl: string,
  domain: ValidatorDomain | string,
  slug: string,
  pathTemplate: string,
): string {
  const path = pathTemplate
    .replace('{domain}', String(domain))
    .replace('{validator}', slug);
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}
