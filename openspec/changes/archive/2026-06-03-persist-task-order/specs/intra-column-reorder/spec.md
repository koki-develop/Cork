## ADDED Requirements

### Requirement: Cards can be reordered within the same column

The board SHALL allow the user to drag a card to a new position within the same column. The new position SHALL be visually indicated during dragging. When dropped, the new order SHALL be persisted via `update_task_order` (with `renumber_tasks` as fallback).

#### Scenario: Intra-column card reorder

- **WHEN** user drags a card to a different position within the same column
- **THEN** the card SHALL appear at the new position in the column

#### Scenario: Order persisted after intra-column reorder

- **WHEN** user drops a card in a new position within the same column
- **THEN** `update_task_order` SHALL be called with the task's path and the new midpoint order value (falling back to `renumber_tasks` on precision exhaustion)

### Requirement: Cross-column move preserves insertion position

When a card is moved to a different column, the card SHALL be inserted at the position where it was dropped (not appended to the end). The order of both source and destination columns SHALL be persisted.

#### Scenario: Card moved to specific position in another column

- **WHEN** user drags a card from column A to the middle of column B
- **THEN** the card SHALL appear at that position in column B
- **AND** `update_task_order` SHALL be called with the moved task's path and the midpoint order value in column B. If column A's order changed (e.g. removing the last remaining task), `renumber_tasks` or the midpoint of its new neighbors SHALL be used as appropriate

### Requirement: Drop position is visually indicated

The column SHALL show a visual highlight when a card is being dragged over it, indicating where the card will be placed. The highlight SHALL use the existing `isCardDropTarget` styling (accent-colored background and ring).

#### Scenario: Visual feedback on drop target

- **WHEN** user drags a card over a column
- **THEN** the column SHALL show the `isCardDropTarget` visual styling
- **AND** the card SHALL display a reduced opacity (`opacity-50`) while being dragged
