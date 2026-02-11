import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// 设置 PDF.js Worker 路径 (Vite 环境)
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const worker = new Worker(new URL('../workers/cv.worker.js', import.meta.url));

/**
 * 核心去水印处理器
 * 流程：PDF -> Canvas -> OpenCV -> pdf-lib -> PDF
 */
export const processPDF = async (file, config, onProgress) => {
    return new Promise(async (resolve, reject) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument(arrayBuffer);
            const pdf = await loadingTask.promise;
            const totalPages = pdf.numPages;

            const outPdf = await PDFDocument.create();

            for (let i = 1; i <= totalPages; i++) {
                if (onProgress) onProgress(i, totalPages);

                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 }); // 提升清晰度

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport }).promise;
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

                // 发送给 Worker 处理
                const processed = await new Promise((res) => {
                    const handler = (e) => {
                        if (e.data.type === 'page_done') {
                            worker.removeEventListener('message', handler);
                            res(e.data.processedImageData);
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ type: 'process_page', imageData, config });
                });

                // 绘制回 Canvas
                context.putImageData(processed, 0, 0);
                const imgDataUrl = canvas.toDataURL('image/png');
                const img = await outPdf.embedPng(imgDataUrl);

                const pdfPage = outPdf.addPage([viewport.width, viewport.height]);
                pdfPage.drawImage(img, {
                    x: 0,
                    y: 0,
                    width: viewport.width,
                    height: viewport.height,
                });
            }

            const pdfBytes = await outPdf.save();
            const processedBlob = new Blob([pdfBytes], { type: 'application/pdf' });

            resolve({ success: true, processedBlob });

        } catch (err) {
            console.error('Processing Failure:', err);
            reject(err);
        }
    });
};
