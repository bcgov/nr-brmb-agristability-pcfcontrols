# Contributing to JJ Read-only Subgrid

Thanks for taking the time to contribute! Bug reports, ideas and pull requests are all welcome.

## Reporting bugs / requesting features

Please open an [issue](../../issues/new/choose) using one of the templates. For bugs, include your environment (Dynamics/Dataverse version), the form/subgrid configuration where the issue appears, the bound view's columns, and steps to reproduce.

## Development setup

Prerequisites: [Node.js](https://nodejs.org) 18+, the [.NET SDK](https://dotnet.microsoft.com), and the [Power Platform CLI](https://aka.ms/PowerPlatformCLI) (`pac`).

```bash
npm install
npm run build      # compile & bundle the control
npm run lint       # ESLint
npm test           # Jest unit + render tests
```

To produce an importable solution:

```bash
dotnet build Solution/Solution.cdsproj -c Release -p:SolutionPackageType=Managed
# -> Solution/bin/Release/Solution.zip
```

## Pull requests

1. Fork the repo and create a topic branch (`feature/...` or `fix/...`).
2. Keep changes focused; match the existing TypeScript style and folder layout.
3. Pure data shaping belongs in `ReadOnlySubgrid/gridLogic.ts` (no React/DOM, no dataset mutations) so it stays unit-testable.
4. Make sure `npm run build`, `npm run lint` and `npm test` all pass.
5. Describe the change and the use case in the PR (see the PR template).

## Code layout

```
ReadOnlySubgrid/
  ControlManifest.Input.xml   control + dataset definition
  index.ts                    PCF entry point (Grids.ReadOnlySubgrid)
  components/                 React UI (Fluent UI v8 DetailsList)
  gridLogic.ts                pure logic: ordering, filtering, grouping, sizing
  css/ · strings/             styling & localised labels
tests/                        Jest unit (gridLogic) + render tests
Solution/                     Dataverse solution wrapper (builds the importable zip)
```

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
