### Added
- The AI assistant now understands DooTask better: when you ask "how do I use this feature" or "where do I find that setting", it first looks up the built-in product handbook before answering and cites its sources. If it finds nothing relevant, it says so honestly instead of making things up.
- The handbook ships with DooTask itself — after upgrading DooTask, just restart this plugin to pick up the latest content. No manual sync needed.
- New "Embedding model" option on the install screen lets you pick the model used for handbook matching (defaults to Qwen, works out of the box; no tweaking required for most users).
- Added Claude Fable 5 to the model list — Anthropic's newest flagship model.
- The AI assistant and chat bots now perform operations through a unified `doo` command-line tool (query/create tasks, send messages, files, reports, search, page navigation, etc.), collapsing the previously per-tool mounting into a single command-line entry — broader coverage, more consistent behavior.
- Page operations (open a task, navigate, operate page elements) are now driven over the main app's persistent connection, so opening the AI assistant no longer establishes an extra connection.
- Page operations now work inside micro-app plugins: when you have a plugin open (e.g. Asset Hub, CRM) and ask the assistant to click a button or switch a menu, the action goes into the plugin itself instead of the main shell.
- The AI assistant can manage application plugins for you: install, update, reinstall, uninstall plugins, and view installed apps, the marketplace, app logs and containers. Install/uninstall require admin permission; destructive operations are confirmed with you first.

### Changed
- Image text recognition (OCR) is retired; multimodal models now understand images directly.
- Built-in tool calls are unified through `doo`; the legacy MCP tools module is being phased out.

### Upgrade notes
- This feature needs DooTask's main Redis to be 8.0 or newer. On older versions it's silently disabled and AI chat keeps working as usual; upgrade Redis in DooTask if you'd like to turn it on.
- This version requires DooTask main app v1.7.91 or newer (page operations depend on the newly added fd injection and operation dispatch endpoints). The app store will refuse to install on older versions.
- The legacy dootask MCP sub-module is unmaintained. After upgrading we recommend uninstalling it from the app store — all its capabilities are now covered by the bundled `doo` CLI.
