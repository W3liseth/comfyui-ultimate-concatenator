import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "UltimateTextConcatenator";
const TEXT_SETS_FILE = "ultimate-concatenator/text_sets.json";
const DEFAULT_ITEMS = [{ text: "", enabled: true, customLabel: false }];
const DEFAULT_REPLACEMENTS = '{"clean_up":true,"rules":[]}';
const ICONS = {
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    include: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    ignore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 6.2A11 11 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.1 2.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6a11 11 0 0 0 3.8-.7M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
};

function parseItems(value) {
    try {
        const items = JSON.parse(value);
        if (Array.isArray(items)) {
            return items.map((item, index) => {
                if (item && typeof item === "object") {
                    const hasLabel = typeof item.label === "string";
                    return {
                        text: String(item.text ?? ""),
                        enabled: item.enabled !== false,
                        label: hasLabel ? item.label : `Text ${index + 1}`,
                        customLabel: item.custom_label ?? hasLabel,
                    };
                }
                return {
                    text: String(item ?? ""),
                    enabled: true,
                    label: `Text ${index + 1}`,
                    customLabel: false,
                };
            });
        }
    } catch {}
    return DEFAULT_ITEMS.map((item) => ({ ...item }));
}

function currentItems(node) {
    return node._ultimateRows.map((row) => ({
        text: row.textarea.value,
        enabled: row.enabled,
        label: row.label.value,
        custom_label: row.customLabel,
    }));
}

function syncItems(node) {
    node._ultimateTextsStorage.value = JSON.stringify(currentItems(node));
}

function parseReplacements(value) {
    try {
        const config = JSON.parse(value);
        if (Array.isArray(config?.rules)) {
            return { clean_up: config.clean_up !== false, rules: config.rules };
        }
    } catch {}
    return JSON.parse(DEFAULT_REPLACEMENTS);
}

function currentReplacements(node) {
    return {
        clean_up: node._ultimateCleanUp.value,
        rules: node._ultimateReplacementRows.map((row) => ({
            find: row.find.value,
            replace: row.replace.value,
            match_case: row.matchCase,
            whole_word: row.wholeWord,
            enabled: row.enabled,
        })),
    };
}

function syncReplacements(node) {
    node._ultimateReplacementsStorage.value = JSON.stringify(currentReplacements(node));
}

// Text sets saved before replacements existed are a plain list of rows.
function setTexts(set) {
    return Array.isArray(set) ? set : set.texts;
}

// Row N always owns the optional STRING socket text_N, so sockets stay in row order; a connected socket replaces the row text.
function inputSlot(node, index) {
    return node.inputs.findIndex((input) => input.name === `text_${index + 1}`);
}

function rowLinks(node) {
    return node._ultimateRows.map((row, index) => {
        const link = node.getInputLink(inputSlot(node, index));
        return link && { id: link.origin_id, slot: link.origin_slot };
    });
}

// links lists, in the new row order, the source each row socket must be connected to.
function syncInputs(node, links) {
    const rows = node._ultimateRows;
    rows.forEach((row, index) => {
        if (inputSlot(node, index) === -1) {
            node.addInput(`text_${index + 1}`, "STRING");
        }
    });
    if (links) {
        const slots = rows.map((row, index) => inputSlot(node, index));
        slots.forEach((slot, index) => {
            const link = node.getInputLink(slot);
            if (link && (link.origin_id !== links[index]?.id || link.origin_slot !== links[index]?.slot)) {
                node.disconnectInput(slot);
            }
        });
        slots.forEach((slot, index) => {
            if (links[index] && node.inputs[slot].link == null) {
                node.graph.getNodeById(links[index].id).connect(links[index].slot, node, slot);
            }
        });
    }
    for (let slot = node.inputs.length - 1; slot >= 0; slot--) {
        const match = /^text_(\d+)$/.exec(node.inputs[slot].name);
        if (match && Number(match[1]) > rows.length) {
            node.removeInput(slot);
        }
    }
    rows.forEach((row, index) => {
        node.inputs[inputSlot(node, index)].label = row.label.value;
    });
    updateLinkedRows(node);
}

function updateLinkedRows(node) {
    node._ultimateRows.forEach((row, index) => {
        const linked = node.inputs[inputSlot(node, index)]?.link != null;
        row.textarea.disabled = linked;
        row.textarea.title = linked ? "This text comes from the connected input" : "";
        row.textarea.style.cursor = linked ? "not-allowed" : "";
        row.textarea.style.fontStyle = linked ? "italic" : "";
    });
}

