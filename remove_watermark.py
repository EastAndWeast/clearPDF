# -*- coding: utf-8 -*-
"""
PDF水印去除脚本 - 去除NotebookLM右下角水印
策略：使用OpenCV风格的修复（inpainting），用周围像素智能填充水印区域
"""
import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFilter
import io
import os

INPUT_PDF = "FD_Technology_Instant_Food_Revolution.pdf"
OUTPUT_PDF = "FD_Technology_Instant_Food_Revolution_无水印.pdf"

# 水印区域（右下角），基于分析结果
# 图片尺寸 1376x768，水印包含圆形图标+NotebookLM文字
WATERMARK_WIDTH = 200   # 水印区域宽度（扩大以覆盖圆形图标）
WATERMARK_HEIGHT = 60   # 水印区域高度（扩大以覆盖完整图标）
MARGIN_RIGHT = 2        # 距右边距（贴近边缘）
MARGIN_BOTTOM = 2       # 距底边距（贴近边缘）


def remove_watermark_from_image(img: Image.Image) -> Image.Image:
    """用周围背景智能填充水印区域"""
    w, h = img.size

    # 水印区域坐标
    x1 = w - WATERMARK_WIDTH - MARGIN_RIGHT
    y1 = h - WATERMARK_HEIGHT - MARGIN_BOTTOM
    x2 = w - MARGIN_RIGHT
    y2 = h - MARGIN_BOTTOM

    # 采样水印上方和左侧区域的背景色来填充
    # 取水印区域上方一条带的平均颜色
    sample_top = img.crop((x1, max(0, y1 - 20), x2, y1))
    # 取水印区域左侧一条带的平均颜色
    sample_left = img.crop((max(0, x1 - 20), y1, x1, y2))

    # 创建修复后的图像副本
    result = img.copy()

    # 方法：逐行从上方和左侧采样渐变填充
    watermark_region = img.crop((x1, y1, x2, y2))

    # 对水印区域进行多层次填充
    # 首先用上方像素向下复制填充
    for dy in range(WATERMARK_HEIGHT):
        for dx in range(WATERMARK_WIDTH):
            px = x1 + dx
            py = y1 + dy

            if px >= w or py >= h:
                continue

            # 从上方采样
            sample_y = max(0, y1 - 5)
            top_color = img.getpixel((px, sample_y))

            # 从左侧采样
            sample_x = max(0, x1 - 5)
            if sample_x < w and py < h:
                left_color = img.getpixel((sample_x, py))
            else:
                left_color = top_color

            # 加权混合：靠上的像素更依赖上方颜色，靠左的更依赖左侧颜色
            weight_top = 1.0 - (dy / WATERMARK_HEIGHT)
            weight_left = 1.0 - (dx / WATERMARK_WIDTH)

            # 归一化权重
            total = weight_top + weight_left
            wt = weight_top / total
            wl = weight_left / total

            if isinstance(top_color, (tuple, list)) and len(top_color) >= 3:
                blended = tuple(
                    int(top_color[c] * wt + left_color[c] * wl)
                    for c in range(3)
                )
            else:
                blended = top_color

            result.putpixel((px, py), blended)

    # 对修复区域做轻微高斯模糊使过渡更自然
    patch = result.crop((x1 - 5, y1 - 5, x2 + 5, y2 + 5))
    patch = patch.filter(ImageFilter.GaussianBlur(radius=2))
    result.paste(patch, (x1 - 5, y1 - 5))

    return result


def main():
    print(f"正在打开: {INPUT_PDF}")
    doc = fitz.open(INPUT_PDF)
    new_doc = fitz.open()  # 新建空白PDF

    total_pages = doc.page_count
    print(f"共 {total_pages} 页，开始处理...")

    for page_num in range(total_pages):
        page = doc[page_num]
        print(f"  处理第 {page_num + 1}/{total_pages} 页...", end=" ")

        # 获取页面图片
        images = page.get_images(full=True)
        if not images:
            # 无图片页面直接复制
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

        # 去除水印
        clean_img = remove_watermark_from_image(pil_img)

        # 转回PyMuPDF Pixmap
        img_bytes = io.BytesIO()
        clean_img.save(img_bytes, format="PNG")
        img_bytes.seek(0)

        # 创建新页面，尺寸与原页面相同
        new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)

        # 插入处理后的图片
        new_page.insert_image(new_page.rect, stream=img_bytes.read())

        print("完成 ✓")

    # 保存输出
    new_doc.save(OUTPUT_PDF)
    new_doc.close()
    doc.close()

    output_size = os.path.getsize(OUTPUT_PDF) / 1024 / 1024
    print(f"\n处理完成！已保存: {OUTPUT_PDF}")
    print(f"输出文件大小: {output_size:.1f} MB")


if __name__ == "__main__":
    main()
