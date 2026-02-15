#!/bin/bash
# Setup script for AI Coding Agent
# Run this in your target repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🤖 AI Coding Agent Setup"
echo "========================"
echo ""

# Check if we're in a git repo
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

# Create workflows directory
mkdir -p .github/workflows

# Copy workflow file
if [ -f "$SCRIPT_DIR/workflows/ai-agent.yml" ]; then
    cp "$SCRIPT_DIR/workflows/ai-agent.yml" .github/workflows/ai-agent.yml
    echo "✅ Copied workflow file to .github/workflows/ai-agent.yml"
else
    echo "📥 Downloading workflow file..."
    curl -sL -o .github/workflows/ai-agent.yml \
        "https://raw.githubusercontent.com/reachkrishnaraj/ai-coding-agent-pipeline/main/agent-runner/workflows/ai-agent.yml"
    echo "✅ Downloaded workflow file"
fi

echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Add API keys to your repository secrets:"
echo "   - ANTHROPIC_API_KEY (for Claude models)"
echo "   - OPENAI_API_KEY (for GPT-4/Codex)"
echo "   - GOOGLE_API_KEY (for Gemini)"
echo ""
echo "   Go to: Settings → Secrets and variables → Actions → New repository secret"
echo ""
echo "2. Commit and push the workflow file:"
echo "   git add .github/workflows/ai-agent.yml"
echo "   git commit -m 'feat: add AI coding agent workflow'"
echo "   git push"
echo ""
echo "3. Create an issue with the 'ai-task' label to test!"
echo ""
echo "🎉 Setup complete!"
