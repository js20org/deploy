import glob from 'glob';

export const globAsync = async (filePattern: any): Promise<string[]> => {
    return new Promise((resolve) => {
        glob(filePattern, (err, files) => {
            if (err) {
                throw err;
            }

            resolve(files);
        });
    });
};