function resizeNode(node) {
    requestAnimationFrame(() => {
        const size = node.computeSize();
        node.setSize([Math.max(node.size[0], size[0], 520), size[1]]);
        app.graph.setDirtyCanvas(true, true);
    });
}

function updateRowState(row) {
    const action = row.enabled ? "Ignore" : "Include";
    row.toggleButton.innerHTML = row.enabled ? ICONS.ignore : ICONS.include;
    styleButtonIcon(row.toggleButton);
    row.toggleButton.title = row.enabled
        ? "Ignore this text when concatenating"
        : "Include this text when concatenating";
    row.toggleButton.setAttribute("aria-label", action);
    row.textarea.style.opacity = row.enabled ? "1" : "0.45";
    row.textarea.style.textDecoration = row.enabled ? "none" : "line-through";
}

function renumberRows(node) {
    node._ultimateRows.forEach((row, index) => {
        const defaultLabel = `Text ${index + 1}`;
        if (!row.customLabel) {
            row.label.value = defaultLabel;
        }
        row.textarea.placeholder = defaultLabel;
        row.textarea.setAttribute("aria-label", row.label.value || defaultLabel);
        setOrderButtonState(row.upButton, index > 0);
        setOrderButtonState(row.downButton, index < node._ultimateRows.length - 1);
    });
}

function setOrderButtonState(button, enabled) {
    button.disabled = !enabled;
    button.style.opacity = enabled ? "1" : "0.35";
    button.style.cursor = enabled ? "pointer" : "default";
}

function moveRow(node, row, offset) {
    const index = node._ultimateRows.indexOf(row);
    const target = index + offset;
    if (index === -1 || target < 0 || target >= node._ultimateRows.length) {
        return;
    }

    const links = rowLinks(node);
    links.splice(target, 0, ...links.splice(index, 1));
    node._ultimateRows.splice(index, 1);
    node._ultimateRows.splice(target, 0, row);
    renumberRows(node);
    arrangeWidgets(node);
    syncItems(node);
    syncInputs(node, links);
    app.graph.setDirtyCanvas(true, true);
}

// texts_json, delimiter, replacements_json and wait_for_validation must stay the only serialized widgets,
// in this order, because the frontend restores widget values by position when a workflow loads.
function arrangeWidgets(node) {
    const ordered = [
        node._ultimateTextsStorage,
        ...node._ultimateRows.map((row) => row.widget),
        ...node._ultimateButtons,
        node._ultimateDelimiter,
        ...node._ultimateReplacementRows.map((row) => row.widget),
        ...node._ultimateReplacementWidgets,
        node._ultimateReplacementsStorage,
        node._ultimateWait,
        node._ultimatePreviewToggle,
        ...(node._ultimateWait.value ? node._ultimateValidationButtons : []),
        ...(node._ultimatePreview ? [node._ultimatePreview] : []),
    ];
    const known = new Set([...ordered, ...node._ultimateValidationButtons]);
    node.widgets = [...ordered, ...node.widgets.filter((widget) => !known.has(widget))];
}

function styleButton(button) {
    Object.assign(button.style, {
        width: "32px",
        minWidth: "32px",
        height: "32px",
        padding: "6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: "0",
        border: "1px solid var(--border-color, #555)",
        borderRadius: "5px",
        color: "var(--input-text, #ddd)",
        background: "var(--comfy-input-bg, #222)",
        cursor: "pointer",
    });
    button.style.setProperty("--icon-size", "18px");
}

function styleButtonIcon(button) {
    const icon = button.querySelector("svg");
    if (!icon) {
        return;
    }
    Object.assign(icon.style, {
        width: "var(--icon-size)",
        height: "var(--icon-size)",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        pointerEvents: "none",
    });
}

function createButton(content, title, ariaLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = content;
    button.title = title;
    button.setAttribute("aria-label", ariaLabel);
    styleButton(button);
    styleButtonIcon(button);
    return button;
}

function styleField(field) {
    Object.assign(field.style, {
        boxSizing: "border-box",
        border: "1px solid var(--border-color, #555)",
        borderRadius: "5px",
        color: "var(--input-text, #ddd)",
        background: "var(--comfy-input-bg, #222)",
    });
}

