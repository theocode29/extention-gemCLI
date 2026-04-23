# Correction de la Commande d'Initialisation - Design Spec

**Date :** 2026-04-23
**Statut :** Approuvé

## Problème
Le Gemini CLI rejette `commands/init.toml` avec l'erreur `MCP issues detected` car l'outil `fs_workspace_init` n'est pas exposé par le serveur MCP.

## Objectifs
- Rendre la commande `/dp-init` fonctionnelle.
- Automatiser le clonage du template BONE:MSD dans le workspace utilisateur.
- Initialiser le suivi d'état (hashes) immédiatement après le clonage.

## Architecture de la Solution

### 1. Modifications du Serveur MCP (`index.ts`)
- **Déclaration Tool** : Ajouter l'outil à la liste retournée par le handler `ListToolsRequestSchema`.
- **Handler Tool** : Ajouter le switch case pour `fs_workspace_init`.
- **Logique** : 
    1. Appeler `boneEngine.initTemplate()`.
    2. En cas de succès, appeler `stateManager.syncAll()` pour indexer les nouveaux fichiers.
    3. Retourner un message de succès confirmant l'initialisation.

### 2. Flux de Données
`Utilisateur (/dp-init)` -> `Gemini CLI` -> `MCP Server (fs_workspace_init)` -> `BONEEngine.initTemplate()` -> `Git Clone` -> `ProjectStateManager.syncAll()`.

## Validation
- Recompiler le projet avec `npm run build`.
- Vérifier que le message d'erreur `[FileCommandLoader]` a disparu au rechargement.
- Tester la commande `/dp-init` dans un dossier vide.
