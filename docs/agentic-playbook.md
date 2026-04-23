# Agentic Playbook v2 (HITL)

Ce playbook decrit la procedure standard de l'extension en mode autonome.

## Pipeline

1. Phase 0 audit
   - `get_manual_modifications`
   - `fs_verify_dependencies`
   - `fs_sync_all`
2. Phase 1 cadrage
   - Clarifier objectifs et contraintes.
3. Phase 2 plan
   - Creer plan missionnel (`agent_plan_create`)
   - Attendre GO humain.
4. Phase 3 execution
   - Init/deps/recherche/ecriture selon besoin.
   - Journaliser checkpoints et backlog.
5. Phase 4 validation
   - Spyglass + lint obligatoires.
   - Headless optionnel si jar present.
6. Phase 5 livraison
   - Gate assets si necessaire.
   - Gate final humain.

## Gates humains

1. Plan (GO)
2. Assets
3. Livraison

## Memoire

- Technique: `.gemini-project.json`
- Mission: `.gemini-mission.json` + `.gemini-mission.md`
