# Security

Do not post API keys, passwords, access tokens, private keys, private conversations or customer files in public issues. Use GitHub private vulnerability reporting if enabled, otherwise contact the maintainer through the repository owner profile before sharing sensitive details.

The client ships no provider keys or hosted-pool administration credentials. BYOK traffic follows your configured provider. Optional hosted tester access uses individually approved, bounded, expiring credentials; a public application download does not grant hosted access. Keys are never a substitute for server-side authorization.

Installer verification and update signing are separate from AI-tool permissions. Keep the native permission mode and Stop controls appropriate for your workspace. Do not treat a prompt, skill, model statement or self-review as independent approval. Updates may be deferred while sessions are active.

This is an experimental Windows prototype, not an enterprise security certification. Current release gates include real separate-device acceptance and the licensing/signing/publication dispositions. See docs/CAPABILITIES.md.
