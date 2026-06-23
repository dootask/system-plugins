### Added

- Added "Doo AI", the official AI service from DooTask: models and quota are provided by DooTask, so you can sign in and start using it right away—no need to bring your own API keys.
- After installing, the first time you open the AI settings an official trial account is created for you automatically, with a default model pre-selected—it works out of the box.
- New account panel in the AI settings: sign in with your email and a verification code to bind the trial account to you, so you can keep using it across devices.
- The account panel shows your remaining quota at a glance.
- In model settings you can pull the official model list with one click, browse it grouped by provider, and add or remove models in bulk.
- Model names are shown in a friendlier way, and more providers such as MiniMax and Kimi are now recognized.
- Each model can have its own thinking depth and tool-use setting, so you can balance speed and quality per model.
- Added Claude Fable 5 to the model list—Anthropic's newest flagship model.
- The AI assistant now understands DooTask better: when you ask "how do I use this feature" or "where is this setting", it checks the built-in product handbook first and cites its sources. If it finds nothing, it says so honestly instead of making things up.
- The handbook now supports "app-bundled guides": after you install an app (Approval, OKR, Mind Map, Flowchart, OnlyOffice, File Preview, Global Search, Face Check-in, etc.), the assistant automatically learns how that app works, and forgets it when the app is uninstalled—so its answers always match the apps you actually have.
- The AI assistant can act directly on your current page: open a task, navigate, and click or fill in buttons and forms on the page.
- Inside an open app plugin (such as Asset Hub or CRM), you can also ask the assistant to click buttons or switch menus, and the action happens inside that app.
- The AI assistant can manage apps for you: install, update, reinstall, uninstall, and view installed apps and the app store. Installing and uninstalling require admin permission, and important actions are confirmed with you first.

### Improved

- The AI assistant and chat bots run actions (find/create tasks, send messages, send files, write reports, search, navigate pages, etc.) more reliably and consistently.
- Images no longer need separate text recognition—the AI reads image content directly.
- Signing out is more robust: even if your session has already expired, your local sign-in info is cleared and you are signed out cleanly.

### Upgrade notes

- This version requires a recent version of the DooTask main app; on older versions the app store will refuse to install, so please upgrade the main app first.
- The smart handbook lookup needs a recent version of the main app's data service; on older versions it is turned off automatically and normal AI chat is unaffected—upgrade the main app if you want to enable it.
- If you previously installed the old standalone "DooTask MCP" plugin, you can uninstall it from the app store after upgrading; all of its capabilities are now built in, so nothing is lost.
