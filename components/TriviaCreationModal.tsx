'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface TriviaCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  hostId: string;
  refreshTrivia: () => Promise<void>;
  onGenerateTrivia: (payload: any) => void;
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

  const handleGenerate = () => {
    if (!isValid) return;

    onGenerateTrivia({
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
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      'fixed inset-0 z-[9999]',
      'flex items-center justify-center',
      'bg-black/60'
    )}>
      <div className={cn(
        'bg-white dark:bg-neutral-900',
        'w-full max-w-xl',
        'rounded-xl shadow-2xl',
        'flex flex-col',
        'max-h-[90vh]'
      )}>
        {/* HEADER */}
        <div className={cn(
          'flex justify-between items-center',
          'p-6 border-b border-black/10 dark:border-white/10'
        )}>
          <h2 className={cn('text-2xl', 'font-bold')}>🧠 Create Trivia Game</h2>
          <button
            onClick={onClose}
            className={cn('text-gray-500', 'hover:text-gray-800', 'dark:hover:text-white')}
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
              className={cn('w-full', 'p-2', 'mt-1', 'border', 'rounded-md', 'bg-white', 'dark:bg-neutral-800')}
            />
          </div>

          <div>
            <label className="font-semibold">Private Trivia Name *</label>
            <input
              value={privateName}
              onChange={(e) => setPrivateName(e.target.value)}
              className={cn('w-full', 'p-2', 'mt-1', 'border', 'rounded-md', 'bg-white', 'dark:bg-neutral-800')}
            />
          </div>

          <div>
            <label className="font-semibold">Main Trivia Topic Prompt *</label>
            <textarea
              value={topicPrompt}
              onChange={(e) => setTopicPrompt(e.target.value)}
              rows={3}
              className={cn('w-full', 'p-2', 'mt-1', 'border', 'rounded-md', 'bg-white', 'dark:bg-neutral-800')}
            />
          </div>

          <div>
            <label className="font-semibold">Number of Questions</label>
            <select
              value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
              className={cn('w-full', 'p-2', 'mt-1', 'border', 'rounded-md', 'bg-white', 'dark:bg-neutral-800')}
            >
              {[5, 10, 15, 20, 25].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold">Difficulty Level</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className={cn('w-full', 'p-2', 'mt-1', 'border', 'rounded-md', 'bg-white', 'dark:bg-neutral-800')}
            >
              {['Elementary', 'Junior High', 'High School', 'College', 'PhD'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold">Number of Rounds</label>
            <select
              value={numRounds}
              onChange={(e) => handleRoundCountChange(Number(e.target.value))}
              className={cn('w-full', 'p-2', 'mt-1', 'border', 'rounded-md', 'bg-white', 'dark:bg-neutral-800')}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!isValid}
            className={cn(
              'w-full py-3 font-semibold rounded-lg transition-all',
              isValid
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-400 text-white opacity-60 cursor-not-allowed'
            )}
          >
            🚀 Generate Trivia
          </button>
        </div>
      </div>
    </div>
  );
}
