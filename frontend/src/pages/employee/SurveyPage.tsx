import { useMemo, useState, type FormEvent } from 'react';
import { FiCheckCircle, FiChevronDown } from 'react-icons/fi';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, PageLoader } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { likertOptions } from '../../lib/ratings';
import { surveyService } from '../../services';
import type { SurveyQuestion } from '../../types';

function Question({ question, index, value, onChange, error }: { question: SurveyQuestion; index: number; value?: number; onChange: (value: number) => void; error: boolean }) {
  return (
    <fieldset id={`question-${question.id}`} className={`rounded-xl border bg-white p-4 shadow-xs sm:p-5 ${error ? 'border-red-300' : 'border-slate-200'}`}>
      <legend className="sr-only">{question.text}</legend>
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">{index + 1}</span>
        <div>
          <p className="text-sm font-medium text-ink sm:text-base">{question.text}</p>
          <p className="text-xs text-slate-400">{question.category}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        {likertOptions.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600 sm:flex-col sm:gap-1.5 sm:px-2 sm:text-center ${
                selected ? 'border-brand-600 bg-brand-50 font-medium text-brand-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <input type="radio" name={`question-${question.id}`} value={option.value} checked={selected} onChange={() => onChange(option.value)} className="h-4 w-4 accent-brand-700" />
              {option.label}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">Please select an answer.</p>}
    </fieldset>
  );
}

function History() {
  const { data, error, reload } = useFetch(() => surveyService.submissions({ pageSize: 10 }), []);
  const [openId, setOpenId] = useState<number | null>(null);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageLoader />;
  if (data.length === 0) return <EmptyState title="No previous submissions" />;
  return (
    <ul className="divide-y divide-slate-100">
      {data.map((submission) => (
        <li key={submission.id}>
          <button type="button" onClick={() => setOpenId(openId === submission.id ? null : submission.id)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm hover:bg-slate-50" aria-expanded={openId === submission.id}>
            <span className="font-medium text-ink">Submitted {formatDateTime(submission.submittedAt)}</span>
            <span className="flex items-center gap-2 text-slate-500">
              {submission.responses.length} answers
              <FiChevronDown className={`transition-transform ${openId === submission.id ? 'rotate-180' : ''}`} aria-hidden />
            </span>
          </button>
          {openId === submission.id && (
            <ol className="space-y-2 bg-slate-50 px-5 py-4 text-sm">
              {submission.responses.map((response, index) => (
                <li key={response.questionId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <span className="text-slate-700">
                    {index + 1}. {response.text}
                  </span>
                  <Badge tone={response.rating >= 4 ? 'green' : response.rating === 3 ? 'slate' : 'amber'}>{likertOptions[response.rating - 1].label}</Badge>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SurveyPage() {
  const toast = useToast();
  const status = useFetch(() => surveyService.status(), []);
  const questions = useFetch(() => surveyService.questions(), []);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const list = questions.data ?? [];
  const unanswered = useMemo(() => list.filter((question) => answers[question.id] === undefined), [list, answers]);
  const answeredCount = list.length - unanswered.length;

  const review = (event: FormEvent) => {
    event.preventDefault();
    if (unanswered.length > 0) {
      setShowErrors(true);
      document.getElementById(`question-${unanswered[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setConfirming(true);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await surveyService.submit(list.map((question) => ({ questionId: question.id, rating: answers[question.id] })));
      toast.success('Survey submitted. Thank you for your feedback.');
      setAnswers({});
      setShowErrors(false);
      status.reload();
      setHistoryKey((key) => key + 1);
    } catch (error) {
      toast.error(errorMessage(error));
      // The question set changed while the form was open: load the current questions and keep matching answers.
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        questions.reload();
        setShowErrors(true);
      }
      if (error instanceof ApiError && error.code === 'SURVEY_ALREADY_COMPLETED') status.reload();
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  const loadError = status.error ?? questions.error;
  return (
    <>
      <PageHeader title="Organizational Behavior Survey" description="Tell us how you experience your work. Your individual answers are visible only to you; HR sees combined results." />

      {loadError ? (
        <ErrorState
          message={loadError}
          onRetry={() => {
            status.reload();
            questions.reload();
          }}
        />
      ) : !status.data || !questions.data ? (
        <PageLoader />
      ) : status.data.completed ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600" aria-hidden>
              <FiCheckCircle />
            </span>
            <h2 className="text-lg font-semibold">Survey completed</h2>
            <p className="max-w-md text-sm text-slate-600">
              You submitted your answers on {formatDate(status.data.lastSubmittedAt)}. The survey can be taken every {status.data.frequencyDays} days; it opens again on{' '}
              <span className="font-medium text-ink">{formatDate(status.data.nextAvailableAt)}</span>.
            </p>
          </div>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState title="The survey is not available right now" description="HR has not published any questions yet. Please check back later." />
        </Card>
      ) : (
        <form onSubmit={review} noValidate className="space-y-4">
          <Alert tone="info">
            Rate each statement from <strong>Strongly Disagree</strong> to <strong>Strongly Agree</strong>. All {list.length} questions are required.
          </Alert>
          {list.map((question, index) => (
            <Question
              key={question.id}
              question={question}
              index={index}
              value={answers[question.id]}
              onChange={(value) => setAnswers((previous) => ({ ...previous, [question.id]: value }))}
              error={showErrors && answers[question.id] === undefined}
            />
          ))}
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
            <div className="flex min-w-40 flex-1 items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={list.length} aria-label="Questions answered">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(answeredCount / list.length) * 100}%` }} />
              </div>
              <span className="text-sm whitespace-nowrap text-slate-600 tabular-nums">
                {answeredCount} / {list.length} answered
              </span>
            </div>
            <Button type="submit">Submit survey</Button>
          </div>
          {showErrors && unanswered.length > 0 && (
            <Alert tone="error">
              {unanswered.length} question{unanswered.length === 1 ? ' still needs' : 's still need'} an answer.
            </Alert>
          )}
        </form>
      )}

      <Card title="Previous submissions" className="mt-8" padded={false}>
        <History key={historyKey} />
      </Card>

      <ConfirmDialog
        open={confirming}
        title="Submit your survey?"
        message={`You answered all ${list.length} questions. Answers cannot be changed after submitting.`}
        confirmLabel="Submit"
        loading={submitting}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
