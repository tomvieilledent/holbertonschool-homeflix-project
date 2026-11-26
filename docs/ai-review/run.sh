#!/usr/bin/env bash
# Lance l'agent « API & Security Consistency Reviewer » avec le Claude Code installé sur ce poste, sur la session
# claude.ai de l'utilisateur (aucune clé d'API). L'agent ne voit qu'une copie des entrées autorisées par
# docs/AI_AGENT_ROLE.md (section 2) : ni secret, ni média. Il n'a ni shell, ni réseau, ni GitHub.
# Usage : ./docs/ai-review/run.sh   (le modèle tourne chez Anthropic : les fichiers copiés lui sont envoyés)
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$root"
agent=api-security-reviewer
commit="$(git rev-parse --short HEAD)"
work="$(mktemp -d)"

git archive HEAD -- \
  docs/api docs/adr docs/architecture/data-model.md docs/RISKS.md docs/PROJECT_EXECUTION_PLAN.md \
  docs/AI_AGENT_ROLE.md \
  homeflix/identity-service/src homeflix/library-service/src homeflix/acquisition-service/src \
  homeflix/frontend/src/services homeflix/frontend/nginx.conf \
  homeflix/compose.yaml homeflix/compose.dev.yaml homeflix/.env.example homeflix/frontend/.env.example \
  | tar -x -C "$work"
mkdir -p "$work/docs/ai-review"

# La définition de l'agent est transmise explicitement : le mode restreint ignore les réglages du projet.
agents_json="$(python3 -I - ".claude/agents/$agent.md" "$agent" <<'PY'
import json, sys
_, header, prompt = open(sys.argv[1], encoding="utf-8").read().split("---\n", 2)
meta = dict(line.split(": ", 1) for line in header.strip().splitlines())
print(json.dumps({sys.argv[2]: {"description": meta["description"], "prompt": prompt.strip(),
                                "tools": [t.strip() for t in meta["tools"].split(",")]}}))
PY
)"

echo "Commit $commit, copie isolée : $work"
(
  cd "$work"
  env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u CLAUDECODE claude \
    --restricted --strict-mcp-config --tools Read,Grep,Glob,Write --permission-mode acceptEdits \
    --agents "$agents_json" --agent "$agent" \
    -p "Lance la revue. Commit analysé : $commit (branche main). Date : $(date +%F). Écris docs/ai-review/REPORT.md."
)

report="$work/docs/ai-review/REPORT.md"
[ -s "$report" ] || { echo "Échec : aucun rapport produit." >&2; exit 1; }
target=docs/ai-review/REPORT.md
# Ne jamais écraser un rapport existant : il peut contenir des décisions humaines.
[ -e "$target" ] && target="docs/ai-review/REPORT.$(date +%Y%m%d-%H%M%S).md"
cp "$report" "$target"
echo "Rapport : $target"
