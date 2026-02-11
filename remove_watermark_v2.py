# -*- coding: utf-8 -*-
"""
PDF水印去除脚本 v2 - 使用OpenCV Inpainting算法
核心原理：
1. 自动检测右下角水印区域
2. 创建精确的水印掩码（mask）
3. 使用 Navier-Stokes / Telea 算法分析周围纹理，智能重建水印区域
"""
import fitz  # PyMuPDF
import cv2
import numpy as np
from PIL import Image
import io
import os

INPUT_PDF = "FD_Technology_Instant_Food_Revolution.pdf"
OUTPUT_PDF = "FD_Technology_Instant_Food_Revolution_无水印.pdf"

# 水印区域参数（右下角）
WATERMARK_REGION_W = 210  # 水印区域宽度
WATERMARK_REGION_H = 65   # 水印区域高度
MARGIN_R = 0              # 距右边距
MARGIN_B = 0              # 距底边距


def create_watermark_mask(img_cv, x1, y1, x2, y2):
    """
    在水印区域内创建精确的掩码。
    通过分析水印区域与周围背景的差异，精确定位水印像素。
    """
    h, w = img_cv.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    # 提取水印区域
    roi = img_cv[y1:y2, x1:x2]

    # 方法1：分析水印区域的边缘和对比度
    gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    # 采样水印区域上方的背景作为参考
    ref_y1 = max(0, y1 - 30)
    ref_y2 = y1
    ref_region = img_cv[ref_y1:ref_y2, x1:x2]

    if ref_region.size > 0:
        # 计算参考背景的平均颜色和标准差
        ref_gray = cv2.cvtColor(ref_region, cv2.COLOR_BGR2GRAY)
        ref_mean = np.mean(ref_gray)
        ref_std = np.std(ref_gray)

        # 水印通常是比背景更亮或更暗的半透明文字/图标
        # 找出与背景差异较大的像素
        diff = np.abs(gray_roi.astype(float) - ref_mean)
        threshold = max(ref_std * 1.5, 15)  # 动态阈值

        # 创建局部掩码
        local_mask = (diff > threshold).astype(np.uint8) * 255
    else:
        # 备用方案：使用固定阈值
        local_mask = np.ones_like(gray_roi, dtype=np.uint8) * 255

    # 膨胀掩码以确保覆盖水印边缘
    kernel = np.ones((5, 5), np.uint8)
    local_mask = cv2.dilate(local_mask, kernel, iterations=2)

    # 整个水印区域都标记为需要修复（确保不遗漏）
    # 同时结合精确掩码
    full_mask = np.ones_like(gray_roi, dtype=np.uint8) * 255
    combined = cv2.bitwise_or(local_mask, full_mask)

    # 写入全图掩码
    mask[y1:y2, x1:x2] = combined

    return mask


def remove_watermark_inpaint(img_pil):
    """使用OpenCV Inpainting算法去除水印"""
    # PIL -> OpenCV
    img_cv = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
    h, w = img_cv.shape[:2]

    # 水印区域坐标
    x1 = w - WATERMARK_REGION_W - MARGIN_R
    y1 = h - WATERMARK_REGION_H - MARGIN_B
    x2 = w - MARGIN_R
    y2 = h - MARGIN_B

    # 确保坐标在图片范围内
    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(w, x2)
    y2 = min(h, y2)

    # 创建水印掩码
    mask = create_watermark_mask(img_cv, x1, y1, x2, y2)

    # 使用 Telea 算法进行图像修复
    # inpaintRadius: 修复半径，越大参考的周围区域越广
    # cv2.INPAINT_TELEA: 基于快速行进法的修复算法，效果更自然
    result = cv2.inpaint(img_cv, mask, inpaintRadius=7, flags=cv2.INPAINT_TELEA)

    # 第二次修复，使用 Navier-Stokes 算法做精修
    # 这个算法基于流体力学方程，能更好地保持纹理连续性
    result = cv2.inpaint(result, mask, inpaintRadius=5, flags=cv2.INPAINT_NS)

    # 对修复区域做轻微模糊平滑过渡边界
    # 只在掩码边缘做平滑，不影响修复区域内部
    blur_mask = cv2.GaussianBlur(mask, (11, 11), 0)
    edge_mask = cv2.subtract(blur_mask, mask)

    # 在边缘区域混合原图和修复结果
    edge_float = edge_mask.astype(float) / 255.0
    edge_3ch = np.stack([edge_float] * 3, axis=-1)
    blended = (result.astype(float) * (1 - edge_3ch * 0.3) +
               img_cv.astype(float) * (edge_3ch * 0.3))
    result = np.clip(blended, 0, 255).astype(np.uint8)

    # OpenCV -> PIL
    result_rgb = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
    return Image.fromarray(result_rgb)


def main():
    print(f"正在打开: {INPUT_PDF}")
    doc = fitz.open(INPUT_PDF)
    new_doc = fitz.open()

    total_pages = doc.page_count
    print(f"共 {total_pages} 页")
    print(f"使用 OpenCV Inpainting 算法（Telea + Navier-Stokes 双重修复）")
    print("=" * 50)

    for page_num in range(total_pages):
        page = doc[page_num]
        print(f"  第 {page_num + 1}/{total_pages} 页...", end=" ", flush=True)

        images = page.get_images(full=True)
        if not images:
            new_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)
            print("(无图片，直接复制)")
            continue

        # 提取图片
        xref = images[0][0]
        pix = fitz.Pixmap(doc, xref)
        if pix.n > 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)

        # 转为PIL Image
        img_data = pix.tobytes("png")
        pil_img = Image.open(io.BytesIO(img_data))

        # Inpainting 去除水印
        clean_img = remove_watermark_inpaint(pil_img)

        # 转回字节流
        img_bytes = io.BytesIO()
        clean_img.save(img_bytes, format="PNG", optimize=True)
        img_bytes.seek(0)

        # 创建新页面
        new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
        new_page.insert_image(new_page.rect, stream=img_bytes.read())
        print("✓ 完成")

    # 保存
    new_doc.save(OUTPUT_PDF, deflate=True, garbage=4)
    new_doc.close()
    doc.close()

    input_size = os.path.getsize(INPUT_PDF) / 1024 / 1024
    output_size = os.path.getsize(OUTPUT_PDF) / 1024 / 1024
    print("=" * 50)
    print(f"处理完成！")
    print(f"  原文件: {input_size:.1f} MB")
    print(f"  输出: {OUTPUT_PDF} ({output_size:.1f} MB)")


if __name__ == "__main__":
    main()
