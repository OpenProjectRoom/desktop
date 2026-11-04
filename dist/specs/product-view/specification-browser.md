# Specification folder browser

## Goal

Every specification file in a configured repository folder should be discoverable from OpenBuildRoom without adding each file as a map component.

## Behavior

- Read `views.specifications.roots` from `productview.yaml`.
- Show folders and files recursively in a tree.
- Let people search by path or filename and read supported text files.
- Render Markdown for reading, with a source view for exact text.
- Refresh the folder tree after files are added outside the app.

## Boundaries

The desktop app reads only inside the selected repository and skips symbolic links. The web demo displays a packaged snapshot of this example repository. Binary files remain visible in the tree, but have no text preview.
