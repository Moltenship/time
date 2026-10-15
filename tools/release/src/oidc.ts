import { npmRegistry } from "./config";

/**
 * What npm said when this workflow's OIDC token asked to publish a package: `trusted` when a
 * trusted publisher for the workflow is set up on it, `untrusted` when not (npm answers 404, or
 * refuses the token with 401 or 403), and `error` for anything else.
 */
export type Trust =
  | { readonly verdict: "trusted" }
  | { readonly verdict: "untrusted"; readonly detail: string }
  | { readonly verdict: "error"; readonly detail: string };

/** The verdict for npm's answer to a token exchange. */
export function trustFromResponse(status: number, body: string): Trust {
  if (status >= 200 && status < 300) {
    return /"token"\s*:\s*"/.test(body)
      ? { verdict: "trusted" }
      : { verdict: "error", detail: `npm answered ${status} without a token` };
  }
  const message = (() => {
    try {
      return (JSON.parse(body) as { message?: string; error?: string }).message ?? body;
    } catch {
      return body;
    }
  })().trim();
  const detail = `npm answered ${status}${message ? `: ${message}` : ""}`;
  // 404 when no trusted publisher matches; 401 and 403 when npm refuses the token. Anything else,
  // such as 429, says nothing about the setup.
  return [401, 403, 404].includes(status)
    ? { verdict: "untrusted", detail }
    : { verdict: "error", detail };
}

/** A fresh GitHub Actions OIDC token for npm, as the npm CLI asks for one. */
async function idToken(): Promise<string> {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const token = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !token) {
    throw new Error("No OIDC token here: the job needs `permissions: id-token: write`.");
  }
  const request = new URL(url);
  request.searchParams.set("audience", `npm:${new URL(npmRegistry).hostname}`);
  const response = await fetch(request, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for an OIDC token`);
  return ((await response.json()) as { value: string }).value;
}

/**
 * Asks npm whether each package trusts this workflow, the way `npm publish` does before it
 * publishes: it trades the job's OIDC token for a short-lived publish token, which this throws
 * away. Nothing is published. Runs in GitHub Actions only, in a job with `id-token: write`.
 */
export async function trustedPublishing(names: readonly string[]): Promise<Map<string, Trust>> {
  const found = new Map<string, Trust>();
  for (const name of names) {
    const exchange = new URL(
      `-/npm/v1/oidc/token/exchange/package/${name.replace("/", "%2f")}`,
      npmRegistry,
    );
    const response = await fetch(exchange, {
      method: "POST",
      headers: { accept: "application/json", authorization: `Bearer ${await idToken()}` },
      signal: AbortSignal.timeout(30_000),
    });
    found.set(name, trustFromResponse(response.status, await response.text()));
  }
  return found;
}
