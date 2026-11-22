import { useState } from 'react';
import { FiCoffee } from 'react-icons/fi';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../lib/api';
import { requestStatusLabels, timeAgo } from '../lib/format';
import { requestService } from '../services';
import type { BreakRecommendation } from '../types';
import { Button, RequestStatusBadge } from './ui';

/**
 * Shown to an employee while a well-being alert is open. It only suggests a break: the request still goes to
 * the Line Manager, who decides, so nothing is forced or approved automatically.
 */
export function BreakRecommendationCard({
  recommendation,
  canRequest = true,
  onRequested,
}: {
  recommendation: BreakRecommendation;
  /** False when the employee has no Line Manager to send the request to. */
  canRequest?: boolean;
  onRequested: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const request = recommendation.request;
  const canAsk = !request || request.status === 'REJECTED' || request.status === 'CANCELLED';

  const ask = async () => {
    setBusy(true);
    try {
      await requestService.create('BREAK', '', recommendation.alertId);
      toast.success('Break requested. Your Line Manager has been notified.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      onRequested();
    }
  };

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-xs" aria-labelledby="break-recommendation-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-2xl text-amber-600" aria-hidden>
          <FiCoffee />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="break-recommendation-title" className="text-base font-semibold text-amber-950">
            A suggestion from your recent check-ins
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            Your well-being matters! Based on your recent check-ins, you may benefit from taking a short break. Consider taking some time to recharge.
          </p>
          {request && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-900">
              Your break request: <RequestStatusBadge status={request.status} />
              {request.status === 'PENDING' && <span className="text-xs">Waiting for your Line Manager.</span>}
              {request.managerComment && <span className="text-xs">“{request.managerComment}”</span>}
              <span className="sr-only">{requestStatusLabels[request.status]}</span>
            </p>
          )}
          {!canRequest && <p className="mt-2 text-xs text-amber-800">You have no Line Manager assigned yet. Please contact HR so a break can be requested.</p>}
        </div>
        {canAsk && canRequest && (
          <Button onClick={ask} loading={busy} icon={<FiCoffee aria-hidden />} className="shrink-0">
            Request a Break
          </Button>
        )}
      </div>
      <p className="mt-3 text-[11px] text-amber-800/80">Suggested {timeAgo(recommendation.triggeredAt)}. This is a recommendation only; your Line Manager decides on the request.</p>
    </section>
  );
}
