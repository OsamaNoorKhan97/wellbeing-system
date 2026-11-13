import { useState, type FormEvent } from 'react';
import { FiCheckCircle, FiClock } from 'react-icons/fi';
import { RatingChip, RatingPicker } from '../../components/RatingPicker';
import { Alert, Button, Card, EmptyState, ErrorState, PageHeader, PageLoader, Pagination } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { RatingCategory } from '../../lib/ratings';
import { assessmentService } from '../../services';

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
  const [justSubmitted, setJustSubmitted] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (categories.some((category) => ratings[category] === null)) {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    try {
      await assessmentService.submit({ mood: ratings.mood!, stress: ratings.stress!, energy: ratings.energy! });
      toast.success('Check-in saved. Thank you for taking a moment for yourself.');
      setRatings(emptyRatings);
      setShowErrors(false);
      setJustSubmitted(true);
      setPage(1);
      history.reload();
    } catch (error) {
      // The limit may have been reached in another tab or lowered by HR since the page loaded.
      toast.error(error instanceof ApiError && error.code === 'DAILY_LIMIT_REACHED' ? error.message : errorMessage(error));
    } finally {
      setSubmitting(false);
      status.reload();
    }
  };

  const current = status.data;
  return (
    <>
      <PageHeader title="Well-Being Check" description="Rate how you feel right now. Your individual ratings are visible only to you." />

      {status.error ? (
        <ErrorState message={status.error} onRetry={status.reload} />
      ) : !current ? (
        <PageLoader />
      ) : current.canSubmit ? (
        <form onSubmit={submit} noValidate className="space-y-4">
          {justSubmitted && <Alert tone="success">Your check-in was saved. You can submit {current.remaining} more today.</Alert>}
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
            <p className="text-sm text-slate-500">
              {current.remaining} of {current.limit} check-in{current.limit === 1 ? '' : 's'} left today
            </p>
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
            <h2 className="text-lg font-semibold">You have completed today's check-in{current.limit === 1 ? '' : 's'}</h2>
            <p className="max-w-md text-sm text-slate-600">
              You have used {current.usedToday} of {current.limit} check-in{current.limit === 1 ? '' : 's'} allowed per day.
            </p>
            <p className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
              <FiClock aria-hidden />
              You can submit again from {formatDateTime(current.nextAvailableAt)}
            </p>
            {current.latestToday && (
              <div className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4">
                {categories.map((category) => (
                  <span key={category} className="text-sm text-slate-500">
                    <span className="mr-2 capitalize">{category}:</span>
                    <RatingChip category={category} value={current.latestToday![category]} />
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
