/**
 * cv.worker.js - 核心去水印算法 Worker (增强版)
 */

self.onerror = (e) => {
    self.postMessage({ success: false, error: 'Worker Error: ' + e.message });
};

// 使用包含完整模块的 OpenCV.js 版本
const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

try {
    console.log('Worker: Loading OpenCV full build...');
    self.importScripts(OPENCV_URL);

    if (cv) {
        cv['onRuntimeInitialized'] = () => {
            console.log('Worker: OpenCV Full Engine Ready');
            self.postMessage({ type: 'ready' });
        };
    }
} catch (e) {
    self.postMessage({ success: false, error: 'Failed to load CV library: ' + e.message });
}

self.onmessage = async (e) => {
    const { type, imageData, config } = e.data;

    if (type === 'process_page') {
        try {
            if (!cv || !cv.Mat) {
                throw new Error('OpenCV library not initialized');
            }

            const src = cv.matFromImageData(imageData);
            const dst = new cv.Mat();
            const gray = new cv.Mat();
            const mask = new cv.Mat();

            // 1. 转换为灰度图
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // 2. 核心算法：识别高亮区域 (通常是浅色水印)
            // 使用自适应阈值或固定高阈值以定位半透明水印
            cv.threshold(gray, mask, 215, 255, cv.THRESH_BINARY);

            // 3. 处理逻辑：
            if (cv.inpaint) {
                // A 方案：使用 Inpainting 修复 (效果最好)
                cv.inpaint(src, mask, dst, 3, cv.INPAINT_TELEA);
            } else {
                // B 方案 (降级)：直接将遮罩区域变白
                // 如果 OpenCV 裁剪版缺少 photo 模块，使用此方案保底
                src.copyTo(dst);
                const white = new cv.Scalar(255, 255, 255, 255);
                dst.setTo(white, mask);
                console.warn('Worker: cv.inpaint missing, using white-out fallback');
            }

            const processedImageData = new ImageData(
                new Uint8ClampedArray(dst.data),
                dst.cols,
                dst.rows
            );

            // 清理内存
            src.delete(); gray.delete(); mask.delete(); dst.delete();

            self.postMessage({
                success: true,
                type: 'page_done',
                processedImageData: processedImageData
            });

        } catch (err) {
            console.error('Worker Algorithm Failure:', err);
            self.postMessage({ success: false, error: err.message });
        }
    }
};
