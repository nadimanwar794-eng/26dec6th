
import React, { useState, useEffect } from 'react';
import { User, Subject, StudentTab, SystemSettings, CreditPackage, WeeklyTest, Chapter } from '../types';
import { updateUserStatus, db, saveUserToLive, getChapterData } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getSubjectsList } from '../constants';
import { RedeemSection } from './RedeemSection';
import { Store } from './Store';
import { Zap, Crown, Calendar, Clock, History, Layout, Gift, Sparkles, Megaphone, Lock, BookOpen, AlertCircle, Edit, Settings, Play, Pause, RotateCcw, MessageCircle, Gamepad2, Timer, CreditCard, Send, CheckCircle, Mail, X, Ban, Smartphone, Trophy, ShoppingBag, ArrowRight, Video, Youtube } from 'lucide-react';
import { SubjectSelection } from './SubjectSelection';
import { ChapterSelection } from './ChapterSelection'; // Imported for Video Flow
import { VideoPlaylistView } from './VideoPlaylistView'; // Imported for Video Flow
import { PdfView } from './PdfView'; // Imported for PDF Flow
import { McqView } from './McqView'; // Imported for MCQ Flow
import { HistoryPage } from './HistoryPage';
import { UniversalChat } from './UniversalChat';
import { SpinWheel } from './SpinWheel';
import { Leaderboard } from './Leaderboard';
import { fetchChapters } from '../services/gemini'; // Needed for Video Flow
import { FileText, CheckSquare } from 'lucide-react'; // Icons

interface Props {
  user: User;
  dailyStudySeconds: number; // Received from Global App
  onSubjectSelect: (subject: Subject) => void;
  onRedeemSuccess: (user: User) => void;
  settings?: SystemSettings; // New prop
  onStartWeeklyTest?: (test: WeeklyTest) => void;
}

const DEFAULT_PACKAGES: CreditPackage[] = [
    { id: 'pkg-1', name: 'Starter Pack', price: 100, credits: 150 },
    { id: 'pkg-2', name: 'Value Pack', price: 200, credits: 350 },
    { id: 'pkg-3', name: 'Pro Pack', price: 500, credits: 1500 },
    { id: 'pkg-4', name: 'Ultra Pack', price: 1000, credits: 3000 },
    { id: 'pkg-5', name: 'Mega Pack', price: 2000, credits: 7000 },
    { id: 'pkg-6', name: 'Giga Pack', price: 3000, credits: 12000 },
    { id: 'pkg-7', name: 'Ultimate Pack', price: 5000, credits: 20000 }
];

