# Security policy

## Supported versions

Cursor Office is under active development. Security fixes are applied to the latest code on `main` and, when practical, to the latest published release. Older development builds are not supported.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Choose **Report a vulnerability** and create a private report.

Include the affected version or commit, impact, reproduction steps, and any suggested mitigation. Remove prompts, responses, transcripts, credentials, source code from private workspaces, and other unrelated sensitive data.

You should receive an acknowledgement within seven days. The maintainers will validate the report, coordinate a fix, and agree on disclosure timing with the reporter. Please allow a reasonable remediation window before public disclosure.

## Security model

Cursor Office is designed to run locally without a network service. Its Hook bridge intentionally discards prompt text, response text, reasoning, file contents, commands, and tool output. See [docs/cursor-integration.md](docs/cursor-integration.md) for the complete data boundary.
