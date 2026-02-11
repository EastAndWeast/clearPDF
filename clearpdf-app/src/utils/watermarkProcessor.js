import { useNavigate } from 'react';

// 模拟水印处理逻辑的 Worker 桥接
export const processPDF = async (file, config) => {
    return new Promise((resolve) => {
        const worker = new Worker(new URL('../workers/cv.worker.js', import.meta.url), {
            type: 'module'
        });

        worker.onmessage = (e) => {
            resolve(e.data);
            worker.terminate();
        };

        worker.postMessage({ file, config });
    });
};
