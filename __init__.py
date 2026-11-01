import json
import re


def apply_replacements(text, replacements, delimiter):
    removed = False
    for rule in replacements.get("rules", []):
        # Several texts can be searched at once by separating them with "|"; longer ones are tried first.
        terms = sorted({term.strip() for term in rule.get("find", "").split("|")} - {""}, key=len, reverse=True)
        if not terms or not rule.get("enabled", True):
            continue
        pattern = "|".join(re.escape(term) for term in terms)
        if rule.get("whole_word", True):
            pattern = rf"(?<!\w)(?:{pattern})(?!\w)"
        replace = rule.get("replace", "")
        flags = 0 if rule.get("match_case", False) else re.IGNORECASE
        text, count = re.subn(pattern, lambda match: replace, text, flags=flags)
        removed = removed or (count > 0 and not replace)

    if removed and replacements.get("clean_up", True):
        text = clean_up(text, delimiter)
    return text


def clean_up(text, delimiter):
    """Remove the empty delimiters and extra spaces left behind by removed words."""
    separator = delimiter.strip()
    if separator:
        mark = re.escape(separator)
        text = re.sub(rf"\s*{mark}(?:\s*{mark})+\s*", lambda match: delimiter, text)
        text = re.sub(rf"^\s*{mark}\s*|\s*{mark}\s*$", "", text)
        if not delimiter[0].isspace():
            text = re.sub(rf"[ \t]+{mark}", lambda match: separator, text)
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
