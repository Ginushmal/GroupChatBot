---
name: github-context
description: Fetches the raw context of a GitHub open source project (code and docs) before implementation, ensuring up-to-date and accurate information without hallucination.
---

# GitHub Raw Context Fetcher

When you are asked to work with, integrate, or answer questions about an open source tool or project hosted on GitHub, you MUST fetch the latest raw context of the repository's files to avoid hallucinating or using out-of-date pre-trained knowledge.

To do this, use the `raw.githubusercontent.com` domain to fetch the exact, up-to-date implementation and documentation files directly.

## How to use raw.githubusercontent.com

When you find a relevant file in a GitHub repository (like a `README.md`, documentation markdown, or a specific source code file), you can fetch its raw contents using the `read_url_content` tool.

1. Take the GitHub file URL:
   `https://github.com/<owner>/<repo>/blob/<branch>/<path-to-file>`
2. Convert it to the raw URL format:
   `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path-to-file>`
3. Use the `read_url_content` tool on the raw URL to read the exact, up-to-date contents of that file into your context.

## Workflow

1. Identify the GitHub repository URL of the open source project.
2. Determine which documentation files (e.g., `README.md`, `docs/`) or source code files are relevant to the user's request.
3. Convert those file URLs to their `raw.githubusercontent.com` equivalents.
4. Fetch the file contents using `read_url_content`.
5. Base your reasoning, design, and implementation **entirely** on this up-to-date raw context rather than your pre-trained knowledge.
