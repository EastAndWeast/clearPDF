import * as pdfjs from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import CVWorker from '../workers/cv.worker.js?worker';

// 设置 PDF.js Worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

/**
 * 核心去水印处理器 - 采用 jsPDF 替代方案解决 pdf-lib Hash Bug
 */
export const processPDF = async (file, config, onProgress) => {
    return new Promise(async (resolve, reject) => {
        let worker = null;
        try {
            worker = new CVWorker();

            // 1. 等待 OpenCV 引擎就绪信号 (关键修复)
            await new Promise((res, rej) => {
                const timeout = setTimeout(() => rej(new Error('OpenCV 引擎加载超时，请检查网络链接')), 45000);
                const handler = (e) => {
                    if (e.data.type === 'ready') {
                        clearTimeout(timeout);
                        worker.removeEventListener('message', handler);
                        res();
                    } else if (e.data.success === false) {
                        clearTimeout(timeout);
                        worker.removeEventListener('message', handler);
                        rej(new Error(e.data.error));
                    }
                };
                worker.addEventListener('message', handler);
            });

            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const totalPages = pdf.numPages;

            // 初始化 jsPDF：'p' (portrait), 'pt' (points), [width, height]
            let doc = null;

            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                // 针对大文件优化：如果文件超过 10MB，降低采样率以保证内存安全
                const isLargeFile = file.size > 10 * 1024 * 1024;
                const scale = isLargeFile ? 1.0 : 1.5;
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport }).promise;
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

                // OpenCV 图像修复处理
                const processed = await new Promise((res, rej) => {
                    const timeout = setTimeout(() => rej(new Error('核心算法响应超时，请尝试减小文件或页数')), 120000);
                    const handler = (e) => {
                        if (e.data.type === 'page_done') {
                            clearTimeout(timeout);
                            worker.removeEventListener('message', handler);
                            res(e.data.processedImageData);
                        } else if (e.data.success === false) {
                            clearTimeout(timeout);
                            worker.removeEventListener('message', handler);
                            rej(new Error(e.data.error || '算法执行异常'));
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ type: 'process_page', imageData, config });
                });

                context.putImageData(processed, 0, 0);

                // 使用 JPEG 压缩以优化 14.7MB 大文件的生成与内存占用
                const finalImgData = canvas.toDataURL('image/jpeg', 0.85);

                const ptWidth = viewport.width * 0.75; // px 转 pt (约 0.75 比例)
                const ptHeight = viewport.height * 0.75;

                if (i === 1) {
                    doc = new jsPDF({
                        orientation: ptWidth > ptHeight ? 'l' : 'p',
                        unit: 'pt',
                        format: [ptWidth, ptHeight]
                    });
                } else {
                    doc.addPage([ptWidth, ptHeight], ptWidth > ptHeight ? 'l' : 'p');
                }

                // 核心修复：jsPDF 的 addImage 远比 pdf-lib 的嵌入逻辑更稳定
                doc.addImage(finalImgData, 'JPEG', 0, 0, ptWidth, ptHeight, undefined, 'FAST');

                if (onProgress) onProgress(i, totalPages);

                // 显式清理内存
                canvas.width = 0; canvas.height = 0;
            }

            const processedBlob = doc.output('blob');

            if (worker) worker.terminate();
            resolve({ success: true, processedBlob });

        } catch (err) {
            if (worker) worker.terminate();
            console.error('Assembly Error:', err);
            reject(new Error(`${err.name}: ${err.message}`));
        }
    });
};
