# Build a first project

Use a small, recoverable project to test the whole flow. This walkthrough asks for a local reading-list app. It does not require a deployment, email, paid service or production credentials.

## Connect and choose New project

Open the installed app and configure access through **Add API key**. Return to the opening menu and choose **New project**. The logo, globe, information table and native controls remain part of the interface.

For the idea, try:

> Build a local reading-list app. I want to add a book title, mark a book as finished and filter the list. Keep the data on this computer. No accounts, payments, email or deployment. Start with one agent.

Describe your needs and what success looks like. For this example, success could mean that adding a book, changing its status and reopening the app preserve the list.

Use the notes question for known constraints and relevant material. Naming a file there does not automatically import its contents. Supply needed source content through the normal file/context tools under your current permissions.

## Answer and review the questions

The intake saves accepted answers. Personalized questions use the current answers and configured model to fill meaningful gaps. A failed AI request leaves saved answers available; it is not automatically replayed. Read the displayed choices before deciding whether to retry, continue without AI or save and return.

The flow recommends an agent total and lets you select it. Choose one for this trial. One means the current lead only; larger totals include the lead rather than adding hidden reviewers.

## Generate and review the PRD

The answers become a candidate product requirements document. Review its scope and acceptance criteria. For the reading-list example, check that local persistence, completion status and filtering are included, and accounts, email, payment and deployment are excluded.

If it adds something you did not request, ask for a change before approval. Approval applies to the current revision. PRD approval does not itself start implementation.

## Choose Build

Choose the visible **Build** action when the current plan is approved. You do not need to send another start message. The app prepares the current context and continues through the native work handoff, subject to permissions, Stop, provider availability and project limits.

Keep tool permissions appropriate to this project. A skill or plan cannot grant access that you have not authorized. Inspect the work and its actual checks. Completion needs evidence for the current requirements and your final acceptance; an agent's self-review is not your acceptance.

The prototype does not promise unattended completion of every app. If it waits, record the reason and use the existing session rather than creating a replacement run.

## Try the quality review and reopen

After a coding change, ask:

> Use amirahco-code-quality and amirahco-maintainability-review on this project's changes. Report findings first and preserve the working features. Do not edit yet.

For TypeScript, include `amirahco-typescript-quality`. `/skills` lists the bundled entries; `/simplify` offers a native simplification review request. See [workflows and skills](WORKFLOWS-AND-SKILLS.md) for the invocation and repair boundaries.

Save, close normally and reopen the same project or conversation from the menu. Check the current stopping point and files before resuming. A stopped intake should remain stopped until you explicitly resume it. Use [troubleshooting](TROUBLESHOOTING.md) if the saved work or provider route is unavailable.

Share the steps, expected behavior and observed result in a [bug report](https://github.com/soin8293/AmirahCo-CLI/issues/new/choose). Use synthetic examples and redact keys, login links and private content.
