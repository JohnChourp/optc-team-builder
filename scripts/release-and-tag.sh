#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage:
  release-and-tag.sh [--bump patch|minor|major] [--version X.Y.Z] [--code N] [--no-push] [--skip-gh-release] [--require-gh-release]
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
BUILD_ARTIFACTS_DIR="${PROJECT_ROOT}/build-artifacts/releases"
BUILD_MOBILE_COMMAND="${BUILD_MOBILE_COMMAND:-npm run build:mobile}"

BUMP_TYPE=""
EXPLICIT_VERSION=""
EXPLICIT_CODE=""
NO_PUSH=0
SKIP_GH_RELEASE=0
REQUIRE_GH_RELEASE=0
BUMP_ARGS=()

while (($# > 0)); do
    case "$1" in
        --bump)
            BUMP_TYPE="${2:-}"
            BUMP_ARGS+=("$1" "${2:-}")
            shift 2
            ;;
        --version)
            EXPLICIT_VERSION="${2:-}"
            BUMP_ARGS+=("$1" "${2:-}")
            shift 2
            ;;
        --code)
            EXPLICIT_CODE="${2:-}"
            BUMP_ARGS+=("$1" "${2:-}")
            shift 2
            ;;
        --no-push)
            NO_PUSH=1
            shift
            ;;
        --skip-gh-release)
            SKIP_GH_RELEASE=1
            shift
            ;;
        --require-gh-release)
            REQUIRE_GH_RELEASE=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

ensure_tool() {
    local tool_name="$1"
    if ! command -v "${tool_name}" >/dev/null 2>&1; then
        echo "ERROR: Required tool '${tool_name}' is not available in PATH." >&2
        exit 1
    fi
}

ensure_release_signing_env() {
    local missing=0
    local required_vars=(
        ANDROID_SIGNING_STORE_FILE
        ANDROID_SIGNING_STORE_PASSWORD
        ANDROID_SIGNING_KEY_ALIAS
        ANDROID_SIGNING_KEY_PASSWORD
    )

    for var_name in "${required_vars[@]}"; do
        if [[ -z "${!var_name:-}" ]]; then
            echo "ERROR: Missing required env var ${var_name}." >&2
            missing=1
        fi
    done

    if (( missing == 1 )); then
        cat >&2 <<'EOF'
Set the Android signing env vars before running the release:
  export ANDROID_SIGNING_STORE_FILE=/absolute/path/to/keystore.jks
  export ANDROID_SIGNING_STORE_PASSWORD=...
  export ANDROID_SIGNING_KEY_ALIAS=...
  export ANDROID_SIGNING_KEY_PASSWORD=...
EOF
        exit 1
    fi

    if [[ ! -f "${ANDROID_SIGNING_STORE_FILE}" ]]; then
        echo "ERROR: ANDROID_SIGNING_STORE_FILE does not exist: ${ANDROID_SIGNING_STORE_FILE}" >&2
        exit 1
    fi
}

ensure_gh_or_fallback_skip() {
    if (( NO_PUSH == 1 || SKIP_GH_RELEASE == 1 )); then
        return
    fi

    if ! command -v gh >/dev/null 2>&1; then
        if (( REQUIRE_GH_RELEASE == 1 )); then
            echo "ERROR: gh CLI not found but --require-gh-release was requested." >&2
            exit 1
        fi
        echo "[release] gh CLI not found. Falling back to --skip-gh-release." >&2
        SKIP_GH_RELEASE=1
        return
    fi

    if ! gh auth status >/dev/null 2>&1; then
        if (( REQUIRE_GH_RELEASE == 1 )); then
            echo "ERROR: gh auth is unavailable but --require-gh-release was requested." >&2
            exit 1
        fi
        echo "[release] gh auth is unavailable. Falling back to --skip-gh-release." >&2
        SKIP_GH_RELEASE=1
    fi
}

generate_release_notes() {
    local version="$1"
    local version_code="$2"
    local previous_tag="$3"
    local notes_file="$4"
    local range_spec=""

    if [[ -n "${previous_tag}" ]]; then
        range_spec="${previous_tag}..HEAD"
    else
        range_spec="HEAD"
    fi

    {
        printf '# OPTC Team Builder %s\n\n' "v${version}"
        printf -- '- Version: `%s`\n' "${version}"
        printf -- '- Version code: `%s`\n' "${version_code}"
        printf -- '- Branch: `%s`\n' "$(git rev-parse --abbrev-ref HEAD)"
        if [[ -n "${previous_tag}" ]]; then
            printf -- '- Changes since: `%s`\n' "${previous_tag}"
        else
            printf -- '- Changes since: first tagged release\n'
        fi
        printf '\n## Commits\n\n'
        git log "${range_spec}" --pretty=format:'- %s (%h)'
        printf '\n'
    } > "${notes_file}"
}

