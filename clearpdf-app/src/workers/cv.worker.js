/**
 * cv.worker.js - 核心去水印算法 Worker (大文件稳健版)
 */

self.onerror = (e) => {
    self.postMessage({ success: false, error: 'Worker Runtime Error: ' + e.message });
};

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

try {
    self.importScripts(OPENCV_URL);
    if (cv) {
        cv['onRuntimeInitialized'] = () => {
            self.postMessage({ type: 'ready' });
        };
    }
} catch (e) {
    self.postMessage({ success: false, error: 'Failed to load CV library: ' + e.message });
}

self.onmessage = async (e) => {
    const { type, imageData, config } = e.data;

    if (type === 'process_page') {
        let src, hsv, mask, maskColor, maskGray, dst, gray;
        try {
            if (!cv || !cv.Mat) {
                throw new Error('OpenCV library not initialized');
            }

            // 1. 初始化
            src = cv.matFromImageData(imageData);
            dst = src.clone();
            hsv = new cv.Mat();
            maskColor = new cv.Mat();
            maskGray = new cv.Mat();
            mask = new cv.Mat();
            gray = new cv.Mat();

            // 2. 策略一：色彩锁定 (针对 NotebookLM 青蓝色按钮)
            // 注意：src 是 RGBA，先提取并转换为 HSV
            cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
            cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

            // 检测青蓝色系 (H: 75-105, S: 40-255, V: 40-255)
            // 使用更轻量的 Scalar 比较，避免创建超大辅助 Mat
            let low = new cv.Mat(1, 1, cv.CV_8UC3, [70, 40, 40, 0]);
            let high = new cv.Mat(1, 1, cv.CV_8UC3, [115, 255, 255, 255]);
            // 为了兼容 inRange，必须保证低/高界限也是相同大小的 Mat 或直接调用 API 
            // 在 JS 中，inRange 的界限必须是 Mat 类型，但大小不一定要跟图一样
            // 我们创建一个能覆盖全图的低/高值 Mat
            let lowMat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [75, 50, 50, 0]);
            let highMat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [115, 255, 255, 255]);
            cv.inRange(hsv, lowMat, highMat, maskColor);
            lowMat.delete(); highMat.delete();

            // 3. 策略二：亮度锁定 (针对浅灰文字水印)
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            // 阈值设为 200 以捕获透明文字，同时避免伤害正文
            cv.threshold(gray, maskGray, 205, 255, cv.THRESH_BINARY);

            // 4. 合并遮罩并消除孤立点
            cv.bitwise_or(maskColor, maskGray, mask);

            // 5. 极简高效擦除 -> 针对浏览器内存优化，弃用 inpaint
            // 我们直接将遮罩区域变成背景色（通常是白色）
            // 这样做不会消耗额外的计算资源，对 15MB 大文件最稳健
            let white = new cv.Scalar(255, 255, 255, 255);
            dst.setTo(white, mask);

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
            let errorMsg = '算法执行异常';
            if (typeof err === 'number') {
                errorMsg = `OpenCV Core Error: ${err} (Likely Memory Overflow)`;
            } else if (err.message) {
                errorMsg = err.message;
            }
            self.postMessage({ success: false, error: errorMsg });
        } finally {
            // 强制垃圾回收
            if (src) src.delete();
            if (dst) dst.delete();
            if (hsv) hsv.delete();
            if (gray) gray.delete();
            if (maskColor) maskColor.delete();
            if (maskGray) maskGray.delete();
            if (mask) mask.delete();
        }
    }
};
