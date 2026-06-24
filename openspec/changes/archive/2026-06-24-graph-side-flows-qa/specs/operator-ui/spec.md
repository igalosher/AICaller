## ADDED Requirements

### Requirement: OpenAI balance indicator
The application header SHALL display an OpenAI balance or billing-status badge near the logo, refreshing periodically when an API key is configured.

#### Scenario: Balance available
- **WHEN** OpenAI billing data is available for the configured API key
- **THEN** the header shows the approximate USD balance

#### Scenario: Balance unavailable
- **WHEN** no reliable balance API is available for the configured key
- **THEN** the header shows a link to the OpenAI billing dashboard with Hebrew label

#### Scenario: No API key configured
- **WHEN** no OpenAI API key is saved in settings
- **THEN** the header shows a Hebrew prompt to configure OpenAI in settings
