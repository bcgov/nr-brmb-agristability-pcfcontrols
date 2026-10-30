<div align="center">

# JJ Read-only Subgrid

### A drop-in, per-instance read-only subgrid for Dynamics 365 / Dataverse - same look as the native modern subgrid, without New / Add Existing / Delete or inline editing.

[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f.svg)](LICENSE)
[![Power Platform](https://img.shields.io/badge/Power%20Platform-PCF%20control-742774.svg)](https://learn.microsoft.com/power-apps/developer/component-framework/overview)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Made by Jeroen Jonckheer](https://img.shields.io/badge/made%20by-Jeroen%20Jonckheer-14b8a6.svg)](https://www.platformpower.nl)

![JJ Read-only Subgrid in action](media/demo.gif)

*Exactly the modern subgrid your users already know, only without the buttons that get in the way.*

A focused **read-only dataset PCF control** for Microsoft Dynamics 365 / Dataverse. Bind it to any subgrid or view; users still get the modern grid's look, sorting, grouping, filtering and lookup-link navigation, but the command bar (New / Add Existing / Delete) and inline editing are gone. Apply it only where you want read-only; the table-level ribbon stays fully functional everywhere else.

</div>

## What you can build

One control, dozens of places it earns its keep - any related-records subgrid that should be view-only on **this one spot** while staying fully editable elsewhere:

- 📑 **Reference data on a form** - countries, currencies, price lists, lookup tables shown but not edited from here.
- 🧾 **Audit / history tabs** - related logs, status changes, signed-off documents.
- 🔒 **Compliance & "no-touch" sections** - contracts, approved records, locked-down activities.
- 👀 **Customer-facing summaries in portals or model-driven forms** - users see related items, can click through, but can't add or delete.
- 👨‍👩‍👧 **Parent-child read-outs** - children visible on the parent form; creating/editing happens via the dedicated child form, not from the parent.
- 📊 **Read-only dashboards** - tabular summaries embedded in a form or dashboard.
- 🛡️ **Subgrids that drive a workflow elsewhere** - rows arrive via integration or process; users should look, not poke.

If a subgrid should be informational on this spot and still fully editable everywhere else, JJ Read-only Subgrid is the right answer.

## Features

- **Read-only by design** - no command bar, no toolbar, no New / Add Existing / Delete, no inline edit.
- **Native-grid look and feel** - row and header pitch calibrated to the standard Power Apps modern grid (42&nbsp;px), native scrollbars, sticky header.
- **Click-through navigation** - click a row to open the record; lookup cells render as links that open the *related* record (click stops propagation, so it never double-opens).
- **Column tools** - per-column dropdown with A→Z / Z→A (server-side sort), Group by / Ungroup, Filter by (client-side contains), Column width dialog, Move left / Move right, plus drag-resize.
- **Smart paging** - eagerly pre-loads past the host's tiny default page size, then lazy-loads more as you scroll.
- **Lookup-aware** - single, customer, owner and party-list lookups all become navigable links.
- **Resilient** - a single malformed record or unreadable column never blanks the whole grid.
- **Localised strings** - Dutch UI labels today, easily extendable via the resx.

## Install

### Option A - import the ready-made solution (no build)

1. Download `JJReadOnlySubgrid_managed.zip` from the [latest release](../../releases/latest).
2. Import it: **make.powerapps.com → Solutions → Import solution**, or:
   ```bash
   pac auth create --url https://YOURORG.crm.dynamics.com
   pac solution import --path JJReadOnlySubgrid_managed.zip --publish-changes
   ```
3. Edit a form, pick a subgrid, and set its control to **Read-only Subgrid**.

An unmanaged zip (`JJReadOnlySubgrid_unmanaged.zip`) is published next to the managed one for sandbox / customization scenarios.

### Option B - build from source

Requires [Node.js](https://nodejs.org), the [.NET SDK](https://dotnet.microsoft.com) and the [Power Platform CLI](https://aka.ms/PowerPlatformCLI) (`pac`).

```bash
npm install
npm run build                                                       # build the control
dotnet build Solution/Solution.cdsproj -c Release -p:SolutionPackageType=Managed
pac solution import --path Solution/bin/Release/Solution.zip --publish-changes
```

The control uses the host-provided **React 16** and **Fluent UI 8** platform libraries.

## Configure on a form

1. Open the form in the modern form designer.
2. Select (or add) a subgrid bound to the related table + view.
3. In the subgrid properties, choose **Read-only Subgrid** as the control for Web / Phone / Tablet.
4. Save & publish.

The bound view's columns, order and widths drive what the grid shows. There are no extra control properties to set.

## Customization & commercial support

JJ Read-only Subgrid is free and open source (MIT) - use it, ship it, learn from it. 💚

**Need it tailored to your organisation?** Bespoke column rendering, organization-specific look and feel, extra interactions, multi-language labels, integration with your process or theme, or a managed-deployment pipeline - I take on paid customization and support for companies with specific requirements.

**Jeroen Jonckheer** · [platformpower.nl](https://www.platformpower.nl) · [LinkedIn](https://www.linkedin.com/in/jeroen-jonckheer/) · jeroen.jonckheer@platformpower.nl

## Documentation

Full docs live in the [**Wiki**](../../wiki):

- [Installation & Deployment](../../wiki/Installation-and-Deployment)
- [Configuration](../../wiki/Configuration)
- [Architecture](../../wiki/Architecture)
- [Development & Testing](../../wiki/Development-and-Testing)
- [Troubleshooting](../../wiki/Troubleshooting)
- [Naming Convention](../../wiki/Naming-Convention)

## Contributing

Issues and pull requests are welcome - see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Jeroen Jonckheer
