/**
 * Single source of truth for the SDK's reported version and wire identity.
 *
 * `SDK_VERSION` is a build-time constant (not a runtime read of
 * package.json) so the dual ESM/CJS bundles stay dependency-free and
 * edge-runtime-safe; `tests/version.test.ts` fails the build the moment it
 * drifts from package.json, and the release process bumps both together.
 *
 * `SDK_LANGUAGE` rides every request as `X-SDK-Lang` so the backend
 * compares this SDK against the Node release line, never the Python one.
 */
export const SDK_VERSION = '0.2.0';

export const SDK_LANGUAGE = 'node';

export const USER_AGENT = `disseqt-node-sdk/${SDK_VERSION}`;
