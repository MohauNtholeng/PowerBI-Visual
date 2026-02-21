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
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel } from "./settings";

interface BarDataPoint {
    category: string;
    value: number;
    index: number;
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private chartGroup: d3.Selection<SVGGElement, unknown, null, undefined>;

    private readonly margin = { top: 40, right: 30, bottom: 60, left: 60 };

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;

        this.svg = d3.select(this.target)
            .append("svg")
            .classed("varianceBarChart", true);

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

        const dataPoints: BarDataPoint[] = categories.values.map((cat, i) => ({
            category: cat ? cat.toString() : "",
            value: values.values[i] !== null ? (values.values[i] as number) : 0,
            index: i
        }));

        this.renderChart(options, dataPoints);
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

        // Determine which bars are "selected" for variance comparison
        const rawFirst = Math.round(bubbleSettings.firstBarIndex.value) - 1;
        const rawSecond = Math.round(bubbleSettings.secondBarIndex.value) - 1;
        const selectedFirst = Math.max(0, Math.min(dataPoints.length - 1, rawFirst));
        const selectedSecond = Math.max(0, Math.min(dataPoints.length - 1, rawSecond));

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
            .attr("fill", d =>
                (d.index === selectedFirst || d.index === selectedSecond) && bubbleSettings.show.value
                    ? selectedColor
                    : defaultBarColor
            )
            .attr("rx", 2)
            .attr("ry", 2);

        bars.append("title")
            .text(d => `${d.category}: ${d.value}`);

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

        // Variance bubble between the two selected bars
        if (bubbleSettings.show.value && selectedFirst !== selectedSecond) {
            this.renderVarianceBubble(dataPoints, selectedFirst, selectedSecond, xScale, yScale, bubbleSettings);
        }
    }

    private renderVarianceBubble(
        dataPoints: BarDataPoint[],
        firstIdx: number,
        secondIdx: number,
        xScale: d3.ScaleBand<string>,
        yScale: d3.ScaleLinear<number, number>,
        bubbleSettings: VisualFormattingSettingsModel["varianceBubbleCard"]
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

        // Position bubble horizontally between the two bars
        const x1 = (xScale(firstBar.category) ?? 0) + xScale.bandwidth() / 2;
        const x2 = (xScale(secondBar.category) ?? 0) + xScale.bandwidth() / 2;
        const bubbleCx = (x1 + x2) / 2;

        // Position bubble vertically above the taller bar
        const topY1 = firstBar.value >= 0 ? yScale(firstBar.value) : yScale(0);
        const topY2 = secondBar.value >= 0 ? yScale(secondBar.value) : yScale(0);
        const bubbleCy = Math.min(topY1, topY2) - 30;

        const bubbleRadius = Math.max(22, fontSize * 1.8);

        const bubbleGroup = this.chartGroup.append("g").classed("variance-bubble-group", true);

        // Connector lines from bubble to each bar top
        const lineY = bubbleCy + bubbleRadius;
        const connectorY1 = Math.min(topY1, lineY);
        const connectorY2 = Math.min(topY2, lineY);

        bubbleGroup.append("line")
            .classed("variance-connector", true)
            .attr("x1", bubbleCx)
            .attr("y1", lineY)
            .attr("x2", x1)
            .attr("y2", connectorY1)
            .attr("stroke", bubbleColor)
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", "4,3");

        bubbleGroup.append("line")
            .classed("variance-connector", true)
            .attr("x1", bubbleCx)
            .attr("y1", lineY)
            .attr("x2", x2)
            .attr("y2", connectorY2)
            .attr("stroke", bubbleColor)
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", "4,3");

        // Bubble circle
        bubbleGroup.append("circle")
            .classed("variance-bubble", true)
            .attr("cx", bubbleCx)
            .attr("cy", bubbleCy)
            .attr("r", bubbleRadius)
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
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
