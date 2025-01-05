import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import axios from 'axios';
import { askForBoolean, fontDim } from '@js20/node-utils';

import { execute, globAsync } from '../utils';
import { IFileInfo, IOverviewFileInfo } from '../types';

export type IGetCacheControl = (filePath: string) => string;

export interface IDeployFrontendProps {
    baseUrl: string;
    directoryPath: string;
    gcloudBucket: string;
    getCacheControl?: IGetCacheControl;
}

interface IDeployProps {
    logger: Logger;
    gcloudBucket: string;
    fromPath: string;
    toPath: string;
    cacheControlHeader: string;
}

const OVERVIEW_FILE_NAME = 'files.json';

class Logger {
    private count: number = 0;
    private total: number;

    constructor(total: number) {
        this.total = total;
    }

    public logDeploy(fromPath: string, fullToPath: string) {
        this.count += 1;
        const relative = path.relative(process.cwd(), fromPath);

        console.log(
            fontDim(
                `(${this.count}/${this.total}) Deployed: ./${relative} -> ${fullToPath}`
            )
        );
    }
}

const deployHtml = async ({
    logger,
    gcloudBucket,
    fromPath,
    toPath,
    cacheControlHeader,
}: IDeployProps) => {
    const fullToPath = `gs://${gcloudBucket}/${toPath}`;
    const command = `gsutil -h "Content-Type:text/html" -h "${cacheControlHeader}" cp ${fromPath} ${fullToPath}`;

    await execute(command, false, undefined, false);
    logger.logDeploy(fromPath, fullToPath);
};

const deployFile = async ({
    logger,
    gcloudBucket,
    fromPath,
    toPath,
    cacheControlHeader,
}: IDeployProps) => {
    const fullToPath = `gs://${gcloudBucket}/${toPath}`;
    const command = `gsutil -h "${cacheControlHeader}" cp ${fromPath} ${fullToPath}`;

    await execute(command, false, undefined, false);
    logger.logDeploy(fromPath, fullToPath);
};

const getOverview = async (baseUrl: string): Promise<IOverviewFileInfo[]> => {
    try {
        const overviewUrl = `${baseUrl}/${OVERVIEW_FILE_NAME}`;
        const overviewResponse = await axios.get(overviewUrl);
        const isSuccessful = overviewResponse.status === 200;

        return isSuccessful ? overviewResponse.data : [];
    } catch {
        return [];
    }
};

const getAllFiles = async (directoryPath: string) => {
    const fullPath = path.resolve(process.cwd(), directoryPath);
    const files = await globAsync(`${fullPath}/**/*`);

    return files.filter((f) => !fs.lstatSync(f).isDirectory());
};

const getFileHash = (filePath: string): Promise<string> => {
    return new Promise((resolve) => {
        const readStream = fs.createReadStream(filePath);
        const hash = crypto.createHash('sha1');

        hash.setEncoding('hex');

        readStream.on('end', function () {
            hash.end();
            resolve(hash.read());
        });

        readStream.pipe(hash);
    });
};

const getDefaultCacheControl = (filePath: string) => {
    const isHtml = filePath.endsWith('.html');
    const isTxt = filePath.endsWith('.txt');

    const isShortLived = isHtml || isTxt;

    if (isShortLived) {
        //html files and robots/sitemap
        return 'Cache-Control: max-age=1';
    } else {
        //Images, videos, etc.
        //Js + css has unique hash in file names so long cache control is good
        return 'Cache-Control: max-age=31536000';
    }
};

const getSortScore = (filePath: string) => {
    const isJsOrCss = filePath.endsWith('.js') || filePath.endsWith('.css');
    const isHtml = filePath.endsWith('.html');

    if (isJsOrCss) {
        return 0;
    } else if (isHtml) {
        return 2;
    } else {
        return 1;
    }
};

