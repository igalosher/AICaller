# agent-config-versioning Specification

## Purpose
Immutable version history for agent configuration: every manual save or restore appends a snapshot; operators can list, preview, and restore prior versions on the **סוכן** page.

## Requirements

### Requirement: Immutable agent config versions
The system SHALL append an immutable `AgentConfigVersion` record whenever an operator explicitly saves agent settings (**שמור הגדרות סוכן**) or restores a previous version.

#### Scenario: Save creates version
- **WHEN** an operator clicks **שמור הגדרות סוכן** with valid config fields
- **THEN** the active config is updated and a new version row is stored with monotonically increasing `versionNumber` and `source` `manual_save`

#### Scenario: Restore creates version
- **WHEN** an operator restores version N from history
- **THEN** the active config becomes the snapshot from version N and a new version row is appended with `source` `restore`

### Requirement: List and preview versions
The Agent page SHALL list historical versions (newest first) with timestamp, version number, optional label, and source.

#### Scenario: Version list
- **WHEN** an operator opens the version history control on **סוכן**
- **THEN** at least the 20 most recent versions are listed with Hebrew-formatted dates

#### Scenario: Preview before restore
- **WHEN** an operator selects a historical version
- **THEN** the UI shows a read-only preview of mission, limits, policies, and opening template from that snapshot

### Requirement: Restore previous version
Operators SHALL be able to restore any historical version as the active agent configuration.

#### Scenario: Restore applies config
- **WHEN** an operator confirms restore on version N
- **THEN** `AppSettings.agentConfigJson` matches version N's snapshot and subsequent agent calls use the restored instructions

#### Scenario: Restore does not delete history
- **WHEN** an operator restores an older version
- **THEN** all prior version rows remain queryable; restore does not mutate historical rows

### Requirement: Initial version backfill
On first deploy after this capability ships, if no versions exist but active config is present, the system SHALL create version `1` from the current active config.

#### Scenario: Backfill on empty history
- **WHEN** the server starts and `AgentConfigVersion` is empty while `agentConfigJson` is non-empty
- **THEN** version `1` is created automatically with `source` `manual_save`
