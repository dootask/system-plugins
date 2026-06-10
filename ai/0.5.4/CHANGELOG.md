### Added
- The AI assistant now understands DooTask better: when you ask "how do I use this feature" or "where do I find that setting", it first looks up the built-in product handbook before answering and cites its sources. If it finds nothing relevant, it says so honestly instead of making things up.
- The handbook ships with DooTask itself — after upgrading DooTask, just restart this plugin to pick up the latest content. No manual sync needed.
- New "Embedding model" option on the install screen lets you pick the model used for handbook matching (defaults to Qwen, works out of the box; no tweaking required for most users).

### Upgrade notes
- This feature needs DooTask's main Redis to be 8.0 or newer. On older versions it's silently disabled and AI chat keeps working as usual; upgrade Redis in DooTask if you'd like to turn it on.