function addTextRow(node, item) {
    const defaultLabel = `Text ${node._ultimateRows.length + 1}`;
    const container = document.createElement("div");
    Object.assign(container.style, {
        width: "100%",
        minHeight: "76px",
        display: "flex",
        alignItems: "flex-start",
        gap: "6px",
        padding: "2px 0",
        boxSizing: "border-box",
    });

    const removeButton = createButton(ICONS.delete, "Delete this text field", "Delete");
    const toggleButton = createButton("", "", "");
    const upButton = createButton(ICONS.up, "Move this field up", "Move up");
    const downButton = createButton(ICONS.down, "Move this field down", "Move down");

    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    styleField(textarea);
    Object.assign(textarea.style, {
        flex: "1",
        minWidth: "0",
        minHeight: "72px",
        padding: "6px",
        resize: "vertical",
    });

    const label = document.createElement("input");
    label.type = "text";
    label.value = item.label ?? defaultLabel;
    label.placeholder = defaultLabel;
    label.title = "Edit this field label";
    label.setAttribute("aria-label", `Label de ${defaultLabel}`);
    styleField(label);
    Object.assign(label.style, {
        width: "96px",
        minWidth: "72px",
        height: "32px",
        padding: "0 6px",
        fontSize: "12px",
    });

    container.append(label, textarea, upButton, downButton, toggleButton, removeButton);
    // Widget names must stay unique and never change; they are unrelated to the positional text_N sockets.
    node._ultimateRowSerial = (node._ultimateRowSerial ?? 0) + 1;
    const widget = node.addDOMWidget(
        `text_row_${node._ultimateRowSerial}`,
        "ultimate-text-row",
        container,
        {
            serialize: false,
            getMinHeight: () => 80,
            getValue: () => textarea.value,
            setValue: (value) => {
                textarea.value = String(value ?? "");
            },
        },
    );
    widget.serialize = false;
    // While a workflow loads, addDOMWidget may restore a saved positional value into the row, so set the text afterwards.
    textarea.value = item.text;
    const row = {
        widget,
        textarea,
        label,
        upButton,
        downButton,
        toggleButton,
        enabled: item.enabled !== false,
        customLabel: item.customLabel === true,
    };
    node._ultimateRows.push(row);

    textarea.addEventListener("input", () => syncItems(node));
    label.addEventListener("input", () => {
        row.customLabel = true;
        textarea.setAttribute("aria-label", label.value || defaultLabel);
        syncItems(node);
        syncInputs(node);
        app.graph.setDirtyCanvas(true, false);
    });
    upButton.addEventListener("click", () => moveRow(node, row, -1));
    downButton.addEventListener("click", () => moveRow(node, row, 1));
    toggleButton.addEventListener("click", () => {
        row.enabled = !row.enabled;
        updateRowState(row);
        syncItems(node);
        app.graph.setDirtyCanvas(true, false);
    });
    removeButton.addEventListener("click", () => {
        const index = node._ultimateRows.indexOf(row);
        if (index === -1) {
            return;
        }
        const links = rowLinks(node);
        links.splice(index, 1);
        node._ultimateRows.splice(index, 1);
        node.removeWidget(row.widget);
        renumberRows(node);
        arrangeWidgets(node);
        syncItems(node);
        syncInputs(node, links);
        resizeNode(node);
    });

    updateRowState(row);
    renumberRows(node);
}

function buildTextRows(node, items) {
    for (const row of node._ultimateRows ?? []) {
        node.removeWidget(row.widget);
    }
    node._ultimateRows = [];
    for (const item of items) {
        addTextRow(node, item);
    }

    arrangeWidgets(node);
    syncItems(node);
    syncInputs(node);
    resizeNode(node);
}

function setFlagButtonState(button, active) {
    button.style.opacity = active ? "1" : "0.4";
    button.style.borderColor = active ? "var(--input-text, #ddd)" : "var(--border-color, #555)";
    button.setAttribute("aria-pressed", String(active));
}

function updateReplacementState(row) {
    setFlagButtonState(row.caseButton, row.matchCase);
    setFlagButtonState(row.wordButton, row.wholeWord);
    row.toggleButton.innerHTML = row.enabled ? ICONS.ignore : ICONS.include;
    styleButtonIcon(row.toggleButton);
    row.toggleButton.title = row.enabled ? "Ignore this replacement" : "Apply this replacement";
    row.toggleButton.setAttribute("aria-label", row.enabled ? "Ignore" : "Include");
    for (const field of [row.find, row.replace]) {
        field.style.opacity = row.enabled ? "1" : "0.45";
        field.style.textDecoration = row.enabled ? "none" : "line-through";
    }
}

