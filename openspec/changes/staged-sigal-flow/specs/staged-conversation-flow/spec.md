## ADDED Requirements

### Requirement: Staged flow runtime
The system SHALL execute outbound calls using a **staged linear flow** when the active published flow is configured as `flowType: "staged"`. Each call SHALL persist `currentStageId` and advance only according to stage rules.

#### Scenario: Call starts at stage one
- **WHEN** an outbound call connects and the active flow is staged
- **THEN** the runtime speaks stage `opening` and enters listen mode for that stage

#### Scenario: Stage index persisted
- **WHEN** the runtime advances from stage `opening` to stage `ask_tv_count`
- **THEN** `currentStageId` on the call record is updated to `ask_tv_count`

### Requirement: One question per qualification stage
The runtime SHALL speak `ask_tv_count` and `ask_internet_type` as **separate turns**. It SHALL NOT combine both questions in one utterance or advance to the internet question before receiving a TV-count answer.

#### Scenario: TV count only on stage two
- **WHEN** the runtime enters stage `ask_tv_count`
- **THEN** the AI speaks only the TV-count question and waits for a numeric answer

#### Scenario: Internet question only after TV count
- **WHEN** the customer provides a TV count on stage `ask_tv_count`
- **THEN** the runtime advances to `ask_internet_type` and speaks only the internet-infrastructure question

### Requirement: TV count qualification stage
After opening, the runtime SHALL speak stage `ask_tv_count` and advance only when the customer provides a numeric TV count.

#### Scenario: Ask TV count
- **WHEN** the runtime enters stage `ask_tv_count`
- **THEN** the AI speaks "על מנת שנוכל להתאים לך את החבילה המשתלמת ביותר נשמח לדעת כמה טלויזיות יש לך בבית"

#### Scenario: Advance on numeric answer
- **WHEN** the customer answers with a number (e.g., "שתיים", "2", "שלוש טלויזיות") on stage `ask_tv_count`
- **THEN** the runtime classifies `provide_tv_count`, stores the extracted count on the call context, and advances to `ask_internet_type`

### Requirement: Internet type qualification stage
The runtime SHALL speak stage `ask_internet_type` and branch into a named sub-flow based on the customer's internet infrastructure answer.

#### Scenario: Ask internet type
- **WHEN** the runtime enters stage `ask_internet_type`
- **THEN** the AI speaks "איזו תשתית אינטרנט יש לך בבית? רגיל, סיבים או לא יודע?"

#### Scenario: Branch on regular internet
- **WHEN** the customer answers "רגיל" on stage `ask_internet_type`
- **THEN** the runtime enters sub-flow `fiber_eligibility_check`

#### Scenario: Branch on unknown or no internet
- **WHEN** the customer answers "לא יודע" or "אין לי אינטרנט" on stage `ask_internet_type`
- **THEN** the runtime enters sub-flow `no_internet_flow`

#### Scenario: Branch on fiber internet
- **WHEN** the customer answers "סיבים" on stage `ask_internet_type`
- **THEN** the runtime enters sub-flow `fiber_exists_flow`

### Requirement: Fiber eligibility address collection
Sub-flow `fiber_eligibility_check` SHALL begin by asking for the customer's full address to check fiber availability.

#### Scenario: Collect address for fiber check
- **WHEN** the runtime enters sub-flow `fiber_eligibility_check`
- **THEN** the AI speaks "נשמח לבדוק עבורך היתכנות לתשתית סיבים אצלך בכתובת, מה הכתובת שלך (עיר, רחוב, מספר בית, וכניה אם יש)"

#### Scenario: Store address from customer
- **WHEN** the customer provides an address on stage `collect_address`
- **THEN** the runtime classifies `provide_address`, stores address text on the call context, and proceeds within the sub-flow per its advance rules

### Requirement: Global repeat on confusion
At any interruptible stage, if the customer says they did not understand (e.g., "לא הבנתי", "מה?"), the runtime SHALL re-speak the **last agent statement** for that stage and remain on the same stage.

#### Scenario: Repeat TV count question
- **WHEN** the customer says "לא הבנתי" during stage `ask_tv_count`
- **THEN** the AI repeats the TV-count question and stays on `ask_tv_count`

#### Scenario: Repeat internet type question
- **WHEN** the customer says "מה?" during stage `ask_internet_type`
- **THEN** the AI repeats the internet-type question and stays on `ask_internet_type`

### Requirement: Sub-flow runtime
The staged engine SHALL support named `subflows` entered via stage `branchOn` mappings. Each call SHALL persist `currentSubflowId` (nullable) alongside `currentStageId`.

#### Scenario: Enter sub-flow from branch
- **WHEN** stage `ask_internet_type` branches to `fiber_eligibility_check`
- **THEN** `currentSubflowId` is set to `fiber_eligibility_check` and `currentStageId` is set to that sub-flow's first stage

### Requirement: Fiber availability outcome
After address collection, the system SHALL check fiber availability at the address and speak the appropriate announcement before offering speed tiers.

#### Scenario: Fiber available at address
- **WHEN** fiber lookup returns available for the collected address
- **THEN** the AI speaks that fiber is available at the address and proceeds to `offer_fiber_speed`

