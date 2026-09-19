# Threat Model — Cargo Control

Structured per STRIDE, scoped to the architecture described in ARCHITECTURE.md.

| Category   | Threat                                         | Mitigation                                                    |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Spoofing   | Fake operator identity / session hijack        | Supabase Auth, short-lived sessions, role resolved server-side |
| Tampering  | Rewrite event history                          | Append-only log; no UPDATE/DELETE RLS on events; corrections as new events |
| Repudiation| Operator denies an action                      | `audit_log` + `created_by` on mutations; reason on sensitive ops |
| Info leak  | Cross-tenant access via misconfigured RLS      | RLS default-deny by `org_id`; isolation tests in CI            |
| Info leak  | Document access without authorization          | Private Storage buckets; signed expiring URLs only             |
| DoS        | Scanner bursts overwhelm API                   | Rate limiting, lightweight edges, paginated reads             |
| Elevation  | Operator escalates role via crafted request    | Role from DB, never from client payload; RLS blocks writes     |
| Supply chain | Malicious dependency                           | Minimal pinned deps, CI audit, review before adding            |

## Secrets

- Never commit `.env` or keys.
- Supabase service-role key only reachable from Edge Functions; client uses
  anon key with RLS as the only enforcement.

## Audit requirements

- Any change to RLS, policies, or roles is recorded in `DECISION LOG.md` and
  these docs, before deployment.