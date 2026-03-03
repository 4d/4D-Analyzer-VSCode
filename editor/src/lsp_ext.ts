import * as lc from "vscode-languageclient";
import { WorkspaceDiagnosticReport } from "vscode-languageclient";

interface DependencyParams {
    project_uri : string,
    preferences_uri : string,
}

export const filesStatus = new lc.RequestType0<object, void>(
    "experimental/filesStatus"
);

export const checkWorkspaceSyntax = new lc.RequestType<lc.TextDocumentIdentifier, WorkspaceDiagnosticReport, void>(
    "experimental/checkSyntax"
);

export const notif_needFetchNotification = new lc.NotificationType<DependencyParams>(
    "dependency/fetch"
);

export interface FetchInfo {
    shouldFetch: boolean;
}

export const checkNeedFetch = new lc.RequestType<lc.TextDocumentIdentifier, FetchInfo, void>(
    "dependency/shouldFetch"
);

export const notif_installComponents = new lc.NotificationType<lc.TextDocumentIdentifier>(
    "dependency/installComponents"
);


export const notif_installComponents_done = new lc.NotificationType<lc.TextDocumentIdentifier>(
    "dependency/installComponents/done"
);

export const notif_installComponents_before = new lc.NotificationType<lc.TextDocumentIdentifier>(
    "dependency/installComponents/before"
);

export interface PrepareDBInfo {
    valid: boolean;
    id: lc.TextDocumentIdentifier;
}


export const prepare_database = new lc.RequestType<lc.TextDocumentIdentifier, PrepareDBInfo, void>(
    "experimental/databaseInitialize"
);

export const prepare_components = new lc.NotificationType<lc.TextDocumentIdentifier>(
    "experimental/prepareComponents"
);