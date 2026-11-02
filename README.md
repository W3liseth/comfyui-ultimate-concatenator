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

## Connecting other nodes

Each row has its own optional `STRING` input socket, named after the row label. When a socket is connected, the connected string replaces the row text: the text field is locked and shown in italics, and its typed text is used again once the link is removed. Ignored rows stay excluded even when connected.

Sockets are always listed in the same order as the rows. Moving or deleting a row moves its connection with it, so every connected string stays attached to the same text. Deleting a row also deletes its connection.

## Replacements

Replacement rules are listed under `delimiter`. Click **Add Replacement**, then fill in the text to find and the text to put instead. Rules only change the strings received through connected sockets; text typed in the rows is never changed. Each connected string is processed on its own, before concatenation, so a find text cannot span two rows. Rules are applied from top to bottom, each one on the result of the previous one. Every occurrence is replaced; a rule whose text is not found does nothing. An empty replacement removes the text, and a connected string that becomes empty is left out of the output.

Separate several texts with `|` to replace all of them with the same text. For example, `black, wavy hair | red hair | brown hair` → `blonde, straight hair` replaces each of the three. Commas are part of the text to find. Spaces around `|` are ignored, and a longer text is matched before a shorter one it contains.

Use `*` to match any text. For example, `The * YOUTUBE` matches `The image has a watermark in the bottom right corner that reads YOUTUBE`. A `*` matches as little text as possible and never goes past the end of a sentence (`.`, `!`, `?` or a line break), so it cannot swallow a previous or following sentence. It can cross commas inside a sentence, so `black * hair` matches `black, wavy hair`. A space next to `*` only means the neighbouring text must be a whole word: `The * YOUTUBE` does not match `Theory ... YOUTUBE`, while `red*` matches `reddish`. A `*` is always a wildcard; a find text cannot contain a literal `*`.

Each rule has these buttons:

- **Aa:** match case. Off by default, so `Red` and `red` are both replaced.
- **ab:** whole word only. On by default, so replacing `cat` does not change `category`.
- **Up / down arrows:** change the order in which rules are applied.
- **Eye:** ignores or applies the rule again without deleting it.
- **Trash:** deletes the rule.

When **Clean up removed words** is on (default), removed text also takes the spaces around it, keeping one space only when it still separates two words: removing `YOUTUBE` from `that reads YOUTUBE.` gives `that reads.`, and from `(blue eyes)` removing `blue` gives `(eyes)`. After a rule removed some text, the connected string is also tidied: repeated delimiters are merged (`red, , green` becomes `red, green`), a delimiter left at the start or end is removed, the period left behind by a removed sentence is dropped (`smiles. . The` becomes `smiles. The`), runs of spaces become one space, and leading and trailing spaces are trimmed.

## Wait for validation and preview

Turn on **Wait for validation** to pause the workflow on this node. Two buttons appear:

- **Refresh:** rebuilds the text from the node's current rows, delimiter, and replacement rules, and shows it in the preview. Connected rows keep the string they received in the last run.
- **Validate:** rebuilds the text the same way, sends it to the next node, and resumes the workflow.

While paused, the **Validate** button reads *Validate (workflow paused)*. Edit rows or rules, click **Refresh** to check the result, then **Validate**. Cancelling the run in ComfyUI also stops the pause. With the switch on, the node pauses on every run, even when nothing changed.

Turn on **Preview** to show the text sent to the next node. It is updated after every run, when the workflow pauses, and on each **Refresh**.

## Text sets

Click **Save Text Set** to store all current rows (text, labels, order, and included/ignored state) and the replacement rules. Type a new name to create a set, or select an existing set in the list to replace it; the button then reads **Replace** and the preview shows the content that will be overwritten.

Click **Load Text Set** to browse saved sets. Select a set to preview its rows, then click **Load** (or double-click it) to replace the node's rows and replacement rules. Sets saved before replacements existed only replace the rows. **Delete** removes the selected set after a second click.

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
