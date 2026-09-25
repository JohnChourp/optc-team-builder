#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage:
  release-and-tag.sh [--bump patch|minor|major] [--version X.Y.Z] [--code N] [--precommit-message MESSAGE] [--no-push] [--skip-gh-release] [--require-gh-release]
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
PRECOMMIT_MESSAGE="chore: prepare release changes"
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
        --precommit-message)
            PRECOMMIT_MESSAGE="${2:-}"
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

ensure_branch_push_state() {
    local current_branch
    local remote_ref
    local counts
    local behind_count
    local ahead_count

    if (( NO_PUSH == 1 )); then
        return
    fi

    current_branch="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "${current_branch}" == "HEAD" ]]; then
        echo "ERROR: Cannot push from detached HEAD." >&2
        exit 1
    fi

    if ! git fetch origin "+refs/heads/${current_branch}:refs/remotes/origin/${current_branch}" >/dev/null 2>&1; then
        echo "ERROR: Failed to fetch origin/${current_branch}; cannot verify release push state." >&2
        exit 1
    fi

    remote_ref="refs/remotes/origin/${current_branch}"
    if ! git show-ref --verify --quiet "${remote_ref}"; then
        echo "[release] No origin/${current_branch} branch found. Release push will create it." >&2
        return
    fi

    counts="$(git rev-list --left-right --count "${remote_ref}...HEAD")"
    behind_count="$(printf '%s\n' "${counts}" | awk '{print $1}')"
    ahead_count="$(printf '%s\n' "${counts}" | awk '{print $2}')"

    if (( behind_count > 0 )); then
        cat >&2 <<EOF
ERROR: Current branch is behind origin/${current_branch} by ${behind_count} commit(s).
Pull/rebase before running the release so the release commit can be pushed safely.
EOF
        exit 1
    fi

    if (( ahead_count > 0 )); then
        echo "[release] Current branch has ${ahead_count} unpushed commit(s); they will be pushed together with the release commit." >&2
    fi
}

has_uncommitted_changes() {
    ! git diff --quiet ||
        ! git diff --cached --quiet ||
        [[ -n "$(git ls-files --others --exclude-standard)" ]]
}

commit_uncommitted_changes() {
    if ! has_uncommitted_changes; then
        return
    fi

    if [[ -z "${PRECOMMIT_MESSAGE}" ]]; then
        echo "ERROR: --precommit-message cannot be empty when local changes are present." >&2
        exit 1
    fi

    echo "[release] Committing existing local changes before version bump." >&2
    git add -A
    if git diff --cached --quiet; then
        echo "ERROR: Local changes were detected but no committable changes were staged." >&2
        exit 1
    fi
    git commit -m "${PRECOMMIT_MESSAGE}"
}

prune_android_ds_store() {
    find "${PROJECT_ROOT}/android" -type f -name '.DS_Store' -delete 2>/dev/null || true
}

