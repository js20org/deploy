import { exec } from 'child_process';
import { fontDim } from '@js20/node-utils';

export const execute = (
    command: string,
    shouldPrint?: boolean,
    options?: any,
    shouldPrintCommand: boolean = true
): Promise<string> => {
    return new Promise((resolve) => {
        if (shouldPrintCommand) {
            console.log(fontDim('Executing command:'));
            console.log(fontDim(command));
        }

        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                console.log('[ERROR]:');
                console.log(error);
                throw new Error('Error in execute.');
            }

            if (shouldPrint) {
                console.log(stdout);
                console.log(stderr);
            }

            resolve(stdout.toString());
        });
    });
};
