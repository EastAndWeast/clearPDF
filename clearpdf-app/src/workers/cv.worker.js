/**
 * cv.worker.js - 核心去水印算法 Worker (精准识别版)
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
        let src, hsv, mask, maskColor, maskGray, dst;
        try {
            if (!cv || !cv.Mat) {
                throw new Error('OpenCV library not initialized');
            }

            src = cv.matFromImageData(imageData);
            dst = src.clone();
            hsv = new cv.Mat();
            maskColor = new cv.Mat();
            maskGray = new cv.Mat();
            mask = new cv.Mat();

            // 1. 策略一：色彩锁定 (针对 NotebookLM 常见的青蓝色/深绿色水印)
            cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB); // 先转 RGB
            cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV); // 再转 HSV

            // 检测青蓝色系 (H: 80-100 对应青绿色)
            let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [70, 40, 40, 0]);
            let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [110, 255, 255, 255]);
            cv.inRange(hsv, low, high, maskColor);
            low.delete(); high.delete();

            // 2. 策略二：亮度锁定 (针对浅灰色/半透明水印)
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
            // 降低阈值至 190 以捕获更深的水印，同时保留主要文字
            cv.threshold(gray, maskGray, 190, 255, cv.THRESH_BINARY);
            gray.delete();

            // 3. 融合遮罩
            cv.bitwise_or(maskColor, maskGray, mask);

            // 4. 消除边缘噪点
            let ksize = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
            cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, ksize);
            ksize.delete();

            // 5. 执行擦除
            if (cv.inpaint) {
                // 使用 Inpaint 修复，半径设为 3，效果最自然
                cv.inpaint(src, mask, dst, 3, cv.INPAINT_TELEA);
            } else {
                // 保底：直接变白
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
            let errorMsg = typeof err === 'number' ? `OpenCV Error: ${err}` : err.message;
            self.postMessage({ success: false, error: errorMsg });
        } finally {
            if (src) src.delete();
            if (hsv) hsv.delete();
            if (maskColor) maskColor.delete();
            if (maskGray) maskGray.delete();
            if (mask) mask.delete();
            if (dst) dst.delete();
        }
    }
};
