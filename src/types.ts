export interface IFileInfo {
    path: string;
    hash: string;
    isHtml: boolean;
    sortScore: number;
    target: string;
    cacheControlHeader: string;
}

export type IOverviewFileInfo = Pick<
    IFileInfo,
    'target' | 'hash' | 'cacheControlHeader'
>;