# 869f13d5t. The install explanation, on the page where the install happens.
#
# The `/supported` screen already answers this - in EN and EL - for somebody who has the
# app. This is for somebody who does not: they arrive at a GitHub Release, see a generated
# commit list, and are asked to allow installation from an unknown source. That warning is
# correct and should be respected, so the text says what it is rather than talking the
# reader past it.
#
# Deliberately NOT a safety claim. "Here is what it does and how to check the file" is
# something this project can stand behind; "it is safe" is not, and a stranger's APK is
# exactly the case where that distinction matters.
#
# Greek as well as English, unlike the What's New paragraph: that one is duplicated by the
# in-app modal, and this one has no in-app counterpart for a reader who has not installed
# anything yet.
install_preamble() {
    cat <<'PREAMBLE'
## Before you install

**What this is.** OPTC Team Builder, a fan-made planning tool for One Piece Treasure
Cruise. It is not made by, endorsed by, or connected to Bandai Namco.

**Why your phone will warn you.** This app is not on Google Play, so Android asks you to
allow installing from an unknown source and shows a warning. That warning is doing its job
- it is how malware arrives too - and it is worth reading rather than clicking past.

**What it asks for once installed.** Exactly two permissions: internet access, and
permission to install packages so the app can install its own updates when you accept one.
Nothing else - no contacts, no location, no camera.

**How to check the file is the one published here.** GitHub shows a SHA-256 for the `.apk`
above. Compare it with the file you downloaded:

```bash
shasum -a 256 optc-team-builder-vX.Y.Z.apk
```

That tells you the download was not corrupted or swapped in transit. It does not, and
cannot, tell you the app is safe - only that you have the file this page published.

**Source.** https://github.com/JohnChourp/optc-team-builder

---

## Πριν την εγκατάσταση

**Τι είναι.** Το OPTC Team Builder, ένα fan-made εργαλείο σχεδιασμού για το One Piece
Treasure Cruise. Δεν κατασκευάζεται από τη Bandai Namco, δεν εγκρίνεται από αυτήν και δεν
συνδέεται με αυτήν.

**Γιατί σε προειδοποιεί το τηλέφωνο.** Η εφαρμογή δεν είναι στο Google Play, οπότε το
Android σού ζητά να επιτρέψεις εγκατάσταση από άγνωστη πηγή και δείχνει προειδοποίηση.
Αυτή η προειδοποίηση κάνει τη δουλειά της - έτσι φτάνει και το κακόβουλο λογισμικό - και
αξίζει να τη διαβάσεις αντί να την προσπεράσεις.

**Τι ζητά μόλις εγκατασταθεί.** Ακριβώς δύο άδειες: πρόσβαση στο internet, και άδεια
εγκατάστασης πακέτων ώστε να μπορεί να εγκαθιστά τις δικές της ενημερώσεις όταν τις
αποδέχεσαι. Τίποτα άλλο - ούτε επαφές, ούτε τοποθεσία, ούτε κάμερα.

**Πώς ελέγχεις ότι το αρχείο είναι αυτό που δημοσιεύτηκε εδώ.** Το GitHub δείχνει ένα
SHA-256 για το `.apk` παραπάνω. Σύγκρινέ το με το αρχείο που κατέβασες με την ίδια εντολή.

Αυτό σου λέει ότι η λήψη δεν αλλοιώθηκε στον δρόμο. Δεν σου λέει - και δεν μπορεί να σου
πει - ότι η εφαρμογή είναι ασφαλής· μόνο ότι έχεις το αρχείο που δημοσίευσε αυτή η σελίδα.
PREAMBLE
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
        printf '\n'
        install_preamble
        printf '\n## Commits\n\n'
        git log "${range_spec}" --pretty=format:'- %s (%h)'
        printf '\n'
    } > "${notes_file}"
}

ensure_tool git
ensure_tool node
ensure_tool npm

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
ensure_branch_push_state
commit_uncommitted_changes
ensure_release_signing_env

# 869f127cq. Everything that can refuse the release runs first, before npm install and before the
# dataset import. Both of those write to the tree, and a release refused after them has already
# spent two minutes and left files changed for a release that was never going to happen.
PREVIOUS_TAG="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"

VERSION_INFO="$("${PROJECT_ROOT}/scripts/bump-version.sh" --print-only "${BUMP_ARGS[@]}")"
RELEASE_VERSION="$(printf '%s\n' "${VERSION_INFO}" | awk -F= '$1=="VERSION"{print $2}')"
RELEASE_CODE="$(printf '%s\n' "${VERSION_INFO}" | awk -F= '$1=="CODE"{print $2}')"
RELEASE_TAG="v${RELEASE_VERSION}"

if git show-ref --verify --quiet "refs/tags/${RELEASE_TAG}"; then
    echo "ERROR: Git tag ${RELEASE_TAG} already exists." >&2
    exit 1
fi

# 869f127cq. BEFORE the bump, and fatal on purpose - unlike the generator call below.
#
# check-whats-new.mjs fails the moment package.json moves ahead of the entry list, so a code
# release with a forgotten entry used to be caught only after this script had bumped, committed and
# tagged, leaving main red until somebody noticed. Refusing here costs nothing: nothing has been
# written yet.
#
# The unattended data-only chain is exempt inside the check itself, on the generator's own
# definition - zero commits since the previous tag - so the nightly path reaches the generator
# below exactly as before.
node "${PROJECT_ROOT}/scripts/check-release-whats-new-ready.mjs" \
    --app-root "${PROJECT_ROOT}" \
    --version "${RELEASE_VERSION}" \
    --previous-tag "${PREVIOUS_TAG}"

echo "[release] Installing npm dependencies." >&2
npm install

