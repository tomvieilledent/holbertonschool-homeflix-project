#!/usr/bin/env python3
"""Valide chaque fixture JSON contre le schéma OpenAPI correspondant (docs/api/*.openapi.yaml).

Usage : python3 docs/api/fixtures/validate.py
Prérequis : PyYAML et jsonschema (pip install pyyaml jsonschema).
Code de sortie : 0 si tout est valide, 1 sinon.
"""
import json
import re
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

HERE = Path(__file__).resolve().parent
API = HERE.parent

# fichier (ou motif) -> (contrat, schéma, "array" si la fixture est une liste d'éléments du schéma)
RULES = [
    ("library/media-page*.json", "library", "MediaPage", False),
    ("library/media-detail*.json", "library", "MediaItem", False),
    ("library/genres.json", "library", None, False),
    ("library/continue-watching.json", "library", "ContinueWatchingItem", True),
    ("library/favourites.json", "library", "MediaItem", True),
    ("library/progress-*.json", "library", "Progress", False),
    ("library/stream-ticket.json", "library", "StreamTicket", False),
    ("library/home*.json", "library", "Home", False),
    ("library/index-job-*.json", "library", "IndexJob", False),
    ("library/media-roots.json", "library", "MediaRoot", True),
    ("identity/setup-status-*.json", "identity", "SetupStatus", False),
    ("identity/token-response.json", "identity", "TokenResponse", False),
    ("identity/me*.json", "identity", "Me", False),
    ("identity/profiles.json", "identity", "Profile", True),
    ("identity/accounts-page.json", "identity", "AccountPage", False),
    ("errors/*.json", "library", "Problem", False),
]

_specs = {}


def spec(name):
    if name not in _specs:
        _specs[name] = yaml.safe_load((API / f"{name}.openapi.yaml").read_text(encoding="utf-8"))
    return _specs[name]


def to_json_schema(node):
    """OpenAPI 3.0 -> JSON Schema : `nullable: true` devient une union avec null."""
    if isinstance(node, dict):
        node = {k: to_json_schema(v) for k, v in node.items()}
        if node.get("nullable") is True and "type" in node:
            node["type"] = [node["type"], "null"]
        node.pop("nullable", None)
        node.pop("writeOnly", None)
    elif isinstance(node, list):
        node = [to_json_schema(v) for v in node]
    return node


def validator(contract, schema, array):
    components = to_json_schema(spec(contract)["components"])
    ref = {"$ref": f"#/components/schemas/{schema}"}
    root = {"components": components, **({"type": "array", "items": ref} if array else ref)}
    return Draft202012Validator(root, format_checker=FormatChecker())


def conventions_codes():
    """Codes d'erreur métier et statuts HTTP du tableau de CONVENTIONS.md."""
    text = (API / "CONVENTIONS.md").read_text(encoding="utf-8")
    return {code: int(status) for code, status in re.findall(r"^\| `([A-Z_]+)` \| (\d{3}) \|", text, re.M)}


def main():
    errors = []
    seen = set()
    codes = conventions_codes()
    for pattern, contract, schema, array in RULES:
        for path in sorted(HERE.glob(pattern)):
            seen.add(path)
            data = json.loads(path.read_text(encoding="utf-8"))
            if schema is None:  # genres : liste de chaînes
                if not (isinstance(data, list) and all(isinstance(x, str) for x in data)):
                    errors.append(f"{path.relative_to(HERE)} : liste de chaînes attendue")
                continue
            for err in validator(contract, schema, array).iter_errors(data):
                where = "/".join(str(p) for p in err.absolute_path)
                errors.append(f"{path.relative_to(HERE)} [{where}] : {err.message}")
            if pattern == "errors/*.json":
                code, status = data["code"], data["status"]
                if code not in codes:
                    errors.append(f"{path.relative_to(HERE)} : code {code} absent de CONVENTIONS.md")
                elif codes[code] != status:
                    errors.append(f"{path.relative_to(HERE)} : statut {status} différent de CONVENTIONS.md ({codes[code]})")

    for path in sorted(HERE.rglob("*.json")):
        if path not in seen:
            errors.append(f"{path.relative_to(HERE)} : aucune règle de validation")

    # Cohérence entre fixtures : tout média cité existe dans le catalogue
    load = lambda p: json.loads((HERE / p).read_text(encoding="utf-8"))
    ids = {m["id"] for m in load("library/media-page.json")["items"]}
    cited = [m["id"] for m in load("library/favourites.json")]
    cited += [i["media"]["id"] for i in load("library/continue-watching.json")]
    cited += [m["id"] for m in load("library/home.json")["recentlyAdded"]]
    cited += [m["id"] for s in load("library/home.json")["categories"] for m in s["items"]]
    for i in sorted(set(cited) - ids):
        errors.append(f"média {i} cité mais absent de library/media-page.json")

    if errors:
        print("\n".join(errors))
        print(f"\n{len(errors)} erreur(s)")
        return 1
    print(f"{len(seen)} fixtures valides")
    return 0


if __name__ == "__main__":
    sys.exit(main())
