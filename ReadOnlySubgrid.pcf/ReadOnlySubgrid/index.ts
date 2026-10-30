/*
 * Author: Jeroen Jonckheer
 * Control: ReadOnlySubgrid
 *
 * Virtual PCF dataset control. Acts as a thin bridge between the PCF
 * framework and the React component that owns rendering. Responsibilities
 * kept here:
 *   - relay the dataset context and allocated dimensions on every
 *     updateView so the component can re-layout on resize;
 *   - bridge row-open and lookup-link clicks to context.navigation.openForm;
 *   - bridge paging requests to dataset.paging.loadNextPage();
 *   - bridge header-menu sort requests to dataset.sorting + refresh.
 *
 * No state-mutating dataset calls (setPageSize / refresh) happen during
 * updateView itself - those caused a freeze where the loading state
 * never resolved. Eager paging beyond the host's default page size is
 * driven from inside the React component via the loadNextPage callback.
 *
 * Layering:
 *   - index.ts (this file)          : PCF lifecycle + side effects only;
 *   - components/ReadOnlySubgridComponent.tsx : all rendering + UI state;
 *   - gridLogic.ts                  : pure data shaping, unit-tested.
 */

import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import {
    ReadOnlySubgridComponent,
    IReadOnlySubgridComponentProps,
} from "./components/ReadOnlySubgridComponent";

export class ReadOnlySubgrid
    implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private context: ComponentFramework.Context<IInputs>;
    private notifyOutputChanged: () => void;

    /**
     * One-time setup. We opt into container-resize tracking so the host
     * re-invokes updateView (with fresh allocatedWidth/Height) whenever the
     * control's slot changes size, letting the component re-layout.
     */
    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary
    ): void {
        this.context = context;
        this.notifyOutputChanged = notifyOutputChanged;
        context.mode.trackContainerResize(true);
    }

    /**
     * Called on every data/size change. Builds the props (dataset, current
     * allocated dimensions, and the three callbacks) and returns the React
     * element; the React rendering is owned by the host for virtual controls.
     */
    public updateView(
        context: ComponentFramework.Context<IInputs>
    ): React.ReactElement {
        this.context = context;

        const dataset = context.parameters.dataset;

        const props: IReadOnlySubgridComponentProps = {
            dataset: dataset,
            width: context.mode.allocatedWidth,
            height: context.mode.allocatedHeight,
            onOpenRecord: (entityName: string, entityId: string): void => {
                if (!entityName || !entityId) {
                    return;
                }
                context.navigation
                    .openForm({
                        entityName: entityName,
                        entityId: entityId,
                    })
                    .then(
                        () => {
                            /* no-op on success */
                        },
                        (error: unknown) => {
                            console.error(
                                "ReadOnlySubgrid: openForm failed",
                                error
                            );
                        }
                    );
            },
            onLoadMore: (): void => {
                if (
                    dataset &&
                    dataset.paging &&
                    dataset.paging.hasNextPage &&
                    !dataset.loading
                ) {
                    try {
                        dataset.paging.loadNextPage();
                    } catch (e) {
                        console.error(
                            "ReadOnlySubgrid: loadNextPage failed",
                            e
                        );
                    }
                }
            },
            onSort: (
                columnName: string,
                descending: boolean
            ): void => {
                try {
                    dataset.sorting.length = 0;
                    dataset.sorting.push({
                        name: columnName,
                        sortDirection: descending ? 1 : 0,
                    });
                    dataset.refresh();
                } catch (e) {
                    console.error("ReadOnlySubgrid: sort refresh failed", e);
                }
            },
        };

        return React.createElement(ReadOnlySubgridComponent, props);
    }

    /**
     * This control is read-only and binds no output properties, so there is
     * nothing to hand back to the framework.
     */
    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        // Virtual controls unmount their React tree automatically when the
        // host removes them; no manual cleanup required here.
    }
}
