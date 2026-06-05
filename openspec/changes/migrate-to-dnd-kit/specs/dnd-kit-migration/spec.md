## ADDED Requirements

### Requirement: Dependency replaced

The project SHALL replace `@hello-pangea/dnd` with `@dnd-kit/react` and `@dnd-kit/helpers`.

#### Scenario: Install new dependencies

- **WHEN** `bun install` is run after adding `@dnd-kit/react` and `@dnd-kit/helpers`
- **THEN** the dependencies SHALL be resolvable and the lockfile updated

#### Scenario: Remove old dependency

- **WHEN** `@hello-pangea/dnd` is removed from `package.json`
- **THEN** `bun install` SHALL succeed and the library SHALL no longer be available at runtime

### Requirement: Card is draggable via useDraggable hook

Every card on the board SHALL be draggable using the `useDraggable` hook from `@dnd-kit/react`. The entire card body SHALL act as the drag handle (no separate handle icon).

#### Scenario: Pick up a card with mouse

- **WHEN** the user mousedowns on a card and starts moving the mouse
- **THEN** the card SHALL lift visually and follow the cursor as a ghost overlay

#### Scenario: Single click does not initiate drag

- **WHEN** the user clicks on a card without moving the mouse
- **THEN** the card SHALL NOT enter a drag state

#### Scenario: Pick up a card with keyboard

- **WHEN** the user focuses a card and presses Space or Enter
- **THEN** the card SHALL enter a drag state and subsequent arrow key presses SHALL move it between columns

#### Scenario: Cancel drag with Escape

- **WHEN** the user presses Escape during a drag
- **THEN** the drag SHALL cancel and the card SHALL return to its original position

### Requirement: Column is a droppable target via useDroppable hook

Every column on the board SHALL act as a valid drop target for dragged cards, using the `useDroppable` hook from `@dnd-kit/react`.

#### Scenario: Column accepts only cards

- **WHEN** a card is dragged over a column
- **THEN** the column SHALL accept the card and show a visual highlight

#### Scenario: Column highlights on hover during drag

- **WHEN** a card is being dragged and the cursor enters a column
- **THEN** that column SHALL show a visual highlight (via `isDropTarget`)

### Requirement: Status update on cross-column drop

When a card is dropped into a column with a different status than the card's current status, the task's status SHALL be updated via `invoke("update_task_status", { path: taskId, status: newStatus })`.

#### Scenario: Drop card into different column

- **WHEN** the user drops a card into a column with a different status
- **THEN** the system SHALL call `invoke("update_task_status", { path: cardId, status: newStatus })`

#### Scenario: Drop card into the same column

- **WHEN** the user drops a card into the column it was already in
- **THEN** no status update SHALL occur

#### Scenario: Drop outside any column

- **WHEN** the user drops a card outside any column area
- **THEN** no status update SHALL occur

### Requirement: Board refreshes after drop

After a successful drop that changes a card's status, the board SHALL refresh to reflect the new arrangement.

#### Scenario: Board re-renders after status change

- **WHEN** a card is dropped into a different column and the status update succeeds
- **THEN** the board SHALL refresh via `loadTasks()` to reflect the new arrangement

### Requirement: Cards are draggable by the entire body

No separate drag handle icon SHALL be rendered. The entire card area SHALL be the drag initiation point.

### Requirement: TypeScript compilation

The codebase SHALL compile without TypeScript errors after the migration.

#### Scenario: TypeScript build passes

- **WHEN** `bun run build` is executed
- **THEN** TypeScript compilation SHALL succeed with no errors