const getChangedFiles = async (
    overview: IOverviewFileInfo[],
    allFiles: string[],
    directoryPath: string,
    getCacheControl?: IGetCacheControl
) => {
    const newOverview: IOverviewFileInfo[] = [];
    const changedFiles: IFileInfo[] = [];

    for (const filePath of allFiles) {
        const hash = await getFileHash(filePath);
        const isHtml = filePath.endsWith('.html');
        const target = getTargetPath(directoryPath, filePath);

        const cacheControlHeader = getCacheControl
            ? getCacheControl(filePath)
            : getDefaultCacheControl(filePath);

        const isFileUnchanged = overview.some(
            (f) =>
                f.target === target &&
                f.hash === hash &&
                f.cacheControlHeader === cacheControlHeader
        );

        const sortScore = getSortScore(filePath);

        const next: IFileInfo = {
            path: filePath,
            hash,
            isHtml,
            target,
            sortScore,
            cacheControlHeader,
        };

        newOverview.push({
            target,
            hash,
            cacheControlHeader,
        });

        if (!isFileUnchanged) {
            changedFiles.push(next);
        }
    }

    return {
        newOverview,
        changedFiles,
    };
};

const deployOverview = async (
    logger: Logger,
    overview: IOverviewFileInfo[],
    directoryPath: string,
    gcloudBucket: string
) => {
    const fileContent = JSON.stringify(overview);
    const filePath = path.resolve(directoryPath, OVERVIEW_FILE_NAME);

    fs.writeFileSync(filePath, fileContent);

    await deployFile({
        logger,
        gcloudBucket,
        fromPath: filePath,
        toPath: OVERVIEW_FILE_NAME,
        cacheControlHeader: 'Cache-Control: no-cache',
    });

    fs.unlinkSync(filePath);
};

const getTargetPath = (directoryPath: string, fromPath: string) => {
    const isHtml = fromPath.endsWith('.html');
    const relative = path.relative(directoryPath, fromPath);

    if (isHtml) {
        const extension = path.extname(fromPath);
        const withoutExtension = relative.replace(extension, '');
        const isSpecialPage =
            relative === 'index.html' || relative === '404.html';

        return isSpecialPage ? relative : withoutExtension;
    } else {
        return relative;
    }
};

const deployAllFiles = async (
    logger: Logger,
    changedFiles: IFileInfo[],
    gcloudBucket: string
) => {
    for (const file of changedFiles) {
        const deployFunction = file.isHtml ? deployHtml : deployFile;

        await deployFunction({
            logger,
            gcloudBucket,
            fromPath: file.path,
            toPath: file.target,
            cacheControlHeader: file.cacheControlHeader,
        });
    }
};

const getSortedFiles = (files: IFileInfo[]) => {
    const clone = [...files];
    clone.sort((a, b) => a.sortScore - b.sortScore);

    return clone;
};

export const deployFrontend = async ({
    baseUrl,
    directoryPath,
    gcloudBucket,
    getCacheControl,
}: IDeployFrontendProps) => {
    console.log('Starting deploy...');
    console.log('');

    const overview = await getOverview(baseUrl);
    const allFiles = await getAllFiles(directoryPath);

    const { newOverview, changedFiles } = await getChangedFiles(
        overview,
        allFiles,
        directoryPath,
        getCacheControl
    );

    const sortedFiles = getSortedFiles(changedFiles);

    const filesString = sortedFiles
        .map((f) => path.relative(process.cwd(), f.path))
        .map((f) => `> ./${f}`)
        .map(fontDim)
        .join('\n');

    const hasChanges = sortedFiles.length > 0;

    if (!hasChanges) {
        console.log('No changes to deploy. All done.');
        return;
    }

    console.log('The following files has changes and will be deployed:');
    console.log('--');
    console.log(filesString);
    console.log('--');

    const shouldContinue = await askForBoolean(
        'Do you want to continue with the deploy?',
        false
    );

    if (!shouldContinue) {
        return;
    }

    const logger = new Logger(sortedFiles.length + 1);

    await deployAllFiles(logger, sortedFiles, gcloudBucket);
    await deployOverview(logger, newOverview, directoryPath, gcloudBucket);

    console.log('');
    console.log('✅ Deploy finished!');
};
