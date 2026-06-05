## ADDED Requirements

### Requirement: Card is draggable

Every card on the board SHALL be draggable using mouse/touch or keyboard.

#### Scenario: Pick up a card with mouse

- **WHEN** the user mousedowns on a card and starts moving the mouse
- **THEN** the card lifts visually (shadow/elevation) and follows the cursor as a ghost overlay

#### Scenario: Pick up a card with keyboard

- **WHEN** the user focuses a card and presses Space or Enter
- **THEN** the card enters a "drag" state and subsequent arrow key presses move it between columns

### Requirement: Column is a drop target

Every column on the board SHALL act as a valid drop target for dragged cards.

#### Scenario: Column highlights on hover during drag

- **WHEN** a card is being dragged and the cursor (or keyboard focus) enters a column
- **THEN** that column shows a visual highlight (background change or border indicator)

#### Scenario: Drop card into different column

- **WHEN** the user drops a card into a column with a different status than the card's current status
- **THEN** the task's status SHALL be updated via `invoke("update_task_status", { path: cardId, status: newStatus })`

#### Scenario: Drop card into the same column

- **WHEN** the user drops a card into the column it was already in
- **THEN** no status update SHALL occur

### Requirement: Board refreshes after drop

After a successful drop that changes a card's status, the board SHALL refresh to reflect the new arrangement.

#### Scenario: Board re-renders after status change

- **WHEN** a card is dropped into a different column and the status update succeeds
- **THEN** `onStatusChange()` SHALL be called, triggering `loadTasks()` to re-fetch all tasks

### Requirement: Visual feedback during drag

The system SHALL provide visual feedback during the entire drag operation.

#### Scenario: Ghost card follows cursor

- **WHEN** a card is being dragged
- **THEN** a semi-transparent copy of the card (ghost) SHALL follow the cursor in real time

#### Scenario: Original position shows placeholder

- **WHEN** a card is lifted and dragged away from its original position
- **THEN** the original position SHALL show a placeholder or the remaining cards reflow to fill the gap

### Requirement: Existing buttons preserved

The existing "Move to {status}" buttons on each card SHALL remain functional as an alternative to drag-and-drop.

#### Scenario: Button click still works

- **WHEN** the user clicks a "Move to {status}" button on a card
- **THEN** the status SHALL update as before, with no interference from the drag-and-drop library

### Requirement: Keyboard accessibility

Cards SHALL be draggable using keyboard navigation alone, meeting WCAG 2.1 AA criteria.

#### Scenario: Keyboard drag to another column

- **WHEN** the user focuses a card, presses Space/Enter to pick it up, uses arrow keys to move to another column, and presses Space/Enter to drop
- **THEN** the task status SHALL update to the target column's status

#### Scenario: Cancel keyboard drag

- **WHEN** the user picks up a card with the keyboard and presses Escape
- **THEN** the drag SHALL cancel and the card SHALL return to its original position
