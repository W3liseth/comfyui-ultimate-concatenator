import { app } from "../../scripts/app.js";

const NODE_NAME = "UltimateTextConcatenator";
const DEFAULT_ITEMS = [{ text: "", enabled: true, customLabel: false }];
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

function resizeNode(node) {
    requestAnimationFrame(() => {
        const size = node.computeSize();
        node.setSize([Math.max(node.size[0], size[0], 520), size[1]]);
        app.graph.setDirtyCanvas(true, true);
    });
}

function removeWidget(node, widget) {
    if (!widget) {
        return;
    }
    const index = node.widgets.indexOf(widget);
    if (index !== -1) {
        node.widgets.splice(index, 1);
    }
    widget.onRemove?.();
}

function clearDynamicWidgets(node) {
    for (const row of node._ultimateRows ?? []) {
        removeWidget(node, row.widget);
    }
    removeWidget(node, node._ultimateAddButton);
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
        row.widget.name = `text_${index + 1}`;
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

    node._ultimateRows.splice(index, 1);
    node._ultimateRows.splice(target, 0, row);
    renumberRows(node);
    arrangeWidgets(node);
    syncItems(node);
    app.graph.setDirtyCanvas(true, true);
}

function arrangeWidgets(node) {
    const dynamicWidgets = new Set([
        ...node._ultimateRows.map((row) => row.widget),
        node._ultimateAddButton,
    ]);
    const remaining = node.widgets.filter(
        (widget) =>
            widget !== node._ultimateTextsStorage &&
            widget !== node._ultimateDelimiter &&
            !dynamicWidgets.has(widget),
    );

    node.widgets = [
        node._ultimateTextsStorage,
        ...node._ultimateRows.map((row) => row.widget),
        node._ultimateAddButton,
        node._ultimateDelimiter,
        ...remaining,
    ];
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

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.innerHTML = ICONS.delete;
    removeButton.title = "Delete this text field";
    removeButton.setAttribute("aria-label", "Delete");
    styleButton(removeButton);
    styleButtonIcon(removeButton);

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    styleButton(toggleButton);

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.innerHTML = ICONS.up;
    upButton.title = "Move this field up";
    upButton.setAttribute("aria-label", "Move up");
    styleButton(upButton);
    styleButtonIcon(upButton);

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.innerHTML = ICONS.down;
    downButton.title = "Move this field down";
    downButton.setAttribute("aria-label", "Move down");
    styleButton(downButton);
    styleButtonIcon(downButton);

    const textarea = document.createElement("textarea");
    textarea.value = item.text;
    textarea.rows = 3;
    Object.assign(textarea.style, {
        flex: "1",
        minWidth: "0",
        minHeight: "72px",
        padding: "6px",
        resize: "vertical",
        boxSizing: "border-box",
        border: "1px solid var(--border-color, #555)",
        borderRadius: "5px",
        color: "var(--input-text, #ddd)",
        background: "var(--comfy-input-bg, #222)",
    });

    const label = document.createElement("input");
    label.type = "text";
    label.value = item.label ?? defaultLabel;
    label.placeholder = defaultLabel;
    label.title = "Edit this field label";
    label.setAttribute("aria-label", `Label de ${defaultLabel}`);
    Object.assign(label.style, {
        width: "96px",
        minWidth: "72px",
        height: "32px",
        padding: "0 6px",
        boxSizing: "border-box",
        border: "1px solid var(--border-color, #555)",
        borderRadius: "5px",
        color: "var(--input-text, #ddd)",
        background: "var(--comfy-input-bg, #222)",
        fontSize: "12px",
    });

    container.append(label, textarea, upButton, downButton, toggleButton, removeButton);
    const widget = node.addDOMWidget(
        `text_${node._ultimateRows.length + 1}`,
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
        node._ultimateRows.splice(index, 1);
        removeWidget(node, row.widget);
        renumberRows(node);
        arrangeWidgets(node);
        syncItems(node);
        resizeNode(node);
    });

    updateRowState(row);
    renumberRows(node);
}

function buildTextRows(node, items) {
    clearDynamicWidgets(node);
    node._ultimateRows = [];
    for (const item of items) {
        addTextRow(node, item);
    }

    node._ultimateAddButton = node.addWidget("button", "Add Text", null, () => {
        addTextRow(node, { text: "", enabled: true, customLabel: false });
        arrangeWidgets(node);
        syncItems(node);
        resizeNode(node);
    });
    node._ultimateAddButton.options ??= {};
    node._ultimateAddButton.options.serialize = false;

    arrangeWidgets(node);
    syncItems(node);
    resizeNode(node);
}

app.registerExtension({
    name: "ultimate-concatenator.dynamic-texts",
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
            this._ultimateTextsStorage.options ??= {};
            this._ultimateTextsStorage.options.hidden = true;
            this._ultimateTextsStorage.hidden = true;
            this._ultimateTextsStorage.computeSize = () => [0, -4];
            buildTextRows(this, parseItems(this._ultimateTextsStorage.value));
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, arguments);
            const values = info?.widgets_values;

            if (Array.isArray(values)) {
                this._ultimateTextsStorage.value =
                    values[0] ?? JSON.stringify(DEFAULT_ITEMS);
                this._ultimateDelimiter.value = values[1] ?? ", ";
            } else if (values && typeof values === "object") {
                this._ultimateTextsStorage.value =
                    values.texts_json ?? JSON.stringify(DEFAULT_ITEMS);
                this._ultimateDelimiter.value = values.delimiter ?? ", ";
            }

            buildTextRows(this, parseItems(this._ultimateTextsStorage.value));
            return result;
        };
    },
});
