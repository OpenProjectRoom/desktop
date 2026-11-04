# Implementation notes

The `specification` component still gives a document a place on the architecture map. The Specifications page separately reads whole folders from `views.specifications.roots`.

For Spec Kit projects, point a root at the directory containing feature folders, for example:

```yaml
views:
  specifications:
    roots: [specs]
```

Files under `specs/` can then be added or reorganized without updating the component list for every `spec.md`, `plan.md`, or `tasks.md`.
