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

- The zip is **managed** (`<SolutionPackageType>Managed</SolutionPackageType>`
  in `Solution.cdsproj`), matching how the Enrolment solution is deployed
  (it exists as managed in dev). Change the package type only if a target
  environment needs an unmanaged copy.
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

> **Do not use `pac pcf push` with this project.** It only supports
> single-control projects and fails here with *"Found more than one
> project source file named 'ControlManifest.Input.xml'"* because
> `Enrolment.pcfproj` packages three controls. Deploy updates by
> rebuilding and re-importing the solution zip instead:

```bash
cd Enrolment.pcf
npm run build                      # rebuild the control bundles
cd Solution
dotnet build Solution.cdsproj -c Release
pac solution import --path bin/Release/Solution.zip \
    --environment <environment-url> --publish-changes
```

- Controls are matched by logical name, so the import upgrades them in
  place on every form already using them.
- **Bump the `version=` in each changed control's
  `ControlManifest.Input.xml` before importing** — the model-driven
  client caches control bundles and the version bump is what busts the
  cache.
- Also bump `<Version>` in `Solution/src/Other/Solution.xml` so the
  import registers as an upgrade of the managed solution.

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
