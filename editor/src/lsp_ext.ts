import * as lc from "vscode-languageclient";
import { WorkspaceDiagnosticReport } from "vscode-languageclient";

export const filesStatus = new lc.RequestType0<object, void>(
    "experimental/filesStatus"
);

export const checkWorkspaceSyntax = new lc.RequestType<lc.TextDocumentIdentifier, WorkspaceDiagnosticReport, void>(
    "experimental/checkSyntax"
);


export const installComponents = new lc.RequestType<lc.TextDocumentIdentifier, void, void>(
    "dependency/installComponents"
);


export const needFetch = new lc.RequestType<lc.TextDocumentIdentifier, boolean, void>(
    "dependency/shouldFetch"
);
