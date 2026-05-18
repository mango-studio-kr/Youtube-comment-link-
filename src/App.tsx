import React, { useState, useRef, useCallback } from 'react';
import { createWorker } from 'tesseract.js';
import { 
  Upload, ExternalLink, Image as ImageIcon, Loader2, 
  ClipboardCopy, CheckCircle2, AlertCircle, X, ScanText, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// CSS 클래스 합치기 유틸리티
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LinkResult {
  url: string;
  id: string;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<LinkResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 이미지 전처리 (인식률 향상)
  const preprocessImage = (imageSrc: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(imageSrc);
        const scale = 3;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'grayscale(100%) contrast(300%) brightness(110%)';
        ctx.drawImage(canvas, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = imageSrc;
    });
  };

  const extractLinks = (text: string): LinkResult[] => {
    const urlRegex = /(https?:\/\/[^\s\n\r"']+)/gi;
    const matches = text.match(urlRegex) || [];
    const cleanedLinks = matches.map(url => url.replace(/[.,!?;:]+$/, '').trim());
    const uniqueLinks = Array.from(new Set(cleanedLinks));
    return uniqueLinks.map(url => ({
      url,
      id: Math.random().toString(36).substr(2, 9)
    }));
  };

  const scanWithLocalOCR = async (imageSrc: string) => {
    setIsProcessing(true);
    setError(null);
    setScanProgress(0);
    setProcessingStep('이미지 최적화 중...');

    try {
      const processedImage = await preprocessImage(imageSrc);
      setProcessingStep('문자 인식 준비 중...');
      const worker = await createWorker('kor+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProcessingStep('텍스트 추출 중...');
            setScanProgress(Math.floor(m.progress * 100));
          }
        },
      });

      const { data: { text } } = await worker.recognize(processedImage);
      await worker.terminate();

      const foundLinks = extractLinks(text);
      setResults(foundLinks);
      if (foundLinks.length === 0) {
        setError("이미지에서 링크를 찾지 못했습니다. 텍스트가 선명한지 확인해주세요.");
      }
    } catch (err) {
      setError("분석 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImage(result);
      scanWithLocalOCR(result);
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setImage(null);
    setResults([]);
    setError(null);
    setScanProgress(0);
    setProcessingStep('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 flex flex-col items-center font-sans lg:pt-12">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center text-balance">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white mb-4 shadow-lg shadow-blue-200">
            <ScanText size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">유튜브 댓글 주소연결</h1>
          <p className="text-slate-500 text-sm mt-1">YouTube Comment Link Scanner</p>
        </header>

        <main className="space-y-6">
          {!image ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 bg-white rounded-3xl p-10 flex flex-col items-center space-y-4 cursor-pointer hover:border-blue-400 transition-colors"
            >
              <Upload className="text-slate-400" size={32} />
              <div className="text-center">
                <p className="font-semibold text-slate-900">댓글 캡처 선택</p>
                <p className="text-xs text-slate-500 mt-1">이미지를 올리면 주소를 찾아드려요</p>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="relative aspect-video bg-slate-100">
                <img src={image} className="w-full h-full object-contain" alt="Preview" />
                {!isProcessing && (
                  <button onClick={reset} className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-md text-slate-400">
                    <X size={20} />
                  </button>
                )}
              </div>
              {isProcessing && (
                <div className="p-8 flex flex-col items-center space-y-3">
                  <Loader2 className="animate-spin text-blue-600" size={32} />
                  <p className="text-sm font-medium">{processingStep}</p>
                </div>
              )}
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-500 px-1">발견된 주소 ({results.length})</h2>
              {results.map((res) => (
                <div key={res.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <p className="flex-1 text-sm truncate font-medium">{res.url}</p>
                  <a href={res.url} target="_blank" className="p-2 bg-blue-600 text-white rounded-xl"><ExternalLink size={16} /></a>
                </div>
              ))}
            </div>
          )}
          
          {error && (
             <div className="bg-amber-50 text-amber-800 p-4 rounded-2xl text-xs text-center">{error}</div>
          )}
        </main>
      </div>
    </div>
  );
}
