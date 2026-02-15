#!/usr/bin/env python3
"""
Multi-Model AI Coding Agent Runner

Supports: Claude, GPT-4, Gemini, Mistral, DeepSeek, and more via LiteLLM
"""

import os
import sys
import json
import re
import subprocess
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

import litellm
from github import Github
from git import Repo
from rich.console import Console
from rich.panel import Panel
from dotenv import load_dotenv

load_dotenv()
console = Console()

# Configure LiteLLM
litellm.set_verbose = False


@dataclass
class TaskContext:
    """Parsed task context from GitHub issue"""
    issue_number: int
    title: str
    description: str
    task_type: str
    acceptance_criteria: list[str]
    likely_files: list[str]
    repo_name: str
    branch_name: str
    recommended_agent: str


def load_config() -> dict:
    """Load agent configuration"""
    config_path = Path(__file__).parent / "config.json"
    with open(config_path) as f:
        return json.load(f)


def get_model_for_agent(agent: str, config: dict) -> tuple[str, int]:
    """Map agent name to LiteLLM model identifier"""
    agent_mapping = config.get("agent_mapping", {})
    model_key = agent_mapping.get(agent, agent_mapping.get("default", "claude-code"))

    models = config.get("models", {})
    model_config = models.get(model_key, models.get("claude-code"))

    return model_config["model"], model_config.get("max_tokens", 4096)


def parse_issue(issue) -> TaskContext:
    """Parse GitHub issue body to extract task context"""
    body = issue.body or ""

    # Extract sections from issue body
    sections = {}
    current_section = "description"
    current_content = []

    for line in body.split("\n"):
        if line.startswith("## "):
            if current_content:
                sections[current_section] = "\n".join(current_content).strip()
            current_section = line[3:].strip().lower().replace(" ", "_")
            current_content = []
        else:
            current_content.append(line)

    if current_content:
        sections[current_section] = "\n".join(current_content).strip()

    # Parse acceptance criteria
    criteria = []
    criteria_text = sections.get("acceptance_criteria", "")
    for line in criteria_text.split("\n"):
        match = re.match(r"- \[[ x]\] (.+)", line)
        if match:
            criteria.append(match.group(1))

    # Parse likely files
    files = []
    files_text = sections.get("likely_files", "")
    for line in files_text.split("\n"):
        match = re.match(r"- `(.+)`", line)
        if match:
            files.append(match.group(1))

    # Extract task type from agent instructions
    task_type = "feature"
    agent_text = sections.get("agent_instructions", "")
    type_match = re.search(r"Task type: \*\*(.+?)\*\*", agent_text)
    if type_match:
        task_type = type_match.group(1)

    # Get recommended agent from labels
    recommended_agent = "claude-code"
    for label in issue.labels:
        if label.name in ["claude-code", "codex", "copilot", "gpt-4", "gemini"]:
            recommended_agent = label.name
            break

    # Generate branch name
    branch_name = f"ai-task/{issue.number}-{re.sub(r'[^a-z0-9]+', '-', issue.title.lower())[:40]}"

    return TaskContext(
        issue_number=issue.number,
        title=issue.title,
        description=sections.get("description", body),
        task_type=task_type,
        acceptance_criteria=criteria,
        likely_files=files,
        repo_name=issue.repository.full_name,
        branch_name=branch_name,
        recommended_agent=recommended_agent,
    )


def read_repo_files(repo_path: Path, config: dict, likely_files: list[str]) -> dict[str, str]:
    """Read relevant files from the repository"""
    files = {}
    include_ext = set(config.get("file_extensions", {}).get("include", []))
    exclude_dirs = set(config.get("file_extensions", {}).get("exclude_dirs", []))

    # First, try to read likely files
    for file_pattern in likely_files:
        if file_pattern == "select as you analyze":
            continue

        # Handle glob patterns
        if "*" in file_pattern:
            for path in repo_path.glob(file_pattern):
                if path.is_file() and path.suffix in include_ext:
                    rel_path = str(path.relative_to(repo_path))
                    if not any(ex in rel_path for ex in exclude_dirs):
                        try:
                            files[rel_path] = path.read_text(errors="ignore")
                        except Exception:
                            pass
        else:
            path = repo_path / file_pattern
            if path.is_file():
                try:
                    files[file_pattern] = path.read_text(errors="ignore")
                except Exception:
                    pass

    # If no files found, read key files for context
    if not files:
        key_files = ["README.md", "package.json", "pom.xml", "build.gradle",
                     "Cargo.toml", "go.mod", "requirements.txt", "pyproject.toml"]
        for key_file in key_files:
            path = repo_path / key_file
            if path.is_file():
                try:
                    files[key_file] = path.read_text(errors="ignore")
                except Exception:
                    pass

    return files


