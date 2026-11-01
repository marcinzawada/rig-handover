---
name: preview-upload
description: Save a rig page as one HTML file and put it on a public GitHub Pages link for review, then upload it again without the lane marker once the review is in (ADR 0003). Use when a plan has a "Preview for review" or "Clean up" step.
---

# preview-upload

The host is GitHub Pages in a separate public repo (`<owner>/rig-preview`), never this repo.
Needs `gh`, signed in. Ask the human before the first upload and before every upload over it.

## Save

Run rig, then save the page with a command (not "save as"):

```sh
curl -sf http://localhost:8787/digest/<night> -o ../preview/index.html
```

Check: one file, no `<script`, no external `src`/`href`, banner shows the lane marker.

## First upload

```sh
cd ../preview && git init -b main && git add index.html && git commit -m "preview"
gh repo create rig-preview --public --source . --push
gh api -X POST repos/<owner>/rig-preview/pages -f "source[branch]=main" -f "source[path]=/"
```

Wait until `https://<owner>.github.io/rig-preview/` serves the file (about a minute), compare it
byte for byte with the local file, then send the link. Leave the preview issue open until the
reviewer has looked.

## Clean up (after the review is in)

Run rig with `LANE_MARKER` unset (banner: "no marker set"), save again, and replace the history
with one clean commit so the marked copy is gone from the branch:

```sh
git checkout --orphan clean && git add index.html && git commit -m "preview, no lane marker"
git branch -D main && git branch -m main && git push --force origin main
```

The CDN caches for up to 10 minutes: poll the link until it shows "no marker set", then close
the clean-up issue.
