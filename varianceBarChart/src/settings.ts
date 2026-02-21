/*
 *  Power BI Visualizations
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

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/**
 * Bar Settings Formatting Card
 */
class BarSettingsCard extends FormattingSettingsCard {
    barColor = new formattingSettings.ColorPicker({
        name: "barColor",
        displayName: "Bar Color",
        value: { value: "#4472C4" }
    });

    selectedBarColor = new formattingSettings.ColorPicker({
        name: "selectedBarColor",
        displayName: "Selected Bar Color",
        value: { value: "#ED7D31" }
    });

    showDataLabels = new formattingSettings.ToggleSwitch({
        name: "showDataLabels",
        displayName: "Show Data Labels",
        value: true
    });

    labelFontSize = new formattingSettings.NumUpDown({
        name: "labelFontSize",
        displayName: "Label Font Size",
        value: 11
    });

    name: string = "barSettings";
    displayName: string = "Bar Settings";
    slices: Array<FormattingSettingsSlice> = [
        this.barColor,
        this.selectedBarColor,
        this.showDataLabels,
        this.labelFontSize
    ];
}

/**
 * Variance Bubble Formatting Card
 */
class VarianceBubbleCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Variance Bubble",
        value: true
    });

    bubbleColor = new formattingSettings.ColorPicker({
        name: "bubbleColor",
        displayName: "Positive Variance Color",
        value: { value: "#70AD47" }
    });

    negativeBubbleColor = new formattingSettings.ColorPicker({
        name: "negativeBubbleColor",
        displayName: "Negative Variance Color",
        value: { value: "#FF0000" }
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 12
    });

    firstBarIndex = new formattingSettings.NumUpDown({
        name: "firstBarIndex",
        displayName: "First Bar (1-based index)",
        value: 1
    });

    secondBarIndex = new formattingSettings.NumUpDown({
        name: "secondBarIndex",
        displayName: "Second Bar (1-based index)",
        value: 2
    });

    name: string = "varianceBubble";
    displayName: string = "Variance Bubble";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.bubbleColor,
        this.negativeBubbleColor,
        this.fontSize,
        this.firstBarIndex,
        this.secondBarIndex
    ];
}

/**
 * Visual settings model class
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    barSettingsCard = new BarSettingsCard();
    varianceBubbleCard = new VarianceBubbleCard();

    cards = [this.barSettingsCard, this.varianceBubbleCard];
}