export const StudentDashboard: React.FC<Props> = ({ user, dailyStudySeconds, onSubjectSelect, onRedeemSuccess, settings, onStartWeeklyTest }) => {
  const [activeTab, setActiveTab] = useState<StudentTab | 'LEADERBOARD' | 'STORE' | 'VIDEO' | 'PDF' | 'MCQ'>('VIDEO');
  const [testAttempts, setTestAttempts] = useState<Record<string, any>>(JSON.parse(localStorage.getItem(`nst_test_attempts_${user.id}`) || '{}'));
  const globalMessage = localStorage.getItem('nst_global_message');
  const [activeExternalApp, setActiveExternalApp] = useState<string | null>(null);
  
  // GENERIC CONTENT FLOW STATE (Used for Video, PDF, MCQ)
  const [contentViewStep, setContentViewStep] = useState<'SUBJECTS' | 'CHAPTERS' | 'PLAYER'>('SUBJECTS');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [profileData, setProfileData] = useState({
      classLevel: user.classLevel || '10',
      board: user.board || 'CBSE',
      stream: user.stream || 'Science',
      newPassword: '',
      dailyGoalHours: 3 // Default
  });

  const [canClaimReward, setCanClaimReward] = useState(false);
  const [selectedPhoneId, setSelectedPhoneId] = useState<string>('');
  
  // Custom Daily Target Logic
  const [dailyTargetSeconds, setDailyTargetSeconds] = useState(3 * 3600);
  const REWARD_AMOUNT = settings?.dailyReward || 3;
  
  // Phone setup
  const adminPhones = settings?.adminPhones || [{id: 'default', number: '8227070298', name: 'Admin'}];
  const defaultPhoneId = adminPhones.find(p => p.isDefault)?.id || adminPhones[0]?.id || 'default';
  
  if (!selectedPhoneId && adminPhones.length > 0) {
    setSelectedPhoneId(defaultPhoneId);
  }
  
  const getPhoneNumber = (phoneId?: string) => {
    const phone = adminPhones.find(p => p.id === (phoneId || selectedPhoneId));
    return phone ? phone.number : '8227070298';
  };

  useEffect(() => {
      // Load user's custom goal
      const storedGoal = localStorage.getItem(`nst_goal_${user.id}`);
      if (storedGoal) {
          const hours = parseInt(storedGoal);
          setDailyTargetSeconds(hours * 3600);
          setProfileData(prev => ({...prev, dailyGoalHours: hours}));
      }
  }, [user.id]);

  // --- CHECK YESTERDAY'S REWARD ON LOAD ---
  useEffect(() => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yDateStr = yesterday.toDateString();
      
      const yActivity = parseInt(localStorage.getItem(`activity_${user.id}_${yDateStr}`) || '0');
      const yClaimed = localStorage.getItem(`reward_claimed_${user.id}_${yDateStr}`);
      
      if (!yClaimed && (!user.subscriptionTier || user.subscriptionTier === 'FREE')) {
          let reward = null;
          if (yActivity >= 10800) reward = { tier: 'MONTHLY', level: 'ULTRA', hours: 4 }; // 3 Hrs -> Ultra
          else if (yActivity >= 3600) reward = { tier: 'WEEKLY', level: 'BASIC', hours: 4 }; // 1 Hr -> Basic

          if (reward) {
              const expiresAt = new Date(new Date().setHours(new Date().getHours() + 24)).toISOString();
              const newMsg = {
                  id: `reward-${Date.now()}`,
                  text: `🎁 Daily Reward! You studied enough yesterday. Claim your ${reward.hours} hours of ${reward.level} access now!`,
                  date: new Date().toISOString(),
                  read: false,
                  type: 'REWARD',
                  reward: { tier: reward.tier as any, level: reward.level as any, durationHours: reward.hours },
                  expiresAt: expiresAt,
                  isClaimed: false
              };
              
              const updatedUser = { 
                  ...user, 
                  inbox: [newMsg, ...(user.inbox || [])] 
              };
              
              handleUserUpdate(updatedUser);
              localStorage.setItem(`reward_claimed_${user.id}_${yDateStr}`, 'true');
          }
      }
  }, [user.id]);

  const claimRewardMessage = (msgId: string, reward: any) => {
      const duration = reward.durationHours || 4;
      const endDate = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
      
      const updatedInbox = user.inbox?.map(m => m.id === msgId ? { ...m, isClaimed: true, read: true } : m);
      
      const updatedUser: User = { 
          ...user, 
          subscriptionTier: reward.tier, 
          subscriptionLevel: reward.level,
          subscriptionEndDate: endDate,
          isPremium: true,
          inbox: updatedInbox
      };
      
      handleUserUpdate(updatedUser);
      alert(`✅ Reward Claimed! Enjoy ${duration} hours of ${reward.level} access.`);
  };

  // --- TRACK TODAY'S ACTIVITY & FIRST DAY BONUSES ---
  // --- REAL-TIME SUBSCRIPTION SYNC ---
  useEffect(() => {
    if (!user.id) return;
    
    // Listen to MY user document in Firestore
    const unsub = onSnapshot(doc(db, "users", user.id), (doc) => {
        if (doc.exists()) {
            const cloudData = doc.data() as User;
            // If subscription or credits changed in cloud, update local state immediately
            if (cloudData.credits !== user.credits || 
                cloudData.subscriptionTier !== user.subscriptionTier ||
                cloudData.isPremium !== user.isPremium ||
                cloudData.isGameBanned !== user.isGameBanned) {
                
                // Merge cloud data with local user object
                const updated = { ...user, ...cloudData };
                onRedeemSuccess(updated); // Propagate to App.tsx
            }
        }
    });
    return () => unsub();
  }, [user.id]); // Only re-subscribe if ID changes (rare)

  useEffect(() => {
      const interval = setInterval(() => {
          updateUserStatus(user.id, dailyStudySeconds);
          
          // Save Daily Stats for Next Day Logic
          const todayStr = new Date().toDateString();
          localStorage.setItem(`activity_${user.id}_${todayStr}`, dailyStudySeconds.toString());
          
          // FIRST DAY SPECIAL BONUS: 1 Hour Usage -> 1 Hour Ultra
          const accountAgeHours = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60);
          const firstDayBonusClaimed = localStorage.getItem(`first_day_ultra_${user.id}`);
          
          if (accountAgeHours < 24 && dailyStudySeconds >= 3600 && !firstDayBonusClaimed) {
              const endDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 Hour
              const updatedUser = { 
                  ...user, 
                  subscriptionTier: 'MONTHLY', // Ultra
                  subscriptionEndDate: endDate,
                  isPremium: true
              };
              
              // Save
              const storedUsers = JSON.parse(localStorage.getItem('nst_users') || '[]');
              const idx = storedUsers.findIndex((u:User) => u.id === user.id);
              if (idx !== -1) storedUsers[idx] = updatedUser;
              
              localStorage.setItem('nst_users', JSON.stringify(storedUsers));
              localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
              localStorage.setItem(`first_day_ultra_${user.id}`, 'true');
              
              onRedeemSuccess(updatedUser);
              alert("🎉 FIRST DAY BONUS: You unlocked 1 Hour Free ULTRA Subscription!");
          }
          
      }, 60000); 
      return () => clearInterval(interval);
  }, [dailyStudySeconds, user.id, user.createdAt]);

  // Inbox
  const [showInbox, setShowInbox] = useState(false);
  const unreadCount = user.inbox?.filter(m => !m.read).length || 0;

  // CONSTANTS FOR PAYMENT
  const packages = settings?.packages || DEFAULT_PACKAGES;

  useEffect(() => {
    // Check if reward already claimed today
    const today = new Date().toDateString();
    const lastClaim = user.lastRewardClaimDate ? new Date(user.lastRewardClaimDate).toDateString() : '';
    setCanClaimReward(lastClaim !== today && dailyStudySeconds >= dailyTargetSeconds);
  }, [user.lastRewardClaimDate, dailyStudySeconds, dailyTargetSeconds]);

  const claimDailyReward = () => {
      if (!canClaimReward) return;
      const updatedUser = {
          ...user,
          credits: (user.credits || 0) + REWARD_AMOUNT,
          lastRewardClaimDate: new Date().toISOString()
      };
      const storedUsers = JSON.parse(localStorage.getItem('nst_users') || '[]');
      const userIdx = storedUsers.findIndex((u:User) => u.id === updatedUser.id);
      if (userIdx !== -1) {
          storedUsers[userIdx] = updatedUser;
          localStorage.setItem('nst_users', JSON.stringify(storedUsers));
          localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
      }
      saveUserToLive(updatedUser); // Sync to Cloud immediately
      setCanClaimReward(false);
      onRedeemSuccess(updatedUser);
      alert(`🎉 Congratulations! You met your Daily Goal.\n\nReceived: ${REWARD_AMOUNT} Free Credits!`);
  };

  const handleExternalAppClick = (app: any) => {
      if (app.isLocked) {
          alert("This app is currently locked by Admin.");
          return;
      }
      
      if (app.creditCost > 0) {
          if (user.credits < app.creditCost) {
              alert(`Insufficient Credits! You need ${app.creditCost} credits to access this app.`);
              return;
          }
          if(!window.confirm(`Access ${app.name} for ${app.creditCost} credits?`)) return;
          
          const updatedUser = { ...user, credits: user.credits - app.creditCost };
          handleUserUpdate(updatedUser);
      }
      
      setActiveExternalApp(app.url);
  };

  const handleBuyPackage = (pkg: CreditPackage) => {
      const phoneNum = getPhoneNumber();
      const message = `Hello Admin, I want to buy credits.\n\n🆔 User ID: ${user.id}\n📦 Package: ${pkg.name}\n💰 Amount: ₹${pkg.price}\n💎 Credits: ${pkg.credits}\n\nPlease check my payment.`;
      const url = `https://wa.me/91${phoneNum}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const saveProfile = () => {
      const storedUsers = JSON.parse(localStorage.getItem('nst_users') || '[]');
      
      const updatedUser = { 
          ...user, 
          board: profileData.board,
          classLevel: profileData.classLevel,
          stream: profileData.stream,
          password: profileData.newPassword.trim() ? profileData.newPassword : user.password
      };

      // Save Goal
      localStorage.setItem(`nst_goal_${user.id}`, profileData.dailyGoalHours.toString());
      setDailyTargetSeconds(profileData.dailyGoalHours * 3600);

      const userIdx = storedUsers.findIndex((u:User) => u.id === user.id);
      if(userIdx !== -1) {
          storedUsers[userIdx] = updatedUser;
          localStorage.setItem('nst_users', JSON.stringify(storedUsers));
          localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
          window.location.reload(); 
      }
      setEditMode(false);
  };
  
  const handleUserUpdate = (updatedUser: User) => {
      const storedUsers = JSON.parse(localStorage.getItem('nst_users') || '[]');
      const userIdx = storedUsers.findIndex((u:User) => u.id === updatedUser.id);
      if (userIdx !== -1) {
          storedUsers[userIdx] = updatedUser;
          localStorage.setItem('nst_users', JSON.stringify(storedUsers));
          localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
          saveUserToLive(updatedUser); // Sync to Cloud immediately
          onRedeemSuccess(updatedUser); 
      }
  };

  const markInboxRead = () => {
      if (!user.inbox) return;
      const updatedInbox = user.inbox.map(m => ({ ...m, read: true }));
      handleUserUpdate({ ...user, inbox: updatedInbox });
  };

  // --- GENERIC CONTENT FLOW HANDLERS ---
  const handleContentSubjectSelect = async (subject: Subject) => {
      setSelectedSubject(subject);
      setLoadingChapters(true);
      setContentViewStep('CHAPTERS');
      try {
          const ch = await fetchChapters(user.board || 'CBSE', user.classLevel || '10', user.stream || 'Science', subject, 'English');
          setChapters(ch);
      } catch(e) { console.error(e); }
      setLoadingChapters(false);
  };

  const handleContentChapterSelect = (chapter: Chapter) => {
      setSelectedChapter(chapter);
      setContentViewStep('PLAYER');
  };

  // GENERIC CONTENT SECTION COMPONENT
  const ContentSection = ({ type }: { type: 'VIDEO' | 'PDF' | 'MCQ' }) => {
      const Icon = type === 'VIDEO' ? Youtube : type === 'PDF' ? FileText : CheckSquare;
      const title = type === 'VIDEO' ? 'Video Library' : type === 'PDF' ? 'Notes Library' : 'MCQ Center';
      const color = type === 'VIDEO' ? 'text-red-600' : type === 'PDF' ? 'text-blue-600' : 'text-purple-600';
      const bgColor = type === 'VIDEO' ? 'bg-red-50' : type === 'PDF' ? 'bg-blue-50' : 'bg-purple-50';

      if (contentViewStep === 'PLAYER' && selectedChapter && selectedSubject) {
          if (type === 'VIDEO') {
            return <VideoPlaylistView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={() => setContentViewStep('CHAPTERS')} onUpdateUser={handleUserUpdate} settings={settings} />;
          } else if (type === 'PDF') {
            return <PdfView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={() => setContentViewStep('CHAPTERS')} onUpdateUser={handleUserUpdate} settings={settings} />;
          } else {
            return <McqView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={() => setContentViewStep('CHAPTERS')} onUpdateUser={handleUserUpdate} />;
          }
      }

      if (contentViewStep === 'CHAPTERS' && selectedSubject) {
          return (
              <ChapterSelection 
                  chapters={chapters} 
                  subject={selectedSubject} 
                  classLevel={user.classLevel || '10'} 
                  loading={loadingChapters} 
                  user={user} 
                  onSelect={handleContentChapterSelect} 
                  onBack={() => setContentViewStep('SUBJECTS')} 
              />
          );
      }

      // Subject List
      return (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            <Icon className={color} /> {title}
                        </h3>
                        <p className="text-xs text-slate-500">Select a subject</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    {getSubjectsList(user.classLevel || '10', user.stream || null).map(subj => (
                        <button 
                            key={subj.id}
                            onClick={() => handleContentSubjectSelect(subj)}
                            className={`bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all text-left group`}
                        >
                            <div className={`w-12 h-12 rounded-full mb-3 flex items-center justify-center ${bgColor} text-slate-700`}>
                                <Icon size={24} className={`${color} group-hover:scale-110 transition-transform`} />
                            </div>
                            <h4 className="font-bold text-slate-800">{subj.name}</h4>
                            <p className="text-[10px] text-slate-500">View Chapters</p>
                        </button>
                    ))}
                </div>
          </div>
      );
  };

  // REPLACED ROUTINE VIEW WITH HEADER STATS

  const isGameEnabled = settings?.isGameEnabled ?? true;

  return (
    <div>
        {/* TOP MARQUEE (ANNOUNCEMENTS) */}
        {settings?.marqueeLines && settings.marqueeLines.length > 0 && (
            <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white text-xs font-medium py-2 px-4 mb-4 rounded-xl overflow-hidden relative shadow-md border border-slate-700">
                <div className="whitespace-nowrap animate-marquee">
                    {settings.marqueeLines.map((line, i) => (
                        <span key={i} className="mx-8 inline-flex items-center gap-2">
                            <Zap size={10} className="text-yellow-400" /> {line}
                        </span>
                    ))}
                </div>
            </div>
        )}

        {/* Profile Edit Modal */}
        {editMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                    <h3 className="font-bold text-lg mb-4">Edit Profile & Settings</h3>
                    <div className="space-y-3 mb-6">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Daily Study Goal (Hours)</label>
                            <input 
                                type="number" 
                                value={profileData.dailyGoalHours}
                                onChange={e => setProfileData({...profileData, dailyGoalHours: Number(e.target.value)})}
                                className="w-full p-2 border rounded-lg"
                                min={1} max={12}
                            />
                        </div>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">New Password</label>
                            <input 
                                type="text" 
                                placeholder="Set new password (optional)" 
                                value={profileData.newPassword}
                                onChange={e => setProfileData({...profileData, newPassword: e.target.value})}
                                className="w-full p-2 border rounded-lg bg-yellow-50 border-yellow-200"
                            />
                            <p className="text-[9px] text-slate-400 mt-1">Leave blank to keep current password.</p>
                        </div>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Board</label>
                            <select value={profileData.board} onChange={e => setProfileData({...profileData, board: e.target.value as any})} className="w-full p-2 border rounded-lg">
                                <option value="CBSE">CBSE</option>
                                <option value="BSEB">BSEB</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Class</label>
                            <select value={profileData.classLevel} onChange={e => setProfileData({...profileData, classLevel: e.target.value as any})} className="w-full p-2 border rounded-lg">
                                {['6','7','8','9','10','11','12'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        {['11','12'].includes(profileData.classLevel) && (
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Stream</label>
                                <select value={profileData.stream} onChange={e => setProfileData({...profileData, stream: e.target.value as any})} className="w-full p-2 border rounded-lg">
                                    <option value="Science">Science</option>
                                    <option value="Commerce">Commerce</option>
                                    <option value="Arts">Arts</option>
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setEditMode(false)} className="flex-1 py-2 text-slate-500 font-bold">Cancel</button>
                        <button onClick={saveProfile} className="flex-1 py-2 bg-[var(--primary)] text-white rounded-lg font-bold">Save Changes</button>
                    </div>
                </div>
            </div>
        )}

        {/* INBOX MODAL */}
        {showInbox && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                    <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Mail size={18} className="text-[var(--primary)]" /> Admin Messages</h3>
                        <button onClick={() => setShowInbox(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-4 space-y-3">
                        {(!user.inbox || user.inbox.length === 0) && (
                            <p className="text-slate-400 text-sm text-center py-8">No messages from Admin.</p>
                        )}
                        {user.inbox?.map(msg => {
                            const isExpired = msg.expiresAt ? new Date(msg.expiresAt) < new Date() : false;
                            return (
                                <div key={msg.id} className={`p-3 rounded-xl border text-sm ${msg.read ? 'bg-white border-slate-100' : 'bg-blue-50 border-blue-100'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <p className={`font-bold text-xs ${msg.type === 'REWARD' ? 'text-purple-600' : 'text-slate-500'}`}>
                                            {msg.type === 'REWARD' ? '🎁 REWARD' : 'MESSAGE'}
                                        </p>
                                        <p className="text-slate-400 text-[10px]">{new Date(msg.date).toLocaleDateString()}</p>
                                    </div>
                                    <p className="text-slate-700 leading-relaxed">{msg.text}</p>
                                    
                                    {msg.type === 'REWARD' && msg.reward && !msg.isClaimed && !isExpired && (
                                        <button 
                                            onClick={() => claimRewardMessage(msg.id, msg.reward)} 
                                            className="w-full mt-3 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold rounded-lg text-xs shadow-md animate-pulse"
                                        >
                                            CLAIM NOW ({msg.reward.durationHours} Hours)
                                        </button>
                                    )}
                                    {msg.type === 'REWARD' && msg.isClaimed && (
                                        <div className="mt-2 text-xs font-bold text-green-600 bg-green-50 p-2 rounded text-center">✅ Claimed</div>
                                    )}
                                    {msg.type === 'REWARD' && isExpired && !msg.isClaimed && (
                                        <div className="mt-2 text-xs font-bold text-red-500 bg-red-50 p-2 rounded text-center">❌ Expired</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {unreadCount > 0 && (
                        <button onClick={markInboxRead} className="w-full py-3 bg-[var(--primary)] text-white font-bold text-sm hover:opacity-90">Mark All as Read</button>
                    )}
                </div>
            </div>
        )}

        {globalMessage && (
            <div className="bg-[var(--primary)] text-white p-3 rounded-xl mb-6 flex items-start gap-3 shadow-lg animate-pulse">
                <Megaphone size={20} className="shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Admin Announcement</p>
                    <p className="font-medium text-sm">{globalMessage}</p>
                </div>
            </div>
        )}

        {/* NEW HEADER STATS AREA (REPLACES ROUTINE VIEW TIMER) */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white mb-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10 mb-4">
                <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                         <Timer size={14} /> Today's Activity
                    </div>
                    <div className="text-3xl font-mono font-bold tracking-wider text-green-400">
                        {formatTime(dailyStudySeconds)}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-xs text-slate-400 font-bold uppercase">Credits</p>
                        <p className="text-xl font-black text-blue-400">{user.credits}</p>
                    </div>
                    <div className="relative cursor-pointer bg-slate-800 p-2 rounded-full" onClick={() => setShowInbox(true)}>
                        <Mail size={20} />
                        {unreadCount > 0 && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unreadCount}</div>}
                    </div>
                </div>
            </div>
            
            {/* PROGRESS BARS */}
            <div className="space-y-3">
                <div>
                    <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
                        <span>Daily Goal ({profileData.dailyGoalHours}h)</span>
                        <span>{Math.floor((Math.min(dailyStudySeconds, dailyTargetSeconds) / dailyTargetSeconds) * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${Math.min((dailyStudySeconds / dailyTargetSeconds) * 100, 100)}%` }}></div>
                    </div>
                </div>
                
                {/* REWARD PROGRESS */}
                {(!user.subscriptionTier || user.subscriptionTier === 'FREE') && (
                    <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                        <div className="flex justify-between text-[9px] text-slate-400 mb-1 font-bold">
                            <span className="flex items-center gap-1"><Gift size={10} className="text-pink-500" /> Next Day Rewards</span>
                        </div>
                        <div className="flex gap-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            {/* First 1 Hour = 3600s */}
                            <div className="bg-pink-500 transition-all duration-1000" style={{ width: `${Math.min((dailyStudySeconds / 3600) * 100, 100)}%` }}></div>
                            {/* Next 2 Hours (Total 3) */}
                            <div className="bg-purple-500 transition-all duration-1000" style={{ width: `${Math.max(0, Math.min(((dailyStudySeconds - 3600) / 7200) * 100, 100))}%` }}></div>
                        </div>
                        <div className="flex justify-between text-[8px] text-slate-500 mt-1 font-mono">
                            <span>1h (Free)</span>
                            <span>3h (Ultra)</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
        
        {/* EXTERNAL APPS GRID (4 NEW APPS) */}
        {settings?.externalApps && settings.externalApps.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-6">
                {settings.externalApps.map((app) => (
                    <button 
                        key={app.id} 
                        onClick={() => handleExternalAppClick(app)}
                        className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center hover:shadow-md transition-all active:scale-95"
                    >
                         <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl mb-2 flex items-center justify-center text-white shadow-lg">
                             {app.isLocked ? <Lock size={16} /> : <Zap size={16} />}
                         </div>
                         <span className="text-[10px] font-bold text-slate-700 leading-tight text-center line-clamp-2">{app.name}</span>
                         {app.creditCost > 0 && <span className="text-[8px] text-orange-600 font-bold mt-1">{app.creditCost} CR</span>}
                    </button>
                ))}
            </div>
        )}
        
        {/* EXTERNAL APP MODAL / VIEW */}
        {activeExternalApp && (
            <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom">
                <div className="flex items-center justify-between p-4 border-b bg-slate-50">
                     <button onClick={() => setActiveExternalApp(null)} className="p-2 bg-white rounded-full border shadow-sm"><X size={20} /></button>
                     <p className="font-bold text-slate-700">External App</p>
                     <div className="w-10"></div>
                </div>
                <iframe src={activeExternalApp} className="flex-1 w-full border-none" title="External App" allow="camera; microphone; geolocation; payment" />
            </div>
        )}

        <div className={`grid ${isGameEnabled ? 'grid-cols-7' : 'grid-cols-6'} gap-1 bg-white p-2 rounded-xl border border-slate-200 shadow-sm mb-8 sticky top-20 z-20 overflow-x-auto`}>
            <button onClick={() => {setActiveTab('VIDEO'); setContentViewStep('SUBJECTS');}} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'VIDEO' ? 'bg-red-50 text-red-600' : 'text-slate-400 hover:bg-slate-50'}`}><Youtube size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">Video</span></button>
            <button onClick={() => {setActiveTab('PDF'); setContentViewStep('SUBJECTS');}} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'PDF' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50'}`}><FileText size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">Notes</span></button>
            <button onClick={() => {setActiveTab('MCQ'); setContentViewStep('SUBJECTS');}} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'MCQ' ? 'bg-purple-50 text-purple-600' : 'text-slate-400 hover:bg-slate-50'}`}><CheckSquare size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">MCQ</span></button>
            
            <button onClick={() => setActiveTab('CHAT')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'CHAT' ? 'bg-slate-100 text-[var(--primary)]' : 'text-slate-400 hover:bg-slate-50'}`}><MessageCircle size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">Chat</span></button>
            <button onClick={() => setActiveTab('LEADERBOARD')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'LEADERBOARD' ? 'bg-slate-100 text-[var(--primary)]' : 'text-slate-400 hover:bg-slate-50'}`}><Trophy size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">Rank</span></button>
            {isGameEnabled && <button onClick={() => setActiveTab('GAME')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'GAME' ? 'bg-orange-50 text-orange-600' : 'text-slate-400 hover:bg-slate-50'}`}><Gamepad2 size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">Game</span></button>}
            <button onClick={() => setActiveTab('HISTORY')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'HISTORY' ? 'bg-slate-100 text-[var(--primary)]' : 'text-slate-400 hover:bg-slate-50'}`}><History size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">History</span></button>
            <button onClick={() => setActiveTab('REDEEM')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'REDEEM' ? 'bg-slate-100 text-[var(--primary)]' : 'text-slate-400 hover:bg-slate-50'}`}><Gift size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">Redeem</span></button>
            <button onClick={() => setActiveTab('STORE')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'STORE' ? 'bg-gradient-to-br from-green-400 to-blue-500 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}><ShoppingBag size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">Store</span></button>
            {settings?.weeklyTests?.some(t => t.isActive && t.classLevel === user.classLevel) && <button onClick={() => setActiveTab('WEEKLY_TEST')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'WEEKLY_TEST' ? 'bg-gradient-to-br from-red-400 to-pink-500 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}><Calendar size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">Exclusive MCQ</span></button>}
            <button onClick={() => setActiveTab('PROFILE')} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[60px] ${activeTab === 'PROFILE' ? 'bg-gradient-to-br from-purple-400 to-indigo-500 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}><Settings size={18} className="mb-1" /><span className="text-[9px] font-bold uppercase">Profile</span></button>
            {/* PREMIUM TAB REMOVED */}
        </div>

        <div className="min-h-[400px]">
            {(activeTab === 'VIDEO' || activeTab === 'PDF' || activeTab === 'MCQ') && <ContentSection type={activeTab} />}
            {activeTab === 'CHAT' && <UniversalChat currentUser={user} onUserUpdate={handleUserUpdate} settings={settings} />}
            {activeTab === 'LEADERBOARD' && <Leaderboard />}
            {activeTab === 'GAME' && isGameEnabled && (user.isGameBanned ? <div className="text-center py-20 bg-red-50 rounded-2xl border border-red-100"><Ban size={48} className="mx-auto text-red-500 mb-4" /><h3 className="text-lg font-bold text-red-700">Access Denied</h3><p className="text-sm text-red-600">Admin has disabled the game for your account.</p></div> : <SpinWheel user={user} onUpdateUser={handleUserUpdate} settings={settings} />)}
            {activeTab === 'HISTORY' && <HistoryPage />}
            {activeTab === 'REDEEM' && <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><RedeemSection user={user} onSuccess={onRedeemSuccess} /></div>}
            {activeTab === 'STORE' && <Store user={user} settings={settings} onUserUpdate={handleUserUpdate} />}
            
            {activeTab === 'WEEKLY_TEST' && (
                <div className="animate-in fade-in zoom-in duration-300">
                    <div className="bg-gradient-to-r from-red-500 to-pink-500 rounded-2xl p-6 text-center text-white mb-6">
                        <h2 className="text-2xl font-bold mb-2">Exclusive MCQ</h2>
                        <p className="text-red-100 text-sm">Auto-submits after 2 hours! Questions accessible during test window.</p>
                    </div>
                    {settings?.weeklyTests?.filter(t => {
                        // 1. Must be active and for correct class
                        if (!t.isActive || t.classLevel !== user.classLevel) return false;
                        
                        // 2. 24-Hour Visibility Rule
                        // If created more than 24 hours ago, hide it (unless user already started it)
                        if (t.createdAt) {
                            const created = new Date(t.createdAt).getTime();
                            const now = Date.now();
                            const diffHours = (now - created) / (1000 * 60 * 60);
                            const hasAttempted = !!testAttempts[t.id];
                            
                            // If > 24 hours old and NOT attempted/started, hide it.
                            // If attempted, keep showing so they can see result/status.
                            if (diffHours > 24 && !hasAttempted) return false;
                        }
                        
                        return true;
                    }).map(test => {
                        const attempt = testAttempts[test.id];
                        const durationMins = test.durationMinutes || 120;
                        const startTime = attempt ? new Date(attempt.startedAt).getTime() : null;
                        const timeLeft = startTime ? Math.max(0, durationMins * 60 * 1000 - (Date.now() - startTime)) : durationMins * 60 * 1000;
                        const isSubmitted = attempt?.submittedAt;
                        const mins = Math.floor(timeLeft / 60000);
                        const secs = Math.floor((timeLeft % 60000) / 1000);
                        
                        return (
                          <div key={test.id} className="bg-white rounded-2xl p-6 border-2 border-red-200 mb-4">
                              <div className="flex justify-between items-start mb-4">
                                  <div><h3 className="text-2xl font-bold text-red-600">{test.name}</h3><p className="text-slate-600 text-sm">{test.description}</p></div>
                                  {attempt && !isSubmitted && <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg font-bold text-lg">{mins}:{secs.toString().padStart(2,'0')}</div>}
                              </div>
                              <div className="flex gap-4 mb-4">
                                  <div className="bg-red-50 p-3 rounded-lg flex-1"><p className="text-xs text-red-600 font-bold">Questions</p><p className="text-2xl font-black text-red-600">{test.totalQuestions}</p></div>
                                  <div className="bg-green-50 p-3 rounded-lg flex-1"><p className="text-xs text-green-600 font-bold">Pass Score</p><p className="text-2xl font-black text-green-600">{test.passingScore}%</p></div>
                              </div>
                              {isSubmitted ? (
                                  <div className="bg-green-50 p-4 rounded-lg text-center"><p className="font-bold text-green-700">✅ Submitted! Score: {attempt.score}/{test.totalQuestions}</p></div>
                              ) : (
                                  <button 
                                      onClick={() => onStartWeeklyTest && onStartWeeklyTest(test)}
                                      className="w-full bg-gradient-to-r from-red-500 to-pink-500 text-white py-3 rounded-xl font-bold hover:shadow-lg hover:scale-[1.02] transition-all"
                                  >
                                      {attempt ? '📝 Resume Test' : '📝 Start Test'} - {test.totalQuestions} Questions
                                  </button>
                              )}
                          </div>
                        );
                    })}
                </div>
            )}

            {activeTab === 'PROFILE' && (
                <div className="animate-in fade-in zoom-in duration-300 pb-10">
                    <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-8 text-center text-white mb-6">
                        <div className="w-16 h-16 bg-white text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold">{user.name.charAt(0)}</div>
                        <h2 className="text-2xl font-bold">{user.name}</h2>
                        <p className="text-purple-100 text-sm">Student ID: {user.id}</p>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Class</p>
                            <p className="text-lg font-black text-slate-800">{user.classLevel} • {user.board} • {user.stream}</p>
                        </div>
                        
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Subscription</p>
                            <p className="text-lg font-black text-slate-800">{user.subscriptionTier || 'FREE'}</p>
                            {user.subscriptionEndDate && <p className="text-xs text-slate-500 mt-1">Expires: {new Date(user.subscriptionEndDate).toLocaleDateString()}</p>}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                                <p className="text-xs font-bold text-blue-600 uppercase">Credits</p>
                                <p className="text-2xl font-black text-blue-600">{user.credits}</p>
                            </div>
                            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                                <p className="text-xs font-bold text-orange-600 uppercase">Streak</p>
                                <p className="text-2xl font-black text-orange-600">{user.streak} Days</p>
                            </div>
                        </div>
                        
                        <button onClick={() => {localStorage.removeItem(`nst_user_${user.id}`); window.location.reload();}} className="w-full bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600">🚪 Logout</button>
                    </div>
                </div>
            )}
            
        </div>
    </div>
  );
};
