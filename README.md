# opencode-starter

> Launch Claude Code using [OpenCode](https://opencode.ai) Zen or Go as the Anthropic API backend.

## What it does

Runs an interactive wizard that:
1. Lets you choose **OpenCode Zen** (66+ models, free tier) or **OpenCode Go** (17 models, subscription)
2. Fetches the current model list — free models highlighted in green, translated models labeled `(translated)`
3. Detects and warns about any conflicting environment variables (Vertex AI, Bedrock, etc.)
4. Launches Claude Code with a clean, isolated environment — **never modifies `~/.claude/settings.json`**

## Prerequisites

- Node.js 18+
- [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code) installed
- An [OpenCode API key](https://opencode.ai/settings/keys)

## Setup

Add your OpenCode API key to your shell profile:

```bash
# zsh
echo 'export OPENCODE_API_KEY="your-key-here"' >> ~/.zshrc && source ~/.zshrc

# bash
echo 'export OPENCODE_API_KEY="your-key-here"' >> ~/.bashrc && source ~/.bashrc
```

## Usage

```bash
npx opencode-starter
```

Or install globally:

```bash
npm install -g opencode-starter
opencode-starter
```

### Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Run the full wizard but show a preview instead of launching Claude Code |
| `--help` | Show usage |
| `--version` | Show version |

Pass extra flags to Claude Code after `--`:

```bash
opencode-starter -- --print "hello"
opencode-starter -- --dangerously-skip-permissions
opencode-starter --dry-run -- --print "test"
```

## How it works

### Environment isolation

When launched, opencode-starter:
1. Removes 17 conflicting env vars from the child process (Vertex AI, Bedrock, AWS, Foundry, stale Anthropic config)
2. Sets `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL` for the session
3. Passes `--model <selected>` to Claude Code as an override

When Claude Code exits (any reason — normal, Ctrl+C, terminal close), everything returns to normal. **No cleanup, no restore step.**

### Model compatibility

OpenCode Zen and Go expose all models via the Anthropic Messages API (`/v1/messages`), with protocol translation handled server-side. Models are labeled:
- **No label** — natively uses Anthropic protocol (Claude, Qwen Plus, MiniMax M3)
- **(translated)** — protocol is translated by OpenCode (DeepSeek, GLM, Kimi, GPT, Gemini, etc.)

For translated models, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` is automatically set to prevent beta header rejection.

### Preference persistence

Your last backend and model selection are saved to `~/.config/opencode-starter/config.json` and pre-selected as defaults on the next run.
