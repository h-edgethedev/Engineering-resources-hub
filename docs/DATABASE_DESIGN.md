# Database Design: Proposed Relational Schema

This is a logical proposal for review, not a committed Prisma schema or migration. UUID primary keys are assumed. Use UTC timestamps and explicit foreign keys. Add indexes from actual browse/search patterns and retain unique constraints only where the owning scope makes values unique.

The first academic data seed will cover the Computer Engineering and Electrical and Electronics Engineering departments within the Faculty of Engineering at the University of Lagos (UNILAG). The project owner will validate course data. Confirm programme labels before preparing seed records. Seed data should use normal university, faculty, department, programme and course records; no UNILAG-specific branches or identifiers belong in application logic.

## 1. Academic structure

```text
University 1---* Faculty 1---* Department 1---* Programme
                                               |
                                               *---* AcademicSession (through ProgrammeSession)
Programme 1---* Course
Programme 1---* ProgrammeLevel 1---* Semester
Course *---* Semester (through CourseOffering)
```

### `University`

`id`, `name`, `slug` (unique), `countryCode`, `websiteUrl?`, `status`, `createdAt`, `updatedAt`.

### `Faculty`

`id`, `universityId`, `name`, `slug`, timestamps. Unique `(universityId, slug)`.

### `Department`

`id`, `facultyId`, `name`, `slug`, timestamps. Unique `(facultyId, slug)`. Faculty determines university, avoiding redundant institution IDs that can disagree.

### `Programme`

`id`, `departmentId`, `name`, `slug`, `award?`, `durationYears?`, `status`, timestamps. Unique `(departmentId, slug)`. Examples include Computer Engineering and Electrical Engineering; no code special-cases a university or discipline.

### `AcademicSession`

`id`, `universityId`, `label` (e.g. `2025/2026`), `startDate?`, `endDate?`, timestamps. Unique `(universityId, label)`.

### `ProgrammeSession`

Join entity: `programmeId`, `academicSessionId`, `status`, timestamps. Composite unique key. This permits sessions and programme availability to vary.

### `ProgrammeLevel`

`id`, `programmeId`, `code` (e.g. `200`), `label?`, `ordinal`, timestamps. Unique `(programmeId, code)` and `(programmeId, ordinal)`.

### `Semester`

`id`, `programmeLevelId`, `code` (e.g. `first`), `label`, `ordinal`, timestamps. Unique `(programmeLevelId, code)` and `(programmeLevelId, ordinal)`. A programme may configure a different number or naming of semesters per level.

### `Course`

`id`, `programmeId`, `code`, `title`, `description?`, `creditUnits?`, `status`, timestamps. Unique `(programmeId, code)`, never globally unique. If a course is shared across programmes, represent that explicitly with a separate canonical course entity and programme-course join only after a real use case confirms it.

### `CourseOffering`

Join entity: `courseId`, `semesterId`, `academicSessionId?`, timestamps. Unique across the chosen scope, likely `(courseId, semesterId, academicSessionId)` with nullable uniqueness handled deliberately. This supports courses moving semesters or changing by session. Confirm whether session belongs on the offering or resource before implementation.

## 2. Accounts and authentication

### `User`

`id`, `email` (normalized, unique), `passwordHash`, `displayName`, `status`, `emailVerifiedAt?`, timestamps. Optional profile fields can be separate to avoid making academic affiliation a registration requirement.

### `StudentProfile`

`userId` (PK/FK), `programmeId?`, `currentLevelId?`, `enrollmentYear?`, `bio?`, timestamps. Store only fields the product needs; treat them as optional and private by default.

### `Role` and `UserRole`

`Role`: `id`, `name` (unique: `student`, `moderator`, `admin`). `UserRole`: `userId`, `roleId`, `grantedBy?`, `createdAt`, composite unique `(userId, roleId)`. Never trust a role sent by the client.

### `Session`

`id` (opaque random token hash or non-secret identifier), `userId`, `expiresAt`, `createdAt`, `lastSeenAt?`, `revokedAt?`, optional safe device metadata. Do not store the raw cookie token. Expired and revoked sessions need cleanup.

## 3. Resources and files

### `Resource`