#### Scenario: Fiber not available at address
- **WHEN** fiber lookup returns unavailable
- **THEN** the AI speaks that fiber is not currently available and proceeds to `offer_regular_speed` with 100MB or 200MB options

### Requirement: Speed tier selection
The runtime SHALL offer fiber speeds (300MB, 600MB, 1GB) or regular speeds (100MB, 200MB) based on the customer's infrastructure path, and store the selected speed on call context.

#### Scenario: Select fiber gigabit
- **WHEN** the customer chooses 1GB on `offer_fiber_speed`
- **THEN** classification returns `select_speed_1000` and the call advances to `ask_current_provider`

### Requirement: No internet sub-flow
Sub-flow `no_internet_flow` SHALL acknowledge no home internet and merge into the shared `sales_path` to build a new package offer.

#### Scenario: No internet entry
- **WHEN** the customer indicated no internet on `ask_internet_type`
- **THEN** the AI speaks an acknowledgment and enters `sales_path`

### Requirement: Fiber exists sub-flow
Sub-flow `fiber_exists_flow` SHALL skip address collection and proceed directly to fiber speed selection.

#### Scenario: Existing fiber skips address
- **WHEN** the customer answered "סיבים" on `ask_internet_type`
- **THEN** the runtime does not ask for address and proceeds to `offer_fiber_speed`

### Requirement: Current provider and price qualification
Shared stage `sales_path` SHALL ask for the customer's current internet provider and monthly price before presenting the tailored package.

#### Scenario: Ask current provider
- **WHEN** the runtime enters `ask_current_provider`
- **THEN** the AI asks which provider the customer has today (Bezeq, HOT, Partner, Cellcom, or other)

#### Scenario: Ask current price
- **WHEN** the customer names a provider
- **THEN** the AI asks how much they pay today for their package

### Requirement: Package offer and add-ons
The runtime SHALL present a triple or double package with price from sales configuration, then offer optional add-ons (VOD, sports, extras).

#### Scenario: Present triple package
- **WHEN** the runtime reaches `offer_package` with TV count and selected speed
- **THEN** the AI presents a triple package pitch with configured monthly price

#### Scenario: Offer add-ons
- **WHEN** the customer accepts or acknowledges the base package
- **THEN** the AI asks about VOD, sports channels, and additional services

### Requirement: Summary and callback close
The runtime SHALL summarize the selected package and price, ask if a representative should call back for installation scheduling, and set contact status accordingly.

#### Scenario: Customer agrees to callback
- **WHEN** the customer agrees on `ask_callback`
- **THEN** the AI speaks "מעולה, נציג יחזור אלייך בהקדם. יום נעים!", ends the call, and sets contact status to `callback`

### Requirement: Sales path one question per stage
Each stage in `sales_path` (`offer_fiber_speed`, `ask_current_provider`, `ask_current_price`, `offer_package`, `ask_addons`, `present_summary`, `ask_callback`) SHALL be spoken alone with `waitForAnswer: true`. The runtime SHALL NOT combine multiple sales-path questions in one utterance.

#### Scenario: Speed question only after fiber ack
- **WHEN** the customer acknowledges `fiber_exists_ack` and the runtime advances to `offer_fiber_speed`
- **THEN** the AI speaks only the speed question and waits for a speed selection

#### Scenario: Provider question only after speed
- **WHEN** the customer selects a speed on `offer_fiber_speed`
- **THEN** the AI speaks only the current-provider question on `ask_current_provider`

#### Scenario: Customer declines callback
- **WHEN** the customer declines on `ask_callback`
- **THEN** the AI thanks the customer politely and ends the call without setting `callback` status

### Requirement: Stage speak script
Each stage SHALL define a Hebrew `speakText` template with variables `{{customer_first_name}}`, `{{customer_family_name}}`, and `{{agent_name}}` (default "סיגל").

#### Scenario: Opening stage script
- **WHEN** stage `opening` is spoken for contact "דוד כהן"
- **THEN** the utterance includes greeting by name, Sigal as digital YES assistant, prior-interest hook, pricing/gift mention, opt-out instruction ("הסר"), and permission to ask questions at any stage

### Requirement: Stage advance rules
Each stage SHALL declare `advanceOn` intent IDs and optional `silenceAdvanceSec`. The runtime SHALL advance to the next stage only when a matching intent is classified or silence advance is triggered per configuration.

#### Scenario: Advance on offer question
- **WHEN** the customer is on stage `opening` and says "מה ההצעה"
- **THEN** the runtime classifies `ask_offer` and advances to the next stage

#### Scenario: Advance on silence
- **WHEN** the customer is on stage `opening`, `silenceAdvanceSec` is configured, and no speech is detected within that window
- **THEN** the runtime advances to the next stage

### Requirement: Opt-out stage handler
If the customer says "הסר" (or equivalent opt-out intent) at any interruptible stage, the runtime SHALL speak "תודה רבה ויום נעים", end the call, and SHALL NOT advance to further stages.

#### Scenario: Opt-out during opening
- **WHEN** the customer says "הסר" during stage `opening`
- **THEN** the AI speaks "תודה רבה ויום נעים" and the call ends