def build_prompt(context: TaskContext, files: dict[str, str]) -> str:
    """Build the prompt for the LLM"""
    files_content = ""
    for path, content in files.items():
        files_content += f"\n### {path}\n```\n{content}\n```\n"

    return f"""You are an expert software engineer. Complete the following coding task.

## Task
{context.title}

## Description
{context.description}

## Task Type
{context.task_type}

## Acceptance Criteria
{chr(10).join(f'- {c}' for c in context.acceptance_criteria) if context.acceptance_criteria else 'Not specified'}

## Existing Files
{files_content if files_content else 'No files provided - analyze the codebase structure and suggest files to modify.'}

## Instructions
1. Analyze the task and existing code
2. Provide your solution as file changes
3. Use the exact format below for EACH file you want to create or modify:

### FILE: path/to/file.ext
```language
entire file content here
```

4. If you need to create new files, use the same format
5. Ensure all existing tests pass
6. Add tests for new functionality
7. Follow the project's coding conventions

## Important
- Output ONLY the file changes in the format above
- Include the COMPLETE file content, not just changes
- Do NOT include explanations outside of code comments
"""


def parse_llm_response(response: str) -> dict[str, str]:
    """Parse LLM response to extract file changes"""
    files = {}

    # Pattern to match file blocks
    pattern = r"### FILE: (.+?)\n```\w*\n(.*?)```"
    matches = re.findall(pattern, response, re.DOTALL)

    for path, content in matches:
        path = path.strip()
        content = content.strip()
        if path and content:
            files[path] = content

    return files


def apply_changes(repo_path: Path, changes: dict[str, str]) -> list[str]:
    """Apply file changes to the repository"""
    modified_files = []

    for file_path, content in changes.items():
        full_path = repo_path / file_path

        # Create directory if needed
        full_path.parent.mkdir(parents=True, exist_ok=True)

        # Write the file
        full_path.write_text(content)
        modified_files.append(file_path)
        console.print(f"  [green]Modified:[/green] {file_path}")

    return modified_files


def create_branch_and_commit(repo: Repo, branch_name: str, modified_files: list[str], context: TaskContext) -> str:
    """Create branch, commit changes, and push"""
    # Create and checkout new branch
    if branch_name in repo.heads:
        repo.heads[branch_name].checkout()
    else:
        repo.create_head(branch_name).checkout()

    # Stage changes
    repo.index.add(modified_files)

    # Commit
    commit_message = f"""{context.task_type}: {context.title}

Closes #{context.issue_number}

Generated by AI Agent ({context.recommended_agent})
"""
    repo.index.commit(commit_message)

    # Push
    origin = repo.remote("origin")
    origin.push(branch_name, set_upstream=True)

    return branch_name


def create_pull_request(gh: Github, context: TaskContext, branch_name: str, modified_files: list[str]) -> str:
    """Create a pull request"""
    repo = gh.get_repo(context.repo_name)

    body = f"""## Summary
This PR addresses #{context.issue_number}: {context.title}

## Changes
{chr(10).join(f'- `{f}`' for f in modified_files)}

## Task Type
{context.task_type}

## Acceptance Criteria
{chr(10).join(f'- [ ] {c}' for c in context.acceptance_criteria) if context.acceptance_criteria else 'See linked issue'}

---
*Generated by AI Agent ({context.recommended_agent})*
"""

    pr = repo.create_pull(
        title=f"{context.task_type}: {context.title}",
        body=body,
        head=branch_name,
        base=repo.default_branch,
    )

    return pr.html_url


