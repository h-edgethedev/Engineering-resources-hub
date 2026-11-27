# Authentication and authorization policy

This document records the initial implementation policy selected on 2026-11-21. The API architecture selects opaque, server-side sessions in HTTP-only cookies. Passwords are stored as bcrypt hashes; session tokens are random, revocable, and stored as hashes. Cookie-authenticated state changes require CSRF protection.

## Role capabilities

| Role | Scope | Capabilities |
|---|---|---|
| Guest | No account | Browse academic data and view/download approved public resources. No uploads, bookmarks, comments, or account actions. |
| Student | Registered, email-verified account; academic affiliation may be optional | Guest capabilities plus account features such as bookmarks, comments, reports, profile, contribution history, and resource submission. New submissions remain private and pending until review. |
| Contributor | University grant | Submit and maintain resources they own. Cannot approve or reject submissions, including their own. |
| Moderator | Required university grant; university-wide for this release | Review, approve, reject, and remove resources in the assigned university. Cannot review or approve a resource they own. Cannot grant roles or edit the academic catalogue. |
| University Administrator | Required university grant | Manage users and academic catalogue records inside the assigned university. Cannot manage Super Administrators or grant permissions outside that university. |
| Super Administrator | Platform-wide | Manage platform settings, users, role grants, and academic records across universities; may also submit resources. May approve their own resource submissions and deletion requests. |

Guest is an anonymous access mode, not a persisted role. Role assignments are server-managed and never accepted from client-supplied request fields. A user may hold several role grants; permissions combine, but resource ownership and scope restrictions below still apply.

## Resource visibility and ownership

- Only `APPROVED` resources are public. Pending, rejected, and removed resources are not included in guest lists or available through public file endpoints.
- An authenticated uploader can view their own pending or rejected resource and its file. Moderators and administrators can access records in their assigned scope for review.
- Every resource records its uploader. An owner may maintain their own submission, but ownership never provides moderation authority.
- A moderator's decision must be recorded with the actor, action, timestamp, and reason. Moderators cannot act outside their university grant or approve their own submissions. Super Administrators may approve their own resource submissions.
- Changes to an approved resource should return it to `PENDING` review. The prior decision should remain auditable.
- Owners may request removal of their own uploads. Moderators may request removal only for resources in their university scope and cannot request governance action on their own resources. A Super Administrator decides requests and can also move a resource directly to recoverable Trash; permanent purge is a separate action.

## Scope and role management

- A University Administrator grant has one required `universityId` and no faculty scope.
- A Moderator grant has one required `universityId` and covers every faculty and department in that university for this release.
- Contributor grants are assigned within a university. A resource is in scope when its course belongs to that university.
- Student academic profile data is optional and does not grant administrative authority.
- University Administrators may manage ordinary user grants only within their university. They cannot grant Super Administrator or University Administrator status. Super Administrator grants are created only through a protected bootstrap process or by another Super Administrator.
- Elevated grants require an active target account with a verified email. Super Administrators can search user accounts and assign/revoke scoped roles; the web admin workspace provides the moderator assignment flow.
- When a user has multiple roles, a denied ownership check or scope mismatch is not bypassed by another role. The explicit self-moderation prohibition always wins.

## Implementation status

The API now enforces email-verified registration/login/logout, server-side sessions, CSRF tokens for authenticated mutations, role grants, uploader ownership, approved-only guest access, university-wide moderation, and self-moderation prevention. Student, Contributor, and Super Administrator accounts may submit resources. The web app includes auth screens, email verification, resource submission, authorized moderation queues, and Super Administrator user/role management. The initial Super Administrator uses a one-time bootstrap command and is marked verified at creation. Account suspension administration, academic-structure write APIs, account recovery, malware scanning, and production deployment controls are not implemented.
