# Native tester access

For current Windows instructions, use the [tester guide](TESTER-GUIDE.md).

Choose **Add API key → Sign in for tester access** in the native CLI. Google sign-in identifies your account; it does not automatically approve access. The website's [tester access page](https://www.amirahco.us/ai/tester-access) uses the same manual-approval policy.

An approved, unexpired grant permits retrieval of its bounded tester credential. The native flow saves it through the existing provider-profile writer and verifies readback. Reopening should use the saved profile without issuing another credential or renewing usage. Keep keys out of project files and shared logs.

Pending, expired, exhausted or revoked access must not silently turn into an active grant or paid fallback. Revoke and replacement requests follow the account controls; replacements remain manually approved and do not reset quota. Ordinary BYOK configuration is separate.

The optional pilot can be paused or capacity-limited. Existing operator receipts and account-specific test histories belong in the private development records, not the public setup guide. [Capability status](CAPABILITIES.md) and [validation](VALIDATION.md) distinguish fixture checks from live account/provider acceptance.
