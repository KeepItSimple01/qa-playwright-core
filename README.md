# @company/pw-core

Core Playwright testing framework — fixtures, i18n, features, env, logger, validation.

## Install

```bash
npm install @company/pw-core
```

> **Gitea registry:** see the [Publishing & Releasing](#publishing--releasing) section below for registry setup.

## Development

```bash
npm ci              # install deps from lockfile
npm run build       # compile TypeScript → dist/
npm run typecheck   # type-check without emitting
npm run test        # typecheck + build
npm run clean       # remove dist/
```

## Usage

```ts
import {
  createTestFixtures,
  TAGS,
  withTags,
  ENV,
  loadFeatures,
  createLogger,
} from "@company/pw-core";
```

See [src/index.ts](src/index.ts) for the full public API surface.

## CLI

```bash
npx pw-core validate-test-cases <file> [--schemas-dir <dir>]
```

Validates a test-cases JSON file against the bundled schemas.

## Publishing & Releasing

### One-time registry setup

```bash
npm config set @company:registry https://<GITEA_HOST>/api/packages/<OWNER>/npm/
npm config set -- '//<GITEA_HOST>/api/packages/<OWNER>/npm/:_authToken' "<YOUR_TOKEN>"
```

### Release checklist

```bash
# 1. Verify everything from a clean state
git checkout master && git pull
rm -rf node_modules dist
npm ci
npm run typecheck
npm run build
npm pack --dry-run            # review included files

# 2. Tag the release
git tag -a v0.1.0 -m "v0.1.0 — initial release"
git push origin v0.1.0

# 3. Publish to Gitea npm registry
npm publish                   # prepack hook runs build automatically

# 4. Create release assets (tarball + checksum)
npm pack                      # produces company-pw-core-0.1.0.tgz
# Linux/macOS:
sha256sum company-pw-core-0.1.0.tgz > company-pw-core-0.1.0.tgz.sha256
# Windows:
certutil -hashfile company-pw-core-0.1.0.tgz SHA256 > company-pw-core-0.1.0.tgz.sha256
```

### Creating the Gitea release

#### Option A — Gitea UI (recommended for most users)

1. Go to your repo on Gitea and click **Releases** > **New Release**.
2. Select the tag you pushed (e.g. `v0.1.0`).
3. Fill in the release title and description.
4. Upload the `.tgz` and `.tgz.sha256` files as attachments.
5. Click **Publish Release**.

#### Option B — Gitea API

```bash
GITEA="https://<GITEA_HOST>"
OWNER="<OWNER>"
REPO="pw-core"
TOKEN="<YOUR_TOKEN>"

# Create the release
RELEASE_ID=$(curl -s -X POST "$GITEA/api/v1/repos/$OWNER/$REPO/releases" \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tag_name":"v0.1.0","name":"v0.1.0","body":"Initial release of @company/pw-core","draft":false,"prerelease":false}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Attach tarball
curl -s -X POST "$GITEA/api/v1/repos/$OWNER/$REPO/releases/$RELEASE_ID/assets" \
  -H "Authorization: token $TOKEN" \
  -F "attachment=@company-pw-core-0.1.0.tgz" \
  -F "name=company-pw-core-0.1.0.tgz"

# Attach checksum
curl -s -X POST "$GITEA/api/v1/repos/$OWNER/$REPO/releases/$RELEASE_ID/assets" \
  -H "Authorization: token $TOKEN" \
  -F "attachment=@company-pw-core-0.1.0.tgz.sha256" \
  -F "name=company-pw-core-0.1.0.tgz.sha256"
```

### Cleanup

```bash
rm -f company-pw-core-0.1.0.tgz company-pw-core-0.1.0.tgz.sha256
```

## License

[MIT](LICENSE)
