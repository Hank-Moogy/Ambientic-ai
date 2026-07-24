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

Provider filters should remain compact, icon-led, and softly illuminated in each provider’s accent. They organize attention without turning the sidebar into a toolbar.

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
