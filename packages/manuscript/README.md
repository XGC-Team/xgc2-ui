# @xgc2/ui-manuscript

Markable source editor, PDF pane, and quote chip for manuscript surfaces.

This sibling package keeps Monaco and PDF.js out of `@xgc2/ui-react` and the GCS
bundle. The product default is the real editors:

- **Source:** [monaco-editor](https://github.com/microsoft/monaco-editor) (MIT)
- **PDF:** [pdfjs-dist](https://github.com/mozilla/pdf.js) (Apache-2.0) canvas + text layer

The host must set `MonacoEnvironment.getWorker` before mounting `SourceEditor`,
and pass `workerSrc` for PDF.js. SyncTeX locations follow the LaTeX Workshop
view/edit protocol; the VS Code extension is not vendored.

Import `@xgc2/ui-manuscript/styles.css` once at the application boundary.
Tests may pass `implementation="plain"` to skip Monaco in jsdom.
