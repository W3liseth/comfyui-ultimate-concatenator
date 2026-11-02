import json
import re

# "*" in a find text matches the shortest run of any text that stays within one sentence.
WILDCARD = r"[^.!?\n]*?"


def find_pattern(term):
    """A space next to "*" only requires the neighbouring text to be a whole word; the wildcard covers the gap."""
    parts = term.split("*")
    pattern = ""
    for index, part in enumerate(parts):
        if index > 0:
            pattern += WILDCARD + (r"(?<!\w)" if part[:1].isspace() else "")
        pattern += re.escape(part.strip())
        if index < len(parts) - 1 and part[-1:].isspace():
            pattern += r"(?!\w)"
    return pattern


def apply_replacements(text, replacements, delimiter):
    removed = False
    for rule in replacements.get("rules", []):
        # Several texts can be searched at once by separating them with "|"; longer ones are tried first.
        terms = {term.strip() for term in rule.get("find", "").split("|")}
        # A text made only of wildcards would match the empty string everywhere.
        terms = sorted((term for term in terms if term.replace("*", "").strip()), key=len, reverse=True)
        if not terms or not rule.get("enabled", True):
            continue
        pattern = "|".join(find_pattern(term) for term in terms)
        if rule.get("whole_word", True):
            pattern = rf"(?<!\w)(?:{pattern})(?!\w)"
        replace = rule.get("replace", "")
        flags = 0 if rule.get("match_case", False) else re.IGNORECASE
        if replace or not replacements.get("clean_up", True):
            text, count = re.subn(pattern, lambda match: replace, text, flags=flags)
        else:
            text, count = remove_matches(text, pattern, flags)
        removed = removed or (count > 0 and not replace)

    if removed and replacements.get("clean_up", True):
        text = clean_up(text, delimiter)
    return text


def remove_matches(text, pattern, flags):
    """Remove each match with the spaces around it, keeping one space only when it still separates two words."""

    def gap(match):
        left = text[match.start() - 1] if match.start() else "\n"
        right = text[match.end()] if match.end() < len(text) else "\n"
        if not (match.group(1) or match.group(2)) or left in "\n([{" or right in "\n)]},;:":
            return ""
        if right in ".!?":
            # Between two sentences, keep "smiles. ." so clean_up drops the period of the removed sentence.
            return " " if left in ".!?" else ""
        return " "

    return re.subn(rf"([ \t]*)(?:{pattern})([ \t]*)", gap, text, flags=flags)


def clean_up(text, delimiter):
    """Remove the empty delimiters and extra spaces left behind by removed words."""
    separator = delimiter.strip()
    if separator:
        mark = re.escape(separator)
        text = re.sub(rf"\s*{mark}(?:\s*{mark})+\s*", lambda match: delimiter, text)
        text = re.sub(rf"^\s*{mark}\s*|\s*{mark}\s*$", "", text)
        if not delimiter[0].isspace():
            text = re.sub(rf"[ \t]+{mark}", lambda match: separator, text)
        if separator not in ".!?":
            # Rows after a sentence get no delimiter, so a delimiter right after one comes from a removed row.
            text = re.sub(rf"([.!?])[ \t]*{mark}[ \t]*", r"\1 ", text)
    # A removed sentence leaves its final punctuation behind: "smiles. ." becomes "smiles.". "..." is kept.
    text = re.sub(r"([.!?])(?:\s+[.!?](?!\S))+", r"\1", text)
    text = re.sub(r"^\s*[.!?](?:\s+|$)", "", text)
    return re.sub(r"[ \t]{2,}", " ", text).strip()


class TextInputs(dict):
    """Optional STRING sockets text_1, text_2, ... created by the frontend, one per row in row order."""

    def __contains__(self, key):
        return key.startswith("text_")

    def __getitem__(self, key):
        return ("STRING", {"forceInput": True})


class UltimateTextConcatenator:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "texts_json": ("STRING", {"default": '[{"text":"","enabled":true}]', "hidden": True}),
                "delimiter": ("STRING", {"default": ", "}),
                "replacements_json": ("STRING", {"default": '{"clean_up":true,"rules":[]}', "hidden": True}),
            },
            "optional": TextInputs(),
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "concatenate"
    CATEGORY = "text"

    def concatenate(self, texts_json, delimiter, replacements_json, **text_inputs):
        texts = json.loads(texts_json)
        if not isinstance(texts, list):
            raise ValueError("texts_json must contain a JSON list")

        enabled_texts = []
        for index, item in enumerate(texts):
            if isinstance(item, dict):
                if item.get("enabled", True):
                    text = text_inputs.get(f"text_{index + 1}", item.get("text", ""))
                    enabled_texts.append(str(text))
            else:
                enabled_texts.append(str(item))

        if not enabled_texts:
            return ("",)

        result = enabled_texts[0]
        previous = enabled_texts[0]
        for text in enabled_texts[1:]:
            previous_without_spaces = previous.rstrip(" ")
            if previous_without_spaces.endswith("."):
                separator = "" if previous_without_spaces != previous else " "
            else:
                separator = delimiter
            result += separator + text
            previous = text

        return (apply_replacements(result, json.loads(replacements_json), delimiter),)


NODE_CLASS_MAPPINGS = {
    "UltimateTextConcatenator": UltimateTextConcatenator,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "UltimateTextConcatenator": "Ultimate Text Concatenator",
}

WEB_DIRECTORY = "./web"
