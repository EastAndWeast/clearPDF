# -*- coding: utf-8 -*-
"""提取PDF第一页图片，以便分析水印"""
import fitz

pdf_path = "FD_Technology_Instant_Food_Revolution.pdf"
doc = fitz.open(pdf_path)

# 提取前3页图片
for page_num in range(min(3, doc.page_count)):
    page = doc[page_num]
    images = page.get_images(full=True)
    for img_idx, img in enumerate(images):
        xref = img[0]
        pix = fitz.Pixmap(doc, xref)
        if pix.n > 4:  # CMYK
            pix = fitz.Pixmap(fitz.csRGB, pix)
        output_file = f"page_{page_num + 1}.png"
        pix.save(output_file)
        print(f"已保存: {output_file} ({pix.width}x{pix.height})")

doc.close()
print("提取完成!")
