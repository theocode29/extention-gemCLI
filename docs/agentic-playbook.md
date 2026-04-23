# Agentic Playbook v3 (HITL + Research-First)

Ce playbook decrit la procedure standard de l'extension en mode autonome.

## Pipeline

1. Phase 0 audit
   - `get_manual_modifications`
   - `fs_verify_dependencies`
   - `fs_sync_all`
2. Phase -1 research grounding (obligatoire)
   - `agent_research_collect`
   - `agent_research_validate` (3 sources obligatoires: lib doc + runtime Minecraft + doc interne)
   - sortie attendue: sources, constraints, chosen_modules, rejected_modules, physics_model
3. Phase 1 cadrage
   - Clarifier objectifs et contraintes.
4. Phase 2 plan
   - Creer plan missionnel (`agent_plan_create`)
   - Duel contradictoire (`agent_plan_duel_start` puis `agent_plan_duel_resolve`)
   - Attendre GO humain.
5. Phase 3 execution
   - Catalogue capability-first:
     - `agent_capability_catalog_refresh`
     - `agent_capability_catalog_get`
   - Routage librairies (`agent_library_route`) obligatoire:
     - routes: `bone` | `bookshelf` | `vanilla` | `hybrid`
     - entrees: task + requested_capabilities + constraints + runtime_impacting
   - Refuser route sans preuve capability->source quand un module specialise est connu.
   - Appliquer profils metier (ex: physique surface) via `datapack_physics_profile_apply` seulement si pertinent.
   - Guard anti-loop (`agent_loop_guard_check`) sur actions repetitives.
   - Journaliser checkpoints et backlog.
6. Phase 4 validation
   - Spyglass + lint obligatoires.
   - `datapack_contract_validate` obligatoire.
   - Si runtime-impacting: headless obligatoire (`run_headless_test`) avant cloture.
   - Si non-runtime-impacting: headless non bloquant.
   - Sans jar + runtime-impacting: status `validation_blocked_headless` et pas de `completed`.
7. Phase 5 livraison
   - Gate assets si necessaire.
   - Gate final humain.

## Gates humains

1. Plan (GO)
2. Assets
3. Livraison

## Memoire

- Technique: `.gemini-project.json`
- Mission: `.gemini-mission.json` + `.gemini-mission.md`

## Etats missionnels enrichis

- `research_blocked`
- `debate_in_progress`
- `validation_blocked_headless`

## Policy Runtime

- `taskClass.runtimeImpacting=true`: cloture exige `headlessPassed=true`.
- `taskClass.runtimeImpacting=false`: cloture possible sans headless, avec contrat valide.
