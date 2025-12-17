import * as lc from "vscode-languageclient";
import { WorkspaceDiagnosticReport } from "vscode-languageclient";

export const filesStatus = new lc.RequestType0<object, void>(
    "experimental/filesStatus"
);

export const checkWorkspaceSyntax = new lc.RequestType<lc.TextDocumentIdentifier, WorkspaceDiagnosticReport, void>(
    "experimental/checkSyntax"
);

export const notif_needFetchNotification = new lc.NotificationType<lc.TextDocumentIdentifier>(
    "dependency/fetch"
);

export const notif_installComponents = new lc.NotificationType<lc.TextDocumentIdentifier>(
    "dependency/installComponents"
);

export const notif_installComponents_progress = new lc.NotificationType<lc.TextDocumentIdentifier>(
    "dependency/installComponents/progress"
);

export const notif_installComponents_before = new lc.NotificationType<lc.TextDocumentIdentifier>(
    "dependency/installComponents/before"
);