`id`, `courseId`, `academicSessionId?`, `semesterId?`, `uploadedById`, `title`, `description?`, `category`, `examinationYear?`, `examinationType?`, `status` (`pending`, `approved`, `rejected`, `removed`), `verificationStatus`, `licence?`, `rightsDeclaration?`, `createdAt`, `updatedAt`, `approvedAt?`, `approvedById?`.

Keep `semesterId` only if it can be validated against the course's programme/offering. If a resource's academic context is fully determined by a course offering, reference that offering instead of duplicating session and semester fields. This is an important schema decision to validate with real use cases.

### `StoredFile`

`id`, `resourceId` (one-to-one for initial PDF scope), `provider`, `storageKey` (unique), `originalFilename`, `mediaType`, `byteSize`, `sha256?`, `uploadState` (`reserved`, `uploaded`, `verified`, `failed`, `deleted`), `createdAt`, `verifiedAt?`. Never store binary PDF data here. Hashes can support duplicate detection but should not become a public identifier.

### `ResourceKeyword`

`resourceId`, `keyword` or normalized `keywordId`, composite uniqueness. Alternatively start with PostgreSQL full-text vectors and add normalized tags only if user-managed tagging is required.

## 4. Community, review and moderation

### `Bookmark`

`userId`, `resourceId`, `createdAt`; composite primary/unique key `(userId, resourceId)`.

### `Comment`

`id`, `resourceId`, `authorId`, `body`, `status`, timestamps, optional `parentCommentId` only if threaded replies are approved for scope.

### `Solution`

`id`, `questionResourceId`, `submittedById`, `body` (structured text/markdown initially), `status`, timestamps, `verifiedById?`, `verifiedAt?`. Multiple solutions per question are allowed. Rich images and code should use explicit attachments or structured content in a later milestone.

### `Report`

`id`, `resourceId?`, `commentId?`, `solutionId?`, `reporterId?` (nullable guest reports only if product policy permits), `reason`, `details?`, `status`, `assignedToId?`, timestamps, `resolvedById?`, `resolution?`. Enforce that exactly one target is set with a database check constraint where practical.

### `ModerationAction`

`id`, `actorId`, `targetType`, `targetId`, `action`, `reason?`, `createdAt`, structured metadata. Prefer typed foreign keys or dedicated review tables if polymorphic targets would weaken integrity. This table is an audit trail and should be append-only for normal application roles.

## 5. Activity and dashboard data

### `ResourceAccess`

`id`, `userId`, `resourceId`, `accessedAt`; index `(userId, accessedAt DESC)`. Retain only if recent-access history is a confirmed product requirement, and set a retention/clearance policy. Avoid recording guest identity.

### `FavouriteCourse`

`userId`, `courseId`, `createdAt`; composite key. Store separately from bookmarks because it represents a different user intent.

Contribution totals can be queried or materialized later; do not persist counters until query volume warrants the consistency burden.

## 6. Relationship, deletion and indexing rules

- Use restrictive deletes for universities, departments, courses and resources with dependent or public history. Prefer archive/status fields over cascading deletion of academic or moderated records.
- Cascading deletion may be appropriate for ephemeral joins such as bookmarks and revoked sessions, after privacy/legal retention rules are decided.
- Index foreign keys used for joins, resource `(status, createdAt)`, resource `(courseId, status)`, academic scoped slug/code uniqueness, session labels, and access history.
- PostgreSQL full-text indexes should cover searchable resource title/description and course code/title. Add only after query design is agreed.
- Normalize email and slugs consistently in the service layer; use database uniqueness to prevent races.
- Store moderation history and resource licence metadata independently of the source PDF so removal can preserve an audit record.

## 7. Decisions before Prisma migrations

1. Confirm whether courses are programme-specific or canonically shared across programmes.
2. Validate the faculty/department/programme hierarchy and semester structure against two target universities.
3. Decide whether resource context points to a course, a course offering, or both; avoid inconsistent duplicated session/semester values.
4. Choose session token representation, store and retention/cleanup policy.
5. Decide guest reporting, profile visibility, access-history retention and account deletion behavior.
6. Decide whether resources may contain multiple files and which non-PDF formats are allowed in the MVP.
7. Define rights metadata and takedown audit retention.

