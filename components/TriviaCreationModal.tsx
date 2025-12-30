'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface TriviaCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  hostId: string;
  refreshTrivia: () => Promise<void>;
  onGenerateTrivia: (payload: any) => void | Promise<void>;
}

export default function TriviaCreationModal({
  isOpen,
  onClose,
  hostId,
  refreshTrivia,
  onGenerateTrivia,
}: TriviaCreationModalProps) {
  const [publicName, setPublicName] = useState('');
  const [privateName, setPrivateName] = useState('');
  const [topicPrompt, setTopicPrompt] = useState('');
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('High School');
  const [numRounds, setNumRounds] = useState(1);
  const [sameTopicForAllRounds, setSameTopicForAllRounds] = useState(true);
  const [roundTopics, setRoundTopics] = useState<string[]>(['']);

  // ✅ New: generating state so we can block re-clicks and show overlay
  const [isGenerating, setIsGenerating] = useState(false);

  const handleRoundCountChange = (value: number) => {
    setNumRounds(value);
    if (!sameTopicForAllRounds) {
      setRoundTopics(Array.from({ length: value }, () => ''));
    }
  };

  /* ✅ REQUIRED FIELD VALIDATION */
  const isValid =
    publicName.trim().length > 0 &&
    privateName.trim().length > 0 &&
    topicPrompt.trim().length > 0;

  const handleGenerate = async () => {
    if (!isValid || isGenerating) return;

    setIsGenerating(true);

    try {
      await onGenerateTrivia({
        publicName: publicName.trim(),
        privateName: privateName.trim(),
        topicPrompt: topicPrompt.trim(),
        numQuestions,
        difficulty,
        numRounds,
        sameTopicForAllRounds,
        roundTopics: sameTopicForAllRounds ? [] : roundTopics,
        hostId,
      });

      // usually the parent will close the modal after success,
      // but if it doesn't, we can optionally reset isGenerating:
      // setIsGenerating(false);
    } catch (err) {
      console.error('❌ Error generating trivia:', err);
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999]',
        'flex items-center justify-center',
        'bg-black/60'
      )}
    >
      <div
        className={cn(
          'bg-white dark:bg-neutral-900',
          'w-full max-w-xl',
          'rounded-xl shadow-2xl',
          'flex flex-col',
          'max-h-[90vh]',
          'relative' // ✅ so the blocking overlay can be positioned inside
        )}
      >
        {/* HEADER */}
        <div
          className={cn(
            'flex justify-between items-center',
            'p-6 border-b border-black/10 dark:border-white/10'
          )}
        >
          <h2 className={cn('text-2xl', 'font-bold')}>🧠 Create Trivia Game</h2>
          <button
            onClick={onClose}
            className={cn(
              'text-gray-500',
              'hover:text-gray-800',
              'dark:hover:text-white'
            )}
            disabled={isGenerating}
          >
            ✖
          </button>
        </div>

        {/* BODY */}
        <div className={cn('p-6', 'space-y-6', 'overflow-y-auto')}>
          <div>
            <label className="font-semibold">Public Trivia Name *</label>
            <input
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
              disabled={isGenerating}
              className={cn(
                'w-full',
                'p-2',
                'mt-1',
                'border',
                'rounded-md',
                'bg-white',
                'dark:bg-neutral-800',
                isGenerating && 'opacity-60 cursor-not-allowed'
              )}
            />
          </div>

          <div>
            <label className="font-semibold">Private Trivia Name *</label>
            <input
              value={privateName}
              onChange={(e) => setPrivateName(e.target.value)}
              disabled={isGenerating}
              className={cn(
                'w-full',
                'p-2',
                'mt-1',
                'border',
                'rounded-md',
                'bg-white',
                'dark:bg-neutral-800',
                isGenerating && 'opacity-60 cursor-not-allowed'
              )}
            />
          </div>

          <div>
            <label className="font-semibold">Main Trivia Topic Prompt *</label>
            <textarea
              value={topicPrompt}
              onChange={(e) => setTopicPrompt(e.target.value)}
              rows={3}
              disabled={isGenerating}
              className={cn(
                'w-full',
                'p-2',
                'mt-1',
                'border',
                'rounded-md',
                'bg-white',
                'dark:bg-neutral-800',
                isGenerating && 'opacity-60 cursor-not-allowed'
              )}
            />
          </div>

          <div>
            <label className="font-semibold">Number of Questions</label>
            <select
              value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
              disabled={isGenerating}
              className={cn(
                'w-full',
                'p-2',
                'mt-1',
                'border',
                'rounded-md',
                'bg-white',
                'dark:bg-neutral-800',
                isGenerating && 'opacity-60 cursor-not-allowed'
              )}
            >
              {[5, 10, 15, 20, 25].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold">Difficulty Level</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              disabled={isGenerating}
              className={cn(
                'w-full',
                'p-2',
                'mt-1',
                'border',
                'rounded-md',
                'bg-white',
                'dark:bg-neutral-800',
                isGenerating && 'opacity-60 cursor-not-allowed'
              )}
            >
              {['Elementary', 'Junior High', 'High School', 'College', 'PhD'].map(
                (d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="font-semibold">Number of Rounds</label>
            <select
              value={numRounds}
              onChange={(e) => handleRoundCountChange(Number(e.target.value))}
              disabled={isGenerating}
              className={cn(
                'w-full',
                'p-2',
                'mt-1',
                'border',
                'rounded-md',
                'bg-white',
                'dark:bg-neutral-800',
                isGenerating && 'opacity-60 cursor-not-allowed'
              )}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!isValid || isGenerating}
            className={cn(
              'w-full py-3 font-semibold rounded-lg transition-all',
              isValid && !isGenerating
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-400 text-white opacity-60 cursor-not-allowed'
            )}
          >
            {isGenerating ? '🤖 AI is thinking…' : '🚀 Generate Trivia'}
          </button>
        </div>

        {/* ✅ Blocking overlay while AI is generating */}
        {isGenerating && (
          <div
            className={cn(
              'absolute inset-0 rounded-xl',
              'bg-black/40',
              'flex flex-col items-center justify-center',
              'backdrop-blur-sm'
            )}
          >
            <div className={cn('h-10', 'w-10', 'rounded-full', 'border-4', 'border-blue-500', 'border-t-transparent', 'animate-spin', 'mb-3')} />
            <p className={cn('text-white', 'font-semibold')}>
              AI is generating your trivia…
            </p>
            <p className={cn('text-white/80', 'text-xs', 'mt-1', 'px-4', 'text-center')}>
              This may take a few seconds. Please don&apos;t click Generate again
              or close this window.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
