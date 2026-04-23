# Mapping `/dp:use-dp` v1

Documentation interne uniquement: ce fichier n'est pas injecte a l'execution de la commande.

Ce document est la source de verite pour le routage de la commande `/dp:use-dp`.

## Intentions supportees

- `bootstrap`
- `dependencies`
- `read/write`
- `docs/research`
- `validation`
- `assets`
- `state/diagnostics`

## Etapes de travail supportees

- `init`
- `build`
- `verify`
- `repair`

## Routage officiel

- `bootstrap/init`
  - Commande primaire: `/dp:init version=<x.y.z> namespace=<id> [profile=minimal|worldgen|tests|full]`
  - Suite recommandee: `/dp:install-bone`, puis `/dp:deps`

- `dependencies`
  - Commande primaire: `/dp:deps`
  - Suite recommandee:
    - `/dp:install-bookshelf <module_name>` si module Bookshelf manquant
    - `/dp:install-bone` si BONE:MSD manquant

- `docs/research`
  - Commande primaire: `/dp:search <query>`

- `read/write`
  - Commande primaire:
    - `/dp:read <path>` pour lecture
    - `/dp:write <payload_json>` pour ecriture

- `validation/verify`
  - Commande primaire:
    - `/dp:spyglass <path>` pour syntaxe
    - `/dp:lint <path>` pour semantique BONE
    - `/dp:test [gametest|bookshelf_status]` pour dynamique

- `assets`
  - Commande primaire: `/dp:assets-update <items_json>`
  - Suite recommandee: `/dp:assets-verify`

- `state/diagnostics`
  - Commande primaire:
    - `/dp:mods` pour modifications manuelles
    - `/dp:sync` pour synchronisation etat
    - `/dp:doctor` pour diagnostic global

## Politique d'ambiguite

Si la demande utilisateur est trop vague, poser une seule question de clarification ciblee et suspendre la recommandation finale.
