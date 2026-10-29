# Ultimate Text Concatenator

Ultimate Text Concatenator is a ComfyUI custom node that joins any number of text fields into one `STRING` output. Each field can be named, reordered, temporarily ignored, or permanently deleted directly inside the node.

## Installation

Place this directory in `ComfyUI/custom_nodes`, restart ComfyUI, and refresh the browser. The node is available as **Ultimate Text Concatenator** in the `text` category.

## Node inputs and output

- Each text row contains an editable label and a multiline text field.
- `delimiter` defines the separator normally inserted between two included text fields.
- The node returns one concatenated `STRING`.
- The internal JSON value used to save the rows is hidden from the interface.

Labels are metadata only. They make the rows easier to identify but are never included in the output text.

## Managing text rows

Click **Add Text** to create a new row. New rows receive sequential default labels such as `Text 1`, `Text 2`, and `Text 3`. A label can be replaced with a descriptive name such as `Clothing`, `Environment`, or `Lighting`.

The icon buttons on the right side of each row provide these actions:

- **Up arrow:** moves the complete row one position upward.
- **Down arrow:** moves the complete row one position downward.
- **Crossed-out eye:** ignores the row during concatenation.
- **Eye:** includes a previously ignored row again.
- **Trash:** permanently deletes the row.

Hover over an icon to display its action. The unavailable up or down arrow is disabled on the first or last row.

Moving a row keeps its label, text, and included/ignored state together. Deleting or moving rows renumbers default labels. Labels edited by the user are preserved unchanged.

Ignored rows remain visible and editable, but their text is excluded from the output. If every row is ignored or deleted, the node returns an empty string.

## Text sets

Click **Save Text Set** to store all current rows (text, labels, order, and included/ignored state) under a name. Saving with an existing name asks before replacing it.

Click **Load Text Set** to browse saved sets. Select a set to preview its rows, then click **Load** (or double-click it) to replace the node's rows. **Delete** removes the selected set after a second click.

Text sets are stored locally in `ComfyUI/user/default/ultimate-concatenator/text_sets.json`, so they are shared by every workflow.

## Concatenation rules

The node first removes ignored rows, then processes the remaining rows in their displayed order. A separator is selected between each pair of included rows:

1. If the preceding text ends with a period and no trailing space, the configured delimiter is ignored and exactly one space is inserted.
2. If the preceding text ends with a period followed by one or more spaces, the configured delimiter and the automatic space are both ignored. The existing spaces are preserved.
3. In every other case, the configured `delimiter` is inserted.
4. No delimiter is ever appended after the final included text.

Examples using ` | ` as the delimiter:

| Text fields | Output |
| --- | --- |
| `red`, `green`, `blue` | `red | green | blue` |
| `A complete sentence.`, `Another sentence.` | `A complete sentence. Another sentence.` |
| `A complete sentence. `, `Another sentence.` | `A complete sentence. Another sentence.` |
| `first`, ignored `second`, `third` | `first | third` |

## Workflow persistence

Text, labels, row order, and included/ignored states are stored in the ComfyUI workflow. Workflows created with earlier versions of this node remain supported; old rows receive the current default labels when loaded.
