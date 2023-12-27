import * as lc from "vscode-languageclient";
import { WorkspaceDiagnosticReport } from "vscode-languageclient";

export const filesStatus = new lc.RequestType0<object, void>(
    "experimental/filesStatus"
);

export const checkSyntax = new lc.RequestType<lc.TextDocumentIdentifier, WorkspaceDiagnosticReport, void>(
    "experimental/checkSyntax"
);
