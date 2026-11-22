export type RatingCategory = 'mood' | 'stress' | 'energy';

export interface RatingOption {
  value: number;
  emoji: string;
  label: string;
}

export const ratingScales: Record<RatingCategory, { title: string; question: string; higherIsBetter: boolean; options: RatingOption[] }> = {
  mood: {
    title: 'Mood',
    question: 'How are you feeling right now?',
    higherIsBetter: true,
    options: [
      { value: 1, emoji: '😞', label: 'Very low' },
      { value: 2, emoji: '🙁', label: 'Low' },
      { value: 3, emoji: '😐', label: 'Neutral' },
      { value: 4, emoji: '🙂', label: 'Good' },
      { value: 5, emoji: '😄', label: 'Excellent' },
    ],
  },
  // Stress is recorded literally: 1 means very little stress, 5 means a lot. Lower is better.
  stress: {
    title: 'Stress',
    question: 'How stressed do you feel?',
    higherIsBetter: false,
    options: [
      { value: 1, emoji: '😌', label: 'Very low' },
      { value: 2, emoji: '🙂', label: 'Low' },
      { value: 3, emoji: '😐', label: 'Moderate' },
      { value: 4, emoji: '😟', label: 'High' },
      { value: 5, emoji: '😫', label: 'Very high' },
    ],
  },
  energy: {
    title: 'Energy',
    question: 'How much energy do you have?',
    higherIsBetter: true,
    options: [
      { value: 1, emoji: '😴', label: 'Exhausted' },
      { value: 2, emoji: '🥱', label: 'Low' },
      { value: 3, emoji: '😐', label: 'Neutral' },
      { value: 4, emoji: '💪', label: 'Good' },
      { value: 5, emoji: '⚡', label: 'Excellent' },
    ],
  },
};

export const ratingOption = (category: RatingCategory, value: number) => ratingScales[category].options[value - 1];

export const likertOptions = [
  { value: 1, label: 'Strongly Disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly Agree' },
];
