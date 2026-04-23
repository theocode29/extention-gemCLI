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

## 👨‍💼 Architecture

L'extension fonctionne avec un flux de travail multi-agents **Gouverneur-Spécialiste** :
- **Gouverneur** : Orchestration stratégique et gestion de l'état du projet.
- **Développeur** : Implémentation logique et intégration Bookshelf.
- **Testeur** : Validation syntaxique (Spyglass) et sémantique.
- **Porter** : Migration depuis les anciennes versions vers la 1.21+.
