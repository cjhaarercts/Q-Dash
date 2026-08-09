# ArcGIS Dashboard District Heat Map Wiring Specification (DSH-04)

## Purpose

Define the DSH-04 district heat map widget configuration, fixed buckets, metric toggle behavior, and drill-down interaction contract.

## Source Contract

Map data is sourced from leadership response section 5 in `integration-api-contracts.md`:

- `heatMap.metric`
- `heatMap.buckets[]`
- `heatMap.districtValues[]`
- `districtDetails[]`
- `deduplication.*`

## Widget Set

| Widget ID | Widget Type | Data Source | Notes |
| --- | --- | --- | --- |
| HM1 | Choropleth map | `heatMap.districtValues[]` + district polygons | One row per district |
| HM2 | Bucket legend | `heatMap.buckets[]` | Fixed boundaries from contract |
| HM3 | Metric toggle | virtual selector | Allowed metrics listed below |
| HM4 | District selection bridge | map click action | Drives drill-down table and trace panel |

## Supported Metrics

Metric toggle options must be exactly:

- `unaccountedFor`
- `needingHelp`
- `needingHelpContacted`

`heatMap.metric` must be one of the options above.

## Bucket Rules

1. Buckets must be ordered by ascending `min`.
2. Buckets must be contiguous with no gaps:
   - each next bucket `min` must equal previous `max + 1`
3. Bucket `min` and `max` values must be integers with `max >= min`.
4. Labels should be stable and human-readable (`0`, `1-5`, `6-20`, `21+`).

## District Value Rules

1. Every `heatMap.districtValues[].district` must appear in `districtDetails[].district`.
2. Every district value must include counts for all supported metrics.
3. `confidenceState` must be one of:
   - `potential`
   - `reported`
   - `confirmed`
4. `overlapRisk` must be one of:
   - `none`
   - `low`
   - `medium`
   - `high`

## Metric Integrity Rules

For each district in `heatMap.districtValues[]`, the `counts` object must match the corresponding district in `districtDetails[].counts` for:

- `unaccountedFor`
- `needingHelp`
- `needingHelpContacted`

## Interaction Wiring

1. Selector to map:
   - `event_id` required filter applies before map render.
   - hazard, district, confidence, and window selectors constrain map rows.
2. Map to downstream widgets:
   - clicking district polygon sets district filter context.
   - selection updates district drill-down table and notification trace panel.
3. No event selected behavior:
   - map must render neutral empty state, not stale district totals.

## Provisional/Overlap Behavior

- If `deduplication.overlapDeconflicted = false`:
  - display a provisional/overlap banner near map title.
  - continue rendering map using provided counts.

## Validation Commands

```powershell
npm run dashboard:validate-contract -- <path-to-response-json>
npm run dashboard:validate-heatmap -- <path-to-response-json>
```

## DSH-04 Exit Checklist

- Metric toggle supports all three required metrics.
- Bucket ranges are fixed, contiguous, and stable.
- District-level counts reconcile between heat map and drill-down payload.
- District click action updates drill-down and trace widgets.
- Provisional overlap banner appears when deconfliction is false.
