## ADDED Requirements

### Requirement: Drag handle per status row

The settings panel SHALL render a visible drag handle (`GripVertical` icon) at the left side of each status row. The handle MUST be the only element that initiates a drag — the label `<input>`, the remove button, and the Add Status button MUST NOT initiate a drag.

#### Scenario: Handle is visible for every row

- **WHEN** the settings panel is opened with one or more statuses
- **THEN** each row displays a `GripVertical` handle at its left edge, with `cursor-grab` styling

#### Scenario: Input field remains fully editable

- **WHEN** the user clicks inside a status label `<input>` and drags to select text
- **THEN** native text selection occurs and no drag operation starts

#### Scenario: Remove button still removes the row

- **WHEN** the user clicks the remove (trash) button on a row
- **THEN** that row is removed from the editing list and no drag is initiated

### Requirement: Drag to reorder status rows

The user SHALL be able to reorder status rows vertically by grabbing the drag handle and dropping it at a new position. The reordering MUST update only the local editing state of the settings panel and MUST NOT persist until the user clicks Save.

#### Scenario: Dragging a row to a new position reorders the list

- **WHEN** the user drags the handle of row A and drops it below row B
- **THEN** the editing list shows row A immediately after row B, with all other rows preserving their relative order

#### Scenario: Drag does not persist on its own

- **WHEN** the user drags a row to a new position and then clicks Cancel (or closes the panel without saving)
- **THEN** the underlying status order in the workspace store is unchanged

#### Scenario: Saving persists the dragged order

- **WHEN** the user drags rows into a new order and then clicks Save
- **THEN** the new order is persisted via the existing `save_statuses` command, in the same order shown in the editing list

#### Scenario: Drag of a row with empty or duplicate label is allowed

- **WHEN** the user drags a row whose label is empty or duplicates another row's label
- **THEN** the drag completes and the row is reordered locally, with empty-label and duplicate-label validation still applied at Save time (existing behavior)

### Requirement: Removal of move-up / move-down buttons

The settings panel SHALL NOT display the `ArrowUp` (Move up) and `ArrowDown` (Move down) buttons that were previously rendered next to each status row. The associated keyboard-reachable controls and their `isFirst` / `isLast` disabled states MUST also be removed.

#### Scenario: No arrow buttons in the row

- **WHEN** the settings panel is opened
- **THEN** no row contains an `ArrowUp` or `ArrowDown` button

#### Scenario: Reordering is still possible via the drag handle

- **WHEN** the user wants to reorder statuses after the arrow buttons are gone
- **THEN** the drag handle provides the only and sufficient mechanism to reorder rows