def run_agent(repo_owner: str, repo_name: str, issue_number: int, model_override: Optional[str] = None):
    """Main agent runner"""
    config = load_config()

    # Initialize GitHub client
    gh_token = os.environ.get("GITHUB_TOKEN")
    if not gh_token:
        console.print("[red]Error: GITHUB_TOKEN not set[/red]")
        sys.exit(1)

    gh = Github(gh_token)
    full_repo_name = f"{repo_owner}/{repo_name}"

    console.print(Panel(f"[bold]AI Coding Agent[/bold]\nRepo: {full_repo_name}\nIssue: #{issue_number}"))

    # Get issue
    console.print("\n[bold]1. Fetching issue...[/bold]")
    repo = gh.get_repo(full_repo_name)
    issue = repo.get_issue(issue_number)
    console.print(f"  Title: {issue.title}")

    # Parse context
    console.print("\n[bold]2. Parsing task context...[/bold]")
    context = parse_issue(issue)
    console.print(f"  Task type: {context.task_type}")
    console.print(f"  Recommended agent: {context.recommended_agent}")

    # Determine model
    model_name = model_override
    if not model_name:
        model_name, max_tokens = get_model_for_agent(context.recommended_agent, config)
    else:
        max_tokens = 4096
    console.print(f"  Using model: {model_name}")

    # Clone/update repo
    console.print("\n[bold]3. Setting up repository...[/bold]")
    repo_path = Path(f"/tmp/ai-agent-{repo_name}")
    if repo_path.exists():
        console.print("  Updating existing clone...")
        git_repo = Repo(repo_path)
        git_repo.remotes.origin.pull()
    else:
        console.print("  Cloning repository...")
        clone_url = f"https://x-access-token:{gh_token}@github.com/{full_repo_name}.git"
        git_repo = Repo.clone_from(clone_url, repo_path)

    # Checkout default branch
    default_branch = repo.default_branch
    git_repo.heads[default_branch].checkout()
    git_repo.remotes.origin.pull()

    # Read relevant files
    console.print("\n[bold]4. Reading codebase...[/bold]")
    files = read_repo_files(repo_path, config, context.likely_files)
    console.print(f"  Read {len(files)} files")

    # Build prompt and call LLM
    console.print("\n[bold]5. Generating solution...[/bold]")
    prompt = build_prompt(context, files)

    response = litellm.completion(
        model=model_name,
        messages=[
            {"role": "system", "content": "You are an expert software engineer. Generate complete, working code."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=max_tokens,
        temperature=0.2,
    )

    llm_response = response.choices[0].message.content
    console.print("  Solution generated!")

    # Parse and apply changes
    console.print("\n[bold]6. Applying changes...[/bold]")
    changes = parse_llm_response(llm_response)

    if not changes:
        console.print("[yellow]  No file changes detected in LLM response[/yellow]")
        console.print("\n[dim]LLM Response:[/dim]")
        console.print(llm_response[:2000])
        sys.exit(1)

    modified_files = apply_changes(repo_path, changes)

    # Create branch, commit, push
    console.print("\n[bold]7. Creating branch and committing...[/bold]")
    branch_name = create_branch_and_commit(git_repo, context.branch_name, modified_files, context)
    console.print(f"  Branch: {branch_name}")

    # Create PR
    console.print("\n[bold]8. Creating pull request...[/bold]")
    pr_url = create_pull_request(gh, context, branch_name, modified_files)
    console.print(f"  [green]PR created: {pr_url}[/green]")

    # Update issue
    issue.create_comment(f"AI Agent has created a pull request: {pr_url}")

    console.print("\n[bold green]Done![/bold green]")
    return pr_url


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AI Coding Agent Runner")
    parser.add_argument("--repo", required=True, help="Repository (owner/name)")
    parser.add_argument("--issue", required=True, type=int, help="Issue number")
    parser.add_argument("--model", help="Override model (e.g., gpt-4o, claude-sonnet-4-20250514)")

    args = parser.parse_args()

    owner, name = args.repo.split("/")
    run_agent(owner, name, args.issue, args.model)
