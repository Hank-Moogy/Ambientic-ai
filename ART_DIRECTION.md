# Ambientic art direction

This document is the durable creative reference for Ambientic. Revisit it whenever a material interface, motion, sound, lighting, or hardware-expression decision is made.

## The feeling

Ambientic should feel **fluid, aerial, calm, and quietly alive**—closer to ambient music and reflected light than to a dense operations dashboard. It is a place where many agents can be active without making the user feel surrounded by alarms.

The experience should suggest:

- Light moving through mist, water, or translucent material.
- Slow breathing and drifting rather than bouncing or snapping.
- A deep, cool atmosphere with selective green, blue, violet, and soft neutral light.
- Moments of digital texture or glitch used as punctuation, never constant noise.
- Physical and screen interfaces behaving like two surfaces of the same instrument.

## Interaction principles

1. **Calm by default.** Persistent motion is slow, low-contrast, and safe to ignore.
2. **Responsive under the hand.** Direct actions answer immediately, then settle with soft easing.
3. **Meaning survives the mood.** Green running, red needs-input, and blue idle remain unambiguous. Expressive sequences are temporary and always restore operational state.
4. **Depth without fog.** Translucency, bloom, and gradients create atmosphere, but text and controls retain strong contrast.
5. **Rhythm over spectacle.** Animation should have phrasing, rests, and variation. Avoid uniform loading-spinner motion.
6. **One instrument.** MIDI light, on-screen motion, preview transitions, and future sound should share timing and color language.
7. **Permission under the hand.** Protected folders, microphone capture, screen preview, and external surfaces are touched only after an explicit user action. Background ambience must never create a macOS permission surprise.

Provider filters should remain compact, icon-led, and softly illuminated in each provider’s accent. They organize attention without turning the sidebar into a toolbar.

Overview provider cards are portals into existing work, not shortcuts for silently creating new tasks. Each card reserves a calm upper identity row: the provider artwork sits to the left while its name and state form a separate text block, and usage metrics remain isolated below. Marks must never overlap a provider label or status. Provider-supplied artwork may replace a generic glyph on this surface when it remains legible in the provider accent; selecting the card transitions directly into that provider’s freshest thread field with the matching filter already illuminated.

## Identity mark

Ambientic’s primary mark is the supplied orbital-circle artwork: nested paths around a central core with one satellite point. It expresses the product as a calm field connecting multiple agents, tools, and physical controls.

- Use the mark itself, not letter substitutes, for the app icon, onboarding focal object, workspace brand, loading state, and compact controller identity.
- Preserve the artwork’s proportions and circular geometry. Never stretch, redraw, or add provider colors inside it.
- On dark interfaces, place the black mark on a quiet cool-white surface so it remains legible; surrounding bloom may use Ambientic’s blue, violet, and green atmosphere.
- Motion may orbit or breathe around the mark, but the artwork itself should remain stable and crisp.
- Small system icons use a padded square derived from the same supplied source rather than a separate symbol.

## Motion and light language

- Ambient cycles: roughly 6–16 seconds.
- Interface transitions: roughly 180–500 ms with gentle acceleration and a long settle.
- Hardware expressions: layered waves at different speeds, sparse deterministic glitches, cool color fields, and a clean return to task-state lighting.
- Prefer spatial waves, opacity drift, blur, and subtle parallax.
- Respect reduced-motion preferences and never obscure an approval or urgent task state for long.

## First expression: Vibe

The Overview **Vibe** button (or ⌘⇧V) cycles through two temporary lighting studies across the connected APC grid:

1. **Center wave** — a cold blue, violet, cyan, and green pulse radiates from the center toward the edges.
2. **Cold orbit** — cool-color rings rotate around the grid with layered angular motion.

The button identifies the queued and currently playing study. Ambientic sends only LEDs that actually change, allowing a higher refresh rate without saturating MIDI; slower phase movement and denser neighboring cold colors soften the discrete hardware palette. After about five seconds, Ambientic restores every live task LED and queues the next composition.

