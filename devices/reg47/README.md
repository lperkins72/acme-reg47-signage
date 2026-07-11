# REG47 Device Launchers

## Purpose

Generated region repos should place stable NUC launcher files in this folder.

Expected generated outputs include:

- `index.html`
- `devices.json`
- `nuc-001.html` through the requested NUC count

Each generated launcher should redirect using:

- `tenant=acme`
- `region=reg47`
- `device=nuc-001`

## Template Note

This template folder does not keep copied live launcher files from any existing deployed region.

Instead, launcher source templates live in:

- `template-meta/device-index.template.html`
- `template-meta/device-launcher.template.html`
- `template-meta/devices-manifest.template.json`

The scaffold script should generate the final launcher files for the target region here.
