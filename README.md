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

- `/dp:init <version>`
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
- `/dp:mods`
- `/dp:test [gametest|bookshelf_status]`
- `/dp:search <query>`
- `/dp:spyglass <path>`
- `/dp:sync`
- `/dp:breaker-reset`
- `/dp:doctor`

Prompts MCP secondaires exposés côté serveur : `mcp-dp-*` (listables via `/mcp desc`).

## 👨‍💼 Architecture

L'extension fonctionne avec un flux de travail multi-agents **Gouverneur-Spécialiste** :
- **Gouverneur** : Orchestration stratégique et gestion de l'état du projet.
- **Développeur** : Implémentation logique et intégration Bookshelf.
- **Testeur** : Validation syntaxique (Spyglass) et sémantique.
- **Porter** : Migration depuis les anciennes versions vers la 1.21+.
