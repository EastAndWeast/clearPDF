import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import CVWorker from '../workers/cv.worker.js?worker';

// 设置 PDF.js Worker (使用 Vite 兼容的资源引用方式)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
).toString();

/**
 * 核心去水印处理器
 */
export const processPDF = async (file, config, onProgress) => {
    return new Promise(async (resolve, reject) => {
        try {
            // 初始化 Worker
            const worker = new CVWorker();

            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const totalPages = pdf.numPages;

            const outPdf = await PDFDocument.create();

            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 }); // 降低一点缩放以保证性能

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport }).promise;
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

                // 发送给 Worker 处理并等待响应
                const processed = await new Promise((res, rej) => {
                    const timeout = setTimeout(() => rej(new Error(`第 ${i} 页处理超时`)), 30000);

                    const handler = (e) => {
                        if (e.data.type === 'page_done') {
                            clearTimeout(timeout);
                            worker.removeEventListener('message', handler);
                            res(e.data.processedImageData);
                        } else if (e.data.success === false) {
                            clearTimeout(timeout);
                            worker.removeEventListener('message', handler);
                            rej(new Error(e.data.error));
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ type: 'process_page', imageData, config });
                });

                context.putImageData(processed, 0, 0);

                // 转换 Canvas 为 Blob 再到 ArrayBuffer，绕过 DataURL 可能引起的 Hashing 错误
                const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                const imgBuffer = await blob.arrayBuffer();
                const img = await outPdf.embedPng(imgBuffer);

                const pdfPage = outPdf.addPage([viewport.width, viewport.height]);
                pdfPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });

                if (onProgress) onProgress(i, totalPages);
            }

            const pdfBytes = await outPdf.save();
            const processedBlob = new Blob([pdfBytes], { type: 'application/pdf' });

            worker.terminate();
            resolve({ success: true, processedBlob });

        } catch (err) {
            console.error('Processing Failure Trace:', err);
            reject(err);
        }
    });
};
