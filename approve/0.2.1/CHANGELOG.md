### Template import

- **Added**: A new "Import Templates" entry at the end of the tabs on the new-template page. The dialog lets you multi-select built-in preset templates, with select-all / deselect-all per category, and creates them in bulk before returning to the template list.
- **Added**: Template names are localized to the current UI language on import (English names in an English UI, Chinese kept in a Chinese UI); presets sharing a name with existing templates are flagged as "Exists" and require confirmation before importing.
- **Fixed**: Environments that migrated legacy data and therefore skipped first-launch seeding were missing the default system templates; they can now be restored anytime via "Import Templates".
