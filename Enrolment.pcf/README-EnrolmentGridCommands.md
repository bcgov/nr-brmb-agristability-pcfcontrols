# EnrolmentGridCommands (PCF)

The **command-bar + row-selection** variant of the `EnrolmentGrid` control
(`./EnrolmentGrid`, same project). Use this one on subgrids that have custom ribbon
buttons; use plain `EnrolmentGrid` on subgrids that should be read-only with
the command bar hidden. The split exists because `cds-data-set-options`
(`displayCommandBar`) is fixed per control manifest, so the choice is made by
picking the control on each subgrid in the form designer.

Differences from `EnrolmentGrid`:

- `displayCommandBar:true` — the subgrid command bar (including custom
  buttons) stays visible.
- Rows are selectable (click / Ctrl+click / Shift+click, no checkboxes); the
  selection is forwarded to `dataset.setSelectedRecordIds` so command-bar
  buttons act on the selected records.
- Because a row click selects, records open via the first-column link, lookup
  links, or double-click/Enter instead of a whole-row click.

Everything else is identical, including the enrolment redirect: rows of
`vsi_participantprogramyear` open in the external code app (URL from the
`vsi_ENcodeAppUrl` environment variable, `?id=<recordId>`), never the retired
Dataverse form.

## Shared source — imported from EnrolmentGrid/

`EnrolmentGridCommands/index.ts` imports the rendering component (and,
through it, `gridLogic.ts`) directly from the sibling control
`EnrolmentGrid/` — there are no copied source files to keep in sync.
Edit the masters in `EnrolmentGrid/`, run the unit tests (`npm test`,
they live in `tests/`), and both grid controls pick the change up on the
next build.

The one exception is the stylesheet: manifest resources must live inside
the control's own folder, so `EnrolmentGridCommands/css/EnrolmentGridCommands.css`
remains a copy of `EnrolmentGrid/css/EnrolmentGrid.css`. On css changes,
re-sync it:

```bash
cp EnrolmentGrid/css/EnrolmentGrid.css EnrolmentGridCommands/css/EnrolmentGridCommands.css
```

`index.ts` and the manifest are variant-specific (selection wiring, control
name, resources) and are maintained here.

## Build

```bash
npm install
npm run build
```
