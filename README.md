# 💎 Gemini Datapack Architect

Senior Minecraft Datapack Architect extension for Gemini CLI. Features local RAG, SCC analysis (Tarjan's algorithm), and BONE:MSD framework integration.

## 🚀 Installation

Install directement depuis GitHub :

```bash
gemini extensions install <git-url>
```

Pour le développement local :

```bash
git clone <git-url>
cd gemini-datapack-architect
npm run install-deps
npm run build
gemini extensions link .
```

## 🛠 Fonctionnalités

- **Local RAG** : Recherche contextuelle dans la documentation Minecraft et les modules Bookshelf.
- **Semantic Linter** : Applique les lois BONE:MSD et les meilleures pratiques de sécurité.
- **Recursive SCC Analysis** : Détecte les écritures NBT dangereuses ou les macros volatiles dans les cycles récursifs.
- **Headless Testing** : Intégration avec HeadlessMC pour la validation dynamique.

## 🧭 Commandes Extension (Gemini CLI v1)

Les commandes sont maintenant au format officiel `prompt`/`description` et utilisent le namespace canonique `/dp:*`.
La commande `/dp:use-dp` est self-contained (sans dependance runtime a `@{...}`).
`/dp:use-dp` est l'entree agentique principale (modes implicites `plan`, `execute`, `resume`).

- `/dp:init version=<x.y.z> namespace=<id> [profile=minimal|worldgen|tests|full]`
- `/dp:ingest`
- `/dp:lint <path>`
- `/dp:install-bookshelf <module_name>`
- `/dp:install-bone`
- `/dp:deps`
- `/dp:mcdoc`
- `/dp:assets-update <items_json>`
- `/dp:assets-verify`
- `/dp:read <path>`
- `/dp:write <payload_json>`
- `/dp:use-dp <demande_libre>`
- `/dp:mods`
- `/dp:test [gametest|bookshelf_status]`
- `/dp:search <query>`
- `/dp:spyglass <path>`
- `/dp:sync`
- `/dp:breaker-reset`
- `/dp:doctor`

Exemple de routage intelligent:

- `/dp:use-dp installe bs.random` -> recommande `/dp:install-bookshelf random`
- `/dp:use-dp verifie les erreurs de syntaxe sur data/` -> recommande `/dp:spyglass data/`
- `/dp:use-dp je veux initialiser un datapack 1.21.5 namespace demo` -> recommande `/dp:init ...`

Prompts MCP secondaires exposés côté serveur : `mcp-dp-*` (listables via `/mcp desc`).

## 🤖 Mode Agentique v2 (HITL)

- Flux standard: idee -> plan propose -> GO humain -> execution auto -> gate assets -> gate livraison.
- 3 gates humains obligatoires:
1. validation du plan (GO),
2. confirmation assets externes,
3. validation finale livraison.
- Memoire persistante:
  - `.gemini-project.json` pour l'etat technique.
  - `.gemini-mission.json` + `.gemini-mission.md` pour la mission en cours (phase, statut, backlog, next_action).

## 🔧 Dépannage MCP

Si `/mcp list` affiche `datapack-tools ... Disconnected` :

1. Vérifie que l'extension est valide : `gemini extensions validate /chemin/vers/gemini-datapack-architect`
2. Rebuild le serveur : `npm run build`
3. Lance Gemini depuis un dossier **trusté** (voir `~/.gemini/trustedFolders.json`) puis relance `/mcp list`

Le serveur MCP est exécuté depuis le dossier extension mais opère sur le workspace courant via `MCP_PROJECT_ROOT=${workspacePath}`.

## 👨‍💼 Architecture

L'extension fonctionne avec un flux de travail multi-agents **Gouverneur-Spécialiste** :
- **Gouverneur** : Orchestration stratégique et gestion de l'état du projet.
- **Développeur** : Implémentation logique et intégration Bookshelf.
- **Testeur** : Validation syntaxique (Spyglass) et sémantique.
- **Porter** : Migration depuis les anciennes versions vers la 1.21+.
