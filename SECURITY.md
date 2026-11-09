# Security

## Repository protections

GitHub secret scanning and repository push protection were enabled and read back through GitHub's API on November 7, 2026. Secret scanning produced an alert for the deterministic `FAKE_LONG_OPAQUE` redaction-test fixture; after source review, that specific alert was resolved as `used_in_tests`. No detector or path exclusion was added. The open-alert readback was empty at verification time; this is not a guarantee that the repository contains no secrets.

This page records the dated configuration check, not a live status feed or security certification. Security-status badges were removed from the README header on November 8 to keep its focus on the app and downloads; both protections remain enabled. The release/download-count badges use live GitHub metadata. GitHub Actions remains disabled, so no CI or coverage success badge is claimed.

Push protection's enabled state was verified; no real credential was created or pushed to challenge its blocking behavior. GitHub's scan-history endpoint is unavailable under this repository's current feature entitlement, so a full historical scan-completion timestamp is not claimed. Maintainers should review new GitHub alerts and retain the local full-history/file-blob scan before releases. Never bypass a block for a real credential.

The separate local source audit covered all 10 public commits and 3,593 reachable file blobs at `a80b5f1`. Its 34 Gitleaks candidates were reviewed as synthetic test values/public identifiers. No credentials were tested against providers. Downloaded installer payloads, dependencies and hosted services were outside that source audit.

## Reporting and credential handling

Do not post API keys, passwords, access tokens, private keys, private conversations or customer files in public issues. Use GitHub private vulnerability reporting if enabled, otherwise contact the maintainer through the repository owner profile before sharing sensitive details.

The client ships no provider keys or hosted-pool administration credentials. BYOK traffic follows your configured provider. Optional hosted tester access uses individually approved, bounded, expiring credentials; a public application download does not grant hosted access. Keys are never a substitute for server-side authorization.

Installer verification and update signing are separate from AI-tool permissions. Keep the native permission mode and Stop controls appropriate for your workspace. Do not treat a prompt, skill, model statement or self-review as independent approval. Updates may be deferred while sessions are active.

This is an experimental Windows prototype, not an enterprise security certification. Current release gates include real separate-device acceptance and the licensing/signing/publication dispositions. See docs/CAPABILITIES.md.
