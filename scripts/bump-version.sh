#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage:
  bump-version.sh [--bump patch|minor|major] [--version X.Y.Z] [--code N] [--print-only]
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
ANDROID_GRADLE="${PROJECT_ROOT}/android/app/build.gradle"
IOS_PBXPROJ="${PROJECT_ROOT}/ios/App/App.xcodeproj/project.pbxproj"

BUMP_TYPE=""
EXPLICIT_VERSION=""
EXPLICIT_CODE=""
PRINT_ONLY=0

while (($# > 0)); do
    case "$1" in
        --bump)
            BUMP_TYPE="${2:-}"
            shift 2
            ;;
        --version)
            EXPLICIT_VERSION="${2:-}"
            shift 2
            ;;
        --code)
            EXPLICIT_CODE="${2:-}"
            shift 2
            ;;
        --print-only)
            PRINT_ONLY=1
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

if [[ -n "${BUMP_TYPE}" && -n "${EXPLICIT_VERSION}" ]]; then
    echo "ERROR: Use either --bump or --version, not both." >&2
    exit 1
fi

if [[ -z "${BUMP_TYPE}" && -z "${EXPLICIT_VERSION}" ]]; then
    BUMP_TYPE="patch"
fi

if [[ -n "${BUMP_TYPE}" && ! "${BUMP_TYPE}" =~ ^(patch|minor|major)$ ]]; then
    echo "ERROR: --bump must be one of patch, minor, major." >&2
    exit 1
fi

CURRENT_VERSION="$(cd "${PROJECT_ROOT}" && node -p "require('./package.json').version")"
CURRENT_CODE="$(node -e "const fs=require('fs'); const file=process.argv[1]; const text=fs.readFileSync(file,'utf8'); const match=text.match(/versionCode\\s+(\\d+)/); if(!match){process.exit(1)} console.log(match[1]);" "${ANDROID_GRADLE}")"

NEXT_VERSION="$(
    CURRENT_VERSION="${CURRENT_VERSION}" \
    BUMP_TYPE="${BUMP_TYPE}" \
    EXPLICIT_VERSION="${EXPLICIT_VERSION}" \
    node <<'NODE'
const current = process.env.CURRENT_VERSION || '';
const explicitVersion = process.env.EXPLICIT_VERSION || '';
const bumpType = process.env.BUMP_TYPE || '';

const isValidSemver = (value) => /^\d+\.\d+\.\d+$/.test(value);

if (explicitVersion) {
  if (!isValidSemver(explicitVersion)) {
    console.error('ERROR: --version must be in X.Y.Z format.');
    process.exit(1);
  }
  console.log(explicitVersion);
  process.exit(0);
}

if (!isValidSemver(current)) {
  console.error(`ERROR: Current package.json version is not semver: ${current}`);
  process.exit(1);
}

const parts = current.split('.').map((value) => Number.parseInt(value, 10));
switch (bumpType) {
  case 'major':
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
    break;
  case 'minor':
    parts[1] += 1;
    parts[2] = 0;
    break;
  case 'patch':
    parts[2] += 1;
    break;
  default:
    console.error(`ERROR: Unsupported bump type: ${bumpType}`);
    process.exit(1);
}

console.log(parts.join('.'));
NODE
)"

if [[ -n "${EXPLICIT_CODE}" ]]; then
    if [[ ! "${EXPLICIT_CODE}" =~ ^[1-9][0-9]*$ ]]; then
        echo "ERROR: --code must be a positive integer." >&2
        exit 1
    fi
    NEXT_CODE="${EXPLICIT_CODE}"
else
    NEXT_CODE="$((CURRENT_CODE + 1))"
fi

if (( PRINT_ONLY == 0 )); then
    (cd "${PROJECT_ROOT}" && npm version "${NEXT_VERSION}" --no-git-tag-version >/dev/null)

    NEXT_VERSION="${NEXT_VERSION}" NEXT_CODE="${NEXT_CODE}" ANDROID_GRADLE="${ANDROID_GRADLE}" IOS_PBXPROJ="${IOS_PBXPROJ}" node <<'NODE'
const fs = require('fs');

const nextVersion = process.env.NEXT_VERSION;
const nextCode = process.env.NEXT_CODE;
const androidGradle = process.env.ANDROID_GRADLE;
const iosPbxproj = process.env.IOS_PBXPROJ;

let android = fs.readFileSync(androidGradle, 'utf8');
if (!/versionCode\s+\d+/.test(android) || !/versionName\s+"[^"]+"/.test(android)) {
  console.error(`ERROR: Failed to locate Android version fields in ${androidGradle}`);
  process.exit(1);
}
android = android.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
android = android.replace(/versionName\s+"[^"]+"/, `versionName "${nextVersion}"`);
fs.writeFileSync(androidGradle, android);

let ios = fs.readFileSync(iosPbxproj, 'utf8');
const currentProjectVersionMatches = ios.match(/CURRENT_PROJECT_VERSION = [^;]+;/g) || [];
const marketingVersionMatches = ios.match(/MARKETING_VERSION = [^;]+;/g) || [];
if (currentProjectVersionMatches.length === 0 || marketingVersionMatches.length === 0) {
  console.error(`ERROR: Failed to locate iOS version fields in ${iosPbxproj}`);
  process.exit(1);
}
ios = ios.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${nextCode};`);
ios = ios.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${nextVersion};`);
fs.writeFileSync(iosPbxproj, ios);
NODE
fi

printf 'VERSION=%s\n' "${NEXT_VERSION}"
printf 'CODE=%s\n' "${NEXT_CODE}"
