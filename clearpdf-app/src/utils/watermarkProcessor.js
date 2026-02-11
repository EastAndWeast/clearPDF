import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import CVWorker from '../workers/cv.worker.js?worker';

// 设置 PDF.js Worker
// 使用更稳定的外部库直接引用
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * 核心去水印处理器 - 极简稳健版
 */
export const processPDF = async (file, config, onProgress) => {
    return new Promise(async (resolve, reject) => {
        let worker = null;
        try {
            worker = new CVWorker();
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const totalPages = pdf.numPages;

            const outPdf = await PDFDocument.create();

            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport }).promise;
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

                // 核心 Worker 处理
                const processed = await new Promise((res, rej) => {
                    const timeout = setTimeout(() => rej(new Error('处理超时')), 60000);
                    const handler = (e) => {
                        if (e.data.type === 'page_done') {
                            clearTimeout(timeout);
                            worker.removeEventListener('message', handler);
                            res(e.data.processedImageData);
                        } else if (e.data.success === false) {
                            clearTimeout(timeout);
                            worker.removeEventListener('message', handler);
                            rej(new Error(e.data.error || '算法处理失败'));
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ type: 'process_page', imageData, config });
                });

                context.putImageData(processed, 0, 0);

                // --- 核心修复：规避 hashOriginal.toHex 错误 ---
                // 直接将 Canvas 导出为 Uint8Array
                const blob = await new Promise(r => canvas.toBlob(r, 'image/png', 0.8));
                const buf = await blob.arrayBuffer();
                const finalUint8 = new Uint8Array(buf);

                // 使用 embedPng 时的特殊处理，有些 PDF 可能在大批量快速处理时触发 Hashing 冲突
                const img = await outPdf.embedPng(finalUint8);

                const pdfPage = outPdf.addPage([viewport.width, viewport.height]);
                pdfPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });

                if (onProgress) onProgress(i, totalPages);
            }

            const pdfBytes = await outPdf.save();
            const processedBlob = new Blob([pdfBytes], { type: 'application/pdf' });

            worker.terminate();
            resolve({ success: true, processedBlob });

        } catch (err) {
            if (worker) worker.terminate();
            console.error('Final processor error:', err);
            // 抛出带有类名的详细错误，帮助定位是否依然是 pdf-lib 的问题
            reject(new Error(`${err.name}: ${err.message}`));
        }
    });
};
