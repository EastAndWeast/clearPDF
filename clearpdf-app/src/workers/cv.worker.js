/**
 * cv.worker.js - 核心去水印算法 Worker (Vite 兼容版)
 */

// 捕获所有加载错误并发送给主线程
self.onerror = (e) => {
    self.postMessage({ success: false, error: 'Worker 运行时错误: ' + e.message });
};

// 使用更宽泛的加载逻辑
try {
    console.log('Worker: 正在加载 OpenCV.js...');
    // 使用官方 CDN，确保路径正确
    self.importScripts('https://www.unpkg.com/opencv.js@1.2.1/opencv.js');

    if (cv) {
        cv['onRuntimeInitialized'] = () => {
            console.log('Worker: OpenCV.js 已就绪');
            self.postMessage({ type: 'ready' });
        };
    }
} catch (e) {
    console.error('Worker: 加载 OpenCV 失败:', e);
    self.postMessage({ success: false, error: '加载 OpenCV 失败: ' + e.message });
}

self.onmessage = async (e) => {
    const { type, imageData, config } = e.data;

    if (type === 'process_page') {
        try {
            if (!cv || !cv.Mat) {
                throw new Error('OpenCV 尚未就绪，请稍等或刷新重试');
            }

            const src = cv.matFromImageData(imageData);
            const dst = new cv.Mat();
            const mask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

            // --- 颜色检测去水印算法 (Teal/Blue 基色) ---
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // 图像二值化定位水印 (基于亮度 200 以上)
            cv.threshold(gray, mask, 210, 255, cv.THRESH_BINARY);

            // Inpaint 修复
            cv.inpaint(src, mask, dst, 3, cv.INPAINT_TELEA);

            const processedImageData = new ImageData(
                new Uint8ClampedArray(dst.data),
                dst.cols,
                dst.rows
            );

            src.delete(); mask.delete(); dst.delete(); gray.delete();

            self.postMessage({
                success: true,
                type: 'page_done',
                processedImageData: processedImageData
            });

        } catch (err) {
            self.postMessage({ success: false, error: err.message });
        }
    }
};
