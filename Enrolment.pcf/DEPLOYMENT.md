# Deploying the Enrolment PCF controls

How to build, package and deploy the three controls in this project —
`vsi_BRMB.EnrolmentGrid`, `vsi_BRMB.EnrolmentGridCommands` and
`vsi_BRMB.EnrolmentLink` — which ship together as the **Enrolment**
Dataverse solution. The project is the deployment unit: every build/push
carries all three controls (unchanged ones re-import harmlessly).

## 1. Build & test locally

```bash
cd Enrolment.pcf
npm install
npm run build     # builds all three controls to ./out/controls/
npm test          # unit tests (tests/ exercise the shared grid sources)
```

## 2. Build the solution zip

```bash
cd Enrolment.pcf/Solution
dotnet build Solution.cdsproj -c Release
# -> bin/Release/Solution.zip  (solution unique name: Enrolment, publisher: vsi)
```

Notes:

- The zip is **unmanaged** by default. For a managed zip (test/prod ALM),
  uncomment `<SolutionPackageType>Both</SolutionPackageType>` in
  `Solution.cdsproj` and rebuild — you get `Solution.zip` +
  `Solution_managed.zip`.
- Do not add an explicit `outDir` to `pcfconfig.json`: the PowerApps
  MSBuild pipeline passes its own and errors with `pcf-1007` if they
  conflict.
- Before importing, confirm the environment's existing `vsi` publisher
  matches the UniqueName/prefix in `Solution/src/Other/Solution.xml`, so
  the import does not create a duplicate publisher.

## 3. First-time setup per environment

1. Import `Solution.zip` (make.powerapps.com → Solutions → Import). This
   creates the **Enrolment** solution owning all three controls.
2. Set the **current value** of the `vsi_ENcodeAppUrl` environment
   variable for that environment (the solution only carries the default).
   The controls deep-link enrolments to `<url>?id=<guid>`.
3. Configure the controls on forms/subgrids in the form designer:
   - Subgrids: `EnrolmentGrid` (read-only, command bar hidden) or
     `EnrolmentGridCommands` (command bar + row selection for custom
     ribbon buttons).
   - Enrolment lookup fields: `EnrolmentLink` (code-app link; native
     pick/clear dialog when the column is editable). On header fields it
     renders in the **flyout only** — the collapsed header strip cannot
     host custom controls (platform limitation).

## 4. Updates to an environment that already has the controls

```bash
cd Enrolment.pcf
pac auth select --index <n>        # or: pac org select --environment <url>
pac pcf push --publisher-prefix vsi --solution-unique-name Enrolment
```

- Controls are matched by logical name, so push upgrades them in place on
  every form already using them.
- **Bump the `version=` in each changed control's
  `ControlManifest.Input.xml` before pushing** — the model-driven client
  caches control bundles and the version bump is what busts the cache.
- `pac pcf push` always imports **unmanaged**. Keep one model per
  environment chain: all-unmanaged pushes, or managed solution upgrades —
  don't layer pushes over a managed import.

## 5. One-time cleanup (dev)

After the Enrolment solution import, delete the superseded solutions in
the environment: `EnrolmentGrid`, `EnrolmentLink`, and the
`PowerAppsTools_vsi` temp solution left by earlier `pac pcf push` runs.
The control components remain — they are owned by **Enrolment** now.

## Troubleshooting

- `npm run build` crashes with `ERR_INVALID_ARG_TYPE` in Git Bash:
  `APPDATA`/`LOCALAPPDATA` are missing from the shell. Prefix the command:
  `APPDATA="$USERPROFILE\\AppData\\Roaming" LOCALAPPDATA="$USERPROFILE\\AppData\\Local" npm run build`
- Shared grid sources: `EnrolmentGridCommands` imports the component and
  gridLogic from `EnrolmentGrid/` — edit there, tests cover both. Only
  `EnrolmentGridCommands/css/EnrolmentGridCommands.css` is a copy of
  `EnrolmentGrid/css/EnrolmentGrid.css`; re-sync it on css changes.
