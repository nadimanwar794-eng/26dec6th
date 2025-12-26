import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  LessonContent,
  Subject,
  ClassLevel,
  Chapter
} from '../types';
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  CheckCircle,
  XCircle,
  Trophy,
  Play
} from 'lucide-react';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface Props {
  content: LessonContent | null;
  subject: Subject;
  classLevel: ClassLevel;
  chapter: Chapter;
  loading: boolean;
  onBack: () => void;
  onMCQComplete?: (count: number) => void;
}

export const LessonView: React.FC<Props> = ({
  content,
  subject,
  classLevel,
  chapter,
  loading,
  onBack,
  onMCQComplete
}) => {

  /* =========================
     🔴 FIX 1: ALL HOOKS AT TOP
  ========================== */
  const [mcqState, setMcqState] = useState<Record<number, number | null>>({});
  const [showResults, setShowResults] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0); // ✅ moved here

  /* =========================
     LOADING STATE
  ========================== */
  if (loading) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <h3 className="text-lg font-bold text-slate-700">Loading Content…</h3>
      </div>
    );
  }

  if (!content || content.isComingSoon) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl m-4 border-2 border-dashed border-slate-200">
        <Clock size={64} className="text-orange-400 mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">
          Coming Soon
        </h2>
        <p className="text-slate-600 mb-6">
          This content is currently being prepared by the Admin.
        </p>
        <button onClick={onBack} className="text-slate-500 font-bold">
          Go Back
        </button>
      </div>
    );
  }

  /* =========================
     MCQ RENDERER
  ========================== */
  if (
    (content.type === 'MCQ_ANALYSIS' || content.type === 'MCQ_SIMPLE') &&
    content.mcqData
  ) {

    const score = Object.keys(mcqState).reduce((acc, key) => {
      const qIdx = parseInt(key);
      return acc +
        (mcqState[qIdx] === content.mcqData![qIdx].correctAnswer ? 1 : 0);
    }, 0);

    return (
      <div className="flex flex-col h-full bg-slate-50">
        {content.mcqData.map((q, idx) => {
          const answered = mcqState[idx] !== undefined;
          return (
            <div
              key={idx}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm m-4"
            >
              <h4 className="font-bold mb-4">
                {idx + 1}. {q.question}
              </h4>

              {q.options.map((opt, oIdx) => {
                const correct = oIdx === q.correctAnswer;
                const selected = mcqState[idx] === oIdx;

                return (
                  <button
                    key={oIdx}
                    disabled={answered}
                    onClick={() =>
                      setMcqState(prev => ({ ...prev, [idx]: oIdx }))
                    }
                    className={`w-full p-3 mb-2 rounded-xl border text-left
                      ${
                        answered && correct
                          ? 'bg-green-100 border-green-400'
                          : answered && selected
                          ? 'bg-red-100 border-red-400'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          );
        })}

        {!showResults && (
          <div className="p-4 sticky bottom-0 bg-white border-t">
            <button
              onClick={() => {
                setShowResults(true);
                onMCQComplete?.(score);
              }}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold"
            >
              <Trophy size={18} className="inline mr-2" />
              Submit Final Score ({score})
            </button>
          </div>
        )}
      </div>
    );
  }

  /* =========================
     🔴 FIX 2: VIDEO ONLY LOGIC
  ========================== */
  if (content.type === 'VIDEO_LECTURE') {

    const playlist =
      content.videoPlaylist && content.videoPlaylist.length > 0
        ? content.videoPlaylist
        : [{ title: chapter.title, url: content.content }];

    const currentVideo = playlist[currentVideoIndex];
    let embedUrl = currentVideo.url;

    // YouTube
    if (embedUrl.includes('youtube.com/watch')) {
      const id = new URL(embedUrl).searchParams.get('v');
      embedUrl = `https://www.youtube.com/embed/${id}`;
    } else if (embedUrl.includes('youtu.be/')) {
      const id = embedUrl.split('youtu.be/')[1];
      embedUrl = `https://www.youtube.com/embed/${id}`;
    }
    // 🔴 FIX 3: Drive SAFE preview
    else if (embedUrl.includes('drive.google.com/file')) {
      const match = embedUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
      }
    }

    return (
      <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-900">
        <div className="flex items-center p-3 bg-slate-800 text-white">
          <button onClick={onBack} className="mr-3">
            <ArrowLeft />
          </button>
          <h3 className="font-bold truncate">{currentVideo.title}</h3>
        </div>

        <iframe
          key={embedUrl}
          src={embedUrl}
          className="flex-1 w-full border-0"
          allow="autoplay; fullscreen"
          allowFullScreen
        />

        {playlist.length > 1 && (
          <div className="bg-slate-900 p-2 space-y-2">
            {playlist.map((vid, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentVideoIndex(idx)}
                className={`w-full p-3 rounded-lg text-left flex items-center gap-2
                  ${
                    idx === currentVideoIndex
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
              >
                <Play size={14} />
                {vid.title}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* =========================
     PDF VIEW
  ========================== */
  if (content.type.startsWith('PDF')) {
    const pdfUrl = content.content
      .replace('/view', '/preview')
      .replace('/edit', '/preview');

    return (
      <div className="h-[calc(100vh-80px)] bg-white">
        <iframe
          src={pdfUrl}
          className="w-full h-full border-0"
          title="PDF Viewer"
        />
      </div>
    );
  }

  /* =========================
     NOTES (MARKDOWN)
  ========================== */
  return (
    <div className="bg-white min-h-screen pb-20">
      <div className="sticky top-0 bg-white border-b p-3 flex items-center">
        <button onClick={onBack} className="mr-3">
          <ArrowLeft />
        </button>
        <h3 className="font-bold">{chapter.title}</h3>
      </div>

      <div className="max-w-3xl mx-auto p-6">
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {content.content}
        </ReactMarkdown>

        <button
          onClick={onBack}
          className="mt-10 bg-slate-900 text-white py-3 px-8 rounded-xl font-bold"
        >
          Complete & Close
        </button>
      </div>
    </div>
  );
};