ensure_tool git
ensure_tool node
ensure_tool npm
ensure_release_signing_env

if (( REQUIRE_GH_RELEASE == 1 && SKIP_GH_RELEASE == 1 )); then
    echo "ERROR: --require-gh-release cannot be combined with --skip-gh-release." >&2
    exit 1
fi

if (( REQUIRE_GH_RELEASE == 1 && NO_PUSH == 1 )); then
    echo "ERROR: --require-gh-release cannot be combined with --no-push." >&2
    exit 1
fi

ensure_gh_or_fallback_skip

if [[ -z "${BUMP_TYPE}" && -z "${EXPLICIT_VERSION}" ]]; then
    BUMP_TYPE="patch"
    BUMP_ARGS=(--bump patch)
fi

cd "${PROJECT_ROOT}"

PREVIOUS_TAG="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"

VERSION_INFO="$("${PROJECT_ROOT}/scripts/bump-version.sh" --print-only "${BUMP_ARGS[@]}")"
RELEASE_VERSION="$(printf '%s\n' "${VERSION_INFO}" | awk -F= '$1=="VERSION"{print $2}')"
RELEASE_CODE="$(printf '%s\n' "${VERSION_INFO}" | awk -F= '$1=="CODE"{print $2}')"
RELEASE_TAG="v${RELEASE_VERSION}"

if git show-ref --verify --quiet "refs/tags/${RELEASE_TAG}"; then
    echo "ERROR: Git tag ${RELEASE_TAG} already exists." >&2
    exit 1
fi

"${PROJECT_ROOT}/scripts/bump-version.sh" "${BUMP_ARGS[@]}" >/dev/null

mkdir -p "${BUILD_ARTIFACTS_DIR}/${RELEASE_TAG}"

# Allow CI to override the web/native sync command without changing the local default.
bash -lc "${BUILD_MOBILE_COMMAND}"

(
    cd "${PROJECT_ROOT}/android"
    ./gradlew clean assembleRelease
)

APK_SOURCE_PATH="${PROJECT_ROOT}/android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "${APK_SOURCE_PATH}" ]]; then
    echo "ERROR: Expected release APK not found at ${APK_SOURCE_PATH}" >&2
    exit 1
fi

APK_OUTPUT_PATH="${BUILD_ARTIFACTS_DIR}/${RELEASE_TAG}/optc-team-builder-${RELEASE_TAG}.apk"
RELEASE_NOTES_PATH="${BUILD_ARTIFACTS_DIR}/${RELEASE_TAG}/RELEASE_NOTES.md"
cp "${APK_SOURCE_PATH}" "${APK_OUTPUT_PATH}"

git add -A
if git diff --cached --quiet; then
    echo "ERROR: No changes were staged for the release commit." >&2
    exit 1
fi

git commit -m "release: ${RELEASE_TAG}"
generate_release_notes "${RELEASE_VERSION}" "${RELEASE_CODE}" "${PREVIOUS_TAG}" "${RELEASE_NOTES_PATH}"
git tag -a "${RELEASE_TAG}" -m "Release ${RELEASE_TAG}"

if (( NO_PUSH == 0 )); then
    CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "${CURRENT_BRANCH}" == "HEAD" ]]; then
        echo "ERROR: Cannot push from detached HEAD." >&2
        exit 1
    fi
    git push origin "${CURRENT_BRANCH}"
    git push origin "${RELEASE_TAG}"
fi

if (( NO_PUSH == 0 && SKIP_GH_RELEASE == 0 )); then
    gh release create "${RELEASE_TAG}" "${APK_OUTPUT_PATH}" \
        --title "${RELEASE_TAG}" \
        --notes-file "${RELEASE_NOTES_PATH}"
fi

printf 'Release prepared: %s\n' "${RELEASE_TAG}"
printf 'APK: %s\n' "${APK_OUTPUT_PATH}"
printf 'Notes: %s\n' "${RELEASE_NOTES_PATH}"
if (( NO_PUSH == 1 )); then
    printf 'Push skipped (--no-push).\n'
fi
if (( SKIP_GH_RELEASE == 1 )); then
    printf 'GitHub Release publish skipped.\n'
fi
