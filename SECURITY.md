# SECURITY.md — Cargo Control

Security strategy and permission model for the platform.

## Principles

- Security by design: every access control decision is explicit, never implicit.
- Least privilege: roles only include the capabilities they require.
- Default deny: RLS policies deny unless a policy explicitly grants.
- Defense in depth: auth + RLS + Edge Functions + Storage policies.

## Identity

- Supabase Auth for authentication (email/password plus optional SSO later).
- App role resolved from the `operators` table (map `auth.users.id` → role),
  never trusted from client-supplied input.

## Row Level Security

RLS is **enabled on every business table**; the Supabase client never uses
`bypassrls` for data access. Table access is filtered by `org_id` of the current
operator.

Policy shape (example):

```sql
create policy "operator read own org"
on public.cargo for select
to authenticated
using (org_id = (select org_id from public.operators where user_id = auth.uid()));
```

Write policies only where the role allows it (e.g., only `supervisor` may
resolve a quarantine). Full matrix: `docs/security/rls.md`.

## Storage

- Buckets are private.
- Documents are served only via signed, expiring URLs generated through
  authorized services.
- No public bucket for manifests or photos.

## Secrets

- `.env` files are never committed (see `.gitignore`).
- Keys are injected via CI secrets / edge function environment variables.

## Auditing

- The append-only `checkpoint_events` log is the traceability spine.
- Sensitive operations and admin actions are recorded in `audit_log` with actor,
  timestamp, and reason.

## Threat model

Threat scenarios and mitigations: `docs/security/threat-model.md`.