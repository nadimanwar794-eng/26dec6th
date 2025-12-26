
import React, { useState, useEffect } from 'react';
import { Chapter, User, Subject, SystemSettings } from '../types';
import { FileText, Lock, ArrowLeft, Crown, Star, CheckCircle, ExternalLink } from 'lucide-react';
import { getChapterData, saveUserToLive } from '../firebase';

interface Props {
  chapter: Chapter;
  subject: Subject;
  user: User;
  board: string;
  classLevel: string;
  stream: string | null;
  onBack: () => void;
  onUpdateUser: (user: User) => void;
  settings?: SystemSettings;
}

export const PdfView: React.FC<Props> = ({ 
  chapter, subject, user, board, classLevel, stream, onBack, onUpdateUser, settings 
}) => {
  const [contentData, setContentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activePdf, setActivePdf] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{type: string, price: number, link: string} | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // STRICT KEY MATCHING WITH ADMIN
      const streamKey = (classLevel === '11' || classLevel === '12') && stream ? `-${stream}` : '';
      const key = `nst_content_${board}_${classLevel}${streamKey}_${subject.name}_${chapter.id}`;
      
      let data = await getChapterData(key);
      if (!data) {
          const stored = localStorage.getItem(key);
          if (stored) data = JSON.parse(stored);
      }
      setContentData(data || {});
      setLoading(false);
    };

    fetchData();
  }, [chapter.id, board, classLevel, stream, subject.name]);

  const handlePdfClick = (type: 'FREE' | 'PREMIUM' | 'ULTRA') => {
      let link = '';
      let price = 0;

      if (type === 'FREE') {
          link = contentData?.freeLink;
          price = 0;
      } else if (type === 'PREMIUM') {
          link = contentData?.premiumLink;
          price = contentData?.price !== undefined ? contentData.price : (settings?.defaultPdfCost ?? 5);
      } else if (type === 'ULTRA') {
          link = contentData?.ultraPdfLink;
          price = contentData?.ultraPdfPrice || 10;
      }

      if (!link) {
          alert("This content has not been uploaded by Admin yet.");
          return;
      }

      // Access Check
      if (user.role === 'ADMIN') {
          setActivePdf(link);
          return;
      }

      if (price === 0) {
          setActivePdf(link);
          return;
      }

      // Subscription Check
      const isSubscribed = user.isPremium && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date();
      if (isSubscribed) {
          if (user.subscriptionLevel === 'ULTRA') {
              setActivePdf(link);
              return;
          }
          // Basic can access Free/Premium but not Ultra (usually)
          if (type !== 'ULTRA') {
              setActivePdf(link);
              return;
          }
      }

      // Coin Deduction
      setConfirmModal({ type, price, link });
  };

  const confirmPayment = () => {
      if (!confirmModal) return;
      
      if (user.credits < confirmModal.price) {
          alert(`Insufficient Credits! You need ${confirmModal.price} coins.`);
          setConfirmModal(null);
          return;
      }

      const updatedUser = { ...user, credits: user.credits - confirmModal.price };
      localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
      saveUserToLive(updatedUser);
      onUpdateUser(updatedUser);
      
      setActivePdf(confirmModal.link);
      setConfirmModal(null);
  };

  return (
    <div className="bg-white min-h-screen pb-20 animate-in fade-in slide-in-from-right-8">
       {/* HEADER */}
       <div className="sticky top-0 z-20 bg-white border-b border-slate-100 shadow-sm p-4 flex items-center gap-3">
           <button onClick={() => activePdf ? setActivePdf(null) : onBack()} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
               <ArrowLeft size={20} />
           </button>
           <div className="flex-1">
               <h3 className="font-bold text-slate-800 leading-tight line-clamp-1">{chapter.title}</h3>
               <p className="text-xs text-slate-500">{subject.name} • PDF Library</p>
           </div>
           <div className="flex items-center gap-1 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
               <Crown size={14} className="text-blue-600" />
               <span className="font-black text-blue-800 text-xs">{user.credits} CR</span>
           </div>
       </div>

       {activePdf ? (
           <div className="h-[calc(100vh-80px)] w-full bg-slate-100">
               <iframe 
                   src={activePdf.includes('drive.google.com') ? activePdf.replace('/view', '/preview') : activePdf} 
                   className="w-full h-full border-none"
                   title="PDF Viewer"
               ></iframe>
           </div>
       ) : (
       <div className="p-6 space-y-4">
           {loading ? (
               <div className="space-y-4">
                   <div className="h-24 bg-slate-100 rounded-2xl animate-pulse"></div>
                   <div className="h-24 bg-slate-100 rounded-2xl animate-pulse"></div>
               </div>
           ) : (
               <>
                   {/* FREE PDF */}
                   <button 
                       onClick={() => handlePdfClick('FREE')}
                       className="w-full p-5 rounded-2xl border-2 border-green-100 bg-green-50/30 hover:bg-green-50 flex items-center gap-4 transition-all"
                   >
                       <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center shadow-sm">
                           <FileText size={24} />
                       </div>
                       <div className="flex-1 text-left">
                           <h4 className="font-bold text-slate-800">Free Notes</h4>
                           <p className="text-xs text-slate-500">Standard Quality PDF</p>
                       </div>
                       <span className="text-[10px] font-bold bg-green-200 text-green-800 px-3 py-1 rounded-full">FREE</span>
                   </button>

                   {/* PREMIUM PDF - RENAMED TO EXCLUSIVE PDF */}
                   <button 
                       onClick={() => handlePdfClick('PREMIUM')}
                       className="w-full p-5 rounded-2xl border-2 border-purple-100 bg-purple-50/30 hover:bg-purple-50 flex items-center gap-4 transition-all"
                   >
                       <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shadow-sm">
                           <Crown size={24} />
                       </div>
                       <div className="flex-1 text-left">
                           <h4 className="font-bold text-slate-800">Exclusive PDF</h4>
                           <p className="text-xs text-slate-500">High Quality / Handwriting</p>
                       </div>
                       <span className="text-[10px] font-bold bg-purple-200 text-purple-800 px-3 py-1 rounded-full flex items-center gap-1">
                           <Lock size={10} /> {contentData?.price !== undefined ? contentData.price : (settings?.defaultPdfCost ?? 5)} CR
                       </span>
                   </button>

                   {/* ULTRA PDF - REMOVED AS REQUESTED */}
               </>
           )}
           
           <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-6 text-center">
               <p className="text-xs text-slate-400">
                   Note: PDFs open inside the app.
               </p>
           </div>
       </div>
       )}

       {/* CONFIRMATION MODAL */}
       {confirmModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
               <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl text-center">
                   <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                       <Lock size={32} />
                   </div>
                   <h3 className="text-xl font-black text-slate-800 mb-2">Unlock {confirmModal.type} PDF?</h3>
                   <p className="text-slate-500 text-sm mb-6">
                       This content requires <span className="font-bold text-slate-800">{confirmModal.price} Coins</span>.
                   </p>
                   <div className="flex gap-3">
                       <button onClick={() => setConfirmModal(null)} className="flex-1 py-3 text-slate-500 font-bold bg-slate-100 rounded-xl hover:bg-slate-200">Cancel</button>
                       <button onClick={confirmPayment} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700">
                           Pay {confirmModal.price} CR
                       </button>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
};
