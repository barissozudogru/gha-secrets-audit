# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly. Do not open a public GitHub issue for security vulnerabilities.

**Options:**
- Open a [private security advisory](https://github.com/barissozudogru/gha-secrets-audit/security/advisories/new) on GitHub
- Contact the maintainer directly via the email listed on the GitHub profile

Please include a description of the vulnerability, steps to reproduce, and the potential impact. You can expect an initial response within 5 business days.

## Scope

This tool performs static analysis of workflow YAML files on the local filesystem. It does not:

- Access the GitHub API or any remote service
- Read or transmit actual secret values (only secret names/identifiers from YAML)
- Store, cache, or persist any data between runs
- Require network access of any kind
- Execute workflow files or any code within them

The only data read are `.yml` and `.yaml` files in the specified directory. Output is written to stdout only.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x (latest) | Yes |

## Dependencies

This package has zero runtime dependencies. The attack surface is limited to the Node.js standard library (`fs`, `path`, `process`) and the TypeScript compiler (dev dependency only).
