import { useState, type FormEvent } from 'react';
import { FiCheckCircle, FiClock } from 'react-icons/fi';
import { BreakRecommendationCard } from '../../components/BreakRecommendationCard';
import { RatingChip, RatingPicker } from '../../components/RatingPicker';
import { Button, Card, EmptyState, ErrorState, PageHeader, PageLoader, Pagination } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { ApiError, errorMessage } from '../../lib/api';
import { describeHours, formatDateTime } from '../../lib/format';
import type { RatingCategory } from '../../lib/ratings';
import { assessmentService } from '../../services';
import type { BreakRecommendation } from '../../types';

const categories: RatingCategory[] = ['mood', 'stress', 'energy'];
type Ratings = Record<RatingCategory, number | null>;
const emptyRatings: Ratings = { mood: null, stress: null, energy: null };

export function WellBeingPage() {
  const toast = useToast();
  const status = useFetch(() => assessmentService.status(), []);
  const [page, setPage] = useState(1);
  const history = useFetch(() => assessmentService.list({ page, pageSize: 10 }), [page]);

  const [ratings, setRatings] = useState<Ratings>(emptyRatings);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recommendation, setRecommendation] = useState<BreakRecommendation | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (categories.some((category) => ratings[category] === null)) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    try {
      const result = await assessmentService.submit({ mood: ratings.mood!, stress: ratings.stress!, energy: ratings.energy! });
      toast.success('Check-in saved. Thank you for taking a moment for yourself.');
      setRatings(emptyRatings);
      setShowErrors(false);
      setRecommendation(result.data.recommendation);
      setPage(1);
      history.reload();
    } catch (error) {
      // The interval may not have passed yet (for example a check-in made in another tab) or may have been changed by the Super Admin.
      toast.error(error instanceof ApiError && error.code === 'ASSESSMENT_NOT_YET_AVAILABLE' ? error.message : errorMessage(error));
    } finally {
      setSubmitting(false);
      status.reload();
    }
  };

  const current = status.data;
  return (
    <>
      <PageHeader title="Well-Being Check" description="Rate how you feel right now. Your individual ratings are visible only to you." />

      {recommendation && (
        <div className="mb-6">
          <BreakRecommendationCard
            recommendation={recommendation}
            onRequested={() => {
              setRecommendation(null);
              history.reload();
            }}
          />
        </div>
      )}

      {status.error ? (
        <ErrorState message={status.error} onRetry={status.reload} />
      ) : !current ? (
        <PageLoader />
      ) : current.canSubmit ? (
        <form onSubmit={submit} noValidate className="space-y-4">
          {categories.map((category) => (
            <RatingPicker
              key={category}
              category={category}
              value={ratings[category]}
              onChange={(value) => setRatings((previous) => ({ ...previous, [category]: value }))}
              error={showErrors && ratings[category] === null}
            />
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Mood, stress and energy are submitted together. Check-ins are allowed every {describeHours(current.intervalHours)}.</p>
            <Button type="submit" loading={submitting}>
              Submit check-in
            </Button>
          </div>
        </form>
      ) : (
        <Card>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600" aria-hidden>
              <FiCheckCircle />
            </span>
            <h2 className="text-lg font-semibold">Your check-in is recorded</h2>
            <p className="max-w-md text-sm text-slate-600">
              Well-being check-ins are available every {describeHours(current.intervalHours)}. Your last one was {formatDateTime(current.lastSubmittedAt)}.
            </p>
            <p className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
              <FiClock aria-hidden />
              Next check-in available on {formatDateTime(current.nextAvailableAt)}
            </p>
            {current.latest && (
              <div className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4">
                {categories.map((category) => (
                  <span key={category} className="text-sm text-slate-500">
                    <span className="mr-2 capitalize">{category}:</span>
                    <RatingChip category={category} value={current.latest![category]} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="Check-in history" description="Your previous assessments" className="mt-8" padded={false}>
        {history.error ? (
          <div className="p-5">
            <ErrorState message={history.error} onRetry={history.reload} />
          </div>
        ) : !history.data ? (
          <PageLoader />
        ) : history.data.length === 0 ? (
          <EmptyState title="No check-ins yet" description="Once you submit a check-in it will be listed here." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date and time</th>
                  <th>Mood</th>
                  <th>Stress</th>
                  <th>Energy</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap">{formatDateTime(item.submittedAt)}</td>
                    {categories.map((category) => (
                      <td key={category}>
                        <RatingChip category={category} value={item[category]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination meta={history.meta} onPageChange={setPage} />
      </Card>
    </>
  );
}
