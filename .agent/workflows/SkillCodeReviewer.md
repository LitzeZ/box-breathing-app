---
name: code-reviewer
description: Expert code analysis and review. Use this skill when the user asks to "review the code", "check for bugs", "improve code quality", or "analyze" a file or codebase. It covers readability, correctness, security, and performance.
license: MIT
---

# Code Reviewer

This skill guides you through performing a professional code review.

## Workflow

1.  **Analyze Context**: Understand the purpose of the code and the language used.
2.  **Verify Review**: Check the code against the [Code Review Checklist](references/checklist.md) to ensure all aspects are covered.
3.  **Report Findings**:
    *   Group issues by category (Logic, Style, Security, Performance).
    *   Prioritize critical bugs first.
    *   Provide actionable suggestions or code snippets for fixes.
    *   Be constructive and polite.

## Common Anti-Patterns to Watch For

*   **Magic Numbers**: Replace with named constants.
*   **Deep Nesting**: Suggest early returns (Guard Clauses) to flatten logic.
*   **God Classes/Functions**: Suggest splitting into smaller, focused components.
*   **Hardcoded Secrets**: IMMEDIATE PRIORITY. Warn the user to move them to environment variables.
*   **Ignored Errors**: Look for empty `catch` blocks or `except:` clauses.

## Usage

When reviewing, always reference the specific lines of code.

```markdown
- **Line 45**: Possible null pointer exception if `user` is undefined.
  - *Fix*: Add optional chaining `user?.id` or a check.
```
