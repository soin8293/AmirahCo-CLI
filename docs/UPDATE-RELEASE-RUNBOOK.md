# Delivering updates

## Current status

The native Windows updater is implemented. The r6 candidate has `feed: null` and no trusted keys, so its in-app channel is **inactive**. Release preparation is available locally; no production feed, signing identity or package has been published by this increment.

Before distributing the first update-enabled installer, provision a stable direct HTTPS origin and an Ed25519 signing identity, then bundle **only the public key and feed URL** in `assets/update-policy.json`. Keep the private signing key outside Git, app packages and the website, with restricted access and a recoverable protected backup. A signed update manifest is separate from Windows Authenticode signing of the installer.

Suggested layout, pending deployment approval:

```text
https://www.amirahco.us/cli-updates/pilot/windows-x64.json
https://www.amirahco.us/cli-updates/packages/<immutable-release>.zip
```

These are proposed paths, not live endpoints. Both must serve bytes directly from the same origin, without redirects, account cookies or an HTML fallback. GitHub remains the source, release notes and manual installer download location. Its redirected release-asset URLs cannot be used as this updater's package transport. Never distribute a private repository token to clients.

## Prepare each release

1. Keep the last shipped policy and signed feed as immutable release evidence. Increase the numeric policy `sequence` for every changed package, including rebuilds with the same displayed version. Never replace bytes or sign different content under an issued sequence.
2. Preserve the installed feed, product/channel/platform/schema and a trusted signing key. Build/test the CLI and use the existing Windows packaging recipe. Review the diff, package checksums, notices, install-over and interrupted-update results. State-schema changes need their separate migration gate.
3. Prepare a private local configuration file using absolute paths. The `currentPolicy` must be the policy of the latest shipped release, not an arbitrary older checkout. The tool reads the successor's policy and version from the actual ZIP; it does not patch a package after packaging.

```json
{
  "archive": "C:/release/candidate/AmirahCoCLI-Pilot-1.0.2-r7-Windows-x64.zip",
  "currentPolicy": "C:/release/last-shipped/update-policy.json",
  "privateKey": "C:/private-release-signing/ed25519.pem",
  "keyId": "REPLACE_WITH_APPROVED_KEY_ID",
  "url": "https://YOUR_APPROVED_ORIGIN/cli-updates/packages/1.0.2-r7.zip",
  "notes": "A short user-facing explanation of the tested changes.",
  "expiresAt": "REPLACE_WITH_FUTURE_ISO_TIMESTAMP",
  "output": "C:/release/candidate/windows-x64.json"
}
```

```powershell
node packaging/windows/prepare-update.mjs C:/release/private-release-config.json
node --test tests/windows-update-release.test.mjs tests/windows-updater.test.mjs
```

The tool inspects the nested ZIP layout and package identity, bounds unpacked sizes, hashes the actual archive, signs it, and exercises the shipped verifier offline against the installed trust policy. It refuses unconfigured/mismatched trust, non-increasing sequence, wrong signer, expired offer or another package origin. Existing output is never overwritten. It uploads nothing and generates no production key. It does not replace the installer's per-file verification, code review, real package receiving or another-device acceptance.

4. Qualify the exact signed package on an isolated installed Windows copy: offer → Later → approve → close normally → fresh launch → version/shortcuts → reopen the same saved work. Exercise interrupted download/install, offline and invalid-signature rejection. Retain receipts. Do not use an owner's active project as a destructive fault fixture.
5. After publication approval, upload the immutable ZIP **first**; verify direct HTTPS status, exact size/hash and no redirects. Replace the small signed feed **last**, atomically. Feed metadata should revalidate (`Cache-Control: no-cache`); immutable versioned packages may be cached. Read back exact feed bytes and run an actual installed-client check before announcing availability. Keep the previous installer and evidence available.
6. Publish GitHub release notes with version, changes, Windows requirements, checksums and manual installer link. A message to users can link to that release and say: “Open AmirahCo CLI and run /update. Choose Install update on next safe launch, then close and reopen normally.” Sending announcements remains a separate action.

## What users experience

Configured installations check metadata at startup and periodically outside the model loop. An update notice points to `/update`; users can also run `amirahcocli update` to check. The native picker defaults to Later. Approval downloads/verifies now and installs on the next safe fresh launch. A running session is never forcibly restarted. Offline checks, failed verification or interrupted updates retain the current version and original recovery identity. Sessions, unfinished work, credentials, Stop and requirement changes stay under their existing recovery protections.

For r6 or older installations without a feed/key, send the reviewed installer link. Close the app normally and install over the existing per-user location. The installer keeps previous binaries and existing profiles/projects. This one-time manual upgrade bootstraps trust; a remote message cannot activate an unconfigured client.

## Rotation and recovery

To rotate keys, first ship a successor signed by the currently trusted key which retains it and adds the next public key. Verify adoption before using the new signer. Maintain a supported update path for clients that missed the bridge; do not silently remove their only trusted key.

Withdraw an unsafe offer by stopping new offers or publishing a higher-sequence corrected release. Do not reuse a sequence or silently downgrade. Already approved interrupted installations reconcile their original signed action, so withdrawing the feed alone does not cancel them. A compromised signer or revoked approved package needs an explicit incident/recovery plan; this increment adds no remote revocation switch. Never delete `.updates` locks or restore old project/credential/control databases as an update remedy.

Offer expiry requires a fresh higher-sequence release for new approvals. Prior approved actions remain recoverable after expiry. Leave uncertain effects and incompatible state migrations held for inspection. Full UI health rollback, Authenticode and fresh-device acceptance remain separate release gates.
