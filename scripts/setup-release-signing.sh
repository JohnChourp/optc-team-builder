#!/usr/bin/env bash
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage:
  setup-release-signing.sh [--keystore-path <path>] [--alias <name>]

Examples:
  setup-release-signing.sh
  setup-release-signing.sh --keystore-path "$HOME/.android/optc-team-builder/release-upload-key.jks"
  setup-release-signing.sh --alias optc_team_builder_upload
USAGE
}

KEYSTORE_PATH="${HOME}/.android/optc-team-builder/release-upload-key.jks"
KEY_ALIAS="optc_team_builder_upload"

while (($# > 0)); do
    case "$1" in
        --keystore-path)
            KEYSTORE_PATH="${2:-}"
            shift 2
            ;;
        --alias)
            KEY_ALIAS="${2:-}"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if ! command -v keytool >/dev/null 2>&1; then
    echo "ERROR: keytool was not found. Install a JDK and run this again." >&2
    exit 1
fi

generate_password() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 24
        return 0
    fi

    if command -v python3 >/dev/null 2>&1; then
        python3 - <<'PY'
import secrets
import string

alphabet = string.ascii_letters + string.digits
print("".join(secrets.choice(alphabet) for _ in range(48)))
PY
        return 0
    fi

    echo "ERROR: Neither openssl nor python3 is available to generate a secure password." >&2
    exit 1
}

KEYSTORE_DIR="$(dirname "$KEYSTORE_PATH")"
mkdir -p "$KEYSTORE_DIR"
KEYSTORE_DIR="$(cd "$KEYSTORE_DIR" && pwd -P)"
KEYSTORE_PATH="${KEYSTORE_DIR}/$(basename "$KEYSTORE_PATH")"
LOCAL_ENV_FILE="${KEYSTORE_DIR}/release-signing.env"

STORE_PASSWORD=""
KEY_PASSWORD=""

if [[ -f "$KEYSTORE_PATH" ]]; then
    if [[ ! -f "$LOCAL_ENV_FILE" ]]; then
        echo "ERROR: Found keystore at $KEYSTORE_PATH but missing $LOCAL_ENV_FILE for safe credential reuse." >&2
        exit 1
    fi

    # shellcheck disable=SC1090
    source "$LOCAL_ENV_FILE"
    STORE_PASSWORD="${ANDROID_SIGNING_STORE_PASSWORD:-}"
    KEY_PASSWORD="${ANDROID_SIGNING_KEY_PASSWORD:-$STORE_PASSWORD}"
    KEY_ALIAS="${ANDROID_SIGNING_KEY_ALIAS:-$KEY_ALIAS}"

    if [[ -z "$STORE_PASSWORD" || -z "$KEY_PASSWORD" || -z "$KEY_ALIAS" ]]; then
        echo "ERROR: $LOCAL_ENV_FILE is incomplete. Expected signing store password, key password, and key alias." >&2
        exit 1
    fi

    # PKCS12 release keystores must use the same password for store and key.
    KEY_PASSWORD="$STORE_PASSWORD"
    echo "[signing] Reusing existing keystore: $KEYSTORE_PATH"
else
    STORE_PASSWORD="$(generate_password)"
    KEY_PASSWORD="$STORE_PASSWORD"

    echo "[signing] Creating new release keystore at $KEYSTORE_PATH"
    keytool -genkeypair -v \
        -keystore "$KEYSTORE_PATH" \
        -storepass "$STORE_PASSWORD" \
        -keypass "$KEY_PASSWORD" \
        -alias "$KEY_ALIAS" \
        -keyalg RSA \
        -keysize 4096 \
        -validity 10000 \
        -dname "CN=OPTC Team Builder,O=OPTC Team Builder,OU=Android,L=Athens,ST=Attica,C=GR" \
        -noprompt >/dev/null
fi

cat > "$LOCAL_ENV_FILE" <<EOF
export ANDROID_SIGNING_STORE_FILE="$KEYSTORE_PATH"
export ANDROID_SIGNING_STORE_PASSWORD="$STORE_PASSWORD"
export ANDROID_SIGNING_KEY_ALIAS="$KEY_ALIAS"
export ANDROID_SIGNING_KEY_PASSWORD="$KEY_PASSWORD"
EOF
chmod 600 "$LOCAL_ENV_FILE"

echo "[signing] Done."
echo "[signing] Local env file: $LOCAL_ENV_FILE"
echo "[signing] For local releases: source \"$LOCAL_ENV_FILE\""
echo "[signing] Keep a secure backup of the keystore and env credentials."
