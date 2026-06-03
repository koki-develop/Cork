## ADDED Requirements

### Requirement: Column header is draggable for reordering
The system SHALL allow users to drag a column header horizontally to reorder it among other columns. The drag handle SHALL be the grip icon (`GripVertical`) in the column header.

#### Scenario: Drag column to new position
- **WHEN** user grabs the grip icon of a column and drags it to a gap between two other columns
- **THEN** the columns visually reorder to reflect the new position while dragging
- **AND** the column snaps to the new position when released

#### Scenario: Drag handle is activated by grip icon only
- **WHEN** user clicks or drags on the column title, task count badge, or card area
- **THEN** column reordering does NOT activate (only the grip icon triggers it)

### Requirement: Column order is persisted
The system SHALL save the new column order to the backend store when a column drag ends.

#### Scenario: Persist on drag end
- **WHEN** user releases a column after dragging it to a new position
- **THEN** the `save_statuses` command is invoked with the updated status order
- **AND** the new order persists across page reloads

### Requirement: Card drag-and-drop continues to work alongside column reordering
The existing card drag-and-drop behavior SHALL remain functional and unaffected by column reordering support.

#### Scenario: Card drops on column are unaffected
- **WHEN** user drags a card and drops it on a column
- **THEN** the card moves to that column's status as before
- **AND** column reordering does NOT interfere with card operations

#### Scenario: Simultaneous operations are not possible
- **WHEN** user is dragging a column
- **THEN** card dragging is disabled for the duration
- **AND** when user is dragging a card, column dragging is disabled

### Requirement: Settings panel retains arrow button reordering
The Settings panel SHALL continue to support up/down arrow button reordering as a secondary method.

#### Scenario: Settings reordering unchanged
- **WHEN** user opens Settings and clicks up/down arrows on a status row
- **THEN** the status order updates in the editing list
- **AND** saving from Settings persists the order via `save_statuses`
