import React, { useState, useEffect, useRef } from 'react';
import { Button } from './Button';
import { fillHtmlTemplate } from '../services/geminiService';
import { AppStatus, StoredTemplate } from '../types';
import { ProgressBar } from './ProgressBar';

interface SmartFillViewProps {
  onStatusChange: (status: AppStatus) => void;
}

type SourceType = 'image' | 'text';

export const SmartFillView: React.FC<SmartFillViewProps> = ({ onStatusChange }) => {
  const [htmlInput, setHtmlInput] = useState<string>('');
  const [sourceType, setSourceType] = useState<SourceType>('text');
  const [image, setImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Template Management
  const [templates, setTemplates] = useState<StoredTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('ocr_templates');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [templateName, setTemplateName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  useEffect(() => {
    localStorage.setItem('ocr_templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              handleFile(file);
              setSourceType('image'); // Auto-switch to image mode
            }
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setImage(base64);
        setMimeType(file.type);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const startProgress = () => {
    setProgress(0);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    
    progressIntervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 5;
      });
    }, 800);
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
    onStatusChange(AppStatus.IDLE);
    setProgress(0);
  };

  const handleGenerate = async () => {
    if (!htmlInput.trim()) {
      setError('Please provide an HTML template.');
      return;
    }

    if (sourceType === 'image' && !image) {
      setError('Please provide a source image.');
      return;
    }

    if (sourceType === 'text' && !textInput.trim()) {
      setError('Please provide source text.');
      return;
    }
    
    abortControllerRef.current = new AbortController();
    setStatus(AppStatus.PROCESSING);
    onStatusChange(AppStatus.PROCESSING);
    setError(null);
    startProgress();
    
    try {
      const source = sourceType === 'image' 
        ? { type: 'image' as const, data: image!, mimeType }
        : { type: 'text' as const, content: textInput };

      const generatedHtml = await fillHtmlTemplate(source, htmlInput);
      
      if (abortControllerRef.current.signal.aborted) {
        return;
      }

      stopProgress();
      setResult(generatedHtml);
      setStatus(AppStatus.SUCCESS);
      onStatusChange(AppStatus.SUCCESS);
    } catch (err: any) {
      if (abortControllerRef.current?.signal.aborted) return;

      stopProgress();
      setError(err.message || 'Generation failed.');
      setStatus(AppStatus.ERROR);
      onStatusChange(AppStatus.ERROR);
    }
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim() || !htmlInput.trim()) return;
    
    const newTemplate: StoredTemplate = {
      id: crypto.randomUUID(),
      name: templateName.trim(),
      html: htmlInput,
      timestamp: Date.now()
    };
    
    setTemplates(prev => [newTemplate, ...prev]);
    setTemplateName('');
    setShowSaveDialog(false);
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const loadTemplate = (template: StoredTemplate) => {
    setHtmlInput(template.html);
  };

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
      {/* Left Column: Inputs */}
      <div className="flex flex-col space-y-4 h-full overflow-hidden">
        
        {/* Template Management */}
        <div className="flex-1 min-h-0 bg-white/70 backdrop-blur-xl rounded-3xl p-6 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col overflow-hidden">
          <div className="flex-none flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
              <i className="fas fa-code mr-2 text-indigo-500"></i>
              HTML Template
            </h3>
            <div className="flex space-x-2">
               <Button variant="soft" onClick={() => setShowSaveDialog(!showSaveDialog)} className="!px-3 !py-1.5 text-[10px]">
                 <i className="fas fa-save mr-1.5"></i> Save
               </Button>
            </div>
          </div>
          
          {showSaveDialog && (
            <div className="flex-none mb-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-200/60 animate-in fade-in slide-in-from-top-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Template Name</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
                  placeholder="e.g. Invoice Layout A"
                />
                <Button onClick={handleSaveTemplate} disabled={!templateName.trim()} className="!px-4 !py-2 text-[10px]">
                  Confirm
                </Button>
              </div>
            </div>
          )}

          {templates.length > 0 && (
            <div className="flex-none mb-4">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-wider">Saved Templates</label>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar">
                {templates.map(t => (
                  <button 
                    key={t.id}
                    onClick={() => loadTemplate(t)}
                    className="group flex items-center px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-100 hover:border-indigo-100 rounded-lg text-[10px] font-bold transition-all shadow-sm hover:shadow-md"
                  >
                    <span className="mr-2 text-slate-600 group-hover:text-indigo-600">{t.name}</span>
                    <span 
                      onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id); }}
                      className="text-slate-300 hover:text-rose-500 px-1 transition-colors"
                    >
                      &times;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea
            value={htmlInput}
            onChange={(e) => setHtmlInput(e.target.value)}
            placeholder="Paste your HTML structure here..."
            className="flex-1 w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl font-mono text-[11px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none resize-none transition-all placeholder:text-slate-400 custom-scrollbar leading-relaxed"
          />
        </div>

        {/* Source Input */}
        <div className="flex-1 min-h-0 bg-white/70 backdrop-blur-xl rounded-3xl p-6 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col overflow-hidden">
          <div className="flex-none flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
              <i className="fas fa-database mr-2 text-indigo-500"></i>
              Data Source
            </h3>
            <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
              <button
                onClick={() => setSourceType('text')}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-300 ${sourceType === 'text' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Text
              </button>
              <button
                onClick={() => setSourceType('image')}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all duration-300 ${sourceType === 'image' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Image
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {sourceType === 'image' ? (
              !image ? (
                <div className="flex-1 relative group min-h-0">
                  <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="absolute inset-0 border-2 border-dashed border-slate-200 group-hover:border-indigo-400/50 group-hover:bg-indigo-50/30 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 bg-slate-50/30">
                    <div className="w-12 h-12 bg-white text-indigo-500 rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 group-hover:shadow-md transition-all duration-300">
                      <i className="fas fa-image text-lg"></i>
                    </div>
                    <p className="text-slate-900 text-xs font-bold uppercase tracking-wide">Upload Image</p>
                    <p className="text-slate-400 text-[10px] mt-1.5 font-medium">Drag & drop or Paste (Ctrl+V)</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 relative rounded-2xl overflow-hidden border border-slate-200/60 bg-slate-100/50 group shadow-inner min-h-0">
                  <img src={image} alt="Source" className="w-full h-full object-contain" />
                  <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                     <Button variant="danger" onClick={() => setImage(null)} className="!rounded-full w-10 h-10 !p-0 shadow-lg scale-90 group-hover:scale-100 transition-transform">
                        <i className="fas fa-trash text-xs"></i>
                     </Button>
                  </div>
                </div>
              )
            ) : (
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste unstructured text, CSV, or JSON here..."
                className="flex-1 w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl font-mono text-[11px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none resize-none transition-all placeholder:text-slate-400 custom-scrollbar leading-relaxed"
              />
            )}
          </div>
          
          <div className="flex-none mt-4">
            <Button 
              onClick={handleGenerate} 
              className="w-full py-4 text-xs font-bold uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
              isLoading={status === AppStatus.PROCESSING}
              disabled={(!htmlInput) || (sourceType === 'image' && !image) || (sourceType === 'text' && !textInput)}
            >
              Smart Fill Table
            </Button>
          </div>

          {error && (
            <div className="flex-none mt-4 bg-rose-50/80 backdrop-blur-sm border border-rose-100 p-4 rounded-2xl text-[11px] text-rose-700 font-medium flex items-start shadow-sm">
              <i className="fas fa-exclamation-circle mt-0.5 mr-2 text-rose-500"></i>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Output */}
      <div className="h-full overflow-hidden flex flex-col">
        {result ? (
          <div className="flex-1 bg-white rounded-3xl shadow-[0_20px_50px_rgb(0,0,0,0.1)] border border-slate-200/60 overflow-hidden flex flex-col ring-1 ring-slate-900/5">
            <div className="flex-none bg-slate-50/80 backdrop-blur-md border-b border-slate-200/60 px-6 py-4 flex justify-between items-center">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                Generated Result
              </h3>
              <Button variant="ghost" onClick={() => navigator.clipboard.writeText(result)} className="!px-3 !py-1.5 text-[10px] font-bold uppercase tracking-wide">
                <i className="fas fa-copy mr-2"></i> Copy HTML
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-white custom-scrollbar">
               <div dangerouslySetInnerHTML={{ __html: result }} />
            </div>
            <div className="flex-none border-t border-slate-100 bg-slate-900 p-6 relative group">
              <div className="absolute top-0 right-0 px-3 py-1 bg-slate-800 rounded-bl-xl text-[9px] font-mono text-slate-400 uppercase tracking-widest">Source Code</div>
              <pre className="text-indigo-300 font-mono text-[10px] overflow-auto max-h-48 custom-scrollbar leading-relaxed">
                {result}
              </pre>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-white/40 backdrop-blur-sm rounded-3xl border border-slate-200/60 border-dashed text-slate-300 relative overflow-hidden group hover:bg-white/60 transition-colors duration-500">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none group-hover:opacity-[0.05] transition-opacity" style={{ backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            
            {status === AppStatus.PROCESSING ? (
              <div className="w-full max-w-sm px-8">
                 <ProgressBar progress={progress} onStop={handleStop} label="Generating Table..." />
              </div>
            ) : (
              <>
                <div className="bg-white p-8 rounded-full mb-6 relative shadow-sm ring-1 ring-slate-100">
                   <i className="fas fa-magic text-5xl text-slate-200"></i>
                </div>
                <p className="font-bold text-xs uppercase tracking-widest text-slate-400">No Result Generated</p>
                <p className="text-center px-12 text-[11px] mt-2 text-slate-400 font-medium max-w-md">
                  Provide a template and source data to generate a populated HTML table.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
