# -*- coding: utf-8 -*-
"""分析PDF水印结构"""
import fitz  # PyMuPDF
import sys

pdf_path = "FD_Technology_Instant_Food_Revolution.pdf"
doc = fitz.open(pdf_path)

print(f"PDF页数: {doc.page_count}")
print(f"PDF元数据: {doc.metadata}")
print("=" * 60)

# 只分析前3页
for page_num in range(min(3, doc.page_count)):
    page = doc[page_num]
    print(f"\n--- 第 {page_num + 1} 页 ---")
    print(f"页面大小: {page.rect}")
    
    # 获取页面上的所有文本
    blocks = page.get_text("dict")["blocks"]
    print(f"文本块数量: {len(blocks)}")
    
    for i, block in enumerate(blocks):
        if block["type"] == 0:  # 文本块
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    if text:
                        # 检查是否包含watermark相关文字
                        is_watermark = "notebooklm" in text.lower() or "notebook" in text.lower()
                        if is_watermark:
                            print(f"  [可能水印] 块{i}: text='{text}', font={span['font']}, size={span['size']}, color={span['color']}, flags={span['flags']}, origin={span['origin']}")
                        elif len(text) < 100:
                            print(f"  块{i}: text='{text[:50]}', font={span['font']}, size={span['size']}")
        elif block["type"] == 1:  # 图片块
            print(f"  图片块{i}: 大小={block.get('width','?')}x{block.get('height','?')}")

    # 检查页面的xobjects和资源
    annots = list(page.annots()) if page.annots() else []
    print(f"\n  页面annotations数量: {len(annots)}")
    
    # 获取页面内容流中的透明度信息
    print(f"  页面内容流长度: {len(page.get_contents())}")
    
    # 检查图片
    images = page.get_images(full=True)
    print(f"  图片数量: {len(images)}")
    for img in images:
        xref = img[0]
        print(f"    图片xref={xref}, 名称={img[7]}, 大小={img[2]}x{img[3]}")

doc.close()
print("\n分析完成!")
