# -*- coding: utf-8 -*-
"""提取处理后PDF的页面图片进行验证"""
import fitz

pdf_path = "FD_Technology_Instant_Food_Revolution_无水印.pdf"
doc = fitz.open(pdf_path)

for page_num in range(min(3, doc.page_count)):
    page = doc[page_num]
    images = page.get_images(full=True)
    for img in images:
        xref = img[0]
        pix = fitz.Pixmap(doc, xref)
        if pix.n > 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        output_file = f"clean_page_{page_num + 1}.png"
        pix.save(output_file)
        print(f"已保存: {output_file} ({pix.width}x{pix.height})")

doc.close()
print("验证图片提取完成!")
