# PLATFORM-02 — AUTHORIZATION / ROLES / ORGANIZATIONS: CERTIFICATION
Status: CERTIFIED (lane-local, with one documented P2 finding) | Date: 2026-10-04

## Implementation
| File | Purpose |
| --- | --- |
| `src/lib/platform/authorization/types.ts` | roles, permission matrix, rank, scopes, resource refs, membership store |
| `src/lib/platform/authorization/authorizationService.ts` | authorize / authorizeResource / assignRole / membership rules |
| `src/middleware/platform/requirePermission.ts` | server-side enforcement middleware |
| `src/lib/platform/authorization/__tests__/authorization.test.ts` | 17 domain tests |
| `src/lib/platform/authorization/__tests__/authorizationHttp.test.ts` | 8 HTTP IDOR tests |

## §19/§20 acceptance evidence (59 platform tests total, all pass)
| Requirement | Proof |
| --- | --- |
| OWNER/ADMIN/MEMBER/VIEWER get only intended permissions | full matrix loop; VIEWER proven to hold zero write/run permissions |
| Unauthenticated rejected before role logic | `NOT_AUTHENTICATED` |
| Non-member rejected | `FORBIDDEN` |
| **IDOR: A reads B's journal / portfolio / research / decision / scenario / paper_replay / alert / learning** | all eight resource types ⇒ `FORBIDDEN` |
| Admin cannot read a member's personal resource | `FORBIDDEN` |
| Cross-workspace access | `FORBIDDEN` in both directions (member of both workspaces) |
| Privilege escalation | member/viewer cannot assign roles; ADMIN cannot grant ADMIN/OWNER; OWNER may grant ADMIN |
| Owner invariant | removing the last OWNER ⇒ `FORBIDDEN` |
| Unknown resource type | fails closed |
| Server-side enforcement (not hidden UI) | 8 HTTP tests through real Express middleware |
| Response bodies leak nothing | `{error:'forbidden'}` / `{error:'unauthorized'}` / `{error:'not_found'}` only |
| Personal (no-organization) workspace | supported and authorized |

## Findings
| Sev | Finding | Disposition |
| --- | --- | --- |
| P2 | Pre-existing feature routers (`/api/stocks/**`, `/api/trading`, `/api/macro`) are not yet behind `requirePermission`; they predate the platform layer and are single-tenant today | Documented, non-blocking; tracked for the PLATFORM-02 wrap-up route wiring. Not a bypass of any multi-user path because no cross-user data exists in those routers yet |
| P3 | No org-level role templates / invitation flow | Deferred to Business lane |

P0 = 0, P1 = 0.

## Phase gate (§64)
Implementation complete · tests pass (`src/lib/platform` → 4 files / 59 tests) · `tsc --noEmit` exit 0 ·
`npm run build` success · security checks pass (IDOR, escalation, no leakage) · evidence audit pass ·
certification document present.