
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { analyzeTableImage } from './services/geminiService';
import { Button } from './components/Button';
import { ResultView } from './components/ResultView';
import { SmartFillView } from './components/TemplatingView';
import { ProgressBar } from './components/ProgressBar';
import { AppStatus, StoredTable } from './types';

type ModuleType = 'ocr' | 'smart-fill';
type OcrViewType = 'workspace' | 'gallery';

const App: React.FC = () => {
  const [currentModule, setCurrentModule] = useState<ModuleType>('ocr');
  const [ocrView, setOcrView] = useState<OcrViewType>('workspace');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [image, setImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [keywordsInput, setKeywordsInput] = useState<string>('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Gallery State
  const [gallery, setGallery] = useState<StoredTable[]>(() => {
    try {
      const saved = localStorage.getItem('ocr_gallery');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  
  const [showCombined, setShowCombined] = useState(false);

  useEffect(() => {
    localStorage.setItem('ocr_gallery', JSON.stringify(gallery));
  }, [gallery]);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setImage(base64);
        setMimeType(file.type);
        setError(null);
        setStatus(AppStatus.IDLE);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      // Only handle paste in OCR module, SmartFillView handles its own paste
      if (currentModule !== 'ocr') return;
      
      const items = event.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) handleFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [currentModule]);

  const startProgress = () => {
    setProgress(0);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    progressIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 10;
      });
    }, 500);
  };

  const stopProgress = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setProgress(100);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setStatus(AppStatus.IDLE);
    setProgress(0);
  };

  const handleExtract = async () => {
    if (!image) return;
    
    abortControllerRef.current = new AbortController();
    setStatus(AppStatus.PROCESSING);
    setError(null);
    startProgress();

    try {
      // We can't pass the signal to generateContent directly easily without wrapper, 
      // but we can check the signal after the promise resolves.
      const htmlResult = await analyzeTableImage(image, mimeType, keywordsInput);
      
      if (abortControllerRef.current.signal.aborted) {
        return;
      }

      stopProgress();
      setResult(htmlResult);
      setStatus(AppStatus.SUCCESS);
      
      const newEntry: StoredTable = {
        id: crypto.randomUUID(),
        html: htmlResult,
        timestamp: Date.now()
      };
      setGallery(prev => [newEntry, ...prev]);
    } catch (err: any) {
      if (abortControllerRef.current?.signal.aborted) return;
      
      stopProgress();
      setError(err.message || 'Extraction failed. Please check your image or API key.');
      setStatus(AppStatus.ERROR);
    }
  };

  const executeDeleteAll = () => {
    setGallery([]);
    setShowCombined(false);
    setIsConfirmingDelete(false);
    localStorage.removeItem('ocr_gallery');
  };

  const deleteItem = (id: string) => {
    setGallery(prev => prev.filter(item => item.id !== id));
  };

  const combinedHtml = useMemo(() => {
    if (gallery.length === 0) return "";
    const parser = new DOMParser();
    const dataMap = new Map<string, Set<string>[]>();
    let maxColumns = 0;

    gallery.forEach(item => {
      const doc = parser.parseFromString(item.html, 'text/html');
      const rows = doc.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length === 0) return;
        const label = (cells[0].textContent || '').trim();
        if (!label) return;
        const values = cells.slice(1).map(c => (c.textContent || '').trim());
        maxColumns = Math.max(maxColumns, values.length);
        if (!dataMap.has(label)) {
          dataMap.set(label, values.map(v => new Set(v ? [v] : [])));
        } else {
          const existingSets = dataMap.get(label)!;
          values.forEach((val, idx) => {
            if (!val) return;
            if (idx >= existingSets.length) {
              existingSets.push(new Set([val]));
            } else {
              existingSets[idx].add(val);
            }
          });
        }
      });
    });

    let html = '<table border="1"><thead><tr><th>Label</th>';
    for (let i = 0; i < maxColumns; i++) {
      html += `<th>Combined Value ${i + 1}</th>`;
    }
    html += '</tr></thead><tbody>';
    dataMap.forEach((columnSets, label) => {
      html += `<tr><td>${label}</td>`;
      for (let i = 0; i < maxColumns; i++) {
        const values = columnSets[i] ? Array.from(columnSets[i]) : [];
        html += `<td>${values.join(', ')}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }, [gallery]);

  const handleReset = useCallback(() => {
    setImage(null);
    setResult('');
    setStatus(AppStatus.IDLE);
    setError(null);
    setProgress(0);
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-[#F8FAFC] text-slate-900 selection:bg-indigo-500/20 flex flex-col font-sans relative">
      {/* Background Decor */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/5 blur-[120px]"></div>
        <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] rounded-full bg-blue-500/5 blur-[100px]"></div>
      </div>

      {/* Header */}
      <header className="flex-none z-50 px-4 md:px-6 pt-4 pb-2">
        <div className="max-w-[1600px] mx-auto bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <i className="fas fa-cube text-xs"></i>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-none">Studio<span className="text-indigo-600">OCR</span></h1>
            </div>
          </div>
          
          <nav className="flex items-center bg-slate-100/50 p-1 rounded-xl border border-slate-200/50">
            <button 
              onClick={() => setCurrentModule('ocr')}
              className={`text-xs font-bold px-4 py-1.5 rounded-lg transition-all duration-300 ${currentModule === 'ocr' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
            >
              OCR Engine
            </button>
            <button 
              onClick={() => setCurrentModule('smart-fill')}
              className={`text-xs font-bold px-4 py-1.5 rounded-lg transition-all duration-300 ${currentModule === 'smart-fill' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Smart Fill
            </button>
          </nav>

          <div className="hidden md:flex items-center space-x-4">
            <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
              v3.5 Active
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 w-full max-w-[1600px] mx-auto px-4 md:px-6 py-4 z-10 relative overflow-hidden flex flex-col">
        {currentModule === 'ocr' ? (
          <div className="h-full flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Sub-navigation */}
            <div className="flex-none flex justify-center">
              <div className="bg-white/50 backdrop-blur-sm p-1 rounded-xl border border-white/60 shadow-sm inline-flex">
                <button
                  onClick={() => setOcrView('workspace')}
                  className={`px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 flex items-center ${ocrView === 'workspace' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'}`}
                >
                  <i className="fas fa-terminal mr-2 opacity-70"></i>
                  Workspace
                </button>
                <button
                  onClick={() => setOcrView('gallery')}
                  className={`px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 flex items-center ${ocrView === 'gallery' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'}`}
                >
                  <i className="fas fa-th-large mr-2 opacity-70"></i>
                  Gallery
                  <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[9px] ${ocrView === 'gallery' ? 'bg-white/20 text-white' : 'bg-slate-200/50 text-slate-500'}`}>
                    {gallery.length}
                  </span>
                </button>
              </div>
            </div>

            {ocrView === 'workspace' ? (
              <div className="flex-1 min-h-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <section id="workspace" className="h-full grid grid-cols-1 xl:grid-cols-12 gap-6">
                  
                  {/* Controls */}
                  <div className="xl:col-span-4 flex flex-col h-full overflow-hidden">
                    <div className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col h-full overflow-y-auto custom-scrollbar">
                      <div className="flex-none flex items-center justify-between mb-6">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                          <i className="fas fa-sliders-h mr-2 text-indigo-500"></i>
                          Configuration
                        </h3>
                      </div>
                      
                      <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar pr-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Exclusion Filters</label>
                          <div className="relative group">
                            <input 
                              type="text"
                              placeholder="e.g. Total, Tax, Sum"
                              value={keywordsInput}
                              onChange={(e) => setKeywordsInput(e.target.value)}
                              className="w-full pl-4 pr-10 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all text-xs font-medium placeholder:text-slate-400"
                            />
                            <i className="fas fa-filter absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors text-xs"></i>
                          </div>
                        </div>

                        <div className="pt-2">
                          {!image ? (
                            <div className="relative group h-48">
                              <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                              <div className="absolute inset-0 border-2 border-dashed border-slate-200 group-hover:border-indigo-400/50 group-hover:bg-indigo-50/30 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 bg-slate-50/30">
                                <div className="w-12 h-12 bg-white text-indigo-500 rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 group-hover:shadow-md transition-all duration-300">
                                  <i className="fas fa-cloud-upload-alt text-lg"></i>
                                </div>
                                <p className="text-slate-900 text-xs font-bold uppercase tracking-wide">Upload Image</p>
                                <p className="text-slate-400 text-[10px] mt-1.5 font-medium">Drag & drop or Paste (Ctrl+V)</p>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="relative rounded-2xl overflow-hidden border border-slate-200/60 aspect-[4/3] flex items-center justify-center bg-slate-100/50 shadow-inner group max-h-[300px]">
                                <img src={image} alt="Preview" className="max-w-full max-h-full object-contain" />
                                <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                   <Button variant="danger" onClick={() => { setImage(null); setStatus(AppStatus.IDLE); }} className="!rounded-full w-10 h-10 !p-0 shadow-lg scale-90 group-hover:scale-100 transition-transform">
                                      <i className="fas fa-trash text-xs"></i>
                                   </Button>
                                </div>
                              </div>
                              <Button 
                                onClick={handleExtract} 
                                className="w-full py-4 text-xs font-bold uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30" 
                                isLoading={status === AppStatus.PROCESSING}
                              >
                                Extract Data
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {error && (
                      <div className="mt-4 bg-rose-50/80 backdrop-blur-sm border border-rose-100 p-4 rounded-2xl flex items-start space-x-3 animate-in slide-in-from-left-4 duration-300 shrink-0">
                        <div className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                          <i className="fas fa-times text-[10px]"></i>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wide">Error</h4>
                          <p className="text-[11px] text-rose-700 font-medium mt-0.5 leading-relaxed">{error}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Result View */}
                  <div className="xl:col-span-8 h-full overflow-hidden flex flex-col">
                    {status === AppStatus.SUCCESS ? (
                      <ResultView html={result} onReset={handleReset} onStore={() => {}} isAutoSaved={true} />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center bg-white/40 backdrop-blur-sm rounded-3xl border border-slate-200/60 border-dashed text-slate-300 relative overflow-hidden group hover:bg-white/60 transition-colors duration-500">
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none group-hover:opacity-[0.05] transition-opacity" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
                        
                        {status === AppStatus.PROCESSING ? (
                          <div className="w-full max-w-sm px-8">
                             <ProgressBar progress={progress} onStop={handleStop} label="Extracting Data..." />
                          </div>
                        ) : (
                          <>
                            <div className="bg-white p-8 rounded-full mb-6 relative shadow-sm ring-1 ring-slate-100">
                               <i className="fas fa-cube text-5xl text-slate-200"></i>
                            </div>
                            <h3 className="text-slate-800 font-bold uppercase tracking-widest text-xs">Ready to Process</h3>
                            <p className="text-center px-12 text-[11px] mt-2 text-slate-400 font-medium max-w-md">
                              Upload an image to start the extraction engine.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8 pb-8">
                {/* Gallery Section */}
                <div className="flex flex-col md:flex-row justify-between items-end gap-6 sticky top-0 bg-[#F8FAFC]/95 backdrop-blur-sm z-10 py-4 border-b border-slate-200/50">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">History</h2>
                    <p className="text-slate-500 font-medium text-xs">Manage your past extractions.</p>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {!isConfirmingDelete ? (
                      <>
                        <Button 
                          variant="soft" 
                          onClick={() => setShowCombined(!showCombined)} 
                          disabled={gallery.length < 2}
                          className="!rounded-xl font-bold text-[10px] uppercase tracking-wide"
                        >
                          <i className="fas fa-layer-group mr-2"></i>
                          {showCombined ? 'Hide Combined' : 'Combine Data'}
                        </Button>
                        <Button variant="ghost" onClick={() => setIsConfirmingDelete(true)} disabled={gallery.length === 0} className="font-bold text-[10px] uppercase tracking-wide">
                          Clear All
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 p-1.5 rounded-xl animate-in fade-in zoom-in duration-200">
                        <span className="text-rose-900 text-[10px] font-bold uppercase tracking-wide px-2">Sure?</span>
                        <Button variant="danger" onClick={executeDeleteAll} className="!py-1 !px-3 text-[10px] font-bold uppercase tracking-wide !rounded-lg">
                          Yes
                        </Button>
                        <Button variant="ghost" onClick={() => setIsConfirmingDelete(false)} className="!py-1 !px-3 text-[10px] font-bold uppercase tracking-wide !rounded-lg">
                          No
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {showCombined && (
                  <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-8 shadow-2xl shadow-indigo-500/30 relative animate-in fade-in slide-in-from-top-4 duration-500 text-white">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-lg font-bold tracking-tight mb-1">Combined View</h3>
                        <p className="text-indigo-100 text-xs font-medium opacity-80">Aggregated data from all history items.</p>
                      </div>
                      <button onClick={() => setShowCombined(false)} className="text-white/40 hover:text-white transition-colors bg-white/10 hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center">
                        <i className="fas fa-times text-sm"></i>
                      </button>
                    </div>
                    
                    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 overflow-auto border border-white/10 max-h-[400px] shadow-inner custom-scrollbar">
                      <style>{`
                        .combined-table table { width: 100%; border-collapse: collapse; color: white; }
                        .combined-table td, .combined-table th { padding: 12px 16px; border: 1px solid rgba(255,255,255,0.1); font-size: 12px; font-weight: 400; }
                        .combined-table th { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.9); text-align: left; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
                      `}</style>
                      <div className="combined-table" dangerouslySetInnerHTML={{ __html: combinedHtml }} />
                    </div>
                    
                    <div className="mt-6 flex justify-end">
                      <Button variant="secondary" onClick={() => navigator.clipboard.writeText(combinedHtml)} className="!rounded-xl font-bold text-[10px] tracking-widest !bg-white/10 !text-white !border-white/20 hover:!bg-white/20">
                        <i className="fas fa-copy mr-2"></i> COPY HTML
                      </Button>
                    </div>
                  </div>
                )}

                {gallery.length === 0 ? (
                  <div className="bg-white/60 backdrop-blur-sm rounded-3xl p-20 flex flex-col items-center justify-center border border-slate-200/60 border-dashed text-slate-300">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                      <i className="fas fa-history text-2xl opacity-30"></i>
                    </div>
                    <p className="font-bold text-xs uppercase tracking-widest text-slate-400">History Empty</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {gallery.map((item) => (
                      <div key={item.id} className="bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden flex flex-col group hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300">
                        <div className="bg-slate-50/50 px-5 py-3 border-b border-slate-100 flex justify-between items-center shrink-0">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </span>
                          <button 
                            onClick={() => deleteItem(item.id)}
                            className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                          >
                            <i className="fas fa-times text-xs"></i>
                          </button>
                        </div>
                        <div className="p-5 flex-1 overflow-auto max-h-[250px] relative custom-scrollbar bg-white">
                          <style>{`
                            .gallery-preview table { font-size: 10px; width: 100%; border-collapse: collapse; }
                            .gallery-preview td, .gallery-preview th { padding: 4px 8px; border: 1px solid #f1f5f9; }
                            .gallery-preview th { font-weight: 700; color: #64748b; background: #f8fafc; text-transform: uppercase; font-size: 8px; }
                          `}</style>
                          <div className="gallery-preview" dangerouslySetInnerHTML={{ __html: item.html }} />
                        </div>
                        <div className="px-5 py-3 bg-slate-50/30 border-t border-slate-50 flex justify-between items-center">
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Preview</div>
                          <Button variant="ghost" className="!p-1.5 h-7 w-7 !rounded-lg hover:bg-indigo-50 hover:text-indigo-600" onClick={() => navigator.clipboard.writeText(item.html)}>
                             <i className="fas fa-copy text-[10px]"></i>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <SmartFillView onStatusChange={setStatus} />
        )}
      </main>

      <footer className="flex-none py-4 text-center">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
          Studio OCR &bull; Intelligent Document Processing
        </p>
      </footer>
    </div>
  );
};

export default App;
