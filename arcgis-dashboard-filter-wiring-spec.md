# ArcGIS Dashboard Filter Wiring Specification (DSH-02)

## Purpose

Define exact filter behavior, targets, and validation checks for ArcGIS Online Dashboard Phase 1.

## Global Selectors

All selectors are placed in the header bar and must drive all dependent widgets unless explicitly noted.

### Selector S1: Event

- Field: `event_id`
- Control: single-select
- Required: yes
- Default behavior:
  - No event selected: suppress summary totals and show "Select an event" placeholder.
  - Event selected: activate all downstream widgets.

Targets:

- Leadership summary cards
- Heat map layer filter
- Hazard comparison panel
- District drill-down table
- Notification trace panel

### Selector S2: Hazard

- Field: `hazard_type`
- Control: multi-select
- Required: no
- Constraint: must support at least two concurrent selections.
- Default behavior:
  - Empty selection means "all hazards for selected event".

Targets:

- Leadership summary cards (what/how-many)
- Heat map layer values
- Hazard comparison panel (combined and per-hazard)
- District drill-down table

### Selector S3: District

- Field: `district`
- Control: multi-select
- Required: no
- Default behavior:
  - Empty selection means "all districts for selected event".

Targets:

- Leadership summary cards
- Heat map extent/highlight
- Hazard comparison panel
- District drill-down table
- Notification trace panel

### Selector S4: Confidence State

- Field: `confidence_state`
- Control: multi-select
- Allowed values: `potential`, `reported`, `confirmed`
- Required: no
- Default behavior:
  - Empty selection means include all confidence states.

Targets:

- Leadership summary cards
- Heat map values and badges
- Hazard comparison panel
- District drill-down table

### Selector S5: Time Window

- Field(s): derived from `latest_update_utc` or equivalent event timestamp field
- Control: single-select
- Allowed values: `6h`, `12h`, `24h`, `72h`
- Required: no
- Default: `24h`

Targets:

- Leadership summary cards
- Heat map values
- Hazard comparison panel
- District drill-down table
- Notification trace recency indicators

## Cross-Widget Interaction Rules

### R1: Map click to drill-down

- Trigger: user clicks/selects one district in heat map.
- Action:
  - Apply district filter to drill-down table.
  - Update notification trace panel to selected district context.
  - Preserve active event/hazard/confidence/time filters.

### R2: Drill-down row selection to trace panel

- Trigger: user selects a row in district table.
- Action:
  - Update trace panel fields (`everbridge_notification_id`, `source_system`, `latest_update_utc`).

### R3: Hazard overlap state

- Trigger: selected hazards intersect.
- Action:
  - Show overlap-risk indicator (`low`, `medium`, `high`).
  - Keep combined and per-hazard totals visible.
  - If deconfliction status missing/unknown, mark totals as provisional.

## Filter Matrix

| Widget | S1 Event | S2 Hazard | S3 District | S4 Confidence | S5 Time Window | Additional Interaction |
| --- | --- | --- | --- | --- | --- | --- |
| Who card | Required | Yes | Yes | Yes | Yes | None |
| What card | Required | Yes | Yes | Yes | Yes | None |
| Where card | Required | Yes | Yes | Yes | Yes | None |
| How-many cards | Required | Yes | Yes | Yes | Yes | None |
| Heat map | Required | Yes | Yes | Yes | Yes | Click -> drill-down |
| Hazard comparison | Required | Yes | Yes | Yes | Yes | Show overlap/provisional states |
| District table | Required | Yes | Yes | Yes | Yes | Row select -> trace panel |
| Notification trace panel | Required | Indirect | Yes | Indirect | Yes | Updated by map/table selection |

## Validation Checklist (DSH-02 Exit)

1. With no `event_id` selected, summary cards and details do not show stale totals.
2. Selecting one event updates all widgets within expected dashboard refresh latency.
3. Selecting two hazards changes heat map, comparison, and table consistently.
4. District multi-select updates all widgets and narrows trace context.
5. Confidence-state filter changes card/map/table values in sync.
6. Time-window changes update counts and latest-update indicators.
7. Heat-map click updates district table and trace panel.
8. Overlap conditions show risk and provisional labels where required.

## Day 1 Build Order

1. Configure S1 Event and wire all targets.
2. Configure S2 Hazard and verify multi-select behavior.
3. Configure S3 District and map click behavior.
4. Configure S4 Confidence state.
5. Configure S5 Time window.
6. Execute validation checklist and record defects.
