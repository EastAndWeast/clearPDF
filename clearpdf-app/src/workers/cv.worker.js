/**
 * cv.worker.js - 核心去水印算法 Worker
 * 处理图像像素，移除水印并进行背景修复
 */

// 1. 加载 OpenCV.js (从 CDN 加载以保持轻量)
// 注意：在正式生产环境建议放到 public/ 下本地加载
self.importScripts('https://docs.opencv.org/4.10.0/opencv.js');

let cvReady = false;
cv['onRuntimeInitialized'] = () => {
    cvReady = true;
    console.log('OpenCV.js 已就绪 (Wasm)');
    self.postMessage({ type: 'ready' });
};

self.onmessage = async (e) => {
    if (!cvReady) {
        self.postMessage({ success: false, error: 'OpenCV 未初始化完成' });
        return;
    }

    const { type, imageData, config } = e.data;

    if (type === 'process_page') {
        try {
            const src = cv.matFromImageData(imageData);
            const dst = new cv.Mat();
            const mask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

            // --- 关键算法：水印识别与遮罩生成 ---
            // 方案 A: 基于特定颜色或亮度的简单的文字水印识别
            // 方案 B: 如果用户提供了文字内容，可以尝试特征匹配
            // 目前实现：基于高亮度/特定色值的快速识别 (通用方法)

            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // 文字水印通常比正文淡，或者有特定特征
            // 这里使用自适应阈值或者固定阈值来检测潜在的水印区域
            cv.threshold(gray, mask, 200, 255, cv.THRESH_BINARY); // 假设水印颜色较浅

            // --- 算法：Inpainting (图像修复) ---
            // 使用 OpenCV 核心算法物理移除遮罩部分的像素，并参考周围像素填充
            cv.inpaint(src, mask, dst, 3, cv.INPAINT_TELEA);

            // 转换为返回给前端的 ImageData
            const processedImageData = new ImageData(
                new Uint8ClampedArray(dst.data),
                dst.cols,
                dst.rows
            );

            // 释放内存
            src.delete(); mask.delete(); dst.delete(); gray.delete();

            self.postMessage({
                success: true,
                type: 'page_done',
                processedImageData: processedImageData
            });

        } catch (err) {
            console.error('Worker 算法处理错误:', err);
            self.postMessage({ success: false, error: err.message });
        }
    }
};
