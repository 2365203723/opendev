# Security

## Before ANY commit
- No hardcoded secrets
- All user inputs validated
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- Error messages don't leak sensitive data

## Secret Management
- NEVER hardcode secrets in source code
- Use environment variables or .env files
- Rotate any secrets that may have been exposed
