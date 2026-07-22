#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:-build-and-enforce}"
case "${mode}" in
  build-and-enforce|--capture-only|--enforce-only) ;;
  *)
    echo "Usage: $0 [--capture-only|--enforce-only]" >&2
    exit 64
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact_dir="${NIVASA_RENDER_ARTIFACT_DIR:-${repo_root}/artifacts/render}"
exit_file="${artifact_dir}/build-exit-code.txt"
log_file="${artifact_dir}/build.log"

read_recorded_status() {
  if [[ ! -f "${exit_file}" ]]; then
    echo "Render build evidence is incomplete: ${exit_file} does not exist." >&2
    return 66
  fi
  local recorded
  recorded="$(tr -d '[:space:]' < "${exit_file}")"
  if [[ ! "${recorded}" =~ ^[0-9]+$ ]] || (( recorded > 255 )); then
    echo "Render build evidence is invalid: ${exit_file} must contain one exit code from 0 to 255." >&2
    return 65
  fi
  if (( recorded != 0 )); then
    echo "Render-equivalent Docker build failed with exit code ${recorded}. Inspect ${log_file} and fix the first failing Docker layer." >&2
  fi
  return "${recorded}"
}

if [[ "${mode}" == "--enforce-only" ]]; then
  read_recorded_status
  exit $?
fi

for command in docker git tee; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command}" >&2
    exit 69
  fi
done

docker version >/dev/null
mkdir -p "${artifact_dir}"
: > "${log_file}"

commit="${RENDER_GIT_COMMIT:-${CIRCLE_SHA1:-$(git -C "${repo_root}" rev-parse HEAD 2>/dev/null || printf 'unversioned')}}"
branch="${RENDER_GIT_BRANCH:-${CIRCLE_BRANCH:-$(git -C "${repo_root}" branch --show-current 2>/dev/null || true)}}"
branch="${branch:-detached}"
hostname="${RENDER_EXTERNAL_HOSTNAME:-nivasaos-ci.onrender.com}"
external_url="${RENDER_EXTERNAL_URL:-https://${hostname}}"
short_commit="${commit:0:12}"
safe_commit="$(printf '%s' "${short_commit}" | LC_ALL=C sed 's/[^[:alnum:]_.-]/-/g')"
safe_commit="${safe_commit:-unversioned}"
image_tag="${NIVASA_RENDER_IMAGE_TAG:-nivasaos:render-${safe_commit}}"

if [[ ! "${hostname}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "RENDER_EXTERNAL_HOSTNAME must contain only a hostname." >&2
  exit 64
fi
if [[ "${external_url}" != "https://${hostname}" ]]; then
  echo "RENDER_EXTERNAL_URL must equal https://${hostname} for the build reproduction." >&2
  exit 64
fi

cat > "${artifact_dir}/build-metadata.txt" <<META
commit=${commit}
branch=${branch}
hostname=${hostname}
external_url=${external_url}
image_tag=${image_tag}
META

set +e
DOCKER_BUILDKIT=1 docker build --pull --progress=plain \
  --build-arg "RENDER_EXTERNAL_HOSTNAME=${hostname}" \
  --build-arg "RENDER_EXTERNAL_URL=${external_url}" \
  --build-arg "RENDER_GIT_COMMIT=${commit}" \
  --build-arg "RENDER_GIT_BRANCH=${branch}" \
  --tag "${image_tag}" \
  "${repo_root}" 2>&1 | tee "${log_file}"
build_status=${PIPESTATUS[0]}
set -e

printf '%s\n' "${build_status}" > "${exit_file}"
if (( build_status == 0 )); then
  docker image inspect "${image_tag}" > "${artifact_dir}/image-inspect.json"
  docker image ls "${image_tag}" --format '{{json .}}' > "${artifact_dir}/image-size.jsonl"
else
  rm -f "${artifact_dir}/image-inspect.json" "${artifact_dir}/image-size.jsonl"
fi

if [[ "${mode}" == "--capture-only" ]]; then
  exit 0
fi

read_recorded_status
exit $?
