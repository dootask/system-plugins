### Added

- The model list now supports hiding models (kept in config but hidden from end users), with bulk show / hide of selected models.
- Automatically and incrementally sync official Doo AI models after login, account claim, refresh, or subscription changes (add-only).
- Added a "Doubao" vendor category in the fetch-models dialog.

### Improved

- Wider model editor drawer; its "Save" now writes directly to the database (model list and default model).
- A model's MCP assignments are now edited inside the drawer and applied only after "Save".

### Fixed

- Fixed the model's MCP picker popover closing after toggling a selection.

### Changed

- MCP management no longer special-cases the DooTask built-in MCP; it is handled the same as custom MCPs.
