# DIDEBAN — Refresh Token patch (review before deployment)

This patch adds an HttpOnly Secure SameSite=Strict refresh cookie, 7-day refresh sessions,
rotation, reuse detection, logout revocation and Angular retry-on-401.

## Important
- Requires HTTPS for browser cookies (Secure); current HTTP localhost:5191 must be changed to HTTPS for end-to-end testing.
- Apply IdentityDbContext EF migration using the project's configured Identity database, not the operational database.
- No real build or integration test has been run in this environment.
- After a page reload, the Angular guard currently requires a token; a bootstrap refresh on app startup remains necessary.
- Concurrent refreshes from multiple tabs can trigger reuse revocation. Test and consider cross-tab coordination.
- Verify CSRF/origin protections, reverse proxy and production cookie policy before deployment.
- This is a development patch, not production approval.