Vibe is an expressive test surface, not a task command. It must never select, start, stop, or alter an agent. The earlier hot-color Game of Life and illumination studies were removed because their hard on/off rhythm felt too stop-motion for Ambientic’s ambient direction.

## Ambient mode: a sustained field

Ambient mode keeps the Mac available for unattended agent work while the display is free to sleep. Its visual state should feel like a quiet field being held open, not an alarm or a power toggle:

- Off is neutral, compact, and unlit.
- On is unmistakable through its label plus a slow blue–violet–green hue, soft bloom, and a small green core.
- The light breathes over several seconds and never flashes. Reduced-motion users keep the same illuminated color and contrast without animation.
- The safety check-in reuses the same orbital light at a larger scale. It asks calmly whether to continue, explains that silence leaves active agents uninterrupted, and presents two equally legible exits.
- Operational meaning remains explicit in text; color and bloom reinforce state but never carry it alone.

## Goals: the living direction field

Goals are not presented as another administrative issue tracker. The landing surface is a calm campaign map: large outcome cards drift at slightly different rhythms in a deep spatial field, while progress, blockers, and the next meaningful action remain readable without opening the card.

- **Direction before activity.** Cards lead with the desired outcome, not a task count. Progress and board mechanics support the goal instead of becoming the goal.
- **Ambient, not ornamental.** Each active path has a restrained cool glow and a slow vertical drift. Hover light should feel like moving through translucent material, never like an arcade reward.
- **Operational truth remains crisp.** Blockers, ownership, target dates, definitions of done, and review states use text as well as color.
- **Execution becomes denser on demand.** Opening a goal transitions from the spacious field to a horizontally navigable board. The tighter execution view retains the same cool atmosphere without sacrificing scan speed.
- **Board cards stay quiet.** A ticket card carries only its title; its column already communicates state. Context, milestone, ownership, definition of done, and the accessible status control appear in a focused detail layer after selection.
- **Goal context is progressive.** The execution view opens with the goal name and board immediately visible. Outcome, motivation, success criteria, priority, target, lifecycle, and progress remain available through one calm disclosure instead of pushing current work below the fold.
- **Humans and agents share one board.** Ownership badges distinguish human, agent, and mixed work without making one actor visually subordinate to the other.
- **Resting work recedes.** Paused, achieved, and archived goals remain accessible in a quieter library below the active field.
- **Motion is optional.** Reduced-motion preferences remove card drift and sweeping highlights while preserving depth, hierarchy, and interaction feedback.

## First-run expression: Enter the field

Onboarding should feel like entering a quiet game world, not completing an enterprise setup checklist. It uses one full-screen decision at a time, oversized editorial type, a restrained four-step progress trace, floating symbols, and one unmistakable primary action.

- Welcome is mysterious but immediately legible: one breathing Ambientic object, one promise, one entrance.
- Identity asks only for a local display name. The input and next action are the entire interaction.
- Provider connection presents four large playable objects—Codex, Claude Code, Hermes, and Kimi—with provider color used only for identity and connection truth.
- Hardware connection visualizes the controller as an instrument waiting in darkness. Detection wakes both the on-screen grid and the real APC with the same temporary cold-water composition.
- Skipping hardware is always possible. Expressive light never blocks setup and operational green/red/blue state returns after the welcome phrase.
- Reduced-motion settings stop drifting, orbiting, and pulsing while preserving hierarchy, connection state, and every action.

The intended balance is **minimalist game introduction + ambient instrument**, never neon arcade spectacle. Large elements earn their scale by reducing choice and explaining state.

## Design review ritual

For every material UI or hardware-expression change, ask:

- Does it feel calmer and more spatial, or merely more decorated?
- Is the hierarchy still readable at a glance?
- Does motion communicate state, continuity, or atmosphere?
- Does the hardware response belong to the same visual world?
- Does the effect end cleanly and restore operational truth?
- Is reduced motion, accessibility, and low-light use respected?

Record meaningful additions or deliberate deviations in this document so the art direction evolves explicitly rather than by accident.
