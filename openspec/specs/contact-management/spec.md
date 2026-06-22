# contact-management Specification

## Purpose
TBD - created by archiving change yes-ai-sales-caller. Update Purpose after archive.
## Requirements
### Requirement: Closed contact list
The system SHALL maintain a closed contact list. Contacts SHALL only be added, edited, or removed by operators through the application. There SHALL be no public or external self-registration.

#### Scenario: Operator adds a contact
- **WHEN** an operator enters a valid name and phone number and saves
- **THEN** the contact appears in the contact list with status "pending"

#### Scenario: Duplicate phone number rejected
- **WHEN** an operator attempts to add a contact with a phone number already in the list
- **THEN** the system rejects the save and displays a Hebrew error message

### Requirement: Contact fields
Each contact SHALL store at minimum: full name (Hebrew), phone number (Israeli format), sale status, last call date, notes, and created/updated timestamps.

#### Scenario: Contact record structure
- **WHEN** a contact is created or viewed
- **THEN** all required fields are present and editable (except timestamps)

### Requirement: Sale status tracking
Each contact SHALL have one of the following sale statuses: `pending`, `in_call`, `sold`, `callback`, `refused`.

#### Scenario: Mark contact as sold
- **WHEN** an operator or the AI flow marks a contact as sold after a successful sale
- **THEN** the contact status updates to `sold` and the sale timestamp is recorded

#### Scenario: Mark contact as refused
- **WHEN** a customer refuses the offer or requests no further calls
- **THEN** the contact status updates to `refused` and the contact SHALL NOT be included in bulk or automatic call queues

#### Scenario: Refused contacts excluded from calling
- **WHEN** an operator initiates a bulk call or "call next" action
- **THEN** contacts with status `refused` are skipped

### Requirement: Contact CRUD operations
Operators SHALL be able to create, read, update, and delete contacts from the Hebrew UI.

#### Scenario: Edit contact details
- **WHEN** an operator edits a contact's name or phone number and saves
- **THEN** the updated information is persisted and reflected immediately in the list

#### Scenario: Delete contact
- **WHEN** an operator confirms deletion of a contact
- **THEN** the contact is removed from the active list (soft-delete with audit log preferred)

### Requirement: Call history per contact
The system SHALL record call history for each contact including date, duration, outcome, and a link to the call transcript/summary.

#### Scenario: View call history
- **WHEN** an operator opens a contact's detail view
- **THEN** all past calls for that contact are listed in reverse chronological order

### Requirement: Contact filtering and search
Operators SHALL be able to search contacts by name or phone number and filter by sale status.

#### Scenario: Filter by refused status
- **WHEN** an operator filters the list by status `refused`
- **THEN** only refused contacts are displayed

