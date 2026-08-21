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

Starting a task should feel like expressing intent, not configuring a runtime. The choices follow one readable current: provider, that provider's model and reasoning level, Ambientic project, then the first prompt. Model controls use the provider's own names and capabilities rather than exposing adapter detail. A safe recent real project is visibly selected by default so a new agent begins with the user's workspace, memory, goal, and task direction as one coherent unit; choosing another folder creates or reuses that unit instead of adding an independent path choice. Folderless projects and an unlinked private scratch workspace remain clearly labeled escape hatches rather than invisible defaults. The project surface should feel grounded and trustworthy without turning the modal into a setup wizard. Protected-folder notices sit beside this choice in quiet amber, naming the real macOS attribution behavior before launch.

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

## Workflows: currents of intent

The Workflow Builder is an infinite spatial field where intent moves through clear, tactile objects. It should read as a calm current rather than a technical flowchart.

- Nodes lead with human language; semantic action identifiers and permission detail appear in the inspector.
- Connections feel continuous and directional without animated noise. A dry run may illuminate one node at a time, then return the field to rest.
- Provider choice is a policy on agent nodes, not a visual fork of the entire workflow. “Best available agent” is the portable default.
- Natural language is the fastest entrance, while direct manipulation keeps the generated result inspectable and correctable.
- The workflow library is the calm shoreline before the canvas: reusable outcomes appear as tactile currents with a readable trigger, compact step trace, last-run truth, and controls that recede until needed. Run history forms a quieter adjacent stream rather than competing with creation.
- The canvas should reward spatial fluency: two-finger movement pans, pinching zooms around the gesture, and keyboard undo/delete behave like familiar creative tools.
- Space is progressive. The natural-language dock and global navigation can collapse into quiet, recoverable handles without hiding their purpose.
- Inbox, calendar, web, and other consequential capabilities always expose their permission boundary before a real run.
- Portable sharing is visible from the beginning, but the field stays private and local until the user explicitly exports it.

### Workflow packs: outcomes before topology

Installable workflow packs enter the Studio as complete outcomes, not as a wall of agent nodes. Career OS establishes the pattern: one prominent atmospheric object explains the routine, privacy boundary, and next human action; its internal workflows remain inspectable only after the user asks for them.

Workflow Studio separates ownership from discovery. **Your workflows** comes first and keeps installed routines, run state, and results together; the **Workflow catalog** follows as a quieter shelf of outcomes that can be installed. A pack may remain visible in the catalog after installation, but its controls point back to the owned workflow and result surfaces instead of creating a second operational home.

- Setup advances through one calm question field at a time, with a thin progress current rather than a configuration sidebar.
- Shared logic and private state are visually separated in plain language before installation. Copying a pack copies only the portable manifest.
- An installed pack leads with operational truth—whether its first scheduled work has run and the action the user can take now—rather than counts of agents or prompts.
- Pack identity may have its own restrained light motif, but it stays inside Ambientic's cool mist, strong-contrast, reduced-motion language and never becomes a separate mini-brand.
- Consequential outcomes keep the same amber approval boundary as ordinary workflows; a polished pack cannot imply permission the user has not granted.

Career OS opens below its installed workflows as a daily current, not a job-board grid. The first hierarchy is time available → actions worth taking → ranked market evidence. The daily queue stays deliberately small, while a separate Market results section retains every discovered role (or any explicit user-selected display limit) so ranking never becomes hidden filtering. Opportunity cards keep Candidate Fit and Career Fit visibly separate, present uncertainty as confidence text, expose the canonical or attributed job link as a first-class action, and reserve glow for current value rather than employer branding. Save, Pursue, and Pass remain quiet controls; passing unfolds lightweight reasons in place so learning does not become a form. Discovery setup groups sources by trust—canonical ATS, attributed remote feed, optional browser/alert—so adding reach still feels like choosing evidence quality rather than configuring a scraper.

Career Profile setup treats identity as user-selected evidence, not invisible inference. CV and LinkedIn files appear as calm local document objects; reviewed Ambientic memories appear as individually selectable provenance cards. The resulting profile carries a visible Building → Needs review → Reviewed state, and its review action sits beside that state. No ranking glow or recommendation language should imply that an unreviewed portrait is already trusted.