function renumberReplacementRows(node) {
    const rows = node._ultimateReplacementRows;
    rows.forEach((row, index) => {
        setOrderButtonState(row.upButton, index > 0);
        setOrderButtonState(row.downButton, index < rows.length - 1);
    });
}

function moveReplacementRow(node, row, offset) {
    const rows = node._ultimateReplacementRows;
    const index = rows.indexOf(row);
    const target = index + offset;
    if (index === -1 || target < 0 || target >= rows.length) {
        return;
    }
    rows.splice(target, 0, ...rows.splice(index, 1));
    renumberReplacementRows(node);
    arrangeWidgets(node);
    syncReplacements(node);
    app.graph.setDirtyCanvas(true, true);
}

function addReplacementRow(node, rule) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 0",
        boxSizing: "border-box",
    });

    const find = document.createElement("input");
    const replace = document.createElement("input");
    for (const [field, placeholder, title] of [
        [find, "Find (a | b, * = any)", "Text to find in the connected texts. Use * for any text within the same sentence, and | to separate several texts to replace."],
        [replace, "Replace with", "Replacement text (leave empty to remove the found text)"],
    ]) {
        field.type = "text";
        field.placeholder = placeholder;
        field.title = title;
        styleField(field);
        Object.assign(field.style, { flex: "1", minWidth: "0", height: "32px", padding: "0 6px" });
    }
    find.value = String(rule.find ?? "");
    replace.value = String(rule.replace ?? "");

    const arrow = document.createElement("span");
    arrow.textContent = "→";
    arrow.style.flexShrink = "0";

    const caseButton = createButton("Aa", "Match case", "Match case");
    const wordButton = createButton("ab", "Whole word only", "Whole word only");
    wordButton.style.textDecoration = "underline";
    const upButton = createButton(ICONS.up, "Move this replacement up", "Move up");
    const downButton = createButton(ICONS.down, "Move this replacement down", "Move down");
    const toggleButton = createButton("", "", "");
    const removeButton = createButton(ICONS.delete, "Delete this replacement", "Delete");

    container.append(find, arrow, replace, caseButton, wordButton, upButton, downButton, toggleButton, removeButton);
    node._ultimateRowSerial = (node._ultimateRowSerial ?? 0) + 1;
    const widget = node.addDOMWidget(
        `replacement_row_${node._ultimateRowSerial}`,
        "ultimate-replacement-row",
        container,
        { serialize: false, getMinHeight: () => 40 },
    );
    widget.serialize = false;
    const row = {
        widget,
        find,
        replace,
        caseButton,
        wordButton,
        upButton,
        downButton,
        toggleButton,
        matchCase: rule.match_case === true,
        wholeWord: rule.whole_word !== false,
        enabled: rule.enabled !== false,
    };
    node._ultimateReplacementRows.push(row);

    const toggle = (flag) => {
        row[flag] = !row[flag];
        updateReplacementState(row);
        syncReplacements(node);
        app.graph.setDirtyCanvas(true, false);
    };
    find.addEventListener("input", () => syncReplacements(node));
    replace.addEventListener("input", () => syncReplacements(node));
    caseButton.addEventListener("click", () => toggle("matchCase"));
    wordButton.addEventListener("click", () => toggle("wholeWord"));
    toggleButton.addEventListener("click", () => toggle("enabled"));
    upButton.addEventListener("click", () => moveReplacementRow(node, row, -1));
    downButton.addEventListener("click", () => moveReplacementRow(node, row, 1));
    removeButton.addEventListener("click", () => {
        node._ultimateReplacementRows.splice(node._ultimateReplacementRows.indexOf(row), 1);
        node.removeWidget(widget);
        renumberReplacementRows(node);
        arrangeWidgets(node);
        syncReplacements(node);
        resizeNode(node);
    });

    updateReplacementState(row);
    renumberReplacementRows(node);
}

