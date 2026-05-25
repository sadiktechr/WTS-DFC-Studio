
import React, { useState } from 'react';
import { Button } from './Button';

interface ResultViewProps {
  html: string;
  onReset: () => void;
  onStore: () => void;
  isAutoSaved?: boolean;
}

export const ResultView: React.FC<ResultViewProps> = ({ html, onReset, isAutoSaved }) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-white rounded-3xl shadow-[0_20px_50px_rgb(0,0,0,0.1)] border border-slate-200/60 overflow-hidden flex flex-col h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500 ring-1 ring-slate-900/5">
      <div className="bg-slate-50/80 backdrop-blur-md border-b border-slate-200/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex bg-slate-200/50 p-1 rounded-xl border border-slate-200/50">
          <button 
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all duration-300 ${activeTab === 'preview' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Preview
          </button>
          <button 
            onClick={() => setActiveTab('code')}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all duration-300 ${activeTab === 'code' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
          >
            HTML Source
          </button>
        </div>
        <div className="flex items-center space-x-3">
          {isAutoSaved && (
            <div className="flex items-center px-2.5 py-1 bg-emerald-50/50 text-emerald-700 text-[9px] font-bold uppercase tracking-wider rounded-full border border-emerald-100/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
              Saved
            </div>
          )}
          <div className="h-4 w-px bg-slate-200 mx-1"></div>
          <Button variant="ghost" onClick={handleCopy} className="text-[10px] font-bold !px-3 uppercase tracking-wide">
            {copied ? <span className="text-emerald-600 flex items-center"><i className="fas fa-check mr-1.5"></i> Copied</span> : <span className="flex items-center"><i className="fas fa-copy mr-1.5"></i> Copy</span>}
          </Button>
          <Button variant="secondary" onClick={onReset} className="text-[10px] font-bold uppercase tracking-wide !px-4">
            Reset
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white custom-scrollbar relative">
        {activeTab === 'preview' ? (
          <div className="p-8">
            <div className="prose prose-slate max-w-none prose-sm">
              <div 
                className="table-wrapper"
                dangerouslySetInnerHTML={{ __html: html }} 
              />
            </div>
          </div>
        ) : (
          <div className="relative h-full bg-slate-900">
            <pre className="text-indigo-300 p-8 font-mono text-[11px] leading-relaxed h-full overflow-auto selection:bg-indigo-500/30 custom-scrollbar">
              {html}
            </pre>
            <div className="absolute top-0 right-0 px-3 py-1 bg-slate-800 rounded-bl-xl text-[9px] font-mono text-slate-400 uppercase tracking-widest pointer-events-none border-l border-b border-slate-700">
              index.html
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-slate-50/50 px-6 py-3 shrink-0 flex items-center justify-between text-[9px] text-slate-400 font-bold tracking-widest uppercase border-t border-slate-100/50 backdrop-blur-sm">
        <div className="flex items-center">
          <i className="fas fa-microchip mr-2 text-indigo-400"></i>
          Gemini 3 Flash Engine
        </div>
        <div className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2"></span>
          Ready for integration
        </div>
      </div>
      
      <style>{`
        .table-wrapper table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }
        .table-wrapper td, .table-wrapper th {
          padding: 14px 18px;
          border-bottom: 1px solid #f1f5f9;
          border-right: 1px solid #f1f5f9;
          font-size: 13px;
        }
        .table-wrapper th {
          background-color: #f8fafc;
          font-weight: 700;
          text-align: left;
          color: #475569;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.05em;
        }
        .table-wrapper tr:last-child td { border-bottom: none; }
        .table-wrapper td:last-child, .table-wrapper th:last-child { border-right: none; }
        .table-wrapper tr:hover td { background-color: #f8fafc; transition: background-color 0.15s ease; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};
