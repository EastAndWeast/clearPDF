import React, { useState } from 'react';
import { Upload, FileText, Settings, Download, CheckCircle2, Loader2, Image as ImageIcon } from 'lucide-react';
import { processPDF } from './utils/watermarkProcessor';

function App() {
  const [file, setFile] = useState(null);
  const [configType, setConfigType] = useState('text'); // 'text' or 'image'
  const [watermarkContent, setWatermarkContent] = useState('');
  const [processingEffect, setProcessingEffect] = useState('smart');
  const [status, setStatus] = useState('idle'); // 'idle', 'processing', 'done'
  const [downloadUrl, setDownloadUrl] = useState('');

  const handleUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const startProcessing = async () => {
    setStatus('processing');
    try {
      // 1. 上传到 Cloudflare R2 (暂存)
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();

      if (!uploadData.success) throw new Error('上传失败');

      // 2. 客户端 Wasm 处理
      const result = await processPDF(file, {
        type: configType,
        content: watermarkContent,
        effect: processingEffect
      });

      if (result.success) {
        // 3. 将处理后的文件回写给后端（模拟持久化到 R2）
        const finalFormData = new FormData();
        finalFormData.append('file', result.processedBlob, file.name);

        const saveRes = await fetch(`/api/upload?key=${encodeURIComponent(result.downloadKey)}`, {
          method: 'POST',
          body: finalFormData
        });
        const saveData = await saveRes.json();

        if (saveData.success) {
          setDownloadUrl(`/api/download?key=${encodeURIComponent(result.downloadKey)}`);
          setStatus('done');
        }
      }
    } catch (err) {
      console.error(err);
      alert('处理失败，请重试');
      setStatus('idle');
    }
  };

  const reset = () => {
    setFile(null);
    setStatus('idle');
  };

  return (
    <div className="container">
      <header>
        <h1>ClearPDF</h1>
        <p className="subtitle">简单的三步，彻底移除 PDF 水印</p>
      </header>

      <main>
        {status === 'idle' && (
          <div className="card">
            {!file ? (
              <div className="upload-area" onClick={() => document.getElementById('file-input').click()} style={styles.uploadArea}>
                <Upload size={48} color="var(--color-primary)" />
                <p style={{ marginTop: '1rem', fontWeight: 600 }}>点击或拖拽上传 PDF 文件</p>
                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>仅支持 .pdf 格式</p>
                <input id="file-input" type="file" accept=".pdf" onChange={handleUpload} hidden />
              </div>
            ) : (
              <div className="config-panel">
                <div style={styles.fileHeader}>
                  <FileText size={24} color="var(--color-primary)" />
                  <span style={{ marginLeft: '10px', fontWeight: 600 }}>{file.name}</span>
                  <button onClick={reset} style={styles.btnLink}>重新上传</button>
                </div>

                <div className="tabs" style={styles.tabs}>
                  <button
                    className={configType === 'text' ? 'active' : ''}
                    onClick={() => setConfigType('text')}
                    style={configType === 'text' ? styles.tabActive : styles.tab}
                  >
                    文字水印
                  </button>
                  <button
                    className={configType === 'image' ? 'active' : ''}
                    onClick={() => setConfigType('image')}
                    style={configType === 'image' ? styles.tabActive : styles.tab}
                  >
                    截图/区域移除
                  </button>
                </div>

                {configType === 'text' ? (
                  <div className="input-group">
                    <label className="label">请输入要移除的水印文字</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="例如：机密文件、公司内部"
                      value={watermarkContent}
                      onChange={(e) => setWatermarkContent(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="input-group">
                    <label className="label">上传水印截图或指定坐标</label>
                    <div style={styles.imagePlaceholder}>
                      <ImageIcon size={32} color="#94a3b8" />
                      <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '10px' }}>点击定位水印区域（功能开发中）</p>
                    </div>
                  </div>
                )}

                <div className="input-group">
                  <label className="label">选择处理效果</label>
                  <select className="input" value={processingEffect} onChange={(e) => setProcessingEffect(e.target.value)}>
                    <option value="smart">智能识别 (推荐)</option>
                    <option value="aggressive">强力清除</option>
                    <option value="preserve">保留布局</option>
                  </select>
                </div>

                <button className="btn-primary" onClick={startProcessing}>
                  立即移除水印
                </button>
              </div>
            )}
          </div>
        )}

        {status === 'processing' && (
          <div className="card" style={styles.centerCard}>
            <Loader2 className="animate-spin" size={64} color="var(--color-primary)" />
            <h2 style={{ marginTop: '24px', color: 'var(--color-primary)' }}>正在深度扫描与处理...</h2>
            <p style={{ marginTop: '8px', color: '#64748b' }}>这通常需要几秒钟，请稍候</p>
          </div>
        )}

        {status === 'done' && (
          <div className="card" style={styles.centerCard}>
            <CheckCircle2 size={64} color="#22c55e" />
            <h2 style={{ marginTop: '24px', color: '#134e4a' }}>水印已成功移除！</h2>
            <p style={{ marginTop: '8px', color: '#475569', marginBottom: '32px' }}>文档已按照您的设置完成优化。</p>
            <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
              <a
                href={downloadUrl}
                download
                className="btn-primary"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
              >
                <Download size={20} style={{ marginRight: '8px' }} />
                下载成品文档
              </a>
              <button
                onClick={reset}
                className="btn-primary"
                style={{ flex: 1, backgroundColor: 'white', color: 'var(--color-primary)', border: '2px solid var(--color-primary)', boxShadow: 'none' }}
              >
                处理另一个
              </button>
            </div>
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        <p>© 2026 ClearPDF. 基于第一性原理构建的极致工具。</p>
      </footer>

      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  uploadArea: {
    border: '3px dashed #cbd5e1',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 200ms ease',
  },
  fileHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #f1f5f9',
  },
  btnLink: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#0d9488',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
    textDecoration: 'underline',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    background: '#f1f5f9',
    padding: '4px',
    borderRadius: '12px',
  },
  tab: {
    flex: 1,
    padding: '10px',
    border: 'none',
    background: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 600,
    color: '#64748b',
    transition: 'all 200ms ease',
  },
  tabActive: {
    flex: 1,
    padding: '10px',
    border: 'none',
    background: 'white',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 700,
    color: '#0d9488',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  },
  imagePlaceholder: {
    height: '120px',
    background: '#f8fafc',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #e2e8f0',
  },
  centerCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '64px 32px',
    textAlign: 'center',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: '48px',
    textAlign: 'center',
    fontSize: '0.85rem',
    color: '#94a3b8',
  }
};

export default App;
