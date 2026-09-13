#!/usr/bin/env bash
# Copy the current Kimodo worker onto the Runpod host and restart it.
# Usage:
#   RUNPOD_SSH='root@HOST -p PORT' ./services/kimodo/deploy-remote.sh
# or:
#   ./services/kimodo/deploy-remote.sh root@HOST -p PORT
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
KEY="${RUNPOD_SSH_KEY:-$HOME/.ssh/id_ed25519_runpod_formchain}"
REMOTE_DIR="${KIMODO_REMOTE_DIR:-/workspace/formchain-kimodo}"

if [[ -n "${RUNPOD_SSH:-}" ]]; then
  # shellcheck disable=SC2206
  SSH_TARGET=(${RUNPOD_SSH})
elif [[ $# -gt 0 ]]; then
  SSH_TARGET=("$@")
else
  echo "Set RUNPOD_SSH to the pod SSH target, e.g. root@<ip> -p <port>" >&2
  exit 1
fi

SSH=(ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${SSH_TARGET[@]}")
SCP=(scp -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

echo "Uploading worker.py and start.sh to ${REMOTE_DIR}/ ..."
"${SCP[@]}" \
  "$ROOT/worker.py" \
  "$ROOT/start.sh" \
  "${SSH_TARGET[-1]}:${REMOTE_DIR}/"

echo "Restarting Kimodo worker..."
"${SSH[@]}" "bash -lc '
  set -euo pipefail
  cd \"$REMOTE_DIR\"
  chmod +x start.sh
  # Prefer the existing helper if present; otherwise restart worker.py directly.
  if [[ -x start-services.sh ]]; then
    ./start-services.sh
  else
    pkill -f \"python3 .*worker.py\" || true
    nohup ./start.sh > /tmp/formchain-kimodo-worker.log 2>&1 &
  fi
  sleep 1
  curl -sS -m 5 -H \"Authorization: Bearer \${KIMODO_API_TOKEN}\" http://127.0.0.1:8000/health || true
'"

echo "Deploy requested. Confirm /health includes input=structured meta.json via --input_folder"
