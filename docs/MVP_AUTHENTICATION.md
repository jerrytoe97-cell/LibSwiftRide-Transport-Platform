# MVP authentication and session experience

## Delivered experience

The shared application shell now provides production account access for every portal:

- Passenger and driver users can register or sign in.
- Business managers, fleet managers, dispatchers and administrators can sign in with accounts provisioned for their roles.
- The requested portal role is checked after authentication. A valid account with the wrong role is signed out and denied access.
- “Keep me signed in” stores the rotated refresh session persistently; clearing it keeps the session scoped to the browser tab.
- Expired access tokens are refreshed once and the original request is retried.
- Logout revokes the active refresh token before clearing browser state.
- Users can update their name, email and language.
- Changing an email clears its verification status.
- Users can inspect and revoke their own active sessions.

Driver registration also exposes onboarding and KYC status. New drivers can create their initial driver record and see document-review state. Direct identity-document upload remains intentionally unavailable until private object storage, signed uploads and malware scanning are configured.

## Security boundaries

- Refresh tokens are rotated by the API and stored only according to the user’s device-persistence choice.
- Profile edits are field-whitelisted and audited.
- Session revocation is ownership-scoped.
- Production demo login remains disabled by configuration.
- Public self-registration creates only passenger or driver roles.
- Business, fleet, dispatcher, support and administrator roles require privileged provisioning.

For a public production launch, replace browser-held refresh credentials with an approved same-site secure-cookie design once all applications share an appropriate production domain boundary. Complete CSP, XSS, CSRF and device-session testing before that migration.

## Automated ride milestone

The database-backed acceptance journey verifies:

1. passenger registration and email verification;
2. profile read and update;
3. driver registration, onboarding, KYC submission and approval;
4. driver availability;
5. passenger booking;
6. dispatcher assignment;
7. driver arrival;
8. passenger boarding;
9. SOS creation;
10. trip start and completion;
11. cash payment capture;
12. 86% driver earnings and 14% platform commission;
13. driver wallet credit;
14. receipt generation; and
15. passenger rating submission.

Live provider payments remain disabled.
