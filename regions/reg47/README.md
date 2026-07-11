# REG47 Region Layer

## Purpose

This folder is the region-default content layer for `reg47`.

The runtime now checks this folder first for supported region files. If a file is not present here, the app falls back to the shared root file.

## Current Region-Aware Files

- `regions/reg47/data/primary-assets.json`
- `regions/reg47/data/primary.json`
- `regions/reg47/data/footer.json`
- `regions/reg47/data/primaryending.json`
- `regions/reg47/assets/primary/manifest.json`
- `regions/reg47/assets/footer/manifest.json`

## Current Behavior

- `primary` can use region manifest and asset-version files from this folder.
- `trivia` can use region trivia content from this folder.
- `footer` and the shared overlay host can use region footer defaults and region footer asset manifests from this folder.
- `secondary` weather remains per NUC and is intentionally not region-layered here.

## Editing Rule

Use this folder for region-wide defaults that should affect `reg47`.

Do not use this folder for:

- per-NUC weather settings
- per-NUC local override state
- backend heartbeat or sync state

## Safe Fallback Rule

If a region file is removed from this folder, the runtime falls back to the shared root file:

- `data/...`
- `assets/...`
