## ADDED Requirements

### Requirement: Toast notification outlet

The application SHALL render a sonner `<Toaster />` component at the root level so toasts are available on every page.

#### Scenario: Toaster renders on WelcomePage

- **WHEN** the user is on the WelcomePage
- **THEN** the Toaster outlet SHALL be mounted and ready to receive toasts

#### Scenario: Toaster renders on BoardPage

- **WHEN** the user is on the BoardPage
- **THEN** the Toaster outlet SHALL be mounted and ready to receive toasts

### Requirement: Toast theming

The Toaster SHALL use sonner's `theme="dark"` mode and SHALL be styled to match Cork's design tokens (`cork-bg` for background, `cork-surface` for elevated surfaces, `cork-border` for borders, `cork-text` for text, `cork-accent` for action highlights).

#### Scenario: Dark theme applied

- **WHEN** a toast is displayed
- **THEN** the toast SHALL render with dark background (`cork-bg` or `cork-surface`), muted text (`cork-muted`), and accent-colored action elements (`cork-accent`)

### Requirement: Success toast

The system SHALL display a success toast when an async user action completes successfully (e.g., task created, status reordered, task moved).

#### Scenario: Task created successfully

- **WHEN** the user creates a new task and the operation succeeds
- **THEN** a success toast SHALL appear with the message "Task created"

### Requirement: Toast auto-dismissal

Success and info toasts SHALL auto-dismiss after 3-5 seconds.

#### Scenario: Success toast auto-dismisses

- **WHEN** a success toast appears
- **THEN** it SHALL auto-dismiss within 5 seconds

### Requirement: Toast position

The Toaster SHALL be positioned at the bottom-right of the viewport.

#### Scenario: Toasts appear at bottom-right

- **WHEN** any toast is triggered
- **THEN** the toast SHALL appear in the bottom-right corner of the screen

### Requirement: Accessible toasts

Toasts SHALL use sonner's built-in ARIA live region support for screen reader announcements.

#### Scenario: Screen reader announces toast

- **WHEN** a toast appears
- **THEN** the content SHALL be announced by screen readers via ARIA live region