function buildReplacementRows(node, config) {
    for (const row of node._ultimateReplacementRows) {
        node.removeWidget(row.widget);
    }
    node._ultimateReplacementRows = [];
    node._ultimateCleanUp.value = config.clean_up;
    for (const rule of config.rules) {
        addReplacementRow(node, rule);
    }

    arrangeWidgets(node);
    syncReplacements(node);
    resizeNode(node);
}

function addButton(node, name, callback) {
    const button = node.addWidget("button", name, null, callback);
    button.serialize = false;
    button.options.serialize = false;
    return button;
}

function showError(error) {
    app.extensionManager.toast.add({
        severity: "error",
        summary: "Ultimate Text Concatenator",
        detail: error.message,
        life: 5000,
    });
}

// Execution ids of nodes inside subgraphs are the path of node ids, such as "12:5".
function nodeByExecutionId(id) {
    let graph = app.rootGraph;
    let node = null;
    for (const part of String(id).split(":")) {
        node = graph?.getNodeById(Number(part));
        graph = node?.subgraph;
    }
    return node;
}

function setPreviewText(node, text) {
    node._ultimatePreviewText = text;
    if (node._ultimatePreview) {
        node._ultimatePreview.element.value = text;
    }
}

function setPreviewShown(node, shown) {
    node.properties.ultimate_preview = shown;
    if (shown && !node._ultimatePreview) {
        const textarea = document.createElement("textarea");
        textarea.readOnly = true;
        textarea.value = node._ultimatePreviewText ?? "";
        textarea.placeholder = "The text sent to the next node appears here after a run or a Refresh.";
        styleField(textarea);
        Object.assign(textarea.style, { width: "100%", minHeight: "80px", padding: "6px", resize: "vertical" });
        node._ultimatePreview = node.addDOMWidget("ultimate_preview", "ultimate-preview", textarea, {
            serialize: false,
            getMinHeight: () => 90,
        });
        node._ultimatePreview.serialize = false;
    } else if (!shown && node._ultimatePreview) {
        node.removeWidget(node._ultimatePreview);
        node._ultimatePreview = null;
    }
    arrangeWidgets(node);
    resizeNode(node);
}

function setPaused(node, paused) {
    node._ultimateValidationButtons[1].label = paused ? "Validate (workflow paused)" : "Validate";
    app.graph.setDirtyCanvas(true, false);
}

// Keep on each row the string its socket received in the last run, so it follows the row if rows move while paused.
function storeLinkedTexts(node, textInputs) {
    node._ultimateRows.forEach((row, index) => {
        row.linkedText = textInputs?.[`text_${index + 1}`];
    });
}

function linkedTexts(node) {
    const textInputs = {};
    node._ultimateRows.forEach((row, index) => {
        if (row.linkedText !== undefined && node.inputs[inputSlot(node, index)]?.link != null) {
            textInputs[`text_${index + 1}`] = row.linkedText;
        }
    });
    return textInputs;
}

