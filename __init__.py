import json
import re
import threading

from aiohttp import web

import comfy.model_management
from server import PromptServer

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


def build_text(texts_json, delimiter, replacements_json, text_inputs):
    texts = json.loads(texts_json)
    if not isinstance(texts, list):
        raise ValueError("texts_json must contain a JSON list")

    replacements = json.loads(replacements_json)
    enabled_texts = []
    for index, item in enumerate(texts):
        if isinstance(item, dict):
            if not item.get("enabled", True):
                continue
            key = f"text_{index + 1}"
            if key in text_inputs:
                # Replacement rules only change strings received through a socket; a string they empty is left out.
                text = apply_replacements(str(text_inputs[key]), replacements, delimiter)
                if text:
                    enabled_texts.append(text)
            else:
                enabled_texts.append(str(item.get("text", "")))
        else:
            enabled_texts.append(str(item))

    if not enabled_texts:
        return ""

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

    return result


# Executions paused by "Wait for validation", keyed by node execution id, until the validate route releases them.
WAITING = {}


def build_text_from_request(data):
    return build_text(data["texts_json"], data["delimiter"], data["replacements_json"], data["text_inputs"])


@PromptServer.instance.routes.post("/ultimate_concatenator/refresh")
async def refresh_text(request):
    return web.json_response({"text": build_text_from_request(await request.json())})


@PromptServer.instance.routes.post("/ultimate_concatenator/validate")
async def validate_text(request):
    data = await request.json()
    waiting = WAITING.get(data["node"])
    if waiting is None:
        return web.json_response({"error": "This node is not waiting for validation."}, status=409)
    waiting["text"] = build_text_from_request(data)
    waiting["released"].set()
    return web.json_response({"text": waiting["text"]})


class UltimateTextConcatenator:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "texts_json": ("STRING", {"default": '[{"text":"","enabled":true}]', "hidden": True}),
                "delimiter": ("STRING", {"default": ", "}),
                "replacements_json": ("STRING", {"default": '{"clean_up":true,"rules":[]}', "hidden": True}),
                "wait_for_validation": ("BOOLEAN", {"default": False}),
            },
            "optional": TextInputs(),
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "concatenate"
    CATEGORY = "text"

    @classmethod
    def IS_CHANGED(cls, wait_for_validation, **kwargs):
        # A node waiting for validation must pause on every run, even when its inputs did not change.
        return float("nan") if wait_for_validation else ""

    def concatenate(self, texts_json, delimiter, replacements_json, wait_for_validation, unique_id, **text_inputs):
        result = build_text(texts_json, delimiter, replacements_json, text_inputs)
        if wait_for_validation:
            waiting = {"released": threading.Event(), "text": result}
            WAITING[unique_id] = waiting
            PromptServer.instance.send_sync(
                "ultimate_concatenator.waiting",
                {"node": unique_id, "text": result, "text_inputs": text_inputs},
            )
            try:
                while not waiting["released"].wait(0.1):
                    comfy.model_management.throw_exception_if_processing_interrupted()
            finally:
                del WAITING[unique_id]
                PromptServer.instance.send_sync("ultimate_concatenator.released", {"node": unique_id})
            result = waiting["text"]

        return {"ui": {"text": [result], "text_inputs": [text_inputs]}, "result": (result,)}


NODE_CLASS_MAPPINGS = {
    "UltimateTextConcatenator": UltimateTextConcatenator,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "UltimateTextConcatenator": "Ultimate Text Concatenator",
}

WEB_DIRECTORY = "./web"
