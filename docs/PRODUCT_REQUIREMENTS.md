# Product Requirements: Engineering Resources Hub

## 1. Purpose

Engineering Resources Hub is an open-source academic resource platform for engineering students, initially launching at the University of Lagos (UNILAG). The initial departments are Computer Engineering and Electrical and Electronics Engineering within UNILAG's Faculty of Engineering. It helps students discover and contribute course-aligned learning materials while giving moderators a clear review process. The product and data model must support additional Nigerian universities without university-specific application logic.

The platform is a discovery and contribution layer, not a blanket licence for the documents it hosts. Each resource must carry its own rights and licence information, and users need a way to report material they believe is unauthorized.

## 2. Users and access

| Role | Core capabilities |
|---|---|
| Guest | Browse academic structures, search, view and download approved public resources |
| Student | Guest capabilities plus bookmarks, uploads, solutions, comments, reports, profile and contribution history |
| Moderator | Review submissions, approve or reject resources, review reports and verify solutions |
| Administrator | Manage users, roles, academic structures, moderators, platform settings and analytics |

Authorization is enforced by the API. Frontend checks are for usability only. Academic profile fields are optional. Public resource access does not require an account.

## 3. MVP outcomes

1. Students can browse the initial UNILAG departments, courses and approved resources; the same flows support additional universities and disciplines as they are added.
2. Students can search and filter resources by academic context and resource metadata.
3. Students can submit a resource with its metadata and rights declaration; it remains pending until review.
4. Moderators can approve or reject a submission and review user reports.
5. The system supports several universities with different academic structures and non-global course codes.
6. The first academic data seed covers the Computer Engineering and Electrical and Electronics Engineering departments within UNILAG's Faculty of Engineering. The project owner will validate the course data before it is seeded. The platform can run natively on Windows, macOS and Linux without Docker; local development uses locally installed PostgreSQL and filesystem uploads.

## 4. Functional requirements

### 4.1 Academic discovery

- Represent universities, faculties, departments, programmes, academic sessions, levels, semesters and courses.
- Allow a university's structure and programme duration to vary; do not encode any university as a special case.
- Scope a course code to its owning academic context. A code is not globally unique.
- Browse and search without registration.

### 4.2 Resources

- Support textbooks, lecture notes, lecture slides, past questions, worked solutions, laboratory manuals, programming exercises, project materials and other academic resources.
- Associate each resource with a course and, where applicable, a session, examination year and semester.
- Record title, description, category, file type and size, storage key, uploader, upload time, moderation status, rights/licence and verification status.
- Allow permitted users to submit, edit and delete their own resources; moderators and administrators have the additional permissions defined by policy.
- Keep new submissions private until approved. Public listing, preview and download apply only to approved resources.
- Support duplicate detection where practical, pagination, filtering, reporting and PDF viewing.

### 4.3 Community and accounts

- Provide registration, login, logout, session management, profile management and role-based authorization.
- Hash passwords with Argon2 or bcrypt; use HTTP-only cookies and appropriate CSRF protections.
- Support bookmarks, comments/reviews, solution submissions, reports and contribution history for authenticated students.
- Design solution records to allow multiple submissions per question and later verification.

### 4.4 Search

- Search course codes and titles, resource titles and descriptions, sessions, categories and keywords.
- Filter by university, department, level, semester, course, category, session and examination year.
- Begin with PostgreSQL search capabilities and keep the search boundary replaceable for future full-text or semantic search.

### 4.5 Dashboards and moderation

- Student dashboard: recent activity, bookmarks, favourite courses, uploads, submission state, solutions and contribution totals.
- Moderator dashboard: pending resources, reports and solution verification queues.
- Admin dashboard: academic structure, account/role management and platform analytics.
- Record moderation decisions with actor, timestamp and reason so decisions are auditable.

## 5. Quality requirements

- Responsive and accessible interface with readable contrast, consistent navigation and useful loading, empty and error states.
- Validate all external input; use centralized API errors and a consistent response envelope.
- Use secure headers, rate limits, strict CORS configuration, authorization middleware and environment-based configuration.
- Keep document bytes out of PostgreSQL. Use a storage interface with a local filesystem provider for development and Cloudflare R2 for production.
- Validate file size, declared MIME type and PDF signature; generate unique storage keys and prevent overwrites. Pending files must not be publicly accessible. Plan malware scanning and abandoned-upload cleanup before public production uploads.
- Keep secrets out of source control and provide placeholders only in `.env.example`.
- Document native setup, PostgreSQL installation/configuration, environment variables, migrations and start commands. Docker must not be required.
- Provide automated coverage for important business rules and CI checks before production deployment.

## 6. Out of scope for the initial MVP

AI assistance, semantic search, OCR, generated questions, offline reading, advanced gamification and native mobile applications. The data and module boundaries should not prevent these later additions.

## 7. Success measures

Initial operational measures should include approved resources per course/university, successful search-to-resource visits, contribution and moderation turnaround, report resolution time, and failed upload rate. Define targets after baseline usage is known; do not treat raw download counts as quality or learning outcomes.

## 8. Open product decisions

- What programme labels and academic session conventions should be used under the two initial departments, and who will validate session data? The project owner will validate course data.
- What rights declaration and permitted licence choices should contributors see at upload time?
- What file size limit, review service-level target and retention policy should apply?
- Which events count as “recently accessed,” and what privacy/retention period applies to that history?
- Are comments required for the first usable release, or can they follow the resource and moderation workflow?

