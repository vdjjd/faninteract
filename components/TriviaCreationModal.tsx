'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------- */
/* FIXED PROPS: added hostId + refreshTrivia          */
/* -------------------------------------------------- */
interface TriviaCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  hostId: string;                          // ✅ Added
  refreshTrivia: () => Promise<void>;      // ✅ Added
  onGenerateTrivia: (payload: any) => void;
}

export default function TriviaCreationModal({
  isOpen,
  onClose,
  hostId,            // ✅ Now accepted
  refreshTrivia,     // ✅ Now accepted
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

  const handleGenerate = () => {
    onGenerateTrivia({
      publicName,
      privateName,
      topicPrompt,
      numQuestions,
      difficulty,
      numRounds,
      sameTopicForAllRounds,
      roundTopics: sameTopicForAllRounds ? [] : roundTopics,
      hostId,                  // Not used inside modal, but often needed in parent handler
    });
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      'fixed inset-0 flex items-center justify-center bg-black/60 z-[9999]'
    )}>
      <div className={cn(
        'bg-white dark:bg-neutral-900 w-full max-w-xl p-6 rounded-xl shadow-2xl space-y-6 animate-fadeIn'
      )}>

        {/* Modal Header */}
        <div className={cn('flex justify-between items-center mb-2')}>
          <h2 className={cn('text-2xl font-bold')}>🧠 Create Trivia Game</h2>
          <button
            onClick={onClose}
            className={cn('text-gray-500 hover:text-gray-800 dark:hover:text-white')}
          >
            ✖
          </button>
        </div>

        {/* Public Name */}
        <div>
          <label className="font-semibold">Public Trivia Name</label>
          <input
            type="text"
            value={publicName}
            onChange={(e) => setPublicName(e.target.value)}
            className={cn('w-full p-2 mt-1 border rounded-md bg-white dark:bg-neutral-800')}
            placeholder="e.g., Holiday Smarts Challenge"
          />
        </div>

        {/* Private Name */}
        <div>
          <label className="font-semibold">Private Trivia Name</label>
          <input
            type="text"
            value={privateName}
            onChange={(e) => setPrivateName(e.target.value)}
            className={cn('w-full p-2 mt-1 border rounded-md bg-white dark:bg-neutral-800')}
            placeholder="Only visible to you"
          />
        </div>

        {/* Topic Prompt */}
        <div>
          <label className="font-semibold">Main Trivia Topic Prompt</label>
          <textarea
            value={topicPrompt}
            onChange={(e) => setTopicPrompt(e.target.value)}
            className={cn('w-full p-2 mt-1 border rounded-md bg-white dark:bg-neutral-800')}
            rows={3}
            placeholder="e.g., 90s country music"
          />
        </div>

        {/* Number of Questions */}
        <div>
          <label className="font-semibold">Number of Questions</label>
          <select
            value={numQuestions}
            onChange={(e) => setNumQuestions(Number(e.target.value))}
            className={cn('w-full p-2 mt-1 border rounded-md bg-white dark:bg-neutral-800')}
          >
            {[5, 10, 15, 20, 25].map((n) => (
              <option key={n} value={n}>
                {n} Questions
              </option>
            ))}
          </select>
        </div>

        {/* Difficulty */}
        <div>
          <label className="font-semibold">Difficulty Level</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className={cn('w-full p-2 mt-1 border rounded-md bg-white dark:bg-neutral-800')}
          >
            {['Elementary', 'Junior High', 'High School', 'College', 'PhD'].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Number of Rounds */}
        <div>
          <label className="font-semibold">Number of Rounds</label>
          <select
            value={numRounds}
            onChange={(e) => handleRoundCountChange(Number(e.target.value))}
            className={cn('w-full p-2 mt-1 border rounded-md bg-white dark:bg-neutral-800')}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
              <option key={r} value={r}>{r} Rounds</option>
            ))}
          </select>
        </div>

        {/* Toggle same topic */}
        <div className={cn('flex items-center justify-between py-2')}>
          <label className="font-semibold">All rounds use the same topic?</label>

          <label className={cn('relative inline-flex items-center cursor-pointer')}>
            <input
              type="checkbox"
              checked={sameTopicForAllRounds}
              onChange={(e) => {
                setSameTopicForAllRounds(e.target.checked);
                if (e.target.checked) setRoundTopics([]);
                else setRoundTopics(Array.from({ length: numRounds }, () => ''));
              }}
              className="sr-only"
            />
            <div className={cn(
              'w-11 h-6 rounded-full transition-all',
              sameTopicForAllRounds ? 'bg-green-500' : 'bg-gray-400'
            )}></div>
            <span
              className={cn(
                'dot absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform',
                sameTopicForAllRounds ? 'translate-x-5' : ''
              )}
            ></span>
          </label>
        </div>

        {/* Round-specific topics */}
        {!sameTopicForAllRounds && (
          <div className={cn('space-y-3 mt-4')}>
            <h3 className="font-semibold">Round Topics</h3>
            {roundTopics.map((topic, index) => (
              <input
                key={index}
                type="text"
                value={topic}
                onChange={(e) => {
                  const newTopics = [...roundTopics];
                  newTopics[index] = e.target.value;
                  setRoundTopics(newTopics);
                }}
                className={cn('w-full p-2 border rounded-md bg-white dark:bg-neutral-800')}
                placeholder={`Round ${index + 1} topic`}
              />
            ))}
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          className={cn(
            'w-full py-3 mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all'
          )}
        >
          🚀 Generate Trivia
        </button>
      </div>
    </div>
  );
}
