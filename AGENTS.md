# Ambientic repository instructions

- The product name is **Ambientic**. Do not introduce the old product name in UI, documentation, identifiers, or release metadata unless documenting migration history.
- Before completing any coding task, update `README.md` so its implementation status, completed work, current work, next steps, and verification notes remain accurate.
- Keep Ambientic local-first. Provider credentials stay in each provider's own credential store.
- The first hardware target is specifically the **Akai APC40 MKII**. Generic MIDI support must not weaken or delay its native behavior.
- Revisit `ART_DIRECTION.md` for every material UI, motion, lighting, sound, or hardware-expression change, and update it when the creative language evolves.
- At every major product milestone, run the canonical local release gate: verify and document the milestone, commit a clean tree, build and sign Ambientic, replace `/Applications/Ambientic.app`, relaunch it, and confirm the installed build identity and health endpoint.
