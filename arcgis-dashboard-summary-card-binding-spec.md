# ArcGIS Dashboard Summary Card Binding Specification (DSH-03)

## Purpose

Define exact card-to-data bindings and reconciliation rules for the leadership summary row.

## Source Contract

All bindings in this spec map to the leadership response contract in `integration-api-contracts.md` section 5.

## Summary Row Cards

| Card ID | Card Label | Contract Path | Type | Notes |
| --- | --- | --- | --- | --- |
| C1 | Potentially Affected Members | `whoWhatWhereHowMany.who.potentiallyAffectedMembers` | Number | Display as whole number with thousands separators |
| C2 | Reported Members | `whoWhatWhereHowMany.who.reportedMembers` | Number | Optional secondary who metric |
| C3 | Active Hazards | `whoWhatWhereHowMany.what.hazards` | Count | Show count, optionally list selected hazards |
| C4 | Active Notifications | `whoWhatWhereHowMany.what.activeNotifications` | Number | Should align with trace panel context |
| C5 | Impacted Districts | `whoWhatWhereHowMany.where.districts` | Count | Count of districts represented in current filter context |
| C6 | Overlap Districts | `whoWhatWhereHowMany.where.overlapDistricts` | Count | If >0, show overlap badge |
| C7 | Unaccounted For | `whoWhatWhereHowMany.howMany.unaccountedFor` | Number | Primary leadership accountability metric |
| C8 | Needing Help | `whoWhatWhereHowMany.howMany.needingHelp` | Number | Primary support metric |
| C9 | Needing Help Contacted | `whoWhatWhereHowMany.howMany.needingHelpContacted` | Number | Follow-up completion metric |
| C10 | Confidence State | `confidence.state` | Enum | Values: potential/reported/confirmed |
| C11 | Generated Timestamp | `generatedAtUtc` | DateTime | Display in UTC and local timezone if needed |

## Reconciliation Rules

1. District reconciliation baseline

   - Aggregate `districtDetails[].counts` values for:
     - `unaccountedFor`
     - `needingHelp`
     - `needingHelpContacted`

1. Deconflicted mode (strict)

   - If `deduplication.overlapDeconflicted = true`, card totals C7-C9 must equal district aggregate totals.

1. Provisional mode (non-strict)

   - If `deduplication.overlapDeconflicted = false`:
     - Allow mismatch between C7-C9 and district aggregate totals.
     - Require a visible provisional/overlap warning in dashboard UI.

1. Confidence visibility

   - Confidence card C10 must remain visible whenever any of C7-C9 are shown.

## Formatting Rules

- Numeric cards: no decimals, use grouped thousands.
- Zero values must render as `0`, never blank.
- Null/unknown values render as `N/A` with tooltip indicating source gap.

## Validation Commands

Use local validators before publishing dashboard changes:

```powershell
npm run dashboard:validate-contract -- <path-to-response-json>
npm run dashboard:validate-summary-cards -- <path-to-response-json>
```

## DSH-03 Exit Checklist

- C1 through C11 are configured and render from contract paths.
- C7-C9 reconciliation passes for deconflicted payloads.
- Provisional mode warning is visible when deconfliction is false.
- Confidence state is visible and consistent with filter context.
