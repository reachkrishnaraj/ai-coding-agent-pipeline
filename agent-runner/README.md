# AI Coding Agent Runner

Multi-model AI coding agent that automatically processes GitHub issues labeled `ai-task` and creates pull requests with the solution.

## Supported Models

| Model | Provider | Best For |
|-------|----------|----------|
| Claude Sonnet 4 | Anthropic | Complex refactoring, architecture |
| Claude Opus 4 | Anthropic | Most complex tasks |
| GPT-4o | OpenAI | Fast, capable for most tasks |
| GPT-4 Turbo | OpenAI | Balance of speed and capability |
| Gemini 1.5 Pro | Google | Long context tasks |
| Gemini 1.5 Flash | Google | Fast and efficient |
| DeepSeek Coder | DeepSeek | Code-specialized |
| Mistral Large | Mistral | Open-weight alternative |

## Quick Setup

### 1. Add GitHub Action to your repository

Copy the workflow file to your repo:

```bash
mkdir -p .github/workflows
curl -o .github/workflows/ai-agent.yml \
  https://raw.githubusercontent.com/reachkrishnaraj/ai-coding-agent-pipeline/main/agent-runner/workflows/ai-agent.yml
```

### 2. Configure Secrets

In your repository settings, add the API keys for the models you want to use:

| Secret | Required For |
|--------|--------------|
| `ANTHROPIC_API_KEY` | Claude models |
| `OPENAI_API_KEY` | GPT-4, Codex |
| `GOOGLE_API_KEY` | Gemini models |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `MISTRAL_API_KEY` | Mistral |

You only need to add keys for the models you plan to use.

### 3. Create an AI Task Issue

Create an issue with the `ai-task` label. The agent will automatically:
1. Parse the issue description
2. Select the appropriate model
3. Generate code changes
4. Create a pull request

## Issue Format

For best results, structure your issues like this:

```markdown
## Description
Describe what you want the agent to do.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Likely Files
- `src/path/to/file.ts`
- `src/another/file.ts`
```

## Model Selection

The agent automatically selects a model based on the `recommended_agent` from the AI Pipeline, or you can specify it via labels:

| Label | Model |
|-------|-------|
| `claude-code` | Claude Sonnet 4 (default) |
| `codex` | GPT-4o |
| `copilot` | GPT-4o |
| `gpt-4` | GPT-4o |
| `gemini` | Gemini 1.5 Pro |

## Manual Trigger

You can also manually trigger the agent from the Actions tab:

1. Go to Actions → AI Coding Agent
2. Click "Run workflow"
3. Enter the issue number
4. Optionally select a specific model

## Local Development

Run the agent locally:

```bash
cd agent-runner
pip install -r requirements.txt

export GITHUB_TOKEN=your_token
export ANTHROPIC_API_KEY=your_key  # or other provider keys

python agent.py --repo owner/repo --issue 123
```

## Configuration

Edit `config.json` to customize:
- Model mappings
- File extensions to include/exclude
- Default model settings

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GitHub Issue   │ ──▶ │  GitHub Action   │ ──▶ │   AI Agent      │
│  (ai-task)      │     │  (Trigger)       │     │   (LiteLLM)     │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                        ┌──────────────────┐              │
                        │  Pull Request    │ ◀────────────┘
                        │  (Auto-created)  │
                        └──────────────────┘
```

## Troubleshooting

### Agent not triggering
- Ensure the `ai-task` label is added to the issue
- Check that GitHub Actions is enabled for your repo
- Verify the workflow file is in `.github/workflows/`

### Model errors
- Verify the correct API key is set in repository secrets
- Check the model name is valid in `config.json`

### Code generation issues
- Add more context in the issue description
- Specify likely files to help the agent focus
- Try a more capable model (Claude Opus, GPT-4)