echo "[release] Refreshing OPTC data before version bump." >&2
npm run data:import:all

# 869f127dr. The dataset only moves here, which is why an importer change goes red on main rather
# than on the branch that made it. This is the first moment the new data and the specs that pin it
# exist together, so it is the last moment the release can refuse instead of committing a tree that
# will be red on main.
# 869f127f6. The unresolved-clause record is a function of the dataset, so it is REGENERATED here
# rather than checked: a release that moves the data moves this with it, in the same commit. A rise
# in the count after an upstream release is then a signal somebody can see, which is the whole point
# - it is never a failure, because degrading to the game's own English is the owner's rule.
echo "[release] Recording clauses that will show in the game's own English." >&2
node "${PROJECT_ROOT}/scripts/generate-unresolved-clauses.mjs" --app-root "${PROJECT_ROOT}"

# 869f127e9. Same reason, different artifact: the measured figures move with the dataset, and the
# comments that quote them are checked against this file by `npm run dataset:measurements`.
echo "[release] Re-measuring the dataset figures quoted in source comments." >&2
node "${PROJECT_ROOT}/scripts/measure-dataset-facts.mjs" --app-root "${PROJECT_ROOT}"

# Owner, 2026-09-25 (wave-11 close). Until then a release that added characters left three lanes
# red on main: nothing here regenerated docs/dataset-schema.json or docs/offline-pack-contract.json,
# and the figures source comments quote with `[@dataset ...]` markers stayed at the old roster. A
# rehearsal of 0.7.0 against the live upstream read 74 of 77. Both documents are generated from what
# the import just wrote, so they are regenerated with it. Only the marked NUMBERS move, never the
# words around them; each moved figure is printed so a person can reread its paragraph. --write still
# checks afterwards and exits non-zero on anything it cannot fix, which stops the release here rather
# than after it has committed a tree that is red on main.
echo "[release] Regenerating the dataset schema and the offline pack contract." >&2
npm run dataset:schema
npm run packs:contract
echo "[release] Moving the figures quoted in source comments to the new measurements." >&2
node "${PROJECT_ROOT}/scripts/check-dataset-measurements.mjs" --app-root "${PROJECT_ROOT}" --write

echo "[release] Checking spec pins against the regenerated dataset." >&2
node "${PROJECT_ROOT}/scripts/check-dataset-spec-pins.mjs" --app-root "${PROJECT_ROOT}"

"${PROJECT_ROOT}/scripts/bump-version.sh" "${BUMP_ARGS[@]}" >/dev/null

# The nightly release chain has no human to write the What's New entry, and
# check-whats-new.mjs fails the moment package.json moves ahead of the list -
# so an unattended data release used to leave main red until someone noticed.
# This never overwrites an entry a person already wrote for this version.
#
# Deliberately non-fatal: this script runs under `set -e`, so without the guard
# a generator that threw - on a refactor of one declaration line, say - would
# abort an otherwise-good release, unattended, mid-bump. A missing entry is a
# red lane someone fixes; a dead release at 12:21 UTC is worse than the problem
# this automation exists to solve.
echo "[release] Ensuring ${RELEASE_TAG} has a What's New entry." >&2
if ! node "${PROJECT_ROOT}/scripts/generate-whats-new-entry.mjs" \
    --app-root "${PROJECT_ROOT}" \
    --version "${RELEASE_VERSION}" \
    --previous-tag "${PREVIOUS_TAG}"; then
    echo "[release] WARNING: could not write a What's New entry for ${RELEASE_TAG}." >&2
    echo "[release] The release continues; write the entry by hand." >&2
fi

mkdir -p "${BUILD_ARTIFACTS_DIR}/${RELEASE_TAG}"

# Allow CI to override the web/native sync command without changing the local default.
bash -lc "${BUILD_MOBILE_COMMAND}"
prune_android_ds_store

# 869f33bru. The web assets packed into the APK are files anyone can unzip from a public GitHub
# Release. Refuse to build one that carries a value shaped like a secret. Deliberately FATAL,
# unlike the What's New step above: a dead release is a red run somebody re-runs, while a key in
# a published APK cannot be taken back.
node "${PROJECT_ROOT}/scripts/check-secrets.mjs" --dir "${PROJECT_ROOT}/dist/optc-team-builder/browser"

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
