# -*- coding: utf-8 -*-
"""提取处理后的页面图片验证效果"""
import fitz

pdf_clean = "FD_Technology_Instant_Food_Revolution_无水印.pdf"
pdf_orig = "FD_Technology_Instant_Food_Revolution.pdf"

# 提取原始和处理后的页面对比
for page_num in [0, 1, 2, 4, 12]:
    # 处理后
    doc = fitz.open(pdf_clean)
    page = doc[page_num]
    imgs = page.get_images(full=True)
    xref = imgs[0][0]
    pix = fitz.Pixmap(doc, xref)
    if pix.n > 4:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    pix.save(f"v2_clean_{page_num+1}.png")
    doc.close()
    print(f"已保存: v2_clean_{page_num+1}.png")

print("验证图片提取完成!")
