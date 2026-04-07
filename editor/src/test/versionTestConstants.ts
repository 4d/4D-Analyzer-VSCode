import { LabeledVersion } from '../labeledVersion';

export const LTS_VERSION = 21;
export const LTS_RELEASE_VERSION = 0;
export const LTS_RELEASE_CHANGELIST = 123456;

export const R_VERSION = 20;
export const R_RELEASE_VERSION = 9;
export const R_RELEASE_CHANGELIST = 123456;
export const R_PREVIOUS_VERSION = 21;
export const R_PREVIOUS_RELEASE_VERSION = 2;
export const R_PREVIOUS_RELEASE_CHANGELIST = 100000;
export const R_LATEST_RELEASE_CHANGELIST = 120000;

export const LTS_VERSION_LABEL = `${LTS_VERSION}`;
export const R_VERSION_LABEL = `${R_VERSION}R${R_RELEASE_VERSION}`;
export const R_PREVIOUS_VERSION_LABEL = `${R_PREVIOUS_VERSION}R${R_PREVIOUS_RELEASE_VERSION}`;
export const R_VERSION_URL_SEGMENT = `${R_VERSION} Rx/${R_VERSION} R${R_RELEASE_VERSION}`;

export function createLTSVersion(changelist = 0, channel = "stable"): LabeledVersion {
    return new LabeledVersion(LTS_VERSION, LTS_RELEASE_VERSION, 0, changelist, false, channel, false);
}

export function createRVersion(changelist = 0, channel = "stable"): LabeledVersion {
    return new LabeledVersion(R_VERSION, R_RELEASE_VERSION, 0, changelist, true, channel, false);
}

export function createLatestRVersion(changelist = 0, channel = "stable"): LabeledVersion {
    return new LabeledVersion(R_VERSION, 0, 0, changelist, true, channel, false);
}

export function createPreviousRVersion(changelist = 0, channel = "stable"): LabeledVersion {
    return new LabeledVersion(R_PREVIOUS_VERSION, R_PREVIOUS_RELEASE_VERSION, 0, changelist, true, channel, false);
}
