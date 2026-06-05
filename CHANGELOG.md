# Changelog

## [0.2.5] - 2026-06-05

- Fix: Pass `X-API-Key` headers to upstream servers for paid Anthropic-format models.
- Fix: Blacklist deprecated MiMo models `mimo-v2-pro` and `mimo-v2-omni` to prevent runtime failures.

## [0.2.4] - 2026-06-05

- Fix: Server network mode now displays the actual local LAN IP address instead of the `<this-computer-ip>` placeholder.
- Fix: Server password prompt now shows input in plaintext so users can verify what they typed before confirming.
- Fix: Server network mode startup output now shows the actual server password so users can share/copy it.

## [0.2.3] - 2026-06-05

- Fix: The `opencode-starter server` command now automatically resolves/loads the API key from the OS credential store (Keyring/Keychain/Credential Manager) if it's not exported in the shell environment.
- Docs: Added instructions to the `README.md` on how to upgrade the package.

## [0.2.2] - 2026-06-05

- Simplified dry-run key-save logging in `resolveOrCollectApiKey` — replaced a 7-branch `if-else` chain with a `Record<SaveChoice, string>` lookup table. No behavioral change.

## [0.2.1]

- Changed the Claude Code launch path to the `opencode-starter claude` command namespace. Bare `opencode-starter` now prints help and migration guidance instead of launching Claude Code.
- Preserved passthrough Claude Code args after `claude`, including `-c`, `--resume <session-id>`, session IDs, and args after `--`.
- Added foreground `opencode-starter server` mode for local or LAN API gateway use.
- Added Anthropic-compatible and limited OpenAI-compatible server endpoints.
- Moved app preferences and model cache to `~/.opencode-starter/config.json`.
- Added one-time migration from the previous OS-native config path.
- Added opt-in saved server password support for network server mode.
- Updated documentation with the supported tools command table, Claude examples, dry-run/setup/trace placement, and migration note.
- Added MIT license file.
