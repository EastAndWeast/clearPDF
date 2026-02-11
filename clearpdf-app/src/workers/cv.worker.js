/**
 * cv.worker.js - 核心去水印算法 Worker (稳定性增强版)
 */

self.onerror = (e) => {
    self.postMessage({ success: false, error: 'Worker Runtime Error: ' + e.message });
};

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
        let src, gray, mask, dst;
        try {
            if (!cv || !cv.Mat) {
                throw new Error('OpenCV library not initialized');
            }

            // 1. 获取图像数据
            src = cv.matFromImageData(imageData);
            dst = new cv.Mat();
            gray = new cv.Mat();
            mask = new cv.Mat();

            // 2. 灰度与阈值识别
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // 识别水印区域 (215-255 通常是文字水印所在的亮度区间)
            cv.threshold(gray, mask, 215, 255, cv.THRESH_BINARY);

            // 3. 执行去水印逻辑
            try {
                if (cv.inpaint) {
                    cv.inpaint(src, mask, dst, 3, cv.INPAINT_TELEA);
                } else {
                    // 降级方案
                    src.copyTo(dst);
                    // RGBA 颜色，对于 RGBA 图片，Scalar 需要 4 个分量
                    const white = new cv.Scalar(255, 255, 255, 255);
                    dst.setTo(white, mask);
                }
            } catch (innerErr) {
                console.warn('Inpaint failed, trying fallback...', innerErr);
                src.copyTo(dst);
                const white = new cv.Scalar(255, 255, 255, 255);
                dst.setTo(white, mask);
            }

            const processedImageData = new ImageData(
                new Uint8ClampedArray(dst.data),
                dst.cols,
                dst.rows
            );

            self.postMessage({
                success: true,
                type: 'page_done',
                processedImageData: processedImageData
            });

        } catch (err) {
            // 捕捉数值形式的 OpenCV 错误或其他异常
            let errorMsg = '算法执行异常';
            if (typeof err === 'number') {
                errorMsg = `OpenCV Error Code: ${err}`;
            } else if (err.message) {
                errorMsg = err.message;
            }
            self.postMessage({ success: false, error: errorMsg });
        } finally {
            // 极其重要：强制销毁所有 Mat 防止内存溢出
            if (src) src.delete();
            if (gray) gray.delete();
            if (mask) mask.delete();
            if (dst) dst.delete();
        }
    }
};