Profile review is a real evidence surface, not a generic workflow checkpoint. A focused editor shows the extracted headline, summary, experience, achievements, skills, projects, leadership, technologies, domains, uncertainties, narrative, and source labels before the user approves them. Save and Approve remain visually distinct, while any agent request that still needs a response links directly to its thread. Career Daily stays quiet and unavailable until this human trust boundary is complete.

## Memory: a quiet archive of continuity

Memory should feel like a local field the user can inspect and prune, never like an invisible personality dossier. Memory lives inside Settings because it is a trust and control surface, not a daily navigation destination. It keeps the same deep, cool atmosphere while making origin and control unusually explicit.

- Active memories are calm, readable objects; candidates and conflicts change border temperature rather than adding motion or alarms.
- Provenance, scope, confidence, and provider origin stay legible but secondary to the remembered statement.
- Project/provider exclusions are small reversible controls close to the project they affect.
- Forget, supersede, and destructive capability actions remain visually restrained but use plain language and confirmation; atmosphere never softens the permission boundary.
- The session capsule is treated as a sealed object: its hash, age, and token size are quiet evidence of continuity, while recall activity appears as a small adjacent trail.
- Compact layouts move the project/activity rail below the memory cards instead of squeezing the reading column. Reduced motion changes nothing essential because the workspace communicates through depth and hierarchy, not animation.

## Hardware: the programmable instrument field

Hardware is a dedicated instrument, not an advanced Settings form. Its local template library is the quiet shelf; opening a template reveals a single floating control deck shared by the screen, MIDI controller, and computer keyboard.

- **One logical surface.** Physical notes, pads, buttons, and keys bind to stable virtual positions. Changing view changes meaning without forcing the user to relearn the physical layout.
- **Low-motion depth.** The deck moves as one restrained field over a subtle perspective grid. Individual pads answer immediately under the hand but do not bob independently or create constant arcade motion.
- **Views feel spatial.** View tabs and violet navigation pads communicate location. Creating a linked view should feel like opening another room in the same instrument, with a visible path Back or Home.
- **Light carries operational truth.** Green remains running, red remains input-required or failed, and blue remains idle. Violet identifies navigation, cyan a neutral executable action, and amber a confirmation boundary.
- **Input is always acknowledged.** A connected core stays softly lit; each valid MIDI arrival creates one short halo even when unmapped, so diagnosis begins with visible truth rather than configuration guesswork.
- **Editing stays inspectable.** Play, Edit, Map MIDI, and Test are explicit modes. The selected pad, its semantic action, local target, trigger gesture, permission level, and physical binding remain readable together.
- **Safety interrupts atmosphere.** Sending a saved prompt, starting work, running a workflow, or interrupting a turn enters an explicit confirmation surface when invoked from hardware. Decorative light never implies permission.
- **Portability is calm and private.** Export is visible from the library, but physical bindings, exact local targets, and saved private prompts are removed before a template leaves the Mac.
- **Native behavior remains sacred.** The APC40 MKII/APC mini live-session template is protected. Users fork it to explore; generic input support never weakens task-state RGB, voice controls, or Vibe restoration.

At compact heights the complete grid scales down before it clips or becomes scroll-dependent. Reduced-motion users keep the same depth, color, selection, and arrival truth without field drift or pulsing.

## First-run expression: Enter the field

Onboarding should feel like entering a quiet game world, not completing an enterprise setup checklist. It uses one full-screen decision at a time, oversized editorial type, a restrained five-step progress trace, floating symbols, and one unmistakable primary action.

- Welcome is mysterious but immediately legible: one breathing Ambientic object, one promise, one entrance.
- Identity asks only for a local display name. The input and next action are the entire interaction.
- Provider connection presents four large playable objects—Codex, Claude Code, Hermes, and Kimi—with provider color used only for identity and connection truth.
- Provider-memory setup is an invitation, never an extraction surprise: the user opts in, connected agents answer independently, and every safe memory remains selectable before activation. Progress feels like quiet signals arriving, not surveillance.
- The learned summary is a first portrait, not a verdict. It stays high-level, names the local boundary, and leads naturally to Settings → Memory for provenance, correction, exclusions, and forgetting.
- Never imply that provider runtimes are omniscient. Empty results are normal when a CLI cannot expose consumer-chat memory, and the interface says so without turning absence into an error.
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
