# Editor Tests

Runs the extension integration tests inside a VS Code instance.

The tests require:
1. A **LanguageServerProtocol** 4D test project containing the test fixture `.4dm` files. Ask the user for the path; default is `$HOME/git/tests/LanguageServerProtocol`.
2. A copy of that project at `editor/testFixture/LanguageServerProtocol`.
3. The `VERSION_4D` environment variable (e.g. `"21R3"`).

Setup:
```bash
rm -rf editor/testFixture/LanguageServerProtocol && cp -R "$HOME/git/tests/LanguageServerProtocol" editor/testFixture/LanguageServerProtocol
```

Run:
```bash
cd editor && VERSION_4D="21R3" npm test
```

This executes `node ./out/test/runTest.js` which launches VS Code and runs the Mocha test suite.

Some tests (completion, signature, formatting, go-to-definition, semantic tokens, dependencies) require a running LSP server. Set `ANALYZER_4D_PATH` to the **binary** path of 4D or tool4d (not the `.app` bundle). Ask the user for the path.

```bash
cd editor && VERSION_4D="21R3" ANALYZER_4D_PATH="/path/to/4D.app/Contents/MacOS/4D" npm test
```
