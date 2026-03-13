/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import * as d3 from "d3";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel } from "./settings";

interface BarDataPoint {
    category: string;
    value: number;
    index: number;
    selectionId: ISelectionId;
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private host: IVisualHost;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    private selectionManager: ISelectionManager;
    private selectedIndices: number[] = [];
    private dataPoints: BarDataPoint[] = [];
    private variancePairs: [number, number][] = [];

    private readonly margin = { top: 40, right: 30, bottom: 60, left: 60 };

    /** Pixels each additional overlapping variance level adds to the bracket height. */
    private static readonly LEVEL_SPACING = 40;
    /** Extra pixels above a data label before the connector starts/ends. */
    private static readonly LABEL_ABOVE_BAR_PADDING = 8;
    /** Minimum clearance (pixels) from the bar top when there is no data label. */
    private static readonly MIN_BAR_CLEARANCE = 4;

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("varianceBarChart", true);

        // Define arrowhead marker for variance connector lines
        const defs = this.svg.append("defs");
        defs.append("marker")
            .attr("id", "variance-arrow")
            .attr("markerWidth", 6)
            .attr("markerHeight", 4.5)
            .attr("refX", 6)
            .attr("refY", 2.25)
            .attr("orient", "auto")
            .append("polygon")
            .attr("points", "0 0, 6 2.25, 0 4.5")
            .attr("fill", "black");

