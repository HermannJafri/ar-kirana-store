// Same pattern the Flutter customer app uses (usernameToEmail in
// mobile-app/lib/services/auth_service.dart) — Staff/Owner only ever see a
// username; Firebase still needs an email under the hood, so we synthesize
// one. See PROJECT_PROMPT.md "Customer identity trade-off".
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@internal.local`;
}
