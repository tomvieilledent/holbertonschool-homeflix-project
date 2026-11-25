#!/usr/bin/env python3
"""Compare les endpoints (méthode + chemin) de l'OpenAPI générée par springdoc avec les contrats docs/api (#108).

Usage : scripts/check-openapi.py <service> [<service>...]   (identity, library, acquisition)
Prérequis : `./mvnw test -Dtest=OpenApiDumpTests` dans chaque service (écrit target/openapi.json).
Code de sortie 1 si un endpoint n'existe que d'un côté. Les chemins /internal/** relèvent de docs/api/internal.md.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACTS = ROOT.parent / "docs" / "api"
METHODS = {"get", "put", "post", "delete", "patch"}
IGNORED = ("/internal/", "/v3/api-docs", "/actuator")


def norm(path):
    path = re.sub(r"\{[^}]+\}", "{}", path)
    return path[len("/api/v1"):] if path.startswith("/api/v1") else path


def from_contract(file):
    ops, path, in_paths = set(), None, False
    for line in file.read_text(encoding="utf-8").splitlines():
        if re.match(r"^paths:\s*$", line):
            in_paths = True
        elif in_paths and re.match(r"^\S", line):
            in_paths = False
        elif in_paths:
            m = re.match(r"^  (/\S*):\s*$", line)
            if m:
                path = norm(m.group(1))
                continue
            m = re.match(r"^    (\w+):", line)
            if m and path is not None and m.group(1) in METHODS:
                ops.add((m.group(1).upper(), path))
    return ops


def from_generated(file):
    doc = json.loads(file.read_text(encoding="utf-8"))
    return {(m.upper(), norm(p)) for p, item in doc["paths"].items() for m in item
            if m in METHODS and not p.startswith(IGNORED)}


status = 0
for service in sys.argv[1:] or ["identity", "library", "acquisition"]:
    generated = from_generated(ROOT / f"{service}-service" / "target" / "openapi.json")
    contract = from_contract(CONTRACTS / f"{service}.openapi.yaml")
    only_code, only_contract = sorted(generated - contract), sorted(contract - generated)
    print(f"== {service} : {len(generated)} endpoints implémentés, {len(contract)} au contrat")
    for m, p in only_code:
        print(f"  CODE SEUL     {m} {p}")
    for m, p in only_contract:
        print(f"  CONTRAT SEUL  {m} {p}")
    status |= bool(only_code or only_contract)
print("OK : code et contrats concordent." if not status else "ÉCART : voir ci-dessus.")
sys.exit(status)
