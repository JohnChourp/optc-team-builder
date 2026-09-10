# Security Policy

OPTC Team Builder is a client-side team planner for One Piece Treasure Cruise.
It ships as a web app at [optcteambuilder.com](https://optcteambuilder.com) and
as an Android APK attached to each GitHub release.

## Supported versions

Only the **latest release** receives fixes. Versions are a single track with no
maintenance branches, so there is nothing to back-port to: the newest tag is the
supported one, and everything before it is superseded.

| Version | Supported |
| --- | --- |
| Latest release | ✅ |
| Anything earlier | ❌ — upgrade instead |

The web app updates itself, so it is always on the latest release. An Android
build has to be reinstalled from the newest
[release](https://github.com/JohnChourp/optc-team-builder/releases).

## What the app handles

Worth knowing before you report, because it bounds what a vulnerability here can
reach:

- **There are no accounts and no password.** Nothing to sign into, nothing to
  breach.
- **Your data stays on your device** — saved teams, boxes, favourites and local
  character overrides live in your own browser or app storage.
- **Google Drive sync is opt-in** and, when you enable it, writes only to the
  app's own folder in *your* Drive. The project stores no copy.
- **The character dataset is public information** regenerated from upstream OPTC
  data, and it is read-only.

## Reporting a vulnerability

Report privately through GitHub:
[**Report a vulnerability**](https://github.com/JohnChourp/optc-team-builder/security/advisories/new).
That opens a draft advisory only you and the maintainer can see.

**Please do not open a public issue for a security problem** — a public issue
tells everyone before there is a fix. Ordinary bugs are welcome as issues.

Helpful things to include: what you did, what happened, which version
(**What's new** in the side menu shows it), and whether it was the web app or
the Android build.

This is a personal project maintained by one person in their own time. Expect a
first reply within about a week. If a report is valid, the fix ships in the next
release and the advisory is published once it is out; if it is not, you will get
an explanation rather than silence.
