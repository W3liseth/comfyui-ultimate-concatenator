import json


class UltimateTextConcatenator:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "texts_json": ("STRING", {"default": '[{"text":"","enabled":true}]', "hidden": True}),
                "delimiter": ("STRING", {"default": ", "}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "concatenate"
    CATEGORY = "text"

    def concatenate(self, texts_json, delimiter):
        texts = json.loads(texts_json)
        if not isinstance(texts, list):
            raise ValueError("texts_json must contain a JSON list")

        enabled_texts = []
        for item in texts:
            if isinstance(item, dict):
                if item.get("enabled", True):
                    enabled_texts.append(str(item.get("text", "")))
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

        return (result,)


NODE_CLASS_MAPPINGS = {
    "UltimateTextConcatenator": UltimateTextConcatenator,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "UltimateTextConcatenator": "Ultimate Text Concatenator",
}

WEB_DIRECTORY = "./web"