        this.chartGroup = this.svg.append("g")
            .classed("chartGroup", true);
    }

    public update(options: VisualUpdateOptions) {
        const dataView: DataView = options.dataViews && options.dataViews[0];
        if (!dataView || !dataView.categorical) {
            this.clearChart();
            return;
        }

        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            dataView
        );

        const categorical = dataView.categorical;
        const categories = categorical.categories && categorical.categories[0];
        const values = categorical.values && categorical.values[0];

        if (!categories || !values) {
            this.clearChart();
            return;
        }

        const newDataPoints: BarDataPoint[] = categories.values.map((cat, i) => ({
            category: cat ? cat.toString() : "",
            value: values.values[i] !== null ? (values.values[i] as number) : 0,
            index: i,
            selectionId: this.host.createSelectionIdBuilder()
                .withCategory(categories, i)
                .createSelectionId()
        }));

        // Clear selections when data length or category identities change; restore persisted variance pairs
        const prevCategories = this.dataPoints.map(d => d.category).join("\0");
        const nextCategories = newDataPoints.map(d => d.category).join("\0");
        if (newDataPoints.length !== this.dataPoints.length || prevCategories !== nextCategories) {
            this.selectedIndices = [];
            this.selectionManager.clear();
            this.variancePairs = this.loadVariancePairs(nextCategories);
        }

        this.dataPoints = newDataPoints;
        this.renderChart(options, this.dataPoints);
    }

    private clearChart(): void {
        this.chartGroup.selectAll("*").remove();
    }

    private renderChart(options: VisualUpdateOptions, dataPoints: BarDataPoint[]): void {
        const width = options.viewport.width;
        const height = options.viewport.height;
        const { top, right, bottom, left } = this.margin;
        const innerWidth = width - left - right;
        const innerHeight = height - top - bottom;

        if (innerWidth <= 0 || innerHeight <= 0) {
            this.clearChart();
            return;
        }

        this.svg
            .attr("width", width)
            .attr("height", height);

        this.chartGroup
            .attr("transform", `translate(${left},${top})`);

        this.chartGroup.selectAll("*").remove();

        const settings = this.formattingSettings;
        const barSettings = settings.barSettingsCard;
        const bubbleSettings = settings.varianceBubbleCard;

        // Scales
        const xScale = d3.scaleBand()
            .domain(dataPoints.map(d => d.category))
            .range([0, innerWidth])
            .padding(0.25);

        const minValue = d3.min(dataPoints, d => d.value) ?? 0;
        const maxValue = d3.max(dataPoints, d => d.value) ?? 1;
        const yMin = minValue < 0 ? minValue * 1.15 : 0;
        const yMax = maxValue > 0 ? maxValue * 1.15 : 1;

        const yScale = d3.scaleLinear()
            .domain([yMin, yMax])
            .nice()
            .range([innerHeight, 0]);

        // X Axis
        this.chartGroup.append("g")
            .classed("x-axis", true)
            .attr("transform", `translate(0,${yScale(0)})`)
            .call(d3.axisBottom(xScale))
            .selectAll("text")
            .style("font-size", "11px");

        // Y Axis
        this.chartGroup.append("g")
            .classed("y-axis", true)
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => d3.format(".2s")(d as number)));

        const defaultBarColor = barSettings.barColor.value.value || "#4472C4";
        const selectedColor = barSettings.selectedBarColor.value.value || "#ED7D31";

        // Draw bars
        const bars = this.chartGroup.selectAll<SVGRectElement, BarDataPoint>(".bar")
            .data(dataPoints)
            .enter()
            .append("rect")
            .classed("bar", true)
            .attr("x", d => xScale(d.category) ?? 0)
            .attr("width", xScale.bandwidth())
            .attr("y", d => d.value >= 0 ? yScale(d.value) : yScale(0))
            .attr("height", d => Math.abs(yScale(d.value) - yScale(0)))
            .attr("fill", d => this.selectedIndices.includes(d.index) ? selectedColor : defaultBarColor)
            .attr("rx", 2)
            .attr("ry", 2);

        bars.append("title")
            .text(d => `${d.category}: ${d.value}`);

        // Click handler: select up to 2 bars; when a pair is complete, lock it in as a variance and reset selection
        bars.on("click", (event: MouseEvent, d: BarDataPoint) => {
            event.stopPropagation();
            const pos = this.selectedIndices.indexOf(d.index);
            if (pos >= 0) {
                // Deselect this bar
                this.selectedIndices.splice(pos, 1);
            } else {
                this.selectedIndices.push(d.index);

                // When a second bar is chosen, lock in the variance pair and reset selection
                if (this.selectedIndices.length === 2) {
                    const [f, s] = [this.selectedIndices[0], this.selectedIndices[1]];
                    const alreadyExists = this.variancePairs.some(
                        ([pf, ps]) => (pf === f && ps === s) || (pf === s && ps === f)
                    );
                    if (!alreadyExists) {
                        this.variancePairs.push([f, s]);
                        this.saveVariancePairs();
                    }
                    this.selectedIndices = [];
                }
            }

            // Sync with Power BI selection manager for cross-filtering
            const selectedIds = this.selectedIndices.map(i => this.dataPoints[i].selectionId);
            if (selectedIds.length > 0) {
                this.selectionManager.select(selectedIds);
            } else {
                this.selectionManager.clear();
            }

            // Update bar fill colors
            this.chartGroup.selectAll<SVGRectElement, BarDataPoint>(".bar")
                .attr("fill", dp => this.selectedIndices.includes(dp.index) ? selectedColor : defaultBarColor);

            // Re-render all locked-in variance bubbles
            this.chartGroup.selectAll(".variance-bubble-group").remove();
            if (bubbleSettings.show.value) {
                const pairLevels = this.computePairLevels(this.variancePairs);
                this.variancePairs.forEach(([firstIdx, secondIdx], pairIndex) => {
                    this.renderVarianceBubble(
                        this.dataPoints,
                        firstIdx,
                        secondIdx,
                        xScale,
                        yScale,
                        bubbleSettings,
                        barSettings,
                        pairLevels[pairIndex]
                    );
                });
            }
        });

        // Data labels
        if (barSettings.showDataLabels.value) {
            const labelFontSize = barSettings.labelFontSize.value ?? 11;
            this.chartGroup.selectAll<SVGTextElement, BarDataPoint>(".bar-label")
                .data(dataPoints)
                .enter()
                .append("text")
                .classed("bar-label", true)
                .attr("x", d => (xScale(d.category) ?? 0) + xScale.bandwidth() / 2)
                .attr("y", d => d.value >= 0
                    ? yScale(d.value) - 4
                    : yScale(d.value) + labelFontSize + 4
                )
                .attr("text-anchor", "middle")
                .style("font-size", `${labelFontSize}px`)
                .style("fill", "#333")
                .text(d => d3.format(".2s")(d.value));
        }

        // Render all locked-in variance pairs; none shown until user has completed at least one pair
        if (bubbleSettings.show.value && this.variancePairs.length > 0) {
            const pairLevels = this.computePairLevels(this.variancePairs);
            this.variancePairs.forEach(([firstIdx, secondIdx], pairIndex) => {
                this.renderVarianceBubble(
                    dataPoints,
                    firstIdx,
                    secondIdx,
                    xScale,
                    yScale,
                    bubbleSettings,
                    barSettings,
                    pairLevels[pairIndex]
                );
            });
        }
    }

    private renderVarianceBubble(
        dataPoints: BarDataPoint[],
        firstIdx: number,
        secondIdx: number,
        xScale: d3.ScaleBand<string>,
        yScale: d3.ScaleLinear<number, number>,
        bubbleSettings: VisualFormattingSettingsModel["varianceBubbleCard"],
        barSettings: VisualFormattingSettingsModel["barSettingsCard"],
        level: number
    ): void {
        const firstBar = dataPoints[firstIdx];
        const secondBar = dataPoints[secondIdx];

        if (!firstBar || !secondBar || firstBar.value === 0) return;

        const variancePct = ((secondBar.value - firstBar.value) / Math.abs(firstBar.value)) * 100;
        const isPositive = variancePct >= 0;

        const positiveColor = bubbleSettings.bubbleColor.value.value || "#70AD47";
        const negativeColor = bubbleSettings.negativeBubbleColor.value.value || "#FF0000";
        const bubbleColor = isPositive ? positiveColor : negativeColor;
        const fontSize = bubbleSettings.fontSize.value ?? 12;

        const showDataLabels = barSettings.showDataLabels.value;
        const labelFontSize = barSettings.labelFontSize.value ?? 11;

        // Position bubble horizontally between the two bars
        const x1 = (xScale(firstBar.category) ?? 0) + xScale.bandwidth() / 2;
        const x2 = (xScale(secondBar.category) ?? 0) + xScale.bandwidth() / 2;
        const bubbleCx = (x1 + x2) / 2;

        // Compute bar tops, then shift up past any data label so arrows never overlap the label
        const rawTopY1 = firstBar.value >= 0 ? yScale(firstBar.value) : yScale(0);
        const rawTopY2 = secondBar.value >= 0 ? yScale(secondBar.value) : yScale(0);
        // For positive bars the label sits above the bar top; push the connector start/end above it
        const labelClearance1 = (showDataLabels && firstBar.value >= 0) ? labelFontSize + Visual.LABEL_ABOVE_BAR_PADDING : Visual.MIN_BAR_CLEARANCE;
        const labelClearance2 = (showDataLabels && secondBar.value >= 0) ? labelFontSize + Visual.LABEL_ABOVE_BAR_PADDING : Visual.MIN_BAR_CLEARANCE;
        const topY1 = rawTopY1 - labelClearance1;
        const topY2 = rawTopY2 - labelClearance2;

        // Position bubble vertically above the taller bar, offset by level to avoid overlap
        const bubbleCy = Math.min(topY1, topY2) - 50 - level * Visual.LEVEL_SPACING;

        const bubbleRx = Math.max(35, fontSize * 2.8);
        const bubbleRy = Math.max(18, fontSize * 1.4);

        const bubbleGroup = this.chartGroup.append("g").classed("variance-bubble-group", true);

        // Bracket-shaped connector: up from first bar top → horizontal → down to second bar top, with arrowhead at end
        const bracketPath = `M ${x1} ${topY1} L ${x1} ${bubbleCy} L ${x2} ${bubbleCy} L ${x2} ${topY2}`;
        bubbleGroup.append("path")
            .classed("variance-connector", true)
            .attr("d", bracketPath)
            .attr("stroke", "black")
            .attr("stroke-width", 2)
            .attr("fill", "none")
            .attr("marker-end", "url(#variance-arrow)");

        // Bubble ellipse (horizontal oval)
        bubbleGroup.append("ellipse")
            .classed("variance-bubble", true)
            .attr("cx", bubbleCx)
            .attr("cy", bubbleCy)
            .attr("rx", bubbleRx)
            .attr("ry", bubbleRy)
            .attr("fill", bubbleColor)
            .attr("fill-opacity", 0.9)
            .attr("stroke", "#fff")
            .attr("stroke-width", 2);

        // Variance label
        const label = `${isPositive ? "+" : ""}${variancePct.toFixed(1)}%`;
        bubbleGroup.append("text")
            .classed("variance-label", true)
            .attr("x", bubbleCx)
            .attr("y", bubbleCy + fontSize * 0.35)
            .attr("text-anchor", "middle")
            .style("font-size", `${fontSize}px`)
            .style("font-weight", "bold")
            .style("fill", "#fff")
            .text(label);

        // Double-click on the bubble group removes it and its stored pair
        bubbleGroup.on("dblclick", (event: MouseEvent) => {
            event.stopPropagation();
            const pairIndex = this.variancePairs.findIndex(
                ([f, s]) => (f === firstIdx && s === secondIdx) || (f === secondIdx && s === firstIdx)
            );
            if (pairIndex >= 0) {
                this.variancePairs.splice(pairIndex, 1);
                this.saveVariancePairs();
            }
            d3.select(event.currentTarget as Element).remove();
        });
    }

    /** Assign a stagger level to each pair so overlapping connectors don't draw on top of each other. */
    private computePairLevels(pairs: [number, number][]): number[] {
        const levels: number[] = new Array(pairs.length).fill(0);
        for (let i = 0; i < pairs.length; i++) {
            const [f1, s1] = pairs[i];
            const minI = Math.min(f1, s1);
            const maxI = Math.max(f1, s1);
            let maxOverlapLevel = -1;
            for (let j = 0; j < i; j++) {
                const [f2, s2] = pairs[j];
                const minJ = Math.min(f2, s2);
                const maxJ = Math.max(f2, s2);
                if (minI <= maxJ && minJ <= maxI) {
                    maxOverlapLevel = Math.max(maxOverlapLevel, levels[j]);
                }
            }
            levels[i] = maxOverlapLevel + 1;
        }
        return levels;
    }

    private saveVariancePairs(): void {
        const key = "pbiviz_variance_pairs_" + this.dataPoints.map(d => d.category).join("\0");
        try {
            localStorage.setItem(key, JSON.stringify(this.variancePairs));
        } catch (e) { /* ignore storage errors */ }
    }

    private loadVariancePairs(categoriesKey: string): [number, number][] {
        try {
            const stored = localStorage.getItem("pbiviz_variance_pairs_" + categoriesKey);
            if (stored) return JSON.parse(stored) as [number, number][];
        } catch (e) { /* ignore storage errors */ }
        return [];
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
