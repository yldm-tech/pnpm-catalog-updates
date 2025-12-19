---
'pcu': minor
---

feat: add AI-powered dependency analysis

- Add AIDetector for automatic detection of AI CLI tools (Claude, Gemini, Codex)
- Add AIAnalysisService for orchestrating AI-powered analysis with caching and
  fallback
- Add provider implementations: ClaudeProvider, GeminiProvider, CodexProvider
- Add RuleEngine as fallback when no AI tools are available
- Add AnalysisCache with TTL-based caching and disk persistence
- Support multiple analysis types: impact, security, compatibility, recommend
