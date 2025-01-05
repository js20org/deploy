export const getDefaultCacheControlHeader = (fileName: string) => {
    const isHtml = fileName.endsWith('.html');
    const isTxt = fileName.endsWith('.txt');

    const isShort = isHtml || isTxt;

    return isShort
        ? 'Cache-Control: max-age=14400'
        : 'Cache-Control: max-age=31536000';
};