// action is "refresh" (rebuild the text from the node's current settings) or "validate" (also resume the workflow).
async function sendText(node, action) {
    const response = await api.fetchApi(`/ultimate_concatenator/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            node: node._ultimateExecutionId ?? String(node.id),
            texts_json: node._ultimateTextsStorage.value,
            delimiter: node._ultimateDelimiter.value,
            replacements_json: node._ultimateReplacementsStorage.value,
            text_inputs: linkedTexts(node),
        }),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error ?? `${action} failed (${response.status})`);
    }
    setPreviewText(node, data.text);
}

async function readTextSets() {
    const response = await api.getUserData(TEXT_SETS_FILE);
    if (response.status === 404) {
        return {};
    }
    if (!response.ok) {
        throw new Error(`Could not read ${TEXT_SETS_FILE}: ${response.status}`);
    }
    return await response.json();
}

async function saveTextSet(node, sets, name) {
    await api.storeUserData(TEXT_SETS_FILE, {
        ...sets,
        [name]: { texts: currentItems(node), replacements: currentReplacements(node) },
    });
    node._ultimateSetName = name;
    app.extensionManager.toast.add({
        severity: "success",
        summary: "Text set saved",
        detail: name,
        life: 3000,
    });
}

function createDialogButton(text) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    Object.assign(button.style, {
        padding: "6px 14px",
        border: "1px solid var(--border-color, #555)",
        borderRadius: "5px",
        color: "var(--input-text, #ddd)",
        background: "var(--comfy-input-bg, #222)",
        cursor: "pointer",
    });
    return button;
}

function openTextSetBrowser(node, sets, saving) {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "9999",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.5)",
    });

    const panel = document.createElement("div");
    panel.tabIndex = -1;
    Object.assign(panel.style, {
        width: "min(760px, 92vw)",
        height: "min(520px, 85vh)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid var(--border-color, #555)",
        borderRadius: "8px",
        color: "var(--fg-color, #ddd)",
        background: "var(--comfy-menu-bg, #353535)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
        outline: "none",
    });

    const title = document.createElement("div");
    title.textContent = saving ? "Save Text Set" : "Load Text Set";
    Object.assign(title.style, {
        padding: "12px 16px",
        fontSize: "16px",
        fontWeight: "bold",
        borderBottom: "1px solid var(--border-color, #555)",
    });

    const body = document.createElement("div");
    Object.assign(body.style, { flex: "1", minHeight: "0", display: "flex" });

    const list = document.createElement("div");
    Object.assign(list.style, {
        width: "220px",
        flexShrink: "0",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "6px",
        overflowY: "auto",
        borderRight: "1px solid var(--border-color, #555)",
    });

    const preview = document.createElement("div");
    Object.assign(preview.style, {
        flex: "1",
        minWidth: "0",
        padding: "12px 16px",
        overflowY: "auto",
    });
    body.append(list, preview);

    const footer = document.createElement("div");
    Object.assign(footer.style, {
        display: "flex",
        gap: "8px",
        padding: "10px 16px",
        borderTop: "1px solid var(--border-color, #555)",
    });
    const deleteButton = createDialogButton("Delete");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = node._ultimateSetName ?? "";
    nameInput.placeholder = "Text set name";
    Object.assign(nameInput.style, {
        flex: "1",
        minWidth: "0",
        padding: "6px 8px",
        border: "1px solid var(--border-color, #555)",
        borderRadius: "5px",
        color: "var(--input-text, #ddd)",
        background: "var(--comfy-input-bg, #222)",
    });
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    const cancelButton = createDialogButton("Cancel");
    const actionButton = createDialogButton(saving ? "Save" : "Load");
    footer.append(deleteButton, saving ? nameInput : spacer, cancelButton, actionButton);

    panel.append(title, body, footer);
    overlay.append(panel);

    let selected = null;
    let deleteArmed = false;
    const entries = new Map();

    const close = () => overlay.remove();

    const load = () => {
        if (selected === null) {
            return;
        }
        const set = sets[selected];
        buildTextRows(node, parseItems(JSON.stringify(setTexts(set))));
        if (!Array.isArray(set)) {
            buildReplacementRows(node, parseReplacements(JSON.stringify(set.replacements)));
        }
        node._ultimateSetName = selected;
        close();
    };

    const save = () => {
        const name = nameInput.value.trim();
        if (!name) {
            return;
        }
        saveTextSet(node, sets, name).then(close).catch(showError);
    };

    const renderPreview = () => {
        preview.replaceChildren();
        if (selected === null) {
            preview.textContent = saving
                ? "Type a name to create a new text set, or select an existing set to replace it."
                : "No saved text sets yet.";
            return;
        }
        for (const item of parseItems(JSON.stringify(setTexts(sets[selected])))) {
            const entry = document.createElement("div");
            Object.assign(entry.style, {
                marginBottom: "10px",
                opacity: item.enabled ? "1" : "0.45",
            });
            const label = document.createElement("div");
            label.textContent = item.enabled ? item.label : `${item.label} (ignored)`;
            Object.assign(label.style, {
                marginBottom: "4px",
                fontSize: "12px",
                fontWeight: "bold",
            });
            const text = document.createElement("div");
            text.textContent = item.text;
            Object.assign(text.style, {
                minHeight: "1.2em",
                padding: "6px",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                borderRadius: "5px",
                color: "var(--input-text, #ddd)",
                background: "var(--comfy-input-bg, #222)",
            });
            entry.append(label, text);
            preview.append(entry);
        }
        const rules = Array.isArray(sets[selected]) ? [] : sets[selected].replacements.rules;
        if (rules.length) {
            const heading = document.createElement("div");
            heading.textContent = "Replacements";
            Object.assign(heading.style, { margin: "14px 0 6px", fontSize: "12px", fontWeight: "bold" });
            preview.append(heading);
        }
        for (const rule of rules) {
            const entry = document.createElement("div");
            entry.textContent = `${rule.find} → ${rule.replace || "(removed)"}${rule.enabled === false ? " (ignored)" : ""}`;
            Object.assign(entry.style, {
                marginBottom: "4px",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                opacity: rule.enabled === false ? "0.45" : "1",
            });
            preview.append(entry);
        }
    };

    const updateActionButton = () => {
        if (saving) {
            const name = nameInput.value.trim();
            actionButton.disabled = !name;
            actionButton.textContent = Object.hasOwn(sets, name) ? "Replace" : "Save";
        } else {
            actionButton.disabled = selected === null;
        }
    };

    const select = (name) => {
        selected = name;
        deleteArmed = false;
        deleteButton.textContent = "Delete";
        deleteButton.disabled = selected === null;
        for (const [entryName, entry] of entries) {
            entry.style.background =
                entryName === selected ? "var(--comfy-input-bg, #222)" : "transparent";
        }
        updateActionButton();
        renderPreview();
    };

    const renderList = () => {
        list.replaceChildren();
        entries.clear();
        const names = Object.keys(sets).sort((a, b) => a.localeCompare(b));
        for (const name of names) {
            const entry = document.createElement("button");
            entry.type = "button";
            entry.textContent = name;
            entry.title = name;
            Object.assign(entry.style, {
                flexShrink: "0",
                padding: "6px 8px",
                overflow: "hidden",
                textAlign: "left",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                border: "none",
                borderRadius: "4px",
                color: "var(--input-text, #ddd)",
                cursor: "pointer",
            });
            entry.addEventListener("click", () => {
                nameInput.value = name;
                select(name);
            });
            if (!saving) {
                entry.addEventListener("dblclick", load);
            }
            entries.set(name, entry);
            list.append(entry);
        }
        if (saving) {
            const name = nameInput.value.trim();
            select(Object.hasOwn(sets, name) ? name : null);
        } else {
            select(names[0] ?? null);
        }
    };

    deleteButton.addEventListener("click", () => {
        if (!deleteArmed) {
            deleteArmed = true;
            deleteButton.textContent = "Click again to delete";
            return;
        }
        const remaining = { ...sets };
        delete remaining[selected];
        api.storeUserData(TEXT_SETS_FILE, remaining)
            .then(() => {
                sets = remaining;
                renderList();
            })
            .catch(showError);
    });
    nameInput.addEventListener("input", () => {
        const name = nameInput.value.trim();
        select(Object.hasOwn(sets, name) ? name : null);
    });
    cancelButton.addEventListener("click", close);
    actionButton.addEventListener("click", saving ? save : load);
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            close();
        }
    });
    // Keep keyboard shortcuts such as Delete from reaching the canvas while the browser is open.
    for (const type of ["keydown", "keyup"]) {
        overlay.addEventListener(type, (event) => {
            event.stopPropagation();
            if (type !== "keydown") {
                return;
            }
            if (event.key === "Escape") {
                close();
            } else if (event.key === "Enter" && event.target === nameInput) {
                save();
            }
        });
    }

    renderList();
    document.body.append(overlay);
    if (saving) {
        nameInput.focus();
        nameInput.select();
    } else {
        panel.focus();
    }
}

app.registerExtension({
    name: "ultimate-concatenator.dynamic-texts",
    setup() {
        api.addEventListener("ultimate_concatenator.waiting", ({ detail }) => {
            const node = nodeByExecutionId(detail.node);
            if (!node) {
                return;
            }
            node._ultimateExecutionId = detail.node;
            storeLinkedTexts(node, detail.text_inputs);
            setPreviewText(node, detail.text);
            setPaused(node, true);
            app.extensionManager.toast.add({
                severity: "info",
                summary: "Workflow paused",
                detail: "Edit the text if needed, then click Validate on the Ultimate Text Concatenator node.",
                life: 5000,
            });
        });
        api.addEventListener("ultimate_concatenator.released", ({ detail }) => {
            const node = nodeByExecutionId(detail.node);
            if (node) {
                setPaused(node, false);
            }
        });
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            this._ultimateTextsStorage = this.widgets.find(
                (widget) => widget.name === "texts_json",
            );
            this._ultimateDelimiter = this.widgets.find(
                (widget) => widget.name === "delimiter",
            );
            this._ultimateReplacementsStorage = this.widgets.find(
                (widget) => widget.name === "replacements_json",
            );
            for (const storage of [this._ultimateTextsStorage, this._ultimateReplacementsStorage]) {
                storage.options ??= {};
                storage.options.hidden = true;
                storage.hidden = true;
                storage.computeSize = () => [0, -4];
            }
            this._ultimateReplacementRows = [];
            this._ultimateCleanUp = this.addWidget(
                "toggle",
                "Clean up removed words",
                true,
                () => syncReplacements(this),
            );
            this._ultimateCleanUp.serialize = false;
            this._ultimateCleanUp.options.serialize = false;
            this._ultimateReplacementWidgets = [
                addButton(this, "Add Replacement", () => {
                    addReplacementRow(this, {});
                    arrangeWidgets(this);
                    syncReplacements(this);
                    resizeNode(this);
                }),
                this._ultimateCleanUp,
            ];
            this._ultimateButtons = [
                addButton(this, "Add Text", () => {
                    addTextRow(this, { text: "", enabled: true, customLabel: false });
                    arrangeWidgets(this);
                    syncItems(this);
                    syncInputs(this);
                    resizeNode(this);
                }),
                addButton(this, "Save Text Set", () => {
                    readTextSets()
                        .then((sets) => openTextSetBrowser(this, sets, true))
                        .catch(showError);
                }),
                addButton(this, "Load Text Set", () => {
                    readTextSets()
                        .then((sets) => openTextSetBrowser(this, sets, false))
                        .catch(showError);
                }),
            ];
            this._ultimateWait = this.widgets.find(
                (widget) => widget.name === "wait_for_validation",
            );
            this._ultimateWait.label = "Wait for validation";
            const waitCallback = this._ultimateWait.callback;
            this._ultimateWait.callback = (...args) => {
                waitCallback?.apply(this._ultimateWait, args);
                arrangeWidgets(this);
                resizeNode(this);
            };
            this._ultimatePreviewToggle = this.addWidget("toggle", "Preview", false, (value) =>
                setPreviewShown(this, value),
            );
            this._ultimatePreviewToggle.serialize = false;
            this._ultimatePreviewToggle.options.serialize = false;
            this._ultimateValidationButtons = [
                addButton(this, "Refresh", () => sendText(this, "refresh").catch(showError)),
                addButton(this, "Validate", () => sendText(this, "validate").catch(showError)),
            ];
            buildTextRows(this, parseItems(this._ultimateTextsStorage.value));
            buildReplacementRows(this, parseReplacements(this._ultimateReplacementsStorage.value));
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, arguments);
            const values = info?.widgets_values;

            if (Array.isArray(values)) {
                // The first release also stored every row and the Add Text button (null) before the delimiter, which was always last.
                const firstRelease = values.length > 3 && values[values.length - 2] === null;
                this._ultimateTextsStorage.value =
                    values[0] ?? JSON.stringify(DEFAULT_ITEMS);
                this._ultimateDelimiter.value =
                    (firstRelease ? values[values.length - 1] : values[1]) ?? ", ";
                this._ultimateReplacementsStorage.value =
                    (firstRelease ? null : values[2]) ?? DEFAULT_REPLACEMENTS;
                this._ultimateWait.value = (firstRelease ? null : values[3]) ?? false;
            } else if (values && typeof values === "object") {
                this._ultimateTextsStorage.value =
                    values.texts_json ?? JSON.stringify(DEFAULT_ITEMS);
                this._ultimateDelimiter.value = values.delimiter ?? ", ";
                this._ultimateReplacementsStorage.value =
                    values.replacements_json ?? DEFAULT_REPLACEMENTS;
                this._ultimateWait.value = values.wait_for_validation ?? false;
            }

            buildTextRows(this, parseItems(this._ultimateTextsStorage.value));
            buildReplacementRows(this, parseReplacements(this._ultimateReplacementsStorage.value));
            this._ultimatePreviewToggle.value = this.properties.ultimate_preview === true;
            setPreviewShown(this, this._ultimatePreviewToggle.value);
            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const result = onExecuted?.apply(this, arguments);
            storeLinkedTexts(this, message.text_inputs?.[0]);
            setPreviewText(this, message.text?.[0] ?? "");
            return result;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const result = onConnectionsChange?.apply(this, arguments);
            updateLinkedRows(this);
            return result;
        };
    },
});
