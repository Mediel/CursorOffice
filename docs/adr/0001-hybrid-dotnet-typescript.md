# ADR-0001: Hybrid C# and TypeScript architecture

- Status: accepted
- Date: 2026-08-21

## Context

Cursor Office is a Cursor IDE extension, but its main application logic is intended to be written in C#. The VS Code Extension API is available from a JavaScript/TypeScript extension host, while the Webview renders web content.

## Decision

The domain, application orchestration, Cursor adapters, and persistence use C# on .NET 10. A thin extension layer and the 3D Webview use TypeScript. The C# host runs as a separate local process and communicates with the extension through a versioned NDJSON protocol over standard input/output.

## Consequences

Benefits:

- Most non-trivial application logic remains in C#.
- The domain can be tested without Cursor or a browser.
- No local network service or port conflict is introduced.
- Rendering stays in the environment for which Three.js is designed.

Costs:

- The project uses two languages and two build toolchains.
- The process boundary requires an explicit, tested contract.
- A distributable VSIX must include compatible .NET host binaries.

## Rejected alternatives

- **TypeScript only:** simpler packaging, but does not meet the goal of C# as the primary application language.
- **Blazor WebAssembly for the entire Webview:** increases size and complicates high-frequency Three.js integration.
- **Local ASP.NET server:** adds a port, service lifecycle, and attack surface without enough benefit for the MVP.
