### Added

- Administrators can void unfinished approvals with a required reason, preserving forms, attachments, and approval history; voided records are excluded from statistics and default exports, but remain available for audit exports.
- Administrators can upload local ZIP or legacy DB backups and restore them after confirmation, with backup validation, an automatic safety backup, and rollback attempted if restoration fails.

### Fixed

- Added signers can now approve or reject their pending tasks instead of seeing only the comment option.

### Changed

- The default single-attachment limit is now 10MB instead of 20MB, configurable from 1 to 200MB during installation; existing installations without this setting also use 10MB, while existing attachments are unaffected.

### Improved

- Application and comment attachments are checked against the configured limit before uploading, with file-specific error messages and independent server-side validation.
