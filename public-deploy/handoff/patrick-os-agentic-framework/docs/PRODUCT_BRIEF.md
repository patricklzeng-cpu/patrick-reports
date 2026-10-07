# Product Brief — Artifact Room

## Product promise

Patrick OS turns one goal into an inspectable, reversible mission. The user sees the evolving artifact, not a wall of agent conversations.

## Primary user outcome

The user can start, supervise, redirect, approve, review, and recover a complex mission without opening ChatGPT, Hermes, Open Swarm, and Pi separately.

## Interaction model

The selected design is Artifact Room:

- The center displays the current artifact and its evidence.
- The bottom timeline shows how the artifact evolved.
- The right rail shows the capability relay and only decisions needing a human.
- The left rail provides stable navigation and privacy/system state.

## What the user should understand at a glance

1. What outcome is being produced?
2. How much of the acceptance contract is satisfied?
3. What is happening now?
4. What changed since the last checkpoint?
5. Does the system need a decision?
6. Can the user safely pause, reject, or roll back?

## Anti-patterns

- four chat columns
- one tab per provider
- a KPI dashboard as the primary surface
- raw logs as the default view
- fake progress percentages
- success based on agent self-report
- provider logos dominating the product
- approvals that hide commands, destinations, or shared data

## Selected demo content

Mission: `Launch the multilingual education demo`

Artifact preview: bilingual solar-system lesson.

Parallel workstreams: Web, iPad, visionOS.

Human decision: two translations may change lesson meaning.

## Visual target

Use `../assets/artifact-room-option-3.png` as the source image. Match hierarchy, density, spacing, colors, and the artifact-centered composition. Adapt components to the target repository's existing system instead of reproducing the mockup with brittle hard-coded positions.